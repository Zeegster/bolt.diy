import { useEffect, useMemo, useState } from 'react';
import type { ModelInfo, ReasoningEffort } from '~/lib/modules/llm/types';

interface ProviderModelSettingsProps {
  providerName?: string;
  authMode?: 'apiKey' | 'account';
  selectedModel?: ModelInfo;
  reasoningEffort?: ReasoningEffort;
  customModelId?: string;
  disabled?: boolean;
  showTitle?: boolean;
  emptyStateMessage?: string;
  onReasoningEffortChange?: (effort?: ReasoningEffort) => void;
  onCustomModelIdSave?: (customModelId?: string) => Promise<void> | void;
}

const EFFORT_LABELS: Record<ReasoningEffort, string> = {
  none: 'None',
  minimal: 'Minimal',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  xhigh: 'Extra high',
  max: 'Max',
};

export function ProviderModelSettings({
  providerName,
  authMode = 'apiKey',
  selectedModel,
  reasoningEffort,
  customModelId,
  disabled = false,
  showTitle = false,
  emptyStateMessage = 'No model settings available for this model or auth mode.',
  onReasoningEffortChange,
  onCustomModelIdSave,
}: ProviderModelSettingsProps) {
  const [customModelInput, setCustomModelInput] = useState(customModelId || '');
  const [isSavingCustomModel, setIsSavingCustomModel] = useState(false);
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);

  useEffect(() => {
    setCustomModelInput(customModelId || '');
  }, [providerName, customModelId]);

  useEffect(() => {
    setIsAdvancedOpen(false);
  }, [providerName, authMode]);

  const isAccountMode = authMode === 'account';
  const supportedEfforts = selectedModel?.supportedReasoningEfforts || [];
  const showEffortControl = isAccountMode && supportedEfforts.length > 0;
  const showCustomModelControl = isAccountMode && providerName === 'Anthropic';

  const normalizedInput = customModelInput.trim();
  const normalizedCurrentCustomModel = (customModelId || '').trim();
  const hasCustomModelChanges = normalizedInput !== normalizedCurrentCustomModel;

  const saveCustomModel = async () => {
    if (!onCustomModelIdSave || !hasCustomModelChanges || disabled || isSavingCustomModel) {
      return;
    }

    try {
      setIsSavingCustomModel(true);
      await onCustomModelIdSave(normalizedInput || undefined);
    } finally {
      setIsSavingCustomModel(false);
    }
  };

  const effortOptions = useMemo(
    () =>
      supportedEfforts.map((effort) => ({
        value: effort,
        label: EFFORT_LABELS[effort] || effort,
      })),
    [supportedEfforts],
  );

  const hasAnyModelControls = showEffortControl || showCustomModelControl;

  return (
    <div className="w-[min(22rem,80vw)] space-y-3">
      {showTitle ? (
        <div className="text-xs font-semibold uppercase tracking-wide text-bolt-elements-textTertiary">
          Model Settings
        </div>
      ) : null}

      <div className="space-y-3">
        {!hasAnyModelControls ? (
          <div className="rounded-md border border-bolt-elements-borderColor bg-bolt-elements-item-backgroundDefault px-3 py-2 text-xs text-bolt-elements-textSecondary">
            {emptyStateMessage}
          </div>
        ) : null}

        {showEffortControl && (
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-bolt-elements-textSecondary">Reasoning effort</label>
            <select
              value={reasoningEffort || effortOptions[0]?.value || ''}
              disabled={disabled}
              onChange={(event) => {
                const value = event.target.value as ReasoningEffort;
                onReasoningEffortChange?.(value || undefined);
              }}
              className="rounded-md border border-bolt-elements-borderColor bg-bolt-elements-prompt-background px-2 py-1.5 text-sm text-bolt-elements-textPrimary focus:outline-none focus:ring-2 focus:ring-bolt-elements-focus disabled:opacity-50"
            >
              {effortOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {showCustomModelControl && (
          <div className="border-t border-bolt-elements-borderColor pt-2">
            <button
              type="button"
              className="flex w-full items-center justify-between rounded-md px-1 py-1 text-xs font-medium text-bolt-elements-textSecondary transition-colors hover:bg-bolt-elements-item-backgroundDefault"
              onClick={() => setIsAdvancedOpen((value) => !value)}
            >
              <span>Advanced</span>
              <span className={`i-ph:caret-${isAdvancedOpen ? 'up' : 'down'} h-4 w-4`} />
            </button>

            <div className={isAdvancedOpen ? 'mt-2 flex flex-col gap-2' : 'hidden'}>
              <label className="text-xs font-medium text-bolt-elements-textSecondary">
                Custom model ID (Anthropic)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={customModelInput}
                  disabled={disabled}
                  placeholder="e.g. claude-sonnet-4-6"
                  className="w-full rounded-md border border-bolt-elements-borderColor bg-bolt-elements-prompt-background px-2 py-1.5 text-sm text-bolt-elements-textPrimary focus:outline-none focus:ring-2 focus:ring-bolt-elements-focus disabled:opacity-50"
                  onChange={(event) => setCustomModelInput(event.target.value)}
                  onBlur={() => {
                    void saveCustomModel();
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      void saveCustomModel();
                    }
                  }}
                />
                <button
                  type="button"
                  disabled={disabled || isSavingCustomModel || !hasCustomModelChanges}
                  onClick={() => {
                    void saveCustomModel();
                  }}
                  className="rounded-md bg-bolt-elements-item-backgroundAccent px-3 py-1.5 text-xs font-medium text-bolt-elements-item-contentAccent disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSavingCustomModel ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
