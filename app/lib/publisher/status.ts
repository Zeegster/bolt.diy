import type {
  CheckReport,
  IntakeSession,
  PublisherBuildSummary,
  PublisherProjectStatus,
  PublisherWorkflowState,
  PublisherWorkflowStep,
} from '~/types/publisher';

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

  if (intakeSession && intakeSession.status !== 'applied') {
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

  return 'draft';
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

  if (status === 'published') {
    return createWorkflowState(
      'published',
      'published',
      'The latest publisher build is already marked as published.',
      'Review build history or start the next intake batch.',
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

  if (counts.releaseFail > 0) {
    return createWorkflowState(
      'failed',
      'release',
      'Release checks are blocking publish readiness.',
      'Inspect release blockers, rebuild preview, and re-run release validation.',
      `${counts.releaseFail} release blocking check(s) failed.`,
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
    );
  }

  return createWorkflowState(
    'draft',
    'intake',
    'Publisher setup exists, but no active intake or validated build has been applied yet.',
    'Start intake review or generate the first contract-safe preview build.',
  );
}
