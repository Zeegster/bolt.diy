import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useSettings } from '~/lib/hooks/useSettings';
import { PROVIDER_LIST } from '~/utils/constants';
import { classNames } from '~/utils/classNames';
import { TbActivityHeartbeat } from 'react-icons/tb';
import { BsCheckCircleFill, BsExclamationCircleFill, BsXCircleFill } from 'react-icons/bs';

type ServiceStatusLevel = 'operational' | 'degraded' | 'down';

type ProviderProbeConfig = {
  provider: string;
  apiUrl: string;
  statusUrl?: string;
};

type ProviderProbeResult = {
  provider: string;
  status: ServiceStatusLevel;
  endpointReachable: boolean;
  authPresent: boolean;
  modelsCount: number;
  responseTimeMs: number;
  checkedAt: string;
  message: string;
  statusUrl?: string;
};

const PROVIDER_PROBES: ProviderProbeConfig[] = [
  {
    provider: 'OpenAI',
    apiUrl: 'https://api.openai.com/v1/models',
    statusUrl: 'https://status.openai.com/',
  },
  {
    provider: 'OpenRouter',
    apiUrl: 'https://openrouter.ai/api/v1/models',
    statusUrl: 'https://status.openrouter.ai/',
  },
  {
    provider: 'Anthropic',
    apiUrl: 'https://api.anthropic.com/v1/models',
    statusUrl: 'https://status.anthropic.com/',
  },
  {
    provider: 'Mistral',
    apiUrl: 'https://api.mistral.ai/v1/models',
    statusUrl: 'https://status.mistral.ai/',
  },
  {
    provider: 'Groq',
    apiUrl: 'https://api.groq.com/openai/v1/models',
    statusUrl: 'https://groqstatus.com/',
  },
];

function getStatusColor(status: ServiceStatusLevel) {
  switch (status) {
    case 'operational':
      return 'text-green-500';
    case 'degraded':
      return 'text-yellow-500';
    case 'down':
      return 'text-red-500';
    default:
      return 'text-bolt-elements-textTertiary';
  }
}

function getStatusIcon(status: ServiceStatusLevel) {
  switch (status) {
    case 'operational':
      return <BsCheckCircleFill className="h-4 w-4" />;
    case 'degraded':
      return <BsExclamationCircleFill className="h-4 w-4" />;
    case 'down':
      return <BsXCircleFill className="h-4 w-4" />;
    default:
      return <BsExclamationCircleFill className="h-4 w-4" />;
  }
}

