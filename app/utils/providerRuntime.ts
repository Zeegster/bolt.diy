import type { ModelsSource } from '~/lib/modules/llm/types';
import type { IProviderSetting, ProviderRuntimeState } from '~/types/model';

type ProviderRuntimeInput = {
  providerName: string;
  providerSettings?: IProviderSetting;
  providerSupportsAccountAuth?: boolean;
  apiKeyConfigured?: boolean;
  accountConnected?: boolean;
  isLoading?: boolean;
  hasModels?: boolean;
  modelsSource?: ModelsSource;
  accountAuthAvailable?: boolean;
};

function getUnavailableMessage(
  providerName: string,
  providerSettings?: IProviderSetting,
  accountAuthAvailable?: boolean,
  accountConnected?: boolean,
  authConfigured?: boolean,
) {
  const authMode = providerSettings?.authMode || 'apiKey';

  if (providerName === 'OpenAI') {
    if (authMode === 'account') {
      if (!accountAuthAvailable) {
        return 'Модели недоступны. Вход через аккаунт OpenAI доступен только в desktop-режиме.';
      }

      if (accountConnected) {
        return 'Аккаунт OpenAI подключен, но модели не загрузились. Обновите статус или повторите вход.';
      }

      return 'Модели недоступны. Войдите в OpenAI аккаунт или подключите API key.';
    }

    if (authConfigured) {
      return 'OpenAI подключен, но модели не загрузились. Проверьте ключ и повторите запрос.';
    }

    return 'Модели недоступны. Подключите API key OpenAI.';
  }

  if (providerName === 'OpenRouter') {
    if (authConfigured) {
      return 'OpenRouter подключен, но модели не загрузились. Проверьте API key и доступность OpenRouter.';
    }

    return 'Модели недоступны. Подключите API key OpenRouter.';
  }

  if (providerName === 'Anthropic') {
    if (authMode === 'account') {
      if (!accountAuthAvailable) {
        return 'Модели недоступны. Вход через аккаунт Anthropic доступен только в desktop-режиме.';
      }

      if (accountConnected) {
        return 'Аккаунт Anthropic подключен, но модели не загрузились. Обновите статус или повторите вход.';
      }

      return 'Модели недоступны. Войдите в Anthropic аккаунт или подключите API key.';
    }

    if (authConfigured) {
      return 'Anthropic подключен, но модели не загрузились. Проверьте API key и повторите запрос.';
    }

    return 'Модели недоступны. Подключите API key Anthropic.';
  }

  if (authConfigured) {
    return 'Провайдер подключен, но модели не загрузились. Проверьте ключ и повторите запрос.';
  }

  return 'Модели недоступны. Подключите API key.';
}

export function getProviderRuntimeState(input: ProviderRuntimeInput): ProviderRuntimeState {
  const {
    providerName,
    providerSettings,
    providerSupportsAccountAuth = false,
    apiKeyConfigured = false,
    accountConnected = false,
    isLoading = false,
    hasModels = false,
    modelsSource = 'unavailable',
    accountAuthAvailable = false,
  } = input;

  const authMode = providerSettings?.authMode || 'apiKey';
  const isAccountAuth = providerSupportsAccountAuth && authMode === 'account';
  const authConfigured = isAccountAuth ? accountConnected : apiKeyConfigured;

  if (isLoading) {
    return {
      authState: authConfigured ? 'authenticated' : isAccountAuth ? 'pending' : 'missing',
      modelsState: 'loading',
      modelsSource,
      warningMessage: authConfigured
        ? undefined
        : getUnavailableMessage(providerName, providerSettings, accountAuthAvailable, accountConnected, authConfigured),
      statusMessage: 'Loading models...',
    };
  }

  if (hasModels) {
    return {
      authState: authConfigured ? 'authenticated' : 'missing',
      modelsState: 'ready',
      modelsSource,
      warningMessage: undefined,
      statusMessage: undefined,
    };
  }

  return {
    authState: authConfigured ? 'authenticated' : 'missing',
    modelsState: 'unavailable',
    modelsSource: 'unavailable',
    warningMessage: getUnavailableMessage(
      providerName,
      providerSettings,
      accountAuthAvailable,
      accountConnected,
      authConfigured,
    ),
    statusMessage: authConfigured ? 'No models returned by provider.' : undefined,
  };
}
