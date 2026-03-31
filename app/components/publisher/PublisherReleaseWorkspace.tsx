import {
  publisherReleasePipelineStages,
  type CheckReport,
  type PublisherAgentActionContract,
  type PublisherBuildSummary,
  type PublisherPipelineStageResult,
  type PublisherProjectStatus,
  type PublisherReleasePipelineStage,
  type PublisherWorkflowState,
} from '~/types/publisher';
import { deriveRepairIntentFromCheck } from '~/lib/publisher/agent-model';
import {
  categorizePublisherDiagnostic,
  getPublisherDiagnosticLabel,
  getPublisherDiagnosticOriginLine,
} from '~/lib/publisher/intake-ui';
import type { PublisherOrchestrationAction } from '~/lib/publisher/orchestration';

const NO_CONSTRAINED_REPAIR_PROMPT =
  'No constrained repair prompt available for this diagnostic. Resolve through source/template review first.';

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

function getStageTone(status: PublisherPipelineStageResult['status']) {
  if (status === 'completed') {
    return 'border-green-500/20 bg-green-500/10 text-green-300';
  }

  if (status === 'running' || status === 'pending') {
    return 'border-blue-500/20 bg-blue-500/10 text-blue-200';
  }

  if (status === 'skipped') {
    return 'border-zinc-500/20 bg-zinc-500/10 text-zinc-300';
  }

  return 'border-red-500/20 bg-red-500/10 text-red-200';
}

function formatStageLabel(stage: PublisherReleasePipelineStage) {
  return stage.charAt(0).toUpperCase() + stage.slice(1);
}

function isReleasePipelineStage(value: string): value is PublisherReleasePipelineStage {
  return (publisherReleasePipelineStages as readonly string[]).includes(value);
}

