import { describe, expect, it } from 'vitest';
import { aggregatePublisherBatchMetrics, bucketBatchFailuresByDiagnostic } from './batch-metrics';
import type { PublisherBatchQueueRow } from './batch';

const rows: PublisherBatchQueueRow[] = [
  {
    projectId: 'site-a',
    status: 'failed',
    workflow: {
      status: 'failed',
      step: 'release',
      label: 'Release readiness',
      summary: 'Blocked',
      nextAction: 'Fix release blockers',
      blockingReason: '2 release blocking check(s) failed.',
    },
    updatedAt: '2026-03-30T10:00:00.000Z',
    lastBuildAt: '2026-03-30T10:00:00.000Z',
    readiness: 'blocked',
    priority: 1,
    blocked: true,
    hasAmbiguity: false,
    stale: false,
    stuck: false,
    failureCount: 2,
    warningCount: 1,
    reason: '2 release blocking check(s) failed.',
  },
  {
    projectId: 'site-b',
    status: 'contract-ready',
    workflow: {
      status: 'contract-ready',
      step: 'review',
      label: 'Contract review',
      summary: 'Needs review',
      nextAction: 'Review contract issues',
    },
    updatedAt: '2026-03-29T08:00:00.000Z',
    readiness: 'review',
    priority: 3,
    blocked: false,
    hasAmbiguity: false,
    stale: true,
    stuck: true,
    failureCount: 0,
    warningCount: 1,
    reason: 'Review contract issues',
  },
  {
    projectId: 'site-c',
    status: 'release-ready',
    workflow: {
      status: 'release-ready',
      step: 'release',
      label: 'Release readiness',
      summary: 'Ready',
      nextAction: 'Inspect artifacts',
    },
    updatedAt: '2026-03-30T11:00:00.000Z',
    lastBuildAt: '2026-03-30T11:00:00.000Z',
    readiness: 'release',
    priority: 2,
    blocked: false,
    hasAmbiguity: false,
    stale: false,
    stuck: false,
    failureCount: 0,
    warningCount: 0,
    reason: 'Inspect artifacts',
  },
];

describe('publisher batch metrics', () => {
  it('aggregates publisher metrics', () => {
    const summary = aggregatePublisherBatchMetrics(rows, {
      now: '2026-03-30T12:00:00.000Z',
    });

    expect(summary.totalProjects).toBe(3);
    expect(summary.blockedProjects).toBe(1);
    expect(summary.reviewProjects).toBe(1);
    expect(summary.releaseProjects).toBe(1);
    expect(summary.staleProjects).toBe(1);
    expect(summary.stuckProjects).toBe(1);
    expect(summary.recentBuilds).toBe(2);
    expect(summary.averageHoursInStage).toBeGreaterThan(9);
    expect(summary.byStep).toEqual({
      release: 2,
      review: 1,
    });
  });

  it('buckets failures by publisher diagnostics', () => {
    const buckets = bucketBatchFailuresByDiagnostic({
      'site-a': [
        { name: 'metadata-completeness', status: 'fail', message: 'Missing metadata', pageId: 'home', gate: 'release' },
        {
          name: 'missing-zone',
          status: 'fail',
          message: 'Missing zone',
          pageId: 'home',
          zone: 'content',
          gate: 'working',
        },
      ],
      'site-b': [{ name: 'broken-internal-link', status: 'warn', message: 'Broken link', gate: 'release' }],
    });

    expect(buckets).toEqual([
      { category: 'composition', count: 1, projects: ['site-a'] },
      { category: 'metadata', count: 1, projects: ['site-a'] },
      { category: 'output', count: 1, projects: ['site-b'] },
    ]);
  });

  it('surfaces an operator-facing metrics summary contract for future UI use', () => {
    const summary = aggregatePublisherBatchMetrics(rows, {
      now: '2026-03-30T12:00:00.000Z',
      checksByProjectId: {
        'site-a': [{ name: 'metadata-completeness', status: 'fail', message: 'Missing metadata', gate: 'release' }],
      },
    });

    expect(summary).toMatchObject({
      totalProjects: 3,
      blockedProjects: 1,
      failureBuckets: [{ category: 'metadata', count: 1, projects: ['site-a'] }],
    });
  });
});
