/*
 * @ts-nocheck
 * Preventing TS checks with files presented in the video for a better presentation.
 */
import { useStore } from '@nanostores/react';
import type { Message } from 'ai';
import { useChat } from 'ai/react';
import { useAnimate } from 'framer-motion';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { cssTransition, toast, ToastContainer } from 'react-toastify';
import { useMessageParser, usePromptEnhancer, useShortcuts } from '~/lib/hooks';
import { description, useChatHistory } from '~/lib/persistence';
import { chatStore } from '~/lib/stores/chat';
import { workbenchStore } from '~/lib/stores/workbench';
import { DEFAULT_PROVIDER, PROMPT_COOKIE_KEY, PROVIDER_LIST } from '~/utils/constants';
import { cubicEasingFn } from '~/utils/easings';
import { createScopedLogger, renderLogger } from '~/utils/logger';
import { BaseChat } from './BaseChat';
import Cookies from 'js-cookie';
import { debounce } from '~/utils/debounce';
import { useSettings } from '~/lib/hooks/useSettings';
import type { ProviderInfo } from '~/types/model';
import { useSearchParams } from '@remix-run/react';
import { createSampler } from '~/utils/sampler';
import { getTemplates, selectStarterTemplate } from '~/utils/selectStarterTemplate';
import { logStore } from '~/lib/stores/logs';
import { streamingState } from '~/lib/stores/streaming';
import { filesToArtifacts } from '~/utils/fileUtils';
import { supabaseConnection } from '~/lib/stores/supabase';
import { saveWorkspaceSession, loadWorkspaceSession } from '~/lib/publisher/workspace-session';
import {
  PUBLISHER_INTAKE_SESSION_FILE,
  PUBLISHER_PROJECT_FILE,
  getPublisherImportedSourcePath,
  resolveUniqueImportedSourcePath,
} from '~/lib/publisher/constants';
import { createPublisherProjectId } from '~/lib/publisher/bootstrap';
import { createPublisherAssetRef, fileToDataUrl, fileToUint8Array } from '~/lib/publisher/file-helpers';
import { savePublisherProjectState } from '~/lib/publisher/persistence';
import type { IntakeSourceSnapshot, PublisherSiteSettings, WorkspaceMode } from '~/types/publisher';
import { serializeIntakeSessionFiles } from '~/lib/publisher/intake-pipeline';
import type { PublisherIntakeOnboardingSubmitPayload } from '~/components/publisher/PublisherIntakeOnboarding';
import {
  buildIntakeSessionChecks,
  buildIntakeSourceManifest,
  createIntakeSession,
  detectIntakeScenario,
  scanIntakeSourceTree,
} from '~/lib/publisher/intake';
import {
  buildAccountTurnMetrics,
  fnv1a32,
  hashHex,
  hashText,
  mergeUsage,
  normalizeUsage,
  safeJsonMetrics,
  textBytes,
} from '~/lib/metrics/accountTurnMetrics';

const toastAnimation = cssTransition({
  enter: 'animated fadeInRight',
  exit: 'animated fadeOutRight',
});

const logger = createScopedLogger('Chat');

async function sha1Hex(value: string) {
  if (!globalThis.crypto?.subtle) {
    return hashText(value);
  }

  const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(value));

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function normalizeUploadedRelativePath(path: string) {
  return path.replaceAll('\\', '/').replace(/^\/+/, '').split('/').filter(Boolean).join('/');
}

export function Chat() {
  renderLogger.trace('Chat');

  const { ready, initialMessages, storeMessageHistory, importChat, exportChat } = useChatHistory();
  const title = useStore(description);
  useEffect(() => {
    workbenchStore.setReloadedMessages(initialMessages.map((m) => m.id));
  }, [initialMessages]);

  return (
    <>
      {ready && (
        <ChatImpl
          description={title}
          initialMessages={initialMessages}
          exportChat={exportChat}
          storeMessageHistory={storeMessageHistory}
          importChat={importChat}
        />
      )}
      <ToastContainer
        closeButton={({ closeToast }) => {
          return (
            <button className="Toastify__close-button" onClick={closeToast}>
              <div className="i-ph:x text-lg" />
            </button>
          );
        }}
        icon={({ type }) => {
          /**
           * @todo Handle more types if we need them. This may require extra color palettes.
           */
          switch (type) {
            case 'success': {
              return <div className="i-ph:check-bold text-bolt-elements-icon-success text-2xl" />;
            }
            case 'error': {
              return <div className="i-ph:warning-circle-bold text-bolt-elements-icon-error text-2xl" />;
            }
          }

          return undefined;
        }}
        position="bottom-right"
        pauseOnFocusLoss
        transition={toastAnimation}
        autoClose={3000}
      />
    </>
  );
}

const processSampledMessages = createSampler(
  (options: {
    messages: Message[];
    initialMessages: Message[];
    isLoading: boolean;
    parseMessages: (messages: Message[], isLoading: boolean) => void;
    storeMessageHistory: (messages: Message[]) => Promise<void>;
  }) => {
    const { messages, initialMessages, isLoading, parseMessages, storeMessageHistory } = options;
    parseMessages(messages, isLoading);

    if (messages.length > initialMessages.length) {
      storeMessageHistory(messages).catch((error) => toast.error(error.message));
    }
  },
  50,
);

