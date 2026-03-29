import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LLMManager } from './manager';
import type { IProviderSetting } from '~/types/model';

describe('LLMManager auth and model fallback policy', () => {
  beforeEach(() => {
    (LLMManager as any)._instance = undefined;
  });

  it('returns no models for cloud provider without auth and does not call dynamic list', async () => {
    const manager = LLMManager.getInstance({});
    const googleProvider = manager.getProvider('Google');

    expect(googleProvider).toBeDefined();

    const dynamicSpy = vi.fn().mockResolvedValue([]);
    (googleProvider as any).getDynamicModels = dynamicSpy;

    const providerSettings: Record<string, IProviderSetting> = {
      Google: { authMode: 'apiKey' },
    };

    const models = await manager.getModelListFromProvider(googleProvider!, {
      apiKeys: {},
      providerSettings,
      serverEnv: {},
    });

    expect(dynamicSpy).not.toHaveBeenCalled();
    expect(models).toEqual([]);
  });

  it('does not fall back to static cloud models when dynamic response is empty', async () => {
    const manager = LLMManager.getInstance({});
    const groqProvider = manager.getProvider('Groq');

    expect(groqProvider).toBeDefined();

    const dynamicSpy = vi.fn().mockResolvedValue([]);
    (groqProvider as any).getDynamicModels = dynamicSpy;

    const providerSettings: Record<string, IProviderSetting> = {
      Groq: { authMode: 'apiKey' },
    };

    const models = await manager.getModelListFromProvider(groqProvider!, {
      apiKeys: { Groq: 'test-key' },
      providerSettings,
      serverEnv: {},
    });

    expect(dynamicSpy).toHaveBeenCalledOnce();
    expect(models).toEqual([]);
  });

  it('treats OpenAI account mode as authenticated for model fetch path', async () => {
    const manager = LLMManager.getInstance({});
    const openAIProvider = manager.getProvider('OpenAI');

    expect(openAIProvider).toBeDefined();

    const dynamicSpy = vi.fn().mockResolvedValue([]);
    (openAIProvider as any).getDynamicModels = dynamicSpy;

    const providerSettings: Record<string, IProviderSetting> = {
      OpenAI: { authMode: 'account' },
    };

    const models = await manager.getModelListFromProvider(openAIProvider!, {
      apiKeys: {},
      providerSettings,
      serverEnv: {},
    });

    expect(dynamicSpy).toHaveBeenCalledOnce();
    expect(models).toEqual([]);
  });

  it('treats Anthropic account mode as authenticated for model fetch path', async () => {
    const manager = LLMManager.getInstance({});
    const anthropicProvider = manager.getProvider('Anthropic');

    expect(anthropicProvider).toBeDefined();

    const dynamicSpy = vi.fn().mockResolvedValue([]);
    (anthropicProvider as any).getDynamicModels = dynamicSpy;
    (anthropicProvider as any).supportsAccountAuth = true;

    const providerSettings: Record<string, IProviderSetting> = {
      Anthropic: { authMode: 'account' },
    };

    const models = await manager.getModelListFromProvider(anthropicProvider!, {
      apiKeys: {},
      providerSettings,
      serverEnv: {},
    });

    expect(dynamicSpy).toHaveBeenCalledOnce();
    expect(models).toEqual([]);
  });
});
