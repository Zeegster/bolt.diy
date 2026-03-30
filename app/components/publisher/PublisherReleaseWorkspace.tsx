import type {
  CheckReport,
  PublisherBuildSummary,
  PublisherProjectStatus,
  PublisherWorkflowState,
} from '~/types/publisher';
import { categorizePublisherDiagnostic, getPublisherDiagnosticLabel } from '~/lib/publisher/intake-ui';

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

function getTargetSummary(check: CheckReport) {
  if (check.pageId && check.zone) {
    return `${check.pageId} · ${check.zone}`;
  }

  if (check.pageId) {
    return check.pageId;
  }

  return 'project';
}

function groupChecks(checks: CheckReport[]) {
  const order = ['metadata', 'composition', 'ownership', 'deprecated', 'output', 'content'] as const;

  return order
    .map((category) => ({
      category,
      label: getPublisherDiagnosticLabel(category),
      checks: checks.filter((check) => categorizePublisherDiagnostic(check) === category),
    }))
    .filter((group) => group.checks.length > 0);
}

interface PublisherReleaseWorkspaceProps {
  status: PublisherProjectStatus;
  workflow: PublisherWorkflowState;
  checks: CheckReport[];
  buildHistory: PublisherBuildSummary[];
  onOpenChecks?: () => void;
  onOpenProvenance?: () => void;
  onOpenState?: () => void;
  onOpenManifest?: () => void;
  onOpenSitemap?: () => void;
  onOpenRobots?: () => void;
}

export function PublisherReleaseWorkspace({
  status,
  workflow,
  checks,
  buildHistory,
  onOpenChecks,
  onOpenProvenance,
  onOpenState,
  onOpenManifest,
  onOpenSitemap,
  onOpenRobots,
}: PublisherReleaseWorkspaceProps) {
  const latestBuild = buildHistory[0];
  const releaseChecks = checks.filter((check) => check.gate === 'release');
  const workingChecks = checks.filter((check) => check.gate !== 'release');
  const releaseFailures = releaseChecks.filter((check) => check.status === 'fail');
  const releaseWarnings = releaseChecks.filter((check) => check.status === 'warn');
  const workingFailures = workingChecks.filter((check) => check.status === 'fail');
  const workingWarnings = workingChecks.filter((check) => check.status === 'warn');
  const groupedPanels = [
    {
      key: 'release-failures',
      title: 'Release blockers',
      description: 'Fix these before trusting generated output.',
      checks: releaseFailures,
    },
    {
      key: 'release-warnings',
      title: 'Release warnings',
      description: 'Output is generated, but these items still deserve operator review.',
      checks: releaseWarnings,
    },
    {
      key: 'working-failures',
      title: 'Working blockers',
      description: 'Contract issues that prevent a clean handoff into release.',
      checks: workingFailures,
    },
    {
      key: 'working-warnings',
      title: 'Working warnings',
      description: 'Composition concerns that may become release problems later.',
      checks: workingWarnings,
    },
  ].filter((panel) => panel.checks.length > 0);

  return (
    <div className="rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-bolt-elements-textPrimary">Release workspace</h3>
          <p className="mt-1 text-xs text-bolt-elements-textSecondary">
            Deterministic release checks, build history, and generated output readiness.
          </p>
          <p className="mt-2 text-sm text-bolt-elements-textPrimary">{workflow.summary}</p>
          <p className="mt-1 text-xs text-bolt-elements-textSecondary">
            Next action: {workflow.nextAction}
            {workflow.blockingReason ? ` · Blocker: ${workflow.blockingReason}` : ''}
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
          onClick={onOpenProvenance}
          className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-3 py-2 text-xs hover:bg-bolt-elements-background-depth-3 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!onOpenProvenance}
        >
          Open provenance.json
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

      {groupedPanels.length > 0 ? (
        <div className="mt-4 space-y-4">
          {groupedPanels.map((panel) => (
            <div key={panel.key} className="space-y-2">
              <div>
                <div className="text-xs uppercase tracking-[0.16em] text-bolt-elements-textSecondary">
                  {panel.title}
                </div>
                <div className="mt-1 text-xs text-bolt-elements-textSecondary">{panel.description}</div>
              </div>

              {groupChecks(panel.checks).map((group) => (
                <div
                  key={`${panel.key}-${group.category}`}
                  className="rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-3"
                >
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <div className="text-xs font-medium uppercase tracking-[0.16em] text-bolt-elements-textSecondary">
                      {group.label}
                    </div>
                    <div className="text-[11px] text-bolt-elements-textSecondary">{group.checks.length} item(s)</div>
                  </div>

                  <div className="space-y-2">
                    {group.checks.map((check) => (
                      <div
                        key={`${check.name}-${check.pageId ?? 'project'}-${check.message}`}
                        className={`rounded-lg border p-3 text-xs ${getCheckTone(check.status)}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium">{check.name}</span>
                          <span className="uppercase tracking-[0.16em]">{check.status}</span>
                        </div>
                        <div className="mt-1 opacity-90">{check.message}</div>
                        <div className="mt-2 text-[11px] uppercase tracking-[0.16em] opacity-80">
                          Inspect: {getTargetSummary(check)}
                        </div>
                        {check.details?.length ? (
                          <div className="mt-2 opacity-90">{check.details.join(' · ')}</div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
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
            {latestBuild.artifacts.length > 0 ? (
              <div className="pt-2">
                <div className="mb-2 text-[11px] uppercase tracking-[0.16em] text-bolt-elements-textSecondary">
                  Artifact details
                </div>
                <div className="space-y-2">
                  {latestBuild.artifacts.slice(0, 6).map((artifact) => (
                    <div
                      key={artifact.path}
                      className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2"
                    >
                      <div className="truncate text-bolt-elements-textPrimary">{artifact.path}</div>
                      <div className="mt-1 flex flex-wrap gap-3 text-[11px] text-bolt-elements-textSecondary">
                        <span>{artifact.contentType}</span>
                        <span>{artifact.fingerprint}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="mt-2 text-sm text-bolt-elements-textSecondary">No build history recorded yet.</div>
        )}
      </div>
    </div>
  );
}
