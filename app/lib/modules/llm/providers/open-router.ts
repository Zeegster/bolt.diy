import { BaseProvider } from '~/lib/modules/llm/base-provider';
import type { ModelInfo } from '~/lib/modules/llm/types';
import type { IProviderSetting } from '~/types/model';
import type { LanguageModelV1 } from 'ai';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';

interface OpenRouterModel {
  name: string;
  id: string;
  context_length: number;
  pricing: {
    prompt: number;
    completion: number;
  };
}

interface OpenRouterModelsResponse {
  data: OpenRouterModel[];
}

export default class OpenRouterProvider extends BaseProvider {
  name = 'OpenRouter';
  getApiKeyLink = 'https://openrouter.ai/settings/keys';
  supportsApiKey = true;
  supportsAccountAuth = false;
  requiresAuthForModels = true;
  unavailableMessage = 'Модели недоступны. Подключите API key OpenRouter.';

  config = {
    apiTokenKey: 'OPEN_ROUTER_API_KEY',
  };

  staticModels: ModelInfo[] = [];

  async getDynamicModels(
    apiKeys?: Record<string, string>,
    settings?: IProviderSetting,
    serverEnv: Record<string, string> = {},
  ): Promise<ModelInfo[]> {
    try {
      const { apiKey } = this.getProviderBaseUrlAndKey({
        apiKeys,
        providerSettings: settings,
        serverEnv,
        defaultBaseUrlKey: '',
        defaultApiTokenKey: 'OPEN_ROUTER_API_KEY',
      });

      if (!apiKey) {
        throw new Error(`Missing API key for ${this.name} provider`);
      }

      const response = await fetch('https://openrouter.ai/api/v1/models', {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
      });

      if (!response.ok) {
        const responseText = await response.text();
        throw new Error(`OpenRouter models request failed: ${response.status} ${response.statusText} ${responseText}`);
      }

      const data = (await response.json()) as OpenRouterModelsResponse;

      return data.data
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((m) => ({
          name: m.id,
          label: `${m.name} - in:$${(m.pricing.prompt * 1_000_000).toFixed(2)} out:$${(m.pricing.completion * 1_000_000).toFixed(2)} - context ${Math.floor(m.context_length / 1000)}k`,
          provider: this.name,
          maxTokenAllowed: m.context_length || 8000,
          source: 'dynamic',
        }));
    } catch (error) {
      console.error('Error getting OpenRouter models:', error);
      return [];
    }
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
      defaultApiTokenKey: 'OPEN_ROUTER_API_KEY',
    });

    if (!apiKey) {
      throw new Error(`Missing API key for ${this.name} provider`);
    }

    const openRouter = createOpenRouter({
      apiKey,
    });
    const instance = openRouter.chat(model) as LanguageModelV1;

    return instance;
  }
}
