import type { CheckReport } from '~/types/publisher';
import { categorizePublisherDiagnostic } from './intake-ui';
import type { PublisherBatchQueueRow } from './batch';

export interface PublisherBatchFailureBucket {
  category: ReturnType<typeof categorizePublisherDiagnostic>;
  count: number;
  projects: string[];
}

export interface PublisherBatchMetricsSummary {
  totalProjects: number;
  blockedProjects: number;
  reviewProjects: number;
  releaseProjects: number;
  staleProjects: number;
  stuckProjects: number;
  recentBuilds: number;
  publishedProjects: number;
  averageHoursInStage: number;
  byStep: Record<string, number>;
  failureBuckets: PublisherBatchFailureBucket[];
}

function roundToSingleDecimal(value: number) {
  return Math.round(value * 10) / 10;
}

export function bucketBatchFailuresByDiagnostic(
  checksByProjectId: Record<string, CheckReport[]>,
): PublisherBatchFailureBucket[] {
  const buckets = new Map<ReturnType<typeof categorizePublisherDiagnostic>, PublisherBatchFailureBucket>();

  Object.entries(checksByProjectId).forEach(([projectId, checks]) => {
    checks
      .filter((check) => check.status === 'fail' || check.status === 'warn')
      .forEach((check) => {
        const category = categorizePublisherDiagnostic(check);
        const existing = buckets.get(category);

        if (existing) {
          existing.count += 1;

          if (!existing.projects.includes(projectId)) {
            existing.projects.push(projectId);
          }

          return;
        }

        buckets.set(category, {
          category,
          count: 1,
          projects: [projectId],
        });
      });
  });

  return [...buckets.values()].sort((left, right) => {
    if (left.count !== right.count) {
      return right.count - left.count;
    }

    return left.category.localeCompare(right.category);
  });
}

export function aggregatePublisherBatchMetrics(
  rows: PublisherBatchQueueRow[],
  options?: {
    checksByProjectId?: Record<string, CheckReport[]>;
    now?: string;
    recentWindowDays?: number;
  },
): PublisherBatchMetricsSummary {
  const now = new Date(options?.now ?? new Date().toISOString()).getTime();
  const recentWindowMs = (options?.recentWindowDays ?? 7) * 24 * 60 * 60 * 1000;
  const byStep = rows.reduce<Record<string, number>>((accumulator, row) => {
    accumulator[row.workflow.step] = (accumulator[row.workflow.step] ?? 0) + 1;
    return accumulator;
  }, {});
  const averageHoursInStage =
    rows.length === 0
      ? 0
      : roundToSingleDecimal(
          rows.reduce((total, row) => total + (now - new Date(row.updatedAt).getTime()) / (1000 * 60 * 60), 0) /
            rows.length,
        );

  return {
    totalProjects: rows.length,
    blockedProjects: rows.filter((row) => row.blocked).length,
    reviewProjects: rows.filter((row) => row.readiness === 'review').length,
    releaseProjects: rows.filter((row) => row.readiness === 'release').length,
    staleProjects: rows.filter((row) => row.stale).length,
    stuckProjects: rows.filter((row) => row.stuck).length,
    recentBuilds: rows.filter((row) => row.lastBuildAt && now - new Date(row.lastBuildAt).getTime() <= recentWindowMs)
      .length,
    publishedProjects: rows.filter((row) => row.readiness === 'published').length,
    averageHoursInStage,
    byStep,
    failureBuckets: bucketBatchFailuresByDiagnostic(options?.checksByProjectId ?? {}),
  };
}
