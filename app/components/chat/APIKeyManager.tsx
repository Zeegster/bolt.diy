import React, { useState, useEffect, useCallback } from 'react';
import Cookies from 'js-cookie';
import { IconButton } from '~/components/ui/IconButton';
import WithTooltip from '~/components/ui/Tooltip';
import type { ProviderInfo, ProviderRuntimeState } from '~/types/model';
import { ProviderIcon } from './providerIcons';

interface APIKeyManagerProps {
  provider: ProviderInfo;
  apiKey: string;
  setApiKey: (key: string) => void;
  authMode?: 'apiKey' | 'account';
  runtimeState?: ProviderRuntimeState;
  accountAuthAvailable?: boolean;
  onAuthModeChange?: (mode: 'apiKey' | 'account') => void;
  onAccountLogin?: () => Promise<void> | void;
  onRefreshStatus?: () => Promise<void> | void;
  onProviderAuthChange?: () => Promise<void> | void;
}

// cache which stores whether the provider's API key is set via environment variable
const providerEnvKeyStatusCache: Record<string, boolean> = {};
const apiKeyMemoizeCache: { [k: string]: Record<string, string> } = {};

export function getApiKeysFromCookies() {
  const storedApiKeys = Cookies.get('apiKeys');
  let parsedKeys: Record<string, string> = {};

  if (storedApiKeys) {
    parsedKeys = apiKeyMemoizeCache[storedApiKeys];

    if (!parsedKeys) {
      parsedKeys = apiKeyMemoizeCache[storedApiKeys] = JSON.parse(storedApiKeys);
    }
  }

  return parsedKeys;
}

