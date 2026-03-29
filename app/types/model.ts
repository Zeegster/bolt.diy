import type { ModelInfo, ModelsSource, ReasoningEffort } from '~/lib/modules/llm/types';

export type ProviderInfo = {
  staticModels: ModelInfo[];
  name: string;
  supportsApiKey?: boolean;
  supportsAccountAuth?: boolean;
  requiresAuthForModels?: boolean;
  unavailableMessage?: string;
  getDynamicModels?: (
    providerName: string,
    apiKeys?: Record<string, string>,
    providerSettings?: IProviderSetting,
    serverEnv?: Record<string, string>,
  ) => Promise<ModelInfo[]>;
  getApiKeyLink?: string;
  labelForGetApiKey?: string;
  icon?: string;
};

export interface IProviderSetting {
  enabled?: boolean;
  baseUrl?: string;
  authMode?: 'apiKey' | 'account';
  reasoningEffort?: ReasoningEffort;
  customModelId?: string;
}

export type IProviderConfig = ProviderInfo & {
  settings: IProviderSetting;
};

export interface ProviderRuntimeState {
  authState: 'missing' | 'pending' | 'authenticated' | 'error';
  modelsState: 'unavailable' | 'loading' | 'ready' | 'error';
  modelsSource: ModelsSource;
  warningMessage?: string;
  statusMessage?: string;
}

export interface AccountUpstreamUsage {
  inputTokens?: number;
  cachedInputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  totalCostUsd?: number;
  durationMs?: number;
  cacheCreationInputTokens?: number;
  cacheReadInputTokens?: number;
}

export interface AccountTurnMetrics {
  provider: string;
  model: string;
  effort?: ReasoningEffort;
  threadId: string;
  turnId: string;
  userInputChars: number;
  userInputBytes: number;
  userInputHash: string;
  boltOutboundPayloadChars: number;
  boltOutboundPayloadBytes: number;
  boltOutboundOverheadChars: number;
  boltOutboundOverheadBytes: number;
  inboundDeltaTextChars: number;
  inboundDeltaTextBytes: number;
  inboundEventEnvelopeChars: number;
  inboundEventEnvelopeBytes: number;
  inboundBoltOverheadChars: number;
  inboundBoltOverheadBytes: number;
  responseTextChars: number;
  responseTextBytes: number;
  responseTextHash: string;
  upstreamUsage?: AccountUpstreamUsage;
  timings: {
    startedAt: string;
    firstDeltaMs?: number;
    completedMs: number;
  };
}