interface ChatProps {
  initialMessages: Message[];
  storeMessageHistory: (messages: Message[]) => Promise<void>;
  importChat: (description: string, messages: Message[]) => Promise<void>;
  exportChat: () => void;
  description?: string;
}

type CodexBridgeEvent =
  | {
      type: 'thread/tokenUsage/updated';
      params: {
        threadId: string;
        usage?: {
          inputTokens?: number;
          cachedInputTokens?: number;
          outputTokens?: number;
          totalTokens?: number;
          totalCostUsd?: number;
          durationMs?: number;
          cacheCreationInputTokens?: number;
          cacheReadInputTokens?: number;
        };
      };
    }
  | {
      type: 'item/agentMessage/delta';
      params: {
        threadId: string;
        turnId: string;
        itemId: string;
        delta: string;
      };
    }
  | {
      type: 'turn/completed';
      params: {
        threadId: string;
        turn: {
          id: string;
          status: 'completed' | 'interrupted' | 'failed' | 'inProgress';
          error: {
            message?: string;
          } | null;
          usage?: {
            inputTokens?: number;
            cachedInputTokens?: number;
            outputTokens?: number;
            totalTokens?: number;
            totalCostUsd?: number;
            durationMs?: number;
            cacheCreationInputTokens?: number;
            cacheReadInputTokens?: number;
          };
        };
      };
    }
  | {
      type: 'account/login/completed';
      params: {
        loginId: string | null;
        success: boolean;
        error: string | null;
      };
    };

type AccountTurnTracker = {
  threadId: string;
  turnId: string;
  assistantMessageId: string;
  providerName: string;
  model: string;
  effort?: string;
  startedAtMs: number;
  firstDeltaAtMs?: number;
  userInputChars: number;
  userInputBytes: number;
  userInputHash: string;
  payloadChars: number;
  payloadBytes: number;
  inboundDeltaChars: number;
  inboundDeltaBytes: number;
  inboundEventChars: number;
  inboundEventBytes: number;
  responseChars: number;
  responseBytes: number;
  responseHashState: number;
  upstreamUsage?: ReturnType<typeof normalizeUsage>;
};

