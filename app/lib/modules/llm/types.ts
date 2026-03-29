import type { LanguageModelV1 } from 'ai';
import type { IProviderSetting } from '~/types/model';

export type ModelsSource = 'dynamic' | 'fallback' | 'unavailable';
export type ReasoningEffort = 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export interface ModelInfo {
  name: string;
  label: string;
  provider: string;
  maxTokenAllowed: number;
  source?: ModelsSource;
  supportedReasoningEfforts?: ReasoningEffort[];
  defaultReasoningEffort?: ReasoningEffort;
}

export interface ProviderInfo {
  name: string;
  staticModels: ModelInfo[];
  supportsApiKey?: boolean;
  supportsAccountAuth?: boolean;
  requiresAuthForModels?: boolean;
  unavailableMessage?: string;
  getDynamicModels?: (
    apiKeys?: Record<string, string>,
    settings?: IProviderSetting,
    serverEnv?: Record<string, string>,
  ) => Promise<ModelInfo[]>;
  getModelInstance: (options: {
    model: string;
    serverEnv: Env;
    apiKeys?: Record<string, string>;
    providerSettings?: Record<string, IProviderSetting>;
  }) => LanguageModelV1;
  getApiKeyLink?: string;
  labelForGetApiKey?: string;
  icon?: string;
}
export interface ProviderConfig {
  baseUrlKey?: string;
  baseUrl?: string;
  apiTokenKey?: string;
}
