import type { CheckReport, IntakeSession, PublisherBuildSummary, PublisherProjectStatus } from '~/types/publisher';

export function summarizeChecks(checks: CheckReport[]) {
  return {
    pass: checks.filter((check) => check.status === 'pass').length,
    warn: checks.filter((check) => check.status === 'warn').length,
    fail: checks.filter((check) => check.status === 'fail').length,
    workingFail: checks.filter((check) => check.gate === 'working' && check.status === 'fail').length,
    releaseFail: checks.filter((check) => check.gate === 'release' && check.status === 'fail').length,
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