function derivePipelineStages(build?: PublisherBuildSummary): PublisherPipelineStageResult[] {
  const stageOrder = [...publisherReleasePipelineStages];
  const pipelineStages = build?.pipeline?.stages;

  if (pipelineStages && pipelineStages.length > 0) {
    return [...pipelineStages].sort((left, right) => stageOrder.indexOf(left.stage) - stageOrder.indexOf(right.stage));
  }

  const legacyJobs = build?.pipeline?.jobs ?? [];
  const releaseLegacyJobs = legacyJobs.filter(
    (
      job,
    ): job is (typeof legacyJobs)[number] & {
      stage: PublisherReleasePipelineStage;
    } => isReleasePipelineStage(job.stage),
  );

  return releaseLegacyJobs
    .map((job) => ({
      stage: job.stage,
      status: job.status === 'idle' ? 'pending' : job.status,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
      summary: job.details?.[0] ?? `${formatStageLabel(job.stage)} stage completed.`,
      details: job.details?.slice(1) ?? [],
    }))
    .sort((left, right) => stageOrder.indexOf(left.stage) - stageOrder.indexOf(right.stage));
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

interface GroupedCheckItem {
  key: string;
  sampleCheck: CheckReport;
  name: string;
  status: CheckReport['status'];
  message: string;
  count: number;
  targets: string[];
  details: string[];
}

function groupChecksByKey(checks: CheckReport[]): GroupedCheckItem[] {
  const grouped = new Map<string, GroupedCheckItem>();

  checks.forEach((check) => {
    const key = `${check.name}:${check.status}:${check.message}`;
    const existing = grouped.get(key);
    const target = getTargetSummary(check);
    const details = check.details ?? [];

    if (existing) {
      existing.count += 1;

      if (!existing.targets.includes(target)) {
        existing.targets.push(target);
      }

      details.forEach((detail) => {
        if (!existing.details.includes(detail)) {
          existing.details.push(detail);
        }
      });

      return;
    }

    grouped.set(key, {
      key,
      sampleCheck: check,
      name: check.name,
      status: check.status,
      message: check.message,
      count: 1,
      targets: [target],
      details: [...details],
    });
  });

  return [...grouped.values()].sort((left, right) => {
    if (left.status !== right.status) {
      return left.status === 'fail' ? -1 : right.status === 'fail' ? 1 : 0;
    }

    if (left.count !== right.count) {
      return right.count - left.count;
    }

    return left.name.localeCompare(right.name);
  });
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
  onQueueRepairIntent?: (payload: { intent: PublisherAgentActionContract; check: CheckReport }) => void;
  onRunOrchestrationAction?: (action: PublisherOrchestrationAction) => void;
  projectId?: string;
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
  onQueueRepairIntent,
  onRunOrchestrationAction,
  projectId,
}: PublisherReleaseWorkspaceProps) {
  const latestBuild = buildHistory[0];
  const releaseChecks = checks.filter((check) => check.gate === 'release');
  const workingChecks = checks.filter((check) => check.gate !== 'release');
  const releaseGateCheck = releaseChecks.find((check) => check.name === 'release-gate');
  const workingGateCheck = workingChecks.find((check) => check.name === 'working-gate');
  const diagnosticChecks = checks.filter((check) => check.name !== 'release-gate' && check.name !== 'working-gate');
  const affectedTargets = new Set(diagnosticChecks.map((check) => getTargetSummary(check))).size;
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
  const pipelineStages = derivePipelineStages(latestBuild);
  const workflowStage =
    workflow.releaseFailureStage ??
    workflow.releaseStage ??
    latestBuild?.pipeline?.failedStage ??
    latestBuild?.pipeline?.activeStage;
  const workflowStageResult = workflowStage ? pipelineStages.find((stage) => stage.stage === workflowStage) : undefined;
  const publishContract = latestBuild?.pipeline?.publishContract;
  const publishContractPath = latestBuild?.publishContractPath ?? publishContract?.artifactPath;

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
            {workflow.releaseStage
              ? ` · Stage: ${formatStageLabel(workflow.releaseStage)} (${workflow.releaseStageStatus ?? 'unknown'})`
              : ''}
            {workflow.releaseFailureStage ? ` · Failed at: ${formatStageLabel(workflow.releaseFailureStage)}` : ''}
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

      {pipelineStages.length > 0 ? (
        <div className="mt-4 rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs uppercase tracking-[0.16em] text-bolt-elements-textSecondary">Pipeline stages</div>
            <div className="text-[11px] text-bolt-elements-textSecondary">{pipelineStages.length} stage(s)</div>
          </div>

          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {pipelineStages.map((stage) => (
              <div key={stage.stage} className={`rounded-lg border p-3 text-xs ${getStageTone(stage.status)}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{formatStageLabel(stage.stage)}</span>
                  <span className="uppercase tracking-[0.16em]">{stage.status}</span>
                </div>
                <div className="mt-1 opacity-90">{stage.summary}</div>
                {stage.blockingReason ? (
                  <div className="mt-2 text-[11px] uppercase tracking-[0.16em] opacity-80">
                    Blocking reason: {stage.blockingReason}
                  </div>
                ) : null}
                {stage.details.length > 0 ? <div className="mt-2 opacity-90">{stage.details.join(' · ')}</div> : null}
              </div>
            ))}
          </div>

          {workflowStageResult ? (
            <div className="mt-3 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-xs text-bolt-elements-textSecondary">
              Active handoff: {formatStageLabel(workflowStageResult.stage)} ({workflowStageResult.status})
              {workflowStageResult.blockingReason ? ` · ${workflowStageResult.blockingReason}` : ''}
            </div>
          ) : null}
        </div>
      ) : null}

      {publishContract ? (
        <div className="mt-4 rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs uppercase tracking-[0.16em] text-bolt-elements-textSecondary">Publish contract</div>
            <div
              className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.16em] ${
                publishContract.canPublish
                  ? 'border-green-500/20 bg-green-500/10 text-green-300'
                  : 'border-red-500/20 bg-red-500/10 text-red-200'
              }`}
            >
              {publishContract.canPublish ? 'publishable' : 'blocked'}
            </div>
          </div>

          <div className="mt-3 space-y-2 text-xs text-bolt-elements-textSecondary">
            <div className="flex items-center justify-between gap-3">
              <span>Artifact</span>
              <span className="truncate text-right text-bolt-elements-textPrimary">
                {publishContractPath ?? 'not generated'}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span>Delivery stage</span>
              <span className="text-bolt-elements-textPrimary">{publishContract.deliveryStage ?? 'export'}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span>Build ID</span>
              <span className="text-bolt-elements-textPrimary">{publishContract.buildId}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span>Publish blockers</span>
              <span className="text-bolt-elements-textPrimary">{publishContract.publishBlockers.length}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span>Publish warnings</span>
              <span className="text-bolt-elements-textPrimary">{publishContract.publishWarnings.length}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span>Rollback strategy</span>
              <span className="text-bolt-elements-textPrimary">
                {publishContract.rollback.strategy} · keep {publishContract.rollback.keepLastBuilds}
              </span>
            </div>
          </div>
        </div>
      ) : null}

      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <div className={`rounded-lg border p-3 text-xs ${getCheckTone(releaseGateCheck?.status ?? 'warn')}`}>
          <div className="text-[11px] uppercase tracking-[0.16em] opacity-80">Release gate</div>
          <div className="mt-1 text-sm font-medium uppercase">{releaseGateCheck?.status ?? 'unknown'}</div>
          <div className="mt-1 opacity-90">{releaseFailures.length} blockers</div>
        </div>
        <div className={`rounded-lg border p-3 text-xs ${getCheckTone(workingGateCheck?.status ?? 'warn')}`}>
          <div className="text-[11px] uppercase tracking-[0.16em] opacity-80">Working gate</div>
          <div className="mt-1 text-sm font-medium uppercase">{workingGateCheck?.status ?? 'unknown'}</div>
          <div className="mt-1 opacity-90">{workingFailures.length} blockers</div>
        </div>
        <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-3 text-xs text-bolt-elements-textSecondary">
          <div className="text-[11px] uppercase tracking-[0.16em]">Release warnings</div>
          <div className="mt-1 text-sm font-medium text-bolt-elements-textPrimary">{releaseWarnings.length}</div>
          <div className="mt-1">Checks that need operator confirmation before publish.</div>
        </div>
        <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-3 text-xs text-bolt-elements-textSecondary">
          <div className="text-[11px] uppercase tracking-[0.16em]">Affected targets</div>
          <div className="mt-1 text-sm font-medium text-bolt-elements-textPrimary">{affectedTargets}</div>
          <div className="mt-1">Unique page or zone scopes touched by diagnostics.</div>
        </div>
      </div>

      <div className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
        Repair actions require operator confirmation before prompt prefill.
      </div>

      {onRunOrchestrationAction && projectId ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => onRunOrchestrationAction({ action: 'run-release-checks', projectId })}
            className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-3 py-2 text-xs hover:bg-bolt-elements-background-depth-3"
          >
            Queue release checks
          </button>
          <button
            type="button"
            onClick={() => onRunOrchestrationAction({ action: 'publish-export', projectId })}
            className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-3 py-2 text-xs hover:bg-bolt-elements-background-depth-3"
          >
            Queue publish/export
          </button>
        </div>
      ) : null}

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
                    {groupChecksByKey(group.checks).map((check) => {
                      const repairIntent = deriveRepairIntentFromCheck(check.sampleCheck);

                      return (
                        <div key={check.key} className={`rounded-lg border p-3 text-xs ${getCheckTone(check.status)}`}>
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium">{check.name}</span>
                            <span className="uppercase tracking-[0.16em]">{check.status}</span>
                          </div>
                          <div className="mt-1 opacity-90">{check.message}</div>
                          <div className="mt-1 text-[11px] opacity-90">
                            {getPublisherDiagnosticOriginLine(check.sampleCheck)}
                          </div>
                          <div className="mt-2 text-[11px] uppercase tracking-[0.16em] opacity-80">
                            Inspect ({check.count}): {check.targets.join(' · ')}
                          </div>
                          {check.details.length ? (
                            <div className="mt-2 opacity-90">{check.details.slice(0, 4).join(' · ')}</div>
                          ) : null}
                          {check.details.length > 4 ? (
                            <div className="mt-2 text-[11px] uppercase tracking-[0.16em] opacity-80">
                              +{check.details.length - 4} more detail item(s)
                            </div>
                          ) : null}
                          {onQueueRepairIntent && repairIntent ? (
                            <button
                              type="button"
                              onClick={() => onQueueRepairIntent({ intent: repairIntent, check: check.sampleCheck })}
                              className="mt-3 rounded-lg border border-current/20 bg-black/10 px-3 py-2 text-xs font-medium hover:bg-black/20"
                            >
                              Queue {repairIntent.action} prompt
                            </button>
                          ) : null}
                          {!repairIntent ? (
                            <div className="mt-2 text-[11px] opacity-90">{NO_CONSTRAINED_REPAIR_PROMPT}</div>
                          ) : null}
                        </div>
                      );
                    })}
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
