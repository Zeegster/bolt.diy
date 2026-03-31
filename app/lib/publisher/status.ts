import type {
  CheckReport,
  IntakeSession,
  PublisherBuildSummary,
  PublisherPipelineStageStatus,
  PublisherProjectStatus,
  PublisherReleasePipelineStage,
  PublisherWorkflowState,
  PublisherWorkflowStep,
} from '~/types/publisher';

interface WorkflowReleaseStageContext {
  releaseStage?: PublisherReleasePipelineStage;
  releaseStageStatus?: PublisherPipelineStageStatus;
  releaseFailureStage?: PublisherReleasePipelineStage;
}

export type CanonicalIntakeLifecycleState =
  | 'scanned'
  | 'pending-disambiguation'
  | 'intake-review'
  | 'contract-ready'
  | 'release-ready'
  | 'failed';

export function summarizeChecks(checks: CheckReport[]) {
  return {
    pass: checks.filter((check) => check.status === 'pass').length,
    warn: checks.filter((check) => check.status === 'warn').length,
    fail: checks.filter((check) => check.status === 'fail').length,
    workingFail: checks.filter((check) => check.gate === 'working' && check.status === 'fail').length,
    releaseFail: checks.filter((check) => check.gate === 'release' && check.status === 'fail').length,
  };
}

function createWorkflowState(
  status: PublisherProjectStatus,
  step: PublisherWorkflowStep,
  summary: string,
  nextAction: string,
  blockingReason?: string,
  stage?: WorkflowReleaseStageContext,
): PublisherWorkflowState {
  const labels: Record<PublisherWorkflowStep, string> = {
    intake: 'Intake review',
    review: 'Contract review',
    release: 'Release readiness',
    published: 'Published',
  };

  return {
    status,
    step,
    label: labels[step],
    summary,
    nextAction,
    blockingReason,
    releaseStage: stage?.releaseStage,
    releaseStageStatus: stage?.releaseStageStatus,
    releaseFailureStage: stage?.releaseFailureStage,
  };
}

function deriveReleaseStageFromBuild(lastBuild?: PublisherBuildSummary): WorkflowReleaseStageContext {
  const stages = lastBuild?.pipeline?.stages ?? [];

  if (stages.length === 0) {
    return {};
  }

  const failedStage = lastBuild?.pipeline?.failedStage ?? stages.find((stage) => stage.status === 'failed')?.stage;

  if (failedStage) {
    const failedResult = stages.find((stage) => stage.stage === failedStage);

    return {
      releaseStage: failedStage,
      releaseStageStatus: failedResult?.status ?? 'failed',
      releaseFailureStage: failedStage,
    };
  }

  const activeStage = lastBuild?.pipeline?.activeStage ?? stages[stages.length - 1]?.stage;

  if (!activeStage) {
    return {};
  }

  const activeResult = stages.find((stage) => stage.stage === activeStage);

  return {
    releaseStage: activeStage,
    releaseStageStatus: activeResult?.status ?? 'completed',
  };
}

export function derivePublisherProjectStatus(options: {
  intakeSession?: IntakeSession;
  checks: CheckReport[];
  lastBuild?: PublisherBuildSummary;
  currentStatus?: PublisherProjectStatus;
}): PublisherProjectStatus {
  const { intakeSession, checks, lastBuild, currentStatus } = options;

  if (currentStatus === 'published') {
    return 'published';
  }

  const lifecycle = deriveCanonicalIntakeLifecycleState({ intakeSession, checks, lastBuild });

  if (lifecycle === 'failed') {
    return 'failed';
  }

  if (lifecycle === 'release-ready') {
    return 'release-ready';
  }

  if (lifecycle === 'contract-ready') {
    return 'contract-ready';
  }

  if (lifecycle === 'pending-disambiguation' || lifecycle === 'intake-review') {
    return 'intake-review';
  }

  return 'draft';
}