async function checkEndpointReachable(url: string) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 10_000);
  const startedAt = performance.now();

  try {
    await fetch(url, {
      method: 'GET',
      mode: 'no-cors',
      signal: controller.signal,
    });

    const responseTimeMs = Math.round(performance.now() - startedAt);

    return { reachable: true, responseTimeMs };
  } catch {
    const responseTimeMs = Math.round(performance.now() - startedAt);
    return { reachable: false, responseTimeMs };
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function getProviderModelsCount(providerName: string) {
  try {
    const response = await fetch(`/api/models/${encodeURIComponent(providerName)}`);
    const payload = (await response.json()) as { modelList?: unknown[] };

    return Array.isArray(payload.modelList) ? payload.modelList.length : 0;
  } catch {
    return 0;
  }
}

async function hasProviderKey(providerName: string) {
  try {
    const response = await fetch(`/api/check-env-key?provider=${encodeURIComponent(providerName)}`);
    const payload = (await response.json()) as { isSet?: boolean };

    return Boolean(payload.isSet);
  } catch {
    return false;
  }
}

function ServiceStatusTab() {
  const { providers } = useSettings();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [results, setResults] = useState<ProviderProbeResult[]>([]);

  const enabledCloudProviders = useMemo(() => {
    const providerMap = new Map(PROVIDER_LIST.map((provider) => [provider.name, provider] as const));

    return PROVIDER_PROBES.filter(({ provider }) => {
      const providerInfo = providerMap.get(provider);
      const providerSettings = providers[provider]?.settings;

      return (
        providerInfo &&
        providerSettings?.enabled !== false &&
        (providerInfo.supportsApiKey !== false || providerInfo.supportsAccountAuth)
      );
    });
  }, [providers]);

  const runProbe = useCallback(
    async (probe: ProviderProbeConfig): Promise<ProviderProbeResult> => {
      const providerSettings = providers[probe.provider]?.settings;
      const isAccountMode =
        providerSettings?.authMode === 'account' && (probe.provider === 'OpenAI' || probe.provider === 'Anthropic');
      const accountBridge =
        probe.provider === 'OpenAI' ? window.codexAuth : probe.provider === 'Anthropic' ? window.anthropicAuth : null;
      const accountBridgeAvailable = Boolean(accountBridge?.getStatus && accountBridge?.listModels);
      const endpointProbeUrl = probe.statusUrl || probe.apiUrl;
      const endpoint = await checkEndpointReachable(endpointProbeUrl);

      let authPresent = false;
      let modelsCount = 0;

      if (isAccountMode) {
        if (accountBridgeAvailable) {
          const accountStatus = await accountBridge?.getStatus?.();
          authPresent = Boolean(accountStatus?.available && accountStatus.authenticated);
          modelsCount = authPresent ? ((await accountBridge?.listModels?.({ includeHidden: false })) || []).length : 0;
        }
      } else {
        authPresent = await hasProviderKey(probe.provider);
        modelsCount = authPresent ? await getProviderModelsCount(probe.provider) : 0;
      }

      let status: ServiceStatusLevel = 'operational';
      let message = 'Endpoint reachable, auth present, models ready.';

      if (!endpoint.reachable) {
        status = 'down';
        message = 'Endpoint unreachable.';
      } else if (!authPresent) {
        status = 'degraded';
        message =
          isAccountMode && !accountBridgeAvailable
            ? `Desktop ${probe.provider} account auth unavailable in this runtime. Switch ${probe.provider} to API key mode.`
            : isAccountMode
              ? `Authentication required: sign in with ${probe.provider} account.`
              : 'Authentication required: add provider API key.';
      } else if (modelsCount === 0) {
        status = 'degraded';
        message = 'Auth present, but model list is empty/unavailable.';
      }

      return {
        provider: probe.provider,
        status,
        endpointReachable: endpoint.reachable,
        authPresent,
        modelsCount,
        responseTimeMs: endpoint.responseTimeMs,
        checkedAt: new Date().toISOString(),
        message,
        statusUrl: probe.statusUrl,
      };
    },
    [providers],
  );

  const refreshStatuses = useCallback(async () => {
    try {
      setRefreshing(true);

      const statuses = await Promise.all(enabledCloudProviders.map((probe) => runProbe(probe)));
      statuses.sort((a, b) => a.provider.localeCompare(b.provider));
      setResults(statuses);
      setLastRefresh(new Date());
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [enabledCloudProviders, runProbe]);

  useEffect(() => {
    void refreshStatuses();

    const intervalId = window.setInterval(
      () => {
        void refreshStatuses();
      },
      2 * 60 * 1000,
    );

    return () => {
      window.clearInterval(intervalId);
    };
  }, [refreshStatuses]);

  if (loading) {
    return <div className="py-8 text-center text-bolt-elements-textSecondary">Checking provider status...</div>;
  }

  return (
    <div className="space-y-4">
      <motion.div
        className="space-y-4"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
      >
        <div className="mt-8 mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div
              className={classNames(
                'flex h-8 w-8 items-center justify-center rounded-lg',
                'bg-bolt-elements-background-depth-3 text-bolt-elements-item-contentAccent',
              )}
            >
              <TbActivityHeartbeat className="h-5 w-5" />
            </div>
            <div>
              <h4 className="text-md font-medium text-bolt-elements-textPrimary">Service Status</h4>
              <p className="text-sm text-bolt-elements-textSecondary">
                Probe mode: endpoint reachable + auth present + non-empty models
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-bolt-elements-textSecondary">
              Last updated: {lastRefresh.toLocaleTimeString()}
            </span>
            <button
              type="button"
              onClick={() => {
                void refreshStatuses();
              }}
              disabled={refreshing}
              className={classNames(
                'rounded-lg px-3 py-1.5 text-sm transition-all',
                'bg-bolt-elements-background-depth-3 hover:bg-bolt-elements-background-depth-4',
                'text-bolt-elements-textPrimary',
                refreshing ? 'cursor-not-allowed opacity-60' : undefined,
              )}
            >
              {refreshing ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        </div>

        {results.length === 0 ? (
          <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4 text-sm text-bolt-elements-textSecondary">
            No enabled cloud providers to probe.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {results.map((result) => (
              <div
                key={result.provider}
                className={classNames(
                  'rounded-lg border border-bolt-elements-borderColor p-4',
                  'bg-bolt-elements-background-depth-2',
                )}
              >
                <div className="mb-2 flex items-center justify-between">
                  <h5 className="text-sm font-medium text-bolt-elements-textPrimary">{result.provider}</h5>
                  <div
                    className={classNames('flex items-center gap-2 text-sm capitalize', getStatusColor(result.status))}
                  >
                    {getStatusIcon(result.status)}
                    <span>{result.status}</span>
                  </div>
                </div>

                <p className="mb-3 text-xs text-bolt-elements-textSecondary">{result.message}</p>

                <div className="space-y-1 text-xs text-bolt-elements-textTertiary">
                  <div>Endpoint reachable: {result.endpointReachable ? 'yes' : 'no'}</div>
                  <div>Auth present: {result.authPresent ? 'yes' : 'no'}</div>
                  <div>Models count: {result.modelsCount}</div>
                  <div>Probe response: {result.responseTimeMs}ms</div>
                  <div>Checked: {new Date(result.checkedAt).toLocaleTimeString()}</div>
                </div>

                {result.statusUrl && (
                  <button
                    type="button"
                    className="mt-3 text-xs text-bolt-elements-item-contentAccent underline"
                    onClick={() => window.open(result.statusUrl, '_blank')}
                  >
                    Open status page
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  );
}

ServiceStatusTab.tabMetadata = {
  icon: 'i-ph:activity-bold',
  description: 'Probe provider availability without legacy test-model checks',
  category: 'services',
};

export default ServiceStatusTab;
