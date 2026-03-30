import { beforeEach, describe, expect, it } from 'vitest';
import type { IntakeSession } from '~/types/publisher';
import { savePublisherProjectState } from './persistence';
import { saveIntakeSession } from './intake-session';
import {
  captureBatchQueueSnapshot,
  deriveBatchQueueRow,
  deriveBatchQueueRowsFromSnapshot,
  filterBlockedBatchQueueRows,
  filterReviewReadyBatchQueueRows,
  sortBatchQueueRows,
} from './batch';

function createMemoryStorage() {
  const store = new Map<string, string>();

  return {
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
    removeItem(key: string) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
  };
}

function createSession(overrides?: Partial<IntakeSession>): IntakeSession {
  return {
    id: 'site-a',
    createdAt: '2026-03-30T08:00:00.000Z',
    updatedAt: '2026-03-30T09:00:00.000Z',
    sourceLabel: 'Imported site',
    importKind: 'html',
    status: 'reviewing',
    scenario: 'template-plus-documents',
    activeContentFamily: 'html',
    project: {
      name: 'Site A',
      defaultLanguage: 'en',
      multilingual: false,
      languages: ['en'],
    },
    sources: [],
    pages: [],
    shellCandidatePaths: [],
    blockLibraryPaths: [],
    warnings: [],
    checks: [],
    scriptRuns: [],
    ...overrides,
  };
}

describe('publisher batch queue helpers', () => {
  beforeEach(() => {
    (globalThis as any).window = { localStorage: createMemoryStorage() };
  });

  it('derives queue rows', () => {
    const row = deriveBatchQueueRow(
      {
        projectId: 'site-a',
        intakeSession: createSession({
          scenario: 'needsDisambiguation',
          disambiguation: {
            status: 'pending',
            candidateImportKinds: ['html', 'document'],
            templateCandidatePaths: ['index.html'],
            homeCandidatePaths: ['pages/index.html'],
          },
        }),
      },
      {
        now: '2026-03-31T12:00:00.000Z',
      },
    );

    expect(row.projectId).toBe('site-a');
    expect(row.readiness).toBe('blocked');
    expect(row.blocked).toBe(true);
    expect(row.hasAmbiguity).toBe(true);
    expect(row.stuck).toBe(true);
    expect(row.reason).toContain('ambiguity');
  });

  it('sorts queue rows deterministically', () => {
    const rows = sortBatchQueueRows([
      deriveBatchQueueRow(
        {
          projectId: 'site-c',
          projectState: {
            agentHistory: [],
            status: 'release-ready',
            buildHistory: [],
            lastBuildAt: '2026-03-30T11:00:00.000Z',
          },
          checks: [],
        },
        { now: '2026-03-30T12:00:00.000Z' },
      ),
      deriveBatchQueueRow(
        {
          projectId: 'site-b',
          projectState: {
            agentHistory: [],
            status: 'failed',
            buildHistory: [],
            lastBuildAt: '2026-03-30T10:00:00.000Z',
          },
          checks: [{ name: 'release-gate', status: 'fail', message: 'failed', gate: 'release' }],
        },
        { now: '2026-03-30T12:00:00.000Z' },
      ),
      deriveBatchQueueRow(
        {
          projectId: 'site-a',
          intakeSession: createSession(),
        },
        { now: '2026-03-30T12:00:00.000Z' },
      ),
    ]);

    expect(rows.map((row) => row.projectId)).toEqual(['site-b', 'site-c', 'site-a']);
    expect(filterBlockedBatchQueueRows(rows).map((row) => row.projectId)).toEqual(['site-b']);
    expect(filterReviewReadyBatchQueueRows(rows).map((row) => row.projectId)).toEqual(['site-c', 'site-a']);
  });

  it('normalizes queue inputs from persisted state and intake storage', () => {
    savePublisherProjectState('site-a', {
      agentHistory: [],
      status: 'release-ready',
      lastBuildAt: '2026-03-30T10:00:00.000Z',
      buildHistory: [
        {
          id: 'build-site-a',
          createdAt: '2026-03-30T10:00:00.000Z',
          projectId: 'site-a',
          status: 'release-ready',
          stage: 'check',
          workingFailures: 0,
          releaseFailures: 0,
          warningCount: 1,
          artifacts: [],
        },
      ],
    });
    savePublisherProjectState('site-b', {
      agentHistory: [],
      status: 'failed',
      lastBuildAt: '2026-03-29T07:00:00.000Z',
    });
    saveIntakeSession(
      createSession({
        id: 'site-b',
        updatedAt: '2026-03-29T07:30:00.000Z',
      }),
    );

    const rows = deriveBatchQueueRowsFromSnapshot(captureBatchQueueSnapshot(), {
      checksByProjectId: {
        'site-b': [{ name: 'release-gate', status: 'fail', message: 'failed', gate: 'release' }],
      },
      now: '2026-03-30T12:00:00.000Z',
    });

    expect(rows).toHaveLength(2);
    expect(rows[0]?.projectId).toBe('site-b');
    expect(rows[0]?.blocked).toBe(true);
    expect(rows[1]?.projectId).toBe('site-a');
    expect(rows[1]?.readiness).toBe('release');
  });
});