// eslint-disable-next-line @typescript-eslint/naming-convention
export const APIKeyManager: React.FC<APIKeyManagerProps> = ({
  provider,
  apiKey,
  setApiKey,
  authMode = 'apiKey',
  runtimeState,
  accountAuthAvailable = false,
  onAuthModeChange,
  onAccountLogin,
  onRefreshStatus,
  onProviderAuthChange,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [tempKey, setTempKey] = useState(apiKey);
  const [isEnvKeySet, setIsEnvKeySet] = useState(false);
  const [isLoginPending, setIsLoginPending] = useState(false);

  useEffect(() => {
    const savedKeys = getApiKeysFromCookies();
    const savedKey = savedKeys[provider.name] || '';

    setTempKey(savedKey);
    setApiKey(savedKey);
    setIsEditing(false);
  }, [provider.name]);

  const checkEnvApiKey = useCallback(async () => {
    if (providerEnvKeyStatusCache[provider.name] !== undefined) {
      setIsEnvKeySet(providerEnvKeyStatusCache[provider.name]);
      return;
    }

    try {
      const response = await fetch(`/api/check-env-key?provider=${encodeURIComponent(provider.name)}`);
      const data = await response.json();
      const isSet = (data as { isSet: boolean }).isSet;

      providerEnvKeyStatusCache[provider.name] = isSet;
      setIsEnvKeySet(isSet);
    } catch (error) {
      console.error('Failed to check environment API key:', error);
      setIsEnvKeySet(false);
    }
  }, [provider.name]);

  useEffect(() => {
    checkEnvApiKey();
  }, [checkEnvApiKey]);

  const handleSave = () => {
    setApiKey(tempKey);

    const currentKeys = getApiKeysFromCookies();
    const newKeys = { ...currentKeys, [provider.name]: tempKey };
    Cookies.set('apiKeys', JSON.stringify(newKeys));

    setIsEditing(false);
    void onProviderAuthChange?.();
  };

  const supportsAccountAuth = provider.supportsAccountAuth === true;
  const supportsApiKey = provider.supportsApiKey !== false;
  const isAccountMode = supportsAccountAuth && authMode === 'account';
  const shouldShowApiKeyEditor = supportsApiKey && !isAccountMode;

  const handleAccountLogin = async () => {
    if (!onAccountLogin) {
      return;
    }

    try {
      setIsLoginPending(true);
      await onAccountLogin();
    } finally {
      setIsLoginPending(false);
    }
  };

  return (
    <div className="space-y-2 py-2 px-1">
      {supportsAccountAuth && (
        <div className="flex items-center gap-1">
          <WithTooltip tooltip={`${provider.name} account mode`}>
            <button
              type="button"
              aria-label={`${provider.name} account mode`}
              className={`rounded-md p-1.5 transition-colors ${
                isAccountMode
                  ? 'bg-bolt-elements-item-backgroundAccent text-bolt-elements-item-contentAccent'
                  : 'bg-bolt-elements-item-backgroundDefault text-bolt-elements-item-contentDefault'
              }`}
              onClick={() => onAuthModeChange?.('account')}
            >
              <div className="i-ph:user-circle h-4 w-4" />
            </button>
          </WithTooltip>

          <WithTooltip tooltip={`${provider.name} API key mode`}>
            <button
              type="button"
              aria-label={`${provider.name} API key mode`}
              className={`rounded-md p-1.5 transition-colors ${
                !isAccountMode
                  ? 'bg-bolt-elements-item-backgroundAccent text-bolt-elements-item-contentAccent'
                  : 'bg-bolt-elements-item-backgroundDefault text-bolt-elements-item-contentDefault'
              }`}
              onClick={() => onAuthModeChange?.('apiKey')}
            >
              <div className="i-ph:key h-4 w-4" />
            </button>
          </WithTooltip>
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <ProviderIcon providerName={provider.name} className="h-4 w-4 shrink-0 text-bolt-elements-textSecondary" />

          {!isEditing && !isAccountMode && (
            <div className="flex items-center gap-1.5">
              {apiKey ? (
                <>
                  <div className="i-ph:check-circle-fill h-4 w-4 text-green-500" />
                  <span className="text-xs text-green-500">API key set</span>
                </>
              ) : isEnvKeySet ? (
                <>
                  <div className="i-ph:check-circle-fill h-4 w-4 text-green-500" />
                  <span className="text-xs text-green-500">API key from env</span>
                </>
              ) : (
                <>
                  <div className="i-ph:x-circle-fill h-4 w-4 text-red-500" />
                  <span className="text-xs text-red-500">API key missing</span>
                </>
              )}
            </div>
          )}

          {isAccountMode && (
            <div className="flex items-center gap-1.5">
              {runtimeState?.authState === 'authenticated' ? (
                <>
                  <div className="i-ph:check-circle-fill h-4 w-4 text-green-500" />
                  <span className="text-xs text-green-500">Account connected</span>
                </>
              ) : (
                <>
                  <div className="i-ph:x-circle-fill h-4 w-4 text-amber-500" />
                  <span className="text-xs text-amber-400">
                    {accountAuthAvailable ? 'Authentication required' : 'Desktop auth unavailable'}
                  </span>
                </>
              )}
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {shouldShowApiKeyEditor && isEditing ? (
            <div className="flex items-center gap-2">
              <input
                type="password"
                value={tempKey}
                placeholder="Enter API Key"
                onChange={(e) => setTempKey(e.target.value)}
                className="w-[260px] rounded border border-bolt-elements-borderColor bg-bolt-elements-prompt-background px-3 py-1.5 text-sm text-bolt-elements-textPrimary focus:outline-none focus:ring-2 focus:ring-bolt-elements-focus"
              />
              <IconButton
                onClick={handleSave}
                title="Save API key"
                className="bg-green-500/10 text-green-500 hover:bg-green-500/20"
              >
                <div className="i-ph:check h-4 w-4" />
              </IconButton>
              <IconButton
                onClick={() => setIsEditing(false)}
                title="Cancel"
                className="bg-red-500/10 text-red-500 hover:bg-red-500/20"
              >
                <div className="i-ph:x h-4 w-4" />
              </IconButton>
            </div>
          ) : isAccountMode ? (
            <>
              <WithTooltip tooltip={isLoginPending ? 'Opening login window...' : 'Sign in to account'}>
                <span>
                  <IconButton
                    onClick={() => void handleAccountLogin()}
                    title="Sign in"
                    disabled={!accountAuthAvailable || isLoginPending}
                    className="bg-blue-500/10 text-blue-300 enabled:hover:bg-blue-500/20"
                  >
                    <div
                      className={isLoginPending ? 'i-ph:spinner-gap h-4 w-4 animate-spin' : 'i-ph:sign-in h-4 w-4'}
                    />
                  </IconButton>
                </span>
              </WithTooltip>

              <WithTooltip tooltip="Refresh auth status">
                <span>
                  <IconButton
                    onClick={() => void onRefreshStatus?.()}
                    title="Refresh status"
                    className="bg-bolt-elements-item-backgroundDefault text-bolt-elements-item-contentDefault"
                  >
                    <div className="i-ph:arrows-clockwise h-4 w-4" />
                  </IconButton>
                </span>
              </WithTooltip>
            </>
          ) : (
            <>
              <WithTooltip tooltip="Edit API key">
                <span>
                  <IconButton
                    onClick={() => setIsEditing(true)}
                    title="Edit API key"
                    className="bg-blue-500/10 text-blue-500 hover:bg-blue-500/20"
                  >
                    <div className="i-ph:pencil-simple h-4 w-4" />
                  </IconButton>
                </span>
              </WithTooltip>

              {provider.getApiKeyLink && !apiKey && (
                <WithTooltip tooltip={provider.labelForGetApiKey || 'Get API key'}>
                  <span>
                    <IconButton
                      onClick={() => window.open(provider.getApiKeyLink)}
                      title="Get API key"
                      className="bg-purple-500/10 text-purple-500 hover:bg-purple-500/20"
                    >
                      <div className="i-ph:key h-4 w-4" />
                    </IconButton>
                  </span>
                </WithTooltip>
              )}
            </>
          )}
        </div>
      </div>

      {runtimeState?.warningMessage && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          {runtimeState.warningMessage}
        </div>
      )}
    </div>
  );
};
