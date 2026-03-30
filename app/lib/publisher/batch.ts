import type { CheckReport, IntakeSession, PublisherProjectStatus, PublisherWorkflowState } from '~/types/publisher';
import { derivePublisherProjectStatus, derivePublisherWorkflowState, summarizeChecks } from './status';
import type { PersistedPublisherProjectState } from './persistence';
import { listPublisherProjectStates } from './persistence';
import { listIntakeSessionsByUpdatedAtDesc } from './intake-session';

export interface PublisherBatchQueueSource {
  projectId: string;
  intakeSession?: IntakeSession;
  projectState?: PersistedPublisherProjectState;
  checks?: CheckReport[];
}

export interface PublisherBatchQueueRow {
  projectId: string;
  status: PublisherProjectStatus;
  workflow: PublisherWorkflowState;
  intakeSessionId?: string;
  lastBuildAt?: string;
  updatedAt: string;
  readiness: 'draft' | 'review' | 'release' | 'published' | 'blocked';
  priority: number;
  blocked: boolean;
  hasAmbiguity: boolean;
  stale: boolean;
  stuck: boolean;
  failureCount: number;
  warningCount: number;
  reason: string;
}

export interface PublisherBatchQueueSnapshot {
  projects: Array<{ projectId: string; state: PersistedPublisherProjectState }>;
  intakeSessions: IntakeSession[];
}

const STALE_THRESHOLD_MS = 1000 * 60 * 60 * 24;

function createFallbackWorkflow(status: PublisherProjectStatus): PublisherWorkflowState | undefined {
  switch (status) {
    case 'release-ready':
      return {
        status,
        step: 'release',
        label: 'Release readiness',
        summary: 'Persisted publisher state marks this project as ready for release review.',
        nextAction: 'Inspect artifacts, confirm release checks, and proceed toward publish/export.',
      };
    case 'contract-ready':
      return {
        status,
        step: 'review',
        label: 'Contract review',
        summary: 'Persisted publisher state marks this project as waiting on contract review.',
        nextAction: 'Review contract issues and prepare the next release build.',
      };
    case 'failed':
      return {
        status,
        step: 'release',
        label: 'Release readiness',
        summary: 'Persisted publisher state marks this project as blocked by failures.',
        nextAction: 'Inspect release blockers, rebuild preview, and re-run release validation.',
        blockingReason: 'Persisted project status is failed.',
      };
    default:
      return undefined;
  }
}

function getLastBuild(projectState?: PersistedPublisherProjectState) {
  return [...(projectState?.buildHistory ?? [])].sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt),
  )[0];
}

function resolveUpdatedAt(source: PublisherBatchQueueSource, lastBuildAt?: string) {
  return [
    source.intakeSession?.updatedAt,
    source.projectState?.lastBuildAt,
    lastBuildAt,
    source.projectState?.buildHistory?.[0]?.createdAt,
  ]
    .filter(Boolean)
    .sort((left, right) => String(right).localeCompare(String(left)))[0]!;
}

function resolveReadiness(status: PublisherProjectStatus, blocked: boolean): PublisherBatchQueueRow['readiness'] {
  if (blocked || status === 'failed') {
    return 'blocked';
  }

  if (status === 'published') {
    return 'published';
  }

  if (status === 'release-ready') {
    return 'release';
  }

  if (status === 'contract-ready' || status === 'intake-review') {
    return 'review';
  }

  return 'draft';
}

function resolvePriority(row: Omit<PublisherBatchQueueRow, 'priority'>) {
  if (row.blocked && row.hasAmbiguity) {
    return 0;
  }

  if (row.blocked) {
    return 1;
  }

  if (row.readiness === 'release') {
    return 2;
  }

  if (row.readiness === 'review') {
    return 3;
  }

  if (row.readiness === 'draft') {
    return 4;
  }

  return 5;
}