export const ChatImpl = memo(
  ({ description, initialMessages, storeMessageHistory, importChat, exportChat }: ChatProps) => {
    useShortcuts();

    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const [chatStarted, setChatStarted] = useState(initialMessages.length > 0);
    const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
    const [imageDataList, setImageDataList] = useState<string[]>([]);
    const [searchParams, setSearchParams] = useSearchParams();
    const [fakeLoading, setFakeLoading] = useState(false);
    const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>('default');
    const [publisherOnboardingCompleted, setPublisherOnboardingCompleted] = useState(false);
    const [publisherBootstrapping, setPublisherBootstrapping] = useState(false);
    const files = useStore(workbenchStore.files);
    const actionAlert = useStore(workbenchStore.alert);
    const deployAlert = useStore(workbenchStore.deployAlert);
    const supabaseConn = useStore(supabaseConnection); // Add this line to get Supabase connection
    const selectedProject = supabaseConn.stats?.projects?.find(
      (project) => project.id === supabaseConn.selectedProjectId,
    );
    const supabaseAlert = useStore(workbenchStore.supabaseAlert);
    const { activeProviders, providers, promptId, setPromptId, autoSelectTemplate, contextOptimizationEnabled } =
      useSettings();
    const hasPublisherProject = Boolean(files[PUBLISHER_PROJECT_FILE]);
    const hasPublisherIntakeSession = Boolean(files[PUBLISHER_INTAKE_SESSION_FILE]);

    const [model, setModel] = useState(() => {
      const savedModel = Cookies.get('selectedModel');
      return savedModel || '';
    });
    const [provider, setProvider] = useState(() => {
      const savedProvider = Cookies.get('selectedProvider');
      return (PROVIDER_LIST.find((p) => p.name === savedProvider) || DEFAULT_PROVIDER) as ProviderInfo;
    });
    const currentProviderSettings = provider ? providers[provider.name]?.settings : undefined;
    const isOpenAIAccountMode = provider?.name === 'OpenAI' && currentProviderSettings?.authMode === 'account';
    const isAnthropicAccountMode = provider?.name === 'Anthropic' && currentProviderSettings?.authMode === 'account';
    const isProviderAccountMode = isOpenAIAccountMode || isAnthropicAccountMode;
    const accountReasoningEffort = currentProviderSettings?.reasoningEffort;

    const { showChat, draftPrefill } = useStore(chatStore);

    const [animationScope, animate] = useAnimate();

    const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
    const publisherWorkspaceReady =
      workspaceMode === 'publisher' &&
      (publisherOnboardingCompleted || hasPublisherProject || hasPublisherIntakeSession);

    const {
      messages,
      isLoading,
      input,
      handleInputChange,
      setInput,
      stop,
      append,
      setMessages,
      reload,
      error,
      data: chatData,
      setData,
    } = useChat({
      api: '/api/chat',
      body: {
        apiKeys,
        files,
        promptId,
        contextOptimization: contextOptimizationEnabled,
        supabase: {
          isConnected: supabaseConn.isConnected,
          hasSelectedProject: !!selectedProject,
          credentials: {
            supabaseUrl: supabaseConn?.credentials?.supabaseUrl,
            anonKey: supabaseConn?.credentials?.anonKey,
          },
        },
      },
      sendExtraMessageFields: true,
      onError: (e) => {
        logger.error('Request failed\n\n', e, error);
        logStore.logError('Chat request failed', e, {
          component: 'Chat',
          action: 'request',
          error: e.message,
        });
        toast.error(
          'There was an error processing your request: ' + (e.message ? e.message : 'No details were returned'),
        );
      },
      onFinish: (message, response) => {
        const usage = response.usage;
        setData(undefined);

        if (usage) {
          console.log('Token usage:', usage);
          logStore.logProvider('Chat response completed', {
            component: 'Chat',
            action: 'response',
            model,
            provider: provider.name,
            usage,
            messageLength: message.content.length,
          });
        }

        logger.debug('Finished streaming');
      },
      initialMessages,
      initialInput: Cookies.get(PROMPT_COOKIE_KEY) || '',
    });

    const [accountMessages, setAccountMessages] = useState<Message[]>(initialMessages);
    const [accountInput, setAccountInput] = useState(Cookies.get(PROMPT_COOKIE_KEY) || '');
    const [accountIsLoading, setAccountIsLoading] = useState(false);
    const activeAccountTurnRef = useRef<AccountTurnTracker | null>(null);
    useEffect(() => {
      const prompt = searchParams.get('prompt');

      // console.log(prompt, searchParams, model, provider);

      if (isProviderAccountMode) {
        return;
      }

      if (prompt && model && provider?.name) {
        setSearchParams({});
        runAnimation();
        append({
          role: 'user',
          content: [
            {
              type: 'text',
              text: `[Model: ${model}]\n\n[Provider: ${provider.name}]\n\n${prompt}`,
            },
          ] as any, // Type assertion to bypass compiler check
        });
      }
    }, [model, provider, searchParams, isProviderAccountMode]);

    const { enhancingPrompt, promptEnhanced, enhancePrompt, resetEnhancer } = usePromptEnhancer();
    const { parsedMessages, parseMessages } = useMessageParser();

    const TEXTAREA_MAX_HEIGHT = chatStarted ? 400 : 200;

    useEffect(() => {
      chatStore.setKey('started', initialMessages.length > 0);
    }, []);

    useEffect(() => {
      if (!draftPrefill?.message) {
        return;
      }

      const currentComposerValue = isProviderAccountMode ? accountInput : input;
      const hasDraft = currentComposerValue.trim().length > 0;
      const shouldReplace =
        !hasDraft ||
        !draftPrefill.replaceRequested ||
        typeof window === 'undefined' ||
        window.confirm('Replace the current draft in the composer with the publisher action prompt?');

      if (shouldReplace) {
        if (isProviderAccountMode) {
          setAccountInput(draftPrefill.message);
        } else {
          setInput(draftPrefill.message);
        }

        textareaRef.current?.focus();
      }

      chatStore.setKey('draftPrefill', null);
    }, [accountInput, draftPrefill, input, isProviderAccountMode, setInput]);

    useEffect(() => {
      const sampledMessages = isProviderAccountMode ? accountMessages : messages;
      const sampledLoading = isProviderAccountMode ? accountIsLoading : isLoading;

      processSampledMessages({
        messages: sampledMessages,
        initialMessages,
        isLoading: sampledLoading,
        parseMessages,
        storeMessageHistory,
      });
    }, [messages, isLoading, accountMessages, accountIsLoading, parseMessages, isProviderAccountMode]);

    const scrollTextArea = () => {
      const textarea = textareaRef.current;

      if (textarea) {
        textarea.scrollTop = textarea.scrollHeight;
      }
    };

    useEffect(() => {
      const accountBridge = isOpenAIAccountMode
        ? window.codexAuth
        : isAnthropicAccountMode
          ? window.anthropicAuth
          : undefined;

      if (!accountBridge?.onEvent) {
        return undefined;
      }

      const unsubscribe = accountBridge.onEvent((event: CodexBridgeEvent) => {
        const activeTurn = activeAccountTurnRef.current;

        if (!activeTurn) {
          return;
        }

        const isDeltaEvent = event.type === 'item/agentMessage/delta' && activeTurn.turnId === event.params.turnId;
        const isCompletedEvent = event.type === 'turn/completed' && activeTurn.turnId === event.params.turn.id;
        const isTokenUsageEvent =
          event.type === 'thread/tokenUsage/updated' && activeTurn.threadId === event.params.threadId;

        if (!isDeltaEvent && !isCompletedEvent && !isTokenUsageEvent) {
          return;
        }

        const eventEnvelopeMetrics = safeJsonMetrics(event);
        activeTurn.inboundEventChars += eventEnvelopeMetrics.chars;
        activeTurn.inboundEventBytes += eventEnvelopeMetrics.bytes;

        if (isTokenUsageEvent) {
          activeTurn.upstreamUsage = mergeUsage(activeTurn.upstreamUsage, normalizeUsage(event.params.usage));
          return;
        }

        if (isDeltaEvent) {
          const delta = event.params.delta;

          if (typeof activeTurn.firstDeltaAtMs !== 'number') {
            activeTurn.firstDeltaAtMs = Date.now();
          }

          activeTurn.inboundDeltaChars += delta.length;
          activeTurn.inboundDeltaBytes += textBytes(delta);
          activeTurn.responseChars += delta.length;
          activeTurn.responseBytes += textBytes(delta);
          activeTurn.responseHashState = fnv1a32(delta, activeTurn.responseHashState);

          setAccountMessages((prevMessages) =>
            prevMessages.map((message) =>
              message.id === activeTurn.assistantMessageId
                ? {
                    ...message,
                    content: `${message.content || ''}${delta}`,
                  }
                : message,
            ),
          );

          return;
        }

        if (isCompletedEvent) {
          setAccountIsLoading(false);

          const completedAtMs = Date.now();
          const completionUsage = normalizeUsage(event.params.turn.usage);
          const mergedUsage = mergeUsage(activeTurn.upstreamUsage, completionUsage);
          const metrics = buildAccountTurnMetrics({
            provider: activeTurn.providerName,
            model: activeTurn.model,
            effort: activeTurn.effort as any,
            threadId: activeTurn.threadId,
            turnId: activeTurn.turnId,
            userInput: {
              chars: activeTurn.userInputChars,
              bytes: activeTurn.userInputBytes,
              hash: activeTurn.userInputHash,
            },
            payload: {
              chars: activeTurn.payloadChars,
              bytes: activeTurn.payloadBytes,
            },
            inbound: {
              deltaChars: activeTurn.inboundDeltaChars,
              deltaBytes: activeTurn.inboundDeltaBytes,
              eventChars: activeTurn.inboundEventChars,
              eventBytes: activeTurn.inboundEventBytes,
            },
            response: {
              chars: activeTurn.responseChars,
              bytes: activeTurn.responseBytes,
              hash: hashHex(activeTurn.responseHashState),
            },
            upstreamUsage: mergedUsage,
            startedAtMs: activeTurn.startedAtMs,
            firstDeltaAtMs: activeTurn.firstDeltaAtMs,
            completedAtMs,
          });

          logStore.logProvider('Account turn overhead measured', {
            component: 'Chat',
            action: 'account_turn_metrics',
            provider: activeTurn.providerName,
            model: activeTurn.model,
            threadId: activeTurn.threadId,
            turnId: activeTurn.turnId,
            accountTurnMetrics: metrics,
          });

          if (event.params.turn.status === 'failed') {
            const errorMessage = event.params.turn.error?.message || `${provider?.name} account turn failed.`;
            toast.error(errorMessage);
          }

          activeAccountTurnRef.current = null;
        }
      });

      return () => {
        unsubscribe();
      };
    }, [isOpenAIAccountMode, isAnthropicAccountMode, provider?.name]);

    useEffect(() => {
      if (!isProviderAccountMode) {
        activeAccountTurnRef.current = null;
        setAccountIsLoading(false);
      }
    }, [isProviderAccountMode]);

    const clearComposerState = () => {
      Cookies.remove(PROMPT_COOKIE_KEY);
      setUploadedFiles([]);
      setImageDataList([]);
      resetEnhancer();
      textareaRef.current?.blur();
    };

    const sendAccountModeMessage = async (finalMessageContent: string) => {
      const accountBridge = isOpenAIAccountMode
        ? window.codexAuth
        : isAnthropicAccountMode
          ? window.anthropicAuth
          : undefined;

      if (!accountBridge?.startTurn) {
        toast.error(`${provider?.name || 'Provider'} account mode is available only in desktop app.`);
        return;
      }

      if (imageDataList.length > 0 || uploadedFiles.length > 0) {
        toast.info(`${provider?.name || 'Provider'} account mode currently supports text-only prompts in this build.`);
      }

      runAnimation();

      const userMessage: Message = {
        id: `${Date.now()}-user`,
        role: 'user',
        content: `[Model: ${model}]\n\n[Provider: ${provider.name}]\n\n${finalMessageContent}`,
      } as Message;
      const assistantMessage: Message = {
        id: `${Date.now()}-assistant`,
        role: 'assistant',
        content: '',
      } as Message;

      setAccountMessages((prevMessages) => [...prevMessages, userMessage, assistantMessage]);
      chatStore.setKey('aborted', false);
      setAccountInput('');
      clearComposerState();
      setAccountIsLoading(true);

      try {
        const outboundPayload = {
          input: finalMessageContent,
          model,
          effort: accountReasoningEffort,
        };
        const payloadMetrics = safeJsonMetrics(outboundPayload);
        const startedAtMs = Date.now();
        const turn = await accountBridge.startTurn(outboundPayload);
        activeAccountTurnRef.current = {
          threadId: turn.threadId,
          turnId: turn.turnId,
          assistantMessageId: assistantMessage.id,
          providerName: provider.name,
          model,
          effort: accountReasoningEffort,
          startedAtMs,
          userInputChars: finalMessageContent.length,
          userInputBytes: textBytes(finalMessageContent),
          userInputHash: hashText(finalMessageContent),
          payloadChars: payloadMetrics.chars,
          payloadBytes: payloadMetrics.bytes,
          inboundDeltaChars: 0,
          inboundDeltaBytes: 0,
          inboundEventChars: 0,
          inboundEventBytes: 0,
          responseChars: 0,
          responseBytes: 0,
          responseHashState: fnv1a32(''),
        };
      } catch (error: any) {
        setAccountIsLoading(false);
        activeAccountTurnRef.current = null;
        toast.error(error?.message || `Failed to start ${provider?.name || 'provider'} account turn.`);
      }
    };

    const abort = () => {
      if (isProviderAccountMode) {
        const activeTurn = activeAccountTurnRef.current;
        const accountBridge = isOpenAIAccountMode
          ? window.codexAuth
          : isAnthropicAccountMode
            ? window.anthropicAuth
            : undefined;

        if (activeTurn && accountBridge?.interruptTurn) {
          void accountBridge.interruptTurn({
            threadId: activeTurn.threadId,
            turnId: activeTurn.turnId,
          });
        }

        activeAccountTurnRef.current = null;
        setAccountIsLoading(false);
      } else {
        stop();
      }

      chatStore.setKey('aborted', true);
      workbenchStore.abortAllActions();

      logStore.logProvider('Chat response aborted', {
        component: 'Chat',
        action: 'abort',
        model,
        provider: provider.name,
      });
    };

    useEffect(() => {
      const textarea = textareaRef.current;

      if (textarea) {
        textarea.style.height = 'auto';

        const scrollHeight = textarea.scrollHeight;

        textarea.style.height = `${Math.min(scrollHeight, TEXTAREA_MAX_HEIGHT)}px`;
        textarea.style.overflowY = scrollHeight > TEXTAREA_MAX_HEIGHT ? 'auto' : 'hidden';
      }
    }, [input, accountInput, isProviderAccountMode, textareaRef]);

    const runAnimation = async () => {
      if (chatStarted) {
        return;
      }

      await Promise.all([
        animate('#examples', { opacity: 0, display: 'none' }, { duration: 0.1 }),
        animate('#intro', { opacity: 0, flex: 1 }, { duration: 0.2, ease: cubicEasingFn }),
      ]);

      chatStore.setKey('started', true);

      setChatStarted(true);
    };

    const sendMessage = async (_event: React.UIEvent, messageInput?: string) => {
      const messageContent = messageInput || (isProviderAccountMode ? accountInput : input);

      if (!messageContent?.trim()) {
        return;
      }

      if (!provider?.name) {
        toast.error('Выберите провайдера перед отправкой сообщения.');
        return;
      }

      if (!model) {
        toast.error('Модели недоступны. Подключите API или войдите в аккаунт провайдера.');
        return;
      }

      if (isProviderAccountMode ? accountIsLoading : isLoading) {
        abort();
        return;
      }

      // If no locked items, proceed normally with the original message
      const finalMessageContent = messageContent;

      if (isProviderAccountMode) {
        await sendAccountModeMessage(finalMessageContent);
        return;
      }

      runAnimation();

      if (!chatStarted) {
        setFakeLoading(true);

        if (publisherWorkspaceReady) {
          const modifiedFiles = workbenchStore.getModifiedFiles();
          const artifact = modifiedFiles ? filesToArtifacts(modifiedFiles, `${Date.now()}`) : '';

          setMessages([
            {
              id: `${new Date().getTime()}`,
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: `[Model: ${model}]\n\n[Provider: ${provider.name}]\n\n${artifact}${finalMessageContent}`,
                },
                ...imageDataList.map((imageData) => ({
                  type: 'image',
                  image: imageData,
                })),
              ] as any,
            },
          ]);
          reload();
          setFakeLoading(false);
          setInput('');
          clearComposerState();
          workbenchStore.resetAllFileModifications();

          return;
        }

        if (autoSelectTemplate) {
          const { template, title } = await selectStarterTemplate({
            message: finalMessageContent,
            model,
            provider,
          });

          if (template !== 'blank') {
            const temResp = await getTemplates(template, title).catch((e) => {
              if (e.message.includes('rate limit')) {
                toast.warning('Rate limit exceeded. Skipping starter template\n Continuing with blank template');
              } else {
                toast.warning('Failed to import starter template\n Continuing with blank template');
              }

              return null;
            });

            if (temResp) {
              const { assistantMessage, userMessage } = temResp;
              setMessages([
                {
                  id: `1-${new Date().getTime()}`,
                  role: 'user',
                  content: [
                    {
                      type: 'text',
                      text: `[Model: ${model}]\n\n[Provider: ${provider.name}]\n\n${finalMessageContent}`,
                    },
                    ...imageDataList.map((imageData) => ({
                      type: 'image',
                      image: imageData,
                    })),
                  ] as any,
                },
                {
                  id: `2-${new Date().getTime()}`,
                  role: 'assistant',
                  content: assistantMessage,
                },
                {
                  id: `3-${new Date().getTime()}`,
                  role: 'user',
                  content: `[Model: ${model}]\n\n[Provider: ${provider.name}]\n\n${userMessage}`,
                  annotations: ['hidden'],
                },
              ]);
              reload();
              setInput('');
              clearComposerState();
              setFakeLoading(false);

              return;
            }
          }
        }

        // If autoSelectTemplate is disabled or template selection failed, proceed with normal message
        setMessages([
          {
            id: `${new Date().getTime()}`,
            role: 'user',
            content: [
              {
                type: 'text',
                text: `[Model: ${model}]\n\n[Provider: ${provider.name}]\n\n${finalMessageContent}`,
              },
              ...imageDataList.map((imageData) => ({
                type: 'image',
                image: imageData,
              })),
            ] as any,
          },
        ]);
        reload();
        setFakeLoading(false);
        setInput('');
        clearComposerState();

        return;
      }

      if (error != null) {
        setMessages(messages.slice(0, -1));
      }

      const modifiedFiles = workbenchStore.getModifiedFiles();

      chatStore.setKey('aborted', false);

      if (modifiedFiles !== undefined) {
        const userUpdateArtifact = filesToArtifacts(modifiedFiles, `${Date.now()}`);
        append({
          role: 'user',
          content: [
            {
              type: 'text',
              text: `[Model: ${model}]\n\n[Provider: ${provider.name}]\n\n${userUpdateArtifact}${finalMessageContent}`,
            },
            ...imageDataList.map((imageData) => ({
              type: 'image',
              image: imageData,
            })),
          ] as any,
        });

        workbenchStore.resetAllFileModifications();
      } else {
        append({
          role: 'user',
          content: [
            {
              type: 'text',
              text: `[Model: ${model}]\n\n[Provider: ${provider.name}]\n\n${finalMessageContent}`,
            },
            ...imageDataList.map((imageData) => ({
              type: 'image',
              image: imageData,
            })),
          ] as any,
        });
      }

      setInput('');
      clearComposerState();
    };

    /**
     * Handles the change event for the textarea and updates the input state.
     * @param event - The change event from the textarea.
     */
    const onTextareaChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      if (isProviderAccountMode) {
        setAccountInput(event.target.value);
        return;
      }

      handleInputChange(event);
    };

    /**
     * Debounced function to cache the prompt in cookies.
     * Caches the trimmed value of the textarea input after a delay to optimize performance.
     */
    const debouncedCachePrompt = useCallback(
      debounce((event: React.ChangeEvent<HTMLTextAreaElement>) => {
        const trimmedValue = event.target.value.trim();
        Cookies.set(PROMPT_COOKIE_KEY, trimmedValue, { expires: 30 });
      }, 1000),
      [],
    );

    useEffect(() => {
      const storedApiKeys = Cookies.get('apiKeys');

      if (storedApiKeys) {
        setApiKeys(JSON.parse(storedApiKeys));
      }
    }, []);

    const handleModelChange = (newModel: string) => {
      setModel(newModel);

      if (newModel) {
        Cookies.set('selectedModel', newModel, { expires: 30 });
      } else {
        Cookies.remove('selectedModel');
      }
    };

    const handleProviderChange = (newProvider: ProviderInfo) => {
      setProvider(newProvider);
      Cookies.set('selectedProvider', newProvider.name, { expires: 30 });
    };

    useEffect(() => {
      if (hasPublisherProject || hasPublisherIntakeSession) {
        setWorkspaceMode('publisher');
        setPublisherOnboardingCompleted(true);
        saveWorkspaceSession({
          mode: 'publisher',
          stage: hasPublisherProject ? 'structure' : 'intake',
          onboardingCompleted: true,
        });
        workbenchStore.setShowWorkbench(true);
        workbenchStore.currentView.set('structure');

        return;
      }

      const session = loadWorkspaceSession();

      if (session) {
        setWorkspaceMode(session.mode);
        setPublisherOnboardingCompleted(Boolean(session.onboardingCompleted));
      }
    }, [hasPublisherIntakeSession, hasPublisherProject]);

    const handleWorkspaceModeChange = useCallback(
      (mode: WorkspaceMode) => {
        setWorkspaceMode(mode);
        saveWorkspaceSession({
          mode,
          stage: mode === 'publisher' ? (hasPublisherProject ? 'structure' : 'onboarding') : 'onboarding',
          onboardingCompleted: mode === 'publisher' ? publisherOnboardingCompleted : false,
        });

        if (mode === 'publisher') {
          if (promptId !== 'publisher') {
            setPromptId('publisher');
          }

          if (publisherOnboardingCompleted || hasPublisherProject || hasPublisherIntakeSession) {
            workbenchStore.setShowWorkbench(true);
            workbenchStore.currentView.set('structure');
          }

          return;
        }

        if (promptId === 'publisher') {
          setPromptId('default');
        }

        if (!chatStarted) {
          workbenchStore.setShowWorkbench(false);
        }

        workbenchStore.currentView.set('code');
      },
      [
        chatStarted,
        hasPublisherIntakeSession,
        hasPublisherProject,
        promptId,
        publisherOnboardingCompleted,
        setPromptId,
      ],
    );

    const handlePublisherOnboardingSubmit = useCallback(async (payload: PublisherIntakeOnboardingSubmitPayload) => {
      setPublisherBootstrapping(true);

      try {
        const nextSettings: PublisherSiteSettings = {
          ...payload.settings,
          languages: payload.settings.multilingual
            ? payload.settings.languages
            : [payload.settings.defaultLanguage.toLowerCase()],
        };
        const sessionId = createPublisherProjectId(nextSettings.name);
        const intakeSources: IntakeSourceSnapshot[] = [];
        const collisionWarnings: Array<{ code: string; message: string; severity: 'warn'; path: string }> = [];
        const usedStoredPaths = new Set(
          Object.keys(workbenchStore.files.get()).filter((path) =>
            path.startsWith('/home/project/.bolt/publisher/intake/sources/imported/'),
          ),
        );

        for (const sourceFile of payload.sourceFiles) {
          const originalRelativePath = sourceFile.webkitRelativePath || sourceFile.name;
          const relativePath = normalizeUploadedRelativePath(originalRelativePath) || sourceFile.name;
          const bucket = await sha1Hex(`${payload.sourceLabel}:${relativePath}`);
          const baseStoredPath = getPublisherImportedSourcePath(relativePath, bucket);
          const storedPath = resolveUniqueImportedSourcePath(baseStoredPath, usedStoredPaths);
          usedStoredPaths.add(storedPath);

          if (storedPath !== baseStoredPath) {
            collisionWarnings.push({
              code: 'source-path-collision',
              message: `Imported source path collision was resolved for ${relativePath}.`,
              severity: 'warn',
              path: relativePath,
            });
          }

          const lowerName = relativePath.toLowerCase();
          const isText =
            sourceFile.type.startsWith('text/') ||
            lowerName.endsWith('.md') ||
            lowerName.endsWith('.markdown') ||
            lowerName.endsWith('.txt') ||
            lowerName.endsWith('.html') ||
            lowerName.endsWith('.htm');

          const content = isText ? await sourceFile.text() : await fileToUint8Array(sourceFile);
          intakeSources.push({
            id: `${bucket}:${relativePath}`,
            path: relativePath,
            storedPath,
            kind: 'file',
            mimeType: sourceFile.type || undefined,
            size: sourceFile.size,
            isBinary: !isText,
            text: typeof content === 'string' ? content : undefined,
            html: lowerName.endsWith('.html') || lowerName.endsWith('.htm') ? String(content) : undefined,
            sourceFamilyHint:
              lowerName.endsWith('.html') || lowerName.endsWith('.htm')
                ? 'html'
                : lowerName.endsWith('.md') || lowerName.endsWith('.markdown') || lowerName.endsWith('.txt')
                  ? 'document'
                  : undefined,
            label: sourceFile.name,
          });

          await workbenchStore.writeSystemFile(storedPath, content);
        }

        const scan = scanIntakeSourceTree(intakeSources, {
          rootPath: payload.sourceLabel,
          importKind: payload.importKind,
        });
        const scenario = scan.scenarioResult ?? detectIntakeScenario(scan, payload.importKind);
        const session = createIntakeSession({
          id: sessionId,
          sourceRoot: payload.sourceLabel,
          importKind: payload.importKind,
          scenario: scenario.scenario,
          activeContentFamily: scenario.activeContentFamily,
          referenceSourceFamily: scenario.referenceSourceFamily,
          projectName: nextSettings.name,
          sourceLabel: payload.sourceLabel,
          sourceManifest: buildIntakeSourceManifest(intakeSources, payload.sourceLabel),
          pages: scan.pageCandidates,
          shellCandidates: scan.shellCandidates,
          templateCandidatePath: scenario.templateCandidatePath,
          homePageCandidatePath: scenario.homePageCandidatePath,
          warnings: [...scan.warnings, ...scenario.warnings, ...collisionWarnings],
          scenarioResult: scenario,
          disambiguation: scenario.needsUserChoice
            ? {
                status: 'pending',
                reason: 'Ambiguous intake scan detected.',
                candidateImportKinds: payload.importKind ? [payload.importKind] : ['html', 'document'],
                templateCandidatePaths: scenario.templateCandidatePaths ?? [],
                homeCandidatePaths: scenario.homeCandidatePaths ?? [],
                selectedImportKind: payload.importKind,
                selectedTemplateCandidatePath: scenario.templateCandidatePath,
                selectedHomePageCandidatePath: scenario.homePageCandidatePath,
              }
            : {
                status: 'resolved',
                reason: 'Intake scan was deterministic.',
                candidateImportKinds: [payload.importKind],
                templateCandidatePaths: scenario.templateCandidatePaths ?? [],
                homeCandidatePaths: scenario.homeCandidatePaths ?? [],
                selectedImportKind: payload.importKind,
                selectedTemplateCandidatePath: scenario.templateCandidatePath,
                selectedHomePageCandidatePath: scenario.homePageCandidatePath,
              },
        });
        session.project = {
          ...session.project,
          name: nextSettings.name,
          domain: nextSettings.domain,
          defaultLanguage: nextSettings.defaultLanguage,
          multilingual: nextSettings.multilingual,
          languages: nextSettings.languages,
          sourceRoot: payload.sourceLabel,
        };

        const storedPathBySourcePath = new Map(
          intakeSources.map((source) => [
            source.path,
            source.storedPath ?? getPublisherImportedSourcePath(source.path),
          ]),
        );
        session.pages = session.pages.map((page) => ({
          ...page,
          storedSourcePath: storedPathBySourcePath.get(page.sourcePath),
        }));
        session.status = scenario.needsUserChoice ? 'pending-disambiguation' : 'reviewing';
        session.scenarioResult = scenario;
        session.checks = buildIntakeSessionChecks(session);
        session.supportedSources = scan.supportedSources;
        session.unsupportedSources = scan.unsupportedSources;
        session.ignoredPaths = scan.ignoredPaths;
        session.unsupportedPaths = scan.unsupportedPaths;
        session.noiseRoots = scan.noiseRoots;
        session.assetRoots = scan.assetRoots;
        session.blockLibraryPaths = scan.blockLibraryCandidates;
        session.blockLibraryCandidates = scan.blockLibraryCandidates;
        session.shellCandidatePaths = scan.shellCandidates;
        session.shellCandidates = scan.shellCandidates;
        session.pageSourcePaths = scan.pageCandidates.map((page) => page.sourcePath);
        session.documentSourcePaths = scan.referenceCandidates
          .filter((page) => page.sourceFamily === 'document')
          .map((page) => page.sourcePath);
        session.assetSourcePaths = scan.supportedSources
          .filter((source) => source.sourceFamilyHint === 'asset')
          .map((source) => source.path);

        for (const [assetName, file] of Object.entries(payload.assets) as Array<
          ['favicon' | 'metaImage' | 'logo', File | undefined]
        >) {
          if (!file) {
            continue;
          }

          const assetRef = createPublisherAssetRef(assetName, file.name, file.type || undefined);
          await workbenchStore.writeSystemFile(assetRef.path, await fileToUint8Array(file));

          const previewPath = await fileToDataUrl(file);

          session.project[assetName] = {
            kind: assetName,
            sourcePath: file.name,
            storedPath: assetRef.path,
            previewPath,
            label: file.name,
            mimeType: file.type || undefined,
            path: assetRef.path,
            publicPath: assetRef.publicPath,
          };
        }

        const intakeArtifacts = serializeIntakeSessionFiles(session);

        for (const [filePath, content] of Object.entries(intakeArtifacts)) {
          await workbenchStore.writeSystemFile(filePath, content);
        }

        savePublisherProjectState(session.id, {
          onboardingCompleted: true,
          siteSettings: nextSettings,
          selectedPageId: session.currentPageId,
          status: 'intake-review',
        });
        saveWorkspaceSession({
          mode: 'publisher',
          stage: 'intake',
          onboardingCompleted: true,
          intakeSessionId: session.id,
        });
        setPublisherOnboardingCompleted(true);
        setWorkspaceMode('publisher');
        workbenchStore.setShowWorkbench(true);
        workbenchStore.currentView.set('structure');
        toast.success(
          scenario.needsUserChoice
            ? 'Source scanned. Resolve disambiguation before intake review.'
            : 'Source scanned and ready for intake review',
        );
      } catch (error) {
        console.error(error);
        toast.error('Failed to scan source for Publisher intake');
      } finally {
        setPublisherBootstrapping(false);
      }
    }, []);

    const activeInput = isProviderAccountMode ? accountInput : input;
    const activeStreaming = (isProviderAccountMode ? accountIsLoading : isLoading) || fakeLoading;
    const activeMessages = isProviderAccountMode
      ? accountMessages
      : messages.map((message, i) => {
          if (message.role === 'user') {
            return message;
          }

          return {
            ...message,
            content: parsedMessages[i] || '',
          };
        });
    const activeData = isProviderAccountMode ? undefined : chatData;

    return (
      <BaseChat
        ref={animationScope}
        textareaRef={textareaRef}
        input={activeInput}
        showChat={showChat}
        chatStarted={chatStarted}
        workspaceMode={workspaceMode}
        publisherWorkspaceReady={publisherWorkspaceReady}
        publisherOnboardingBusy={publisherBootstrapping}
        onWorkspaceModeChange={handleWorkspaceModeChange}
        onPublisherOnboardingSubmit={handlePublisherOnboardingSubmit}
        isStreaming={activeStreaming}
        onStreamingChange={(streaming) => {
          streamingState.set(streaming);
        }}
        enhancingPrompt={enhancingPrompt}
        promptEnhanced={promptEnhanced}
        sendMessage={sendMessage}
        model={model}
        setModel={handleModelChange}
        provider={provider}
        setProvider={handleProviderChange}
        providerList={activeProviders}
        handleInputChange={(e) => {
          onTextareaChange(e);
          debouncedCachePrompt(e);
        }}
        handleStop={abort}
        description={description}
        importChat={importChat}
        exportChat={exportChat}
        messages={activeMessages}
        enhancePrompt={() => {
          enhancePrompt(
            activeInput,
            (input) => {
              if (isProviderAccountMode) {
                setAccountInput(input);
              } else {
                setInput(input);
              }

              scrollTextArea();
            },
            model,
            provider,
            apiKeys,
          );
        }}
        uploadedFiles={uploadedFiles}
        setUploadedFiles={setUploadedFiles}
        imageDataList={imageDataList}
        setImageDataList={setImageDataList}
        actionAlert={actionAlert}
        clearAlert={() => workbenchStore.clearAlert()}
        supabaseAlert={supabaseAlert}
        clearSupabaseAlert={() => workbenchStore.clearSupabaseAlert()}
        deployAlert={deployAlert}
        clearDeployAlert={() => workbenchStore.clearDeployAlert()}
        data={activeData}
      />
    );
  },
);
