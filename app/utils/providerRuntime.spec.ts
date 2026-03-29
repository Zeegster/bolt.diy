import { describe, expect, it } from 'vitest';
import { getProviderRuntimeState } from './providerRuntime';

describe('getProviderRuntimeState', () => {
  it('returns OpenRouter warning when API key is missing', () => {
    const state = getProviderRuntimeState({
      providerName: 'OpenRouter',
      providerSettings: { authMode: 'apiKey' },
      apiKeyConfigured: false,
      hasModels: false,
    });

    expect(state.modelsState).toBe('unavailable');
    expect(state.warningMessage).toBe('Модели недоступны. Подключите API key OpenRouter.');
  });

  it('returns OpenRouter load failure warning when auth is configured but models are missing', () => {
    const state = getProviderRuntimeState({
      providerName: 'OpenRouter',
      providerSettings: { authMode: 'apiKey' },
      apiKeyConfigured: true,
      hasModels: false,
    });

    expect(state.authState).toBe('authenticated');
    expect(state.warningMessage).toBe(
      'OpenRouter подключен, но модели не загрузились. Проверьте API key и доступность OpenRouter.',
    );
  });

  it('returns OpenAI account warning when account auth is missing', () => {
    const state = getProviderRuntimeState({
      providerName: 'OpenAI',
      providerSettings: { authMode: 'account' },
      providerSupportsAccountAuth: true,
      accountAuthAvailable: true,
      accountConnected: false,
      hasModels: false,
    });

    expect(state.authState).toBe('missing');
    expect(state.warningMessage).toBe('Модели недоступны. Войдите в OpenAI аккаунт или подключите API key.');
  });

  it('returns Anthropic account warning when account auth is missing', () => {
    const state = getProviderRuntimeState({
      providerName: 'Anthropic',
      providerSettings: { authMode: 'account' },
      providerSupportsAccountAuth: true,
      accountAuthAvailable: true,
      accountConnected: false,
      hasModels: false,
    });

    expect(state.authState).toBe('missing');
    expect(state.warningMessage).toBe('Модели недоступны. Войдите в Anthropic аккаунт или подключите API key.');
  });

  it('returns ready state when provider has real models', () => {
    const state = getProviderRuntimeState({
      providerName: 'Anthropic',
      providerSettings: { authMode: 'apiKey' },
      apiKeyConfigured: true,
      hasModels: true,
      modelsSource: 'dynamic',
    });

    expect(state.authState).toBe('authenticated');
    expect(state.modelsState).toBe('ready');
    expect(state.modelsSource).toBe('dynamic');
    expect(state.warningMessage).toBeUndefined();
  });

  it('marks Anthropic account mode as authenticated when account is connected and models are loaded', () => {
    const state = getProviderRuntimeState({
      providerName: 'Anthropic',
      providerSettings: { authMode: 'account' },
      providerSupportsAccountAuth: true,
      accountAuthAvailable: true,
      accountConnected: true,
      hasModels: true,
      modelsSource: 'dynamic',
    });

    expect(state.authState).toBe('authenticated');
    expect(state.modelsState).toBe('ready');
    expect(state.warningMessage).toBeUndefined();
  });
});