export function deriveBatchQueueRow(
  source: PublisherBatchQueueSource,
  options?: {
    now?: string;
    staleThresholdMs?: number;
  },
): PublisherBatchQueueRow {
  const checks = source.checks ?? [];
  const lastBuild = getLastBuild(source.projectState);
  const derivedStatus = derivePublisherProjectStatus({
    intakeSession: source.intakeSession,
    checks,
    lastBuild,
    currentStatus: source.projectState?.status,
  });
  const fallbackStatus =
    derivedStatus === 'draft' && source.projectState?.status && source.projectState.status !== 'draft'
      ? source.projectState.status
      : undefined;
  const status = fallbackStatus ?? derivedStatus;
  const derivedWorkflow = derivePublisherWorkflowState({
    intakeSession: source.intakeSession,
    checks,
    lastBuild,
    currentStatus: source.projectState?.status,
  });
  const workflow = fallbackStatus ? (createFallbackWorkflow(fallbackStatus) ?? derivedWorkflow) : derivedWorkflow;
  const counts = summarizeChecks(checks);
  const hasAmbiguity =
    source.intakeSession?.scenario === 'needsDisambiguation' ||
    source.intakeSession?.disambiguation?.status === 'pending';
  const blocked = hasAmbiguity || status === 'failed' || counts.fail > 0;
  const updatedAt = resolveUpdatedAt(source, lastBuild?.createdAt);
  const staleThresholdMs = options?.staleThresholdMs ?? STALE_THRESHOLD_MS;
  const ageMs = Math.max(0, new Date(options?.now ?? updatedAt).getTime() - new Date(updatedAt).getTime());
  const stale = ageMs >= staleThresholdMs;
  const stuck =
    stale &&
    (blocked ||
      status === 'contract-ready' ||
      (source.intakeSession?.status !== undefined && source.intakeSession.status !== 'applied'));
  const readiness = resolveReadiness(status, blocked);
  const warningCount = counts.warn + (lastBuild?.warningCount ?? 0);
  const rowWithoutPriority = {
    projectId: source.projectId,
    status,
    workflow,
    intakeSessionId: source.intakeSession?.id,
    lastBuildAt: lastBuild?.createdAt,
    updatedAt,
    readiness,
    blocked,
    hasAmbiguity,
    stale,
    stuck,
    failureCount: counts.fail + (lastBuild?.releaseFailures ?? 0) + (lastBuild?.workingFailures ?? 0),
    warningCount,
    reason: hasAmbiguity
      ? 'intake ambiguity requires operator choice'
      : (workflow.blockingReason ?? workflow.nextAction),
  };

  return {
    ...rowWithoutPriority,
    priority: resolvePriority(rowWithoutPriority),
  };
}

export function sortBatchQueueRows(rows: PublisherBatchQueueRow[]) {
  return [...rows].sort((left, right) => {
    if (left.priority !== right.priority) {
      return left.priority - right.priority;
    }

    if (left.stuck !== right.stuck) {
      return left.stuck ? -1 : 1;
    }

    if (left.updatedAt !== right.updatedAt) {
      return right.updatedAt.localeCompare(left.updatedAt);
    }

    return left.projectId.localeCompare(right.projectId);
  });
}

export function filterBlockedBatchQueueRows(rows: PublisherBatchQueueRow[]) {
  return rows.filter((row) => row.blocked);
}

export function filterReviewReadyBatchQueueRows(rows: PublisherBatchQueueRow[]) {
  return rows.filter((row) => row.readiness === 'review' || row.readiness === 'release');
}

export function captureBatchQueueSnapshot(): PublisherBatchQueueSnapshot {
  return {
    projects: listPublisherProjectStates(),
    intakeSessions: listIntakeSessionsByUpdatedAtDesc(),
  };
}

export function deriveBatchQueueRowsFromSnapshot(
  snapshot: PublisherBatchQueueSnapshot,
  options?: {
    checksByProjectId?: Record<string, CheckReport[]>;
    now?: string;
    staleThresholdMs?: number;
  },
) {
  const sessionByProjectId = new Map<string, IntakeSession>();

  snapshot.intakeSessions.forEach((session) => {
    sessionByProjectId.set(session.id, session);
  });

  const rows = snapshot.projects.map(({ projectId, state }) =>
    deriveBatchQueueRow(
      {
        projectId,
        projectState: state,
        intakeSession: sessionByProjectId.get(projectId),
        checks: options?.checksByProjectId?.[projectId] ?? [],
      },
      {
        now: options?.now,
        staleThresholdMs: options?.staleThresholdMs,
      },
    ),
  );

  const knownProjectIds = new Set(snapshot.projects.map((entry) => entry.projectId));

  snapshot.intakeSessions.forEach((session) => {
    if (knownProjectIds.has(session.id)) {
      return;
    }

    rows.push(
      deriveBatchQueueRow(
        {
          projectId: session.id,
          intakeSession: session,
          checks: options?.checksByProjectId?.[session.id] ?? [],
        },
        {
          now: options?.now,
          staleThresholdMs: options?.staleThresholdMs,
        },
      ),
    );
  });

  return sortBatchQueueRows(rows);
}
