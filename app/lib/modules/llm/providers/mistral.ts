import { BaseProvider } from '~/lib/modules/llm/base-provider';
import type { ModelInfo } from '~/lib/modules/llm/types';
import type { IProviderSetting } from '~/types/model';
import type { LanguageModelV1 } from 'ai';
import { createMistral } from '@ai-sdk/mistral';

export default class MistralProvider extends BaseProvider {
  name = 'Mistral';
  getApiKeyLink = 'https://console.mistral.ai/api-keys/';
  supportsApiKey = true;
  supportsAccountAuth = false;
  requiresAuthForModels = true;
  unavailableMessage = 'Модели недоступны. Подключите API key.';

  config = {
    apiTokenKey: 'MISTRAL_API_KEY',
  };

  staticModels: ModelInfo[] = [
    { name: 'open-mistral-7b', label: 'Mistral 7B', provider: 'Mistral', maxTokenAllowed: 8000 },
    { name: 'open-mixtral-8x7b', label: 'Mistral 8x7B', provider: 'Mistral', maxTokenAllowed: 8000 },
    { name: 'open-mixtral-8x22b', label: 'Mistral 8x22B', provider: 'Mistral', maxTokenAllowed: 8000 },
    { name: 'open-codestral-mamba', label: 'Codestral Mamba', provider: 'Mistral', maxTokenAllowed: 8000 },
    { name: 'open-mistral-nemo', label: 'Mistral Nemo', provider: 'Mistral', maxTokenAllowed: 8000 },
    { name: 'ministral-8b-latest', label: 'Mistral 8B', provider: 'Mistral', maxTokenAllowed: 8000 },
    { name: 'mistral-small-latest', label: 'Mistral Small', provider: 'Mistral', maxTokenAllowed: 8000 },
    { name: 'codestral-latest', label: 'Codestral', provider: 'Mistral', maxTokenAllowed: 8000 },
    { name: 'mistral-large-latest', label: 'Mistral Large Latest', provider: 'Mistral', maxTokenAllowed: 8000 },
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
      defaultApiTokenKey: 'MISTRAL_API_KEY',
    });

    if (!apiKey) {
      return [];
    }

    const response = await fetch('https://api.mistral.ai/v1/models', {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Mistral models request failed: ${response.status} ${response.statusText} ${text}`);
    }

    const payload = (await response.json()) as any;
    const modelsFromApi = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.data)
        ? payload.data
        : Array.isArray(payload?.models)
          ? payload.models
          : [];

    const staticModelIds = new Set(this.staticModels.map((model) => model.name));

    return modelsFromApi
      .map((model: any) => {
        const name = model?.id || model?.name;
        const contextLength = model?.max_context_length || model?.context_length || model?.contextLength || 32000;

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
      defaultApiTokenKey: 'MISTRAL_API_KEY',
    });

    if (!apiKey) {
      throw new Error(`Missing API key for ${this.name} provider`);
    }

    const mistral = createMistral({
      apiKey,
    });

    return mistral(model);
  }
}
