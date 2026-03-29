import { convertToCoreMessages, streamText as _streamText, type Message } from 'ai';
import { MAX_TOKENS, type FileMap } from './constants';
import { getSystemPrompt } from '~/lib/common/prompts/prompts';
import { MODIFICATIONS_TAG_NAME, PROVIDER_LIST, WORK_DIR } from '~/utils/constants';
import type { IProviderSetting } from '~/types/model';
import { PromptLibrary } from '~/lib/common/prompt-library';
import { allowedHTMLElements } from '~/utils/markdown';
import { LLMManager } from '~/lib/modules/llm/manager';
import { createScopedLogger } from '~/utils/logger';
import { createFilesContext, extractPropertiesFromMessage } from './utils';

export type Messages = Message[];

export interface StreamingOptions extends Omit<Parameters<typeof _streamText>[0], 'model'> {
  supabaseConnection?: {
    isConnected: boolean;
    hasSelectedProject: boolean;
    credentials?: {
      anonKey?: string;
      supabaseUrl?: string;
    };
  };
}

const logger = createScopedLogger('stream-text');

export async function streamText(props: {
  messages: Omit<Message, 'id'>[];
  env?: Env;
  options?: StreamingOptions;
  apiKeys?: Record<string, string>;
  files?: FileMap;
  providerSettings?: Record<string, IProviderSetting>;
  promptId?: string;
  contextOptimization?: boolean;
  contextFiles?: FileMap;
  summary?: string;
  messageSliceId?: number;
}) {
  const {
    messages,
    env: serverEnv,
    options,
    apiKeys,
    files,
    providerSettings,
    promptId,
    contextOptimization,
    contextFiles,
    summary,
  } = props;
  let currentModel: string | undefined;
  let currentProvider: string | undefined;
  let processedMessages = messages.map((message) => {
    if (message.role === 'user') {
      const { model, provider, content } = extractPropertiesFromMessage(message);

      if (model) {
        currentModel = model;
      }

      if (provider) {
        currentProvider = provider;
      }

      return { ...message, content };
    } else if (message.role == 'assistant') {
      let content = message.content;
      content = content.replace(/<div class=\\"__boltThought__\\">.*?<\/div>/s, '');
      content = content.replace(/<think>.*?<\/think>/s, '');

      // Remove package-lock.json content specifically keeping token usage MUCH lower
      content = content.replace(
        /<boltAction type="file" filePath="package-lock\.json">[\s\S]*?<\/boltAction>/g,
        '[package-lock.json content removed]',
      );

      // Trim whitespace potentially left after removals
      content = content.trim();

      return { ...message, content };
    }

    return message;
  });

  if (!currentProvider) {
    throw new Error('Provider metadata is missing in the chat request. Re-select provider and model, then retry.');
  }

  if (!currentModel) {
    throw new Error('Model metadata is missing in the chat request. Re-select provider and model, then retry.');
  }

  const provider = PROVIDER_LIST.find((p) => p.name === currentProvider);

  if (!provider) {
    throw new Error(`Provider ${currentProvider} is not available.`);
  }

  const modelsList = await LLMManager.getInstance().getModelListFromProvider(provider, {
    apiKeys,
    providerSettings,
    serverEnv: serverEnv as any,
  });

  if (!modelsList.length) {
    throw new Error(provider.unavailableMessage || `No models found for provider ${provider.name}`);
  }

  let modelDetails = modelsList.find((m) => m.name === currentModel);

  if (!modelDetails) {
    logger.warn(
      `MODEL [${currentModel || 'empty'}] not found in provider [${provider.name}]. Falling back to first real model. ${modelsList[0].name}`,
    );
    modelDetails = modelsList[0];
  }

  const dynamicMaxTokens = modelDetails && modelDetails.maxTokenAllowed ? modelDetails.maxTokenAllowed : MAX_TOKENS;

  let systemPrompt =
    PromptLibrary.getPropmtFromLibrary(promptId || 'default', {
      cwd: WORK_DIR,
      allowedHtmlElements: allowedHTMLElements,
      modificationTagName: MODIFICATIONS_TAG_NAME,
      supabase: {
        isConnected: options?.supabaseConnection?.isConnected || false,
        hasSelectedProject: options?.supabaseConnection?.hasSelectedProject || false,
        credentials: options?.supabaseConnection?.credentials || undefined,
      },
    }) ?? getSystemPrompt();

  if (contextFiles && contextOptimization) {
    const codeContext = createFilesContext(contextFiles, true);

    systemPrompt = `${systemPrompt}

Below is the artifact containing the context loaded into context buffer for you to have knowledge of and might need changes to fullfill current user request.
CONTEXT BUFFER:
---
${codeContext}
---
`;

    if (summary) {
      systemPrompt = `${systemPrompt}
      below is the chat history till now
CHAT SUMMARY:
---
${props.summary}
---
`;

      if (props.messageSliceId) {
        processedMessages = processedMessages.slice(props.messageSliceId);
      } else {
        const lastMessage = processedMessages.pop();

        if (lastMessage) {
          processedMessages = [lastMessage];
        }
      }
    }
  }

  const effectiveLockedFilePaths = new Set<string>();

  if (files) {
    for (const [filePath, fileDetails] of Object.entries(files)) {
      if (fileDetails?.isLocked) {
        effectiveLockedFilePaths.add(filePath);
      }
    }
  }

  if (effectiveLockedFilePaths.size > 0) {
    const lockedFilesListString = Array.from(effectiveLockedFilePaths)
      .map((filePath) => `- ${filePath}`)
      .join('\n');
    systemPrompt = `${systemPrompt}

IMPORTANT: The following files are locked and MUST NOT be modified in any way. Do not suggest or make any changes to these files. You can proceed with the request but DO NOT make any changes to these files specifically:
${lockedFilesListString}
---
`;
  } else {
    console.log('No locked files found from any source for prompt.');
  }

  logger.info(`Sending llm call to ${provider.name} with model ${modelDetails.name}`);

  // console.log(systemPrompt, processedMessages);

  return await _streamText({
    model: provider.getModelInstance({
      model: modelDetails.name,
      serverEnv,
      apiKeys,
      providerSettings,
    }),
    system: systemPrompt,
    maxTokens: dynamicMaxTokens,
    messages: convertToCoreMessages(processedMessages as any),
    ...options,
  });
}
