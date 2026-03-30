import type { CheckReport, PublisherBuildSummary, PublisherProjectStatus } from '~/types/publisher';

const statusOrder: PublisherProjectStatus[] = [
  'draft',
  'intake-review',
  'contract-ready',
  'release-ready',
  'published',
];

function getCheckTone(status: CheckReport['status']) {
  if (status === 'pass') {
    return 'border-green-500/20 bg-green-500/10 text-green-300';
  }

  if (status === 'warn') {
    return 'border-amber-500/20 bg-amber-500/10 text-amber-200';
  }

  return 'border-red-500/20 bg-red-500/10 text-red-200';
}

interface PublisherReleaseWorkspaceProps {
  status: PublisherProjectStatus;
  checks: CheckReport[];
  buildHistory: PublisherBuildSummary[];
  onOpenChecks?: () => void;
  onOpenState?: () => void;
  onOpenManifest?: () => void;
  onOpenSitemap?: () => void;
  onOpenRobots?: () => void;
}

export function PublisherReleaseWorkspace({
  status,
  checks,
  buildHistory,
  onOpenChecks,
  onOpenState,
  onOpenManifest,
  onOpenSitemap,
  onOpenRobots,
}: PublisherReleaseWorkspaceProps) {
  const latestBuild = buildHistory[0];
  const workingChecks = checks.filter((check) => check.gate !== 'release').slice(0, 3);
  const releaseChecks = checks.filter((check) => check.gate === 'release');

  return (
    <div className="rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-bolt-elements-textPrimary">Release workspace</h3>
          <p className="mt-1 text-xs text-bolt-elements-textSecondary">
            Deterministic release checks, build history, and generated output readiness.
          </p>
        </div>
        <div className="rounded-full border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-3 py-1 text-[10px] uppercase tracking-[0.16em] text-bolt-elements-textSecondary">
          {status}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {statusOrder.map((item) => {
          const isActive = item === status;
          const isReached = statusOrder.indexOf(item) <= statusOrder.indexOf(status) || status === 'failed';

          return (
            <div
              key={item}
              className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.16em] ${
                isActive
                  ? 'border-accent-500/40 bg-accent-500/15 text-accent-300'
                  : isReached
                    ? 'border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 text-bolt-elements-textPrimary'
                    : 'border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 text-bolt-elements-textSecondary'
              }`}
            >
              {item}
            </div>
          );
        })}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onOpenChecks}
          className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-3 py-2 text-xs hover:bg-bolt-elements-background-depth-3 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!onOpenChecks}
        >
          Open checks.json
        </button>
        <button
          type="button"
          onClick={onOpenState}
          className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-3 py-2 text-xs hover:bg-bolt-elements-background-depth-3 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!onOpenState}
        >
          Open state.json
        </button>
        <button
          type="button"
          onClick={onOpenManifest}
          className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-3 py-2 text-xs hover:bg-bolt-elements-background-depth-3 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!onOpenManifest}
        >
          Open site.webmanifest
        </button>
        <button
          type="button"
          onClick={onOpenSitemap}
          className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-3 py-2 text-xs hover:bg-bolt-elements-background-depth-3 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!onOpenSitemap}
        >
          Open sitemap.xml
        </button>
        <button
          type="button"
          onClick={onOpenRobots}
          className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-3 py-2 text-xs hover:bg-bolt-elements-background-depth-3 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!onOpenRobots}
        >
          Open robots.txt
        </button>
      </div>

      {releaseChecks.length > 0 ? (
        <div className="mt-4 space-y-2">
          <div className="text-xs uppercase tracking-[0.16em] text-bolt-elements-textSecondary">Release checks</div>
          {releaseChecks.slice(0, 4).map((check) => (
            <div
              key={`${check.name}-${check.pageId ?? 'project'}-${check.message}`}
              className={`rounded-lg border p-3 text-xs ${getCheckTone(check.status)}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{check.name}</span>
                <span className="uppercase tracking-[0.16em]">{check.status}</span>
              </div>
              <div className="mt-1 opacity-90">{check.message}</div>
            </div>
          ))}
        </div>
      ) : null}

      {workingChecks.length > 0 ? (
        <div className="mt-4 space-y-2">
          <div className="text-xs uppercase tracking-[0.16em] text-bolt-elements-textSecondary">Working checks</div>
          {workingChecks.map((check) => (
            <div
              key={`${check.name}-${check.pageId ?? 'project'}-${check.message}`}
              className={`rounded-lg border p-3 text-xs ${getCheckTone(check.status)}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{check.name}</span>
                <span className="uppercase tracking-[0.16em]">{check.status}</span>
              </div>
              <div className="mt-1 opacity-90">{check.message}</div>
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-4 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-3">
        <div className="text-xs uppercase tracking-[0.16em] text-bolt-elements-textSecondary">Recent builds</div>
        {latestBuild ? (
          <div className="mt-2 space-y-2 text-xs text-bolt-elements-textSecondary">
            <div className="flex items-center justify-between gap-3">
              <span>Latest build</span>
              <span className="text-bolt-elements-textPrimary">{latestBuild.createdAt}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span>Working failures</span>
              <span className="text-bolt-elements-textPrimary">{latestBuild.workingFailures}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span>Release failures</span>
              <span className="text-bolt-elements-textPrimary">{latestBuild.releaseFailures}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span>Artifacts</span>
              <span className="text-bolt-elements-textPrimary">{latestBuild.artifacts.length}</span>
            </div>
          </div>
        ) : (
          <div className="mt-2 text-sm text-bolt-elements-textSecondary">No build history recorded yet.</div>
        )}
      </div>
    </div>
  );
}
