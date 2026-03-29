import { useMemo, useState } from 'react';
import type { ModelInfo, ReasoningEffort } from '~/lib/modules/llm/types';
import type { ProviderInfo, ProviderRuntimeState } from '~/types/model';
import { classNames } from '~/utils/classNames';
import { APIKeyManager } from './APIKeyManager';
import { ProviderModelSettings } from './ProviderModelSettings';

type SettingsTab = 'model' | 'connection';

interface ProviderSettingsPopoverProps {
  provider: ProviderInfo;
  apiKey: string;
  authMode?: 'apiKey' | 'account';
  runtimeState?: ProviderRuntimeState;
  accountAuthAvailable?: boolean;
  selectedModel?: ModelInfo;
  reasoningEffort?: ReasoningEffort;
  customModelId?: string;
  onApiKeyChange: (key: string) => void;
  onAuthModeChange?: (mode: 'apiKey' | 'account') => Promise<void> | void;
  onAccountLogin?: () => Promise<void> | void;
  onRefreshStatus?: () => Promise<void> | void;
  onProviderAuthChange?: () => Promise<void> | void;
  onReasoningEffortChange?: (effort?: ReasoningEffort) => void;
  onCustomModelIdSave?: (customModelId?: string) => Promise<void> | void;
}

export function ProviderSettingsPopover({
  provider,
  apiKey,
  authMode,
  runtimeState,
  accountAuthAvailable,
  selectedModel,
  reasoningEffort,
  customModelId,
  onApiKeyChange,
  onAuthModeChange,
  onAccountLogin,
  onRefreshStatus,
  onProviderAuthChange,
  onReasoningEffortChange,
  onCustomModelIdSave,
}: ProviderSettingsPopoverProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('model');

  const tabs = useMemo(
    () => [
      { id: 'model' as const, label: 'Model settings', icon: 'i-ph:sliders-horizontal' },
      { id: 'connection' as const, label: 'Connection settings', icon: 'i-ph:plugs' },
    ],
    [],
  );

  return (
    <div className="w-[min(25rem,88vw)] space-y-3">
      <div className="rounded-md border border-bolt-elements-borderColor bg-bolt-elements-item-backgroundDefault p-1">
        <div className="grid grid-cols-2 gap-1">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={classNames(
                  'flex items-center justify-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors',
                  isActive
                    ? 'bg-bolt-elements-item-backgroundAccent text-bolt-elements-item-contentAccent'
                    : 'text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-3',
                )}
              >
                <span className={`${tab.icon} h-4 w-4`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-2">
        {activeTab === 'model' ? (
          <ProviderModelSettings
            providerName={provider.name}
            authMode={authMode}
            selectedModel={selectedModel}
            reasoningEffort={reasoningEffort}
            customModelId={customModelId}
            onReasoningEffortChange={onReasoningEffortChange}
            onCustomModelIdSave={onCustomModelIdSave}
            showTitle={false}
          />
        ) : (
          <APIKeyManager
            provider={provider}
            apiKey={apiKey}
            setApiKey={onApiKeyChange}
            authMode={authMode}
            runtimeState={runtimeState}
            accountAuthAvailable={accountAuthAvailable}
            onAuthModeChange={onAuthModeChange}
            onAccountLogin={onAccountLogin}
            onRefreshStatus={onRefreshStatus}
            onProviderAuthChange={onProviderAuthChange}
          />
        )}
      </div>
    </div>
  );
}
