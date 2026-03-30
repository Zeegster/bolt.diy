import type {
  IntakeAiBatchPageInput,
  IntakeAiBatchResult,
  IntakeAiSuggestion,
  IntakePageDraft,
  IntakeScriptRun,
} from '~/types/publisher';
import { PROVIDER_LIST } from '~/utils/constants';
import {
  buildIntakeBatchNormalizePrompt,
  buildIntakeNormalizePrompt,
  parseIntakeBatchNormalizeOutput,
  parseIntakeNormalizeOutput,
} from './intake-pipeline';

function getProviderInfo(providerName: string) {
  return PROVIDER_LIST.find((provider) => provider.name === providerName);
}

export async function normalizeIntakePageWithProvider(options: {
  page: IntakePageDraft;
  rawSource: string;
  providerName: string;
  model: string;
}): Promise<{ suggestion: IntakeAiSuggestion; scriptRun: IntakeScriptRun; raw: string }> {
  const provider = getProviderInfo(options.providerName);

  if (!provider) {
    throw new Error(`Unknown provider: ${options.providerName}`);
  }

  const prompt = buildIntakeNormalizePrompt({
    page: {
      id: options.page.id,
      role: options.page.role,
      slug: options.page.slug,
      path: options.page.path,
      title: options.page.title,
      description: options.page.description,
      h1: options.page.h1,
    } as any,
    sourceText: options.rawSource,
    parserWarnings: options.page.warnings.map((warning) => warning.message),
    sourceFamily: options.page.sourceFamily,
    provider: options.providerName.toLowerCase(),
    model: options.model,
  });

  const response = await fetch('/api/llmcall', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      system: prompt.system,
      message: prompt.user,
      model: options.model,
      provider,
      streamOutput: false,
    }),
  });

  if (!response.ok) {
    throw new Error(`AI normalize failed with status ${response.status}`);
  }

  const payload = (await response.json()) as { text?: string };
  const raw = typeof payload.text === 'string' ? payload.text : '';
  const suggestion = parseIntakeNormalizeOutput(raw);

  return {
    suggestion,
    raw,
    scriptRun: {
      id: `ai-${Date.now().toString(36)}`,
      pageId: options.page.id,
      runnerKind: 'ai-extraction',
      provider: options.providerName.toLowerCase().includes('anthropic') ? 'anthropic' : 'openai',
      model: options.model,
      inputSummary: `${options.page.id} · ${options.page.sourceFamily}`,
      outputSummary: `title:${suggestion.title ?? 'null'} sections:${suggestion.sections.length}`,
      success: true,
      createdAt: new Date().toISOString(),
    },
  };
}

export async function normalizeIntakePagesWithProvider(options: {
  pages: IntakeAiBatchPageInput[];
  providerName: string;
  model: string;
}): Promise<{ result: IntakeAiBatchResult; scriptRun: IntakeScriptRun; raw: string }> {
  const provider = getProviderInfo(options.providerName);

  if (!provider) {
    throw new Error(`Unknown provider: ${options.providerName}`);
  }

  if (options.pages.length === 0) {
    throw new Error('No pages were provided for batch AI normalization.');
  }

  const prompt = buildIntakeBatchNormalizePrompt({
    pages: options.pages,
    provider: options.providerName.toLowerCase(),
    model: options.model,
  });

  const response = await fetch('/api/llmcall', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      system: prompt.system,
      message: prompt.user,
      model: options.model,
      provider,
      streamOutput: false,
    }),
  });

  if (!response.ok) {
    throw new Error(`AI batch normalize failed with status ${response.status}`);
  }

  const payload = (await response.json()) as { text?: string };
  const raw = typeof payload.text === 'string' ? payload.text : '';
  const result = parseIntakeBatchNormalizeOutput(raw);

  return {
    result,
    raw,
    scriptRun: {
      id: `ai-batch-${Date.now().toString(36)}`,
      runnerKind: 'ai-extraction',
      provider: options.providerName.toLowerCase().includes('anthropic') ? 'anthropic' : 'openai',
      model: options.model,
      inputSummary: `batch:${options.pages.length}`,
      outputSummary: `pages:${result.pages.length}`,
      success: true,
      createdAt: new Date().toISOString(),
    },
  };
}