export function deriveCanonicalIntakeLifecycleState(options: {
  intakeSession?: IntakeSession;
  checks: CheckReport[];
  lastBuild?: PublisherBuildSummary;
}): CanonicalIntakeLifecycleState {
  const { intakeSession, checks, lastBuild } = options;

  if (!intakeSession) {
    return 'scanned';
  }

  if (intakeSession.status === 'pending-disambiguation' || intakeSession.disambiguation?.status === 'pending') {
    return 'pending-disambiguation';
  }

  if ((intakeSession.completionBlockers?.length ?? 0) > 0) {
    return 'pending-disambiguation';
  }

  if (intakeSession.status !== 'applied') {
    return 'intake-review';
  }

  if (checks.some((check) => check.gate === 'release' && check.status === 'fail')) {
    return 'failed';
  }

  if (checks.some((check) => check.gate === 'working' && check.status === 'fail')) {
    return 'contract-ready';
  }

  if (lastBuild) {
    return lastBuild.releaseFailures > 0 ? 'failed' : 'release-ready';
  }

  return 'contract-ready';
}

export function derivePublisherWorkflowState(options: {
  intakeSession?: IntakeSession;
  checks: CheckReport[];
  lastBuild?: PublisherBuildSummary;
  currentStatus?: PublisherProjectStatus;
}): PublisherWorkflowState {
  const { intakeSession, checks, lastBuild } = options;
  const counts = summarizeChecks(checks);
  const status = derivePublisherProjectStatus(options);
  const stageFromBuild = deriveReleaseStageFromBuild(lastBuild);

  if (status === 'published') {
    return createWorkflowState(
      'published',
      'published',
      'The latest publisher build is already marked as published.',
      'Review build history or start the next intake batch.',
      undefined,
      stageFromBuild,
    );
  }

  if (intakeSession && intakeSession.status !== 'applied') {
    return createWorkflowState(
      'intake-review',
      'intake',
      'Source intake still needs operator review before publisher contracts are treated as current.',
      'Resolve intake ambiguity, repair metadata, and apply the intake session.',
      `Current intake session status: ${intakeSession.status}`,
    );
  }

  if (status === 'failed') {
    const failedCount = Math.max(counts.releaseFail, lastBuild?.releaseFailures ?? 0);
    const fallbackFailureStage: PublisherReleasePipelineStage | undefined = failedCount > 0 ? 'check' : undefined;

    return createWorkflowState(
      'failed',
      'release',
      'Release checks are blocking publish readiness.',
      'Inspect release blockers, rebuild preview, and re-run release validation.',
      `${failedCount} release blocking check(s) failed.`,
      {
        releaseStage: stageFromBuild.releaseStage ?? fallbackFailureStage,
        releaseStageStatus: stageFromBuild.releaseStageStatus ?? (failedCount > 0 ? 'failed' : undefined),
        releaseFailureStage: stageFromBuild.releaseFailureStage ?? fallbackFailureStage,
      },
    );
  }

  if (counts.workingFail > 0) {
    return createWorkflowState(
      'contract-ready',
      'review',
      'Contracts exist, but working checks still need operator fixes before release trust is granted.',
      'Fix contract issues, metadata gaps, or invalid composition warnings in review.',
      `${counts.workingFail} working check(s) failed.`,
    );
  }

  if (lastBuild) {
    return createWorkflowState(
      'release-ready',
      'release',
      'Contracts and the latest build are aligned for release review.',
      'Inspect artifacts, confirm release checks, and proceed toward publish/export.',
      lastBuild.releaseFailures > 0
        ? `${lastBuild.releaseFailures} release failure(s) remain in the latest build.`
        : undefined,
      stageFromBuild,
    );
  }

  return createWorkflowState(
    'draft',
    'intake',
    'Publisher setup exists, but no active intake or validated build has been applied yet.',
    'Start intake review or generate the first contract-safe preview build.',
  );
}
