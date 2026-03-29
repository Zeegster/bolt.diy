import { BaseProvider } from '~/lib/modules/llm/base-provider';
import type { ModelInfo } from '~/lib/modules/llm/types';
import type { IProviderSetting } from '~/types/model';
import type { LanguageModelV1 } from 'ai';
import { createCohere } from '@ai-sdk/cohere';

export default class CohereProvider extends BaseProvider {
  name = 'Cohere';
  getApiKeyLink = 'https://dashboard.cohere.com/api-keys';
  supportsApiKey = true;
  supportsAccountAuth = false;
  requiresAuthForModels = true;
  unavailableMessage = 'Модели недоступны. Подключите API key.';

  config = {
    apiTokenKey: 'COHERE_API_KEY',
  };

  staticModels: ModelInfo[] = [
    { name: 'command-r-plus-08-2024', label: 'Command R plus Latest', provider: 'Cohere', maxTokenAllowed: 4096 },
    { name: 'command-r-08-2024', label: 'Command R Latest', provider: 'Cohere', maxTokenAllowed: 4096 },
    { name: 'command-r-plus', label: 'Command R plus', provider: 'Cohere', maxTokenAllowed: 4096 },
    { name: 'command-r', label: 'Command R', provider: 'Cohere', maxTokenAllowed: 4096 },
    { name: 'command', label: 'Command', provider: 'Cohere', maxTokenAllowed: 4096 },
    { name: 'command-nightly', label: 'Command Nightly', provider: 'Cohere', maxTokenAllowed: 4096 },
    { name: 'command-light', label: 'Command Light', provider: 'Cohere', maxTokenAllowed: 4096 },
    { name: 'command-light-nightly', label: 'Command Light Nightly', provider: 'Cohere', maxTokenAllowed: 4096 },
    { name: 'c4ai-aya-expanse-8b', label: 'c4AI Aya Expanse 8b', provider: 'Cohere', maxTokenAllowed: 4096 },
    { name: 'c4ai-aya-expanse-32b', label: 'c4AI Aya Expanse 32b', provider: 'Cohere', maxTokenAllowed: 4096 },
  ];

  async getDynamicModels(
    apiKeys?: Record<string, string>,
    settings?: IProviderSetting,
    serverEnv?: Record<string, string>,
  ): Promise<ModelInfo[]> {
    const { apiKey } = this.getProviderBaseUrlAndKey({
      apiKeys,
      providerSettings: settings,
      serverEnv: serverEnv as any,
      defaultBaseUrlKey: '',
      defaultApiTokenKey: 'COHERE_API_KEY',
    });

    if (!apiKey) {
      return [];
    }

    const response = await fetch('https://api.cohere.com/v1/models', {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Cohere models request failed: ${response.status} ${response.statusText} ${text}`);
    }

    const payload = (await response.json()) as any;
    const modelsFromApi = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.models)
        ? payload.models
        : Array.isArray(payload?.data)
          ? payload.data
          : [];

    const staticModelIds = new Set(this.staticModels.map((model) => model.name));

    return modelsFromApi
      .map((model: any) => {
        const name = model?.name || model?.id;
        const contextLength = model?.context_length || model?.contextLength || model?.max_input_tokens || 4096;

        return name
          ? {
              name,
              label: name,
              provider: this.name,
              maxTokenAllowed: contextLength,
              source: 'dynamic' as const,
            }
          : null;
      })
      .filter((model: ModelInfo | null): model is ModelInfo => Boolean(model))
      .filter((model: ModelInfo) => !staticModelIds.has(model.name));
  }

  getModelInstance(options: {
    model: string;
    serverEnv: Env;
    apiKeys?: Record<string, string>;
    providerSettings?: Record<string, IProviderSetting>;
  }): LanguageModelV1 {
    const { model, serverEnv, apiKeys, providerSettings } = options;

    const { apiKey } = this.getProviderBaseUrlAndKey({
      apiKeys,
      providerSettings: providerSettings?.[this.name],
      serverEnv: serverEnv as any,
      defaultBaseUrlKey: '',
      defaultApiTokenKey: 'COHERE_API_KEY',
    });

    if (!apiKey) {
      throw new Error(`Missing API key for ${this.name} provider`);
    }

    const cohere = createCohere({
      apiKey,
    });

    return cohere(model);
  }
}
