import { describe, expect, it } from 'vitest';
import {
  PUBLISHER_INTAKE_SESSION_FILE,
  PUBLISHER_PROJECT_FILE,
  PUBLISHER_REFERENCES_FILE,
  PUBLISHER_THEME_FILE,
} from './constants';
import {
  isPublisherContractFile,
  isPublisherSystemFile,
  resolveWorkbenchAutoView,
  shouldConfirmDraftReplacement,
  shouldWritePublisherFileToProject,
} from './ui-state';
import { derivePublisherWorkflowState } from './status';

describe('publisher ui state helpers', () => {
  it('auto-switches to preview only when preview first appears', () => {
    expect(
      resolveWorkbenchAutoView({
        hadPreview: false,
        hasPreview: true,
        currentView: 'code',
        hasPublisherContract: true,
      }),
    ).toBe('preview');

    expect(
      resolveWorkbenchAutoView({
        hadPreview: true,
        hasPreview: true,
        currentView: 'structure',
        hasPublisherContract: true,
      }),
    ).toBeUndefined();
  });

  it('falls back away from preview if preview disappears', () => {
    expect(
      resolveWorkbenchAutoView({
        hadPreview: true,
        hasPreview: false,
        currentView: 'preview',
        hasPublisherContract: true,
      }),
    ).toBe('structure');

    expect(
      resolveWorkbenchAutoView({
        hadPreview: true,
        hasPreview: false,
        currentView: 'preview',
        hasPublisherContract: false,
      }),
    ).toBe('code');
  });

  it('recognizes system-owned publisher files', () => {
    expect(isPublisherSystemFile('/home/project/.bolt/publisher/generated/index.html')).toBe(true);
    expect(isPublisherSystemFile('/home/project/.bolt/publisher/checks.json')).toBe(false);
    expect(isPublisherSystemFile(PUBLISHER_INTAKE_SESSION_FILE)).toBe(true);
    expect(isPublisherSystemFile('/home/project/.bolt/publisher/pages/home.json')).toBe(false);
  });

  it('requires confirmation only when replacement is requested and input is non-empty', () => {
    expect(shouldConfirmDraftReplacement('', true)).toBe(false);
    expect(shouldConfirmDraftReplacement('draft', false)).toBe(false);
    expect(shouldConfirmDraftReplacement('draft', true)).toBe(true);
  });

  it('routes publisher files to the correct write target', () => {
    expect(isPublisherContractFile(PUBLISHER_PROJECT_FILE)).toBe(true);
    expect(isPublisherContractFile(PUBLISHER_THEME_FILE)).toBe(true);
    expect(isPublisherContractFile(PUBLISHER_REFERENCES_FILE)).toBe(true);
    expect(isPublisherContractFile('/home/project/.bolt/publisher/pages/home.json')).toBe(true);
    expect(shouldWritePublisherFileToProject(PUBLISHER_PROJECT_FILE)).toBe(true);
    expect(shouldWritePublisherFileToProject('/home/project/.bolt/publisher/pages/home.json')).toBe(true);
    expect(shouldWritePublisherFileToProject('/home/project/.bolt/publisher/intake/session.json')).toBe(false);
    expect(shouldWritePublisherFileToProject('/home/project/.bolt/publisher/generated/index.html')).toBe(false);
  });
});

describe('publisher workflow release semantics', () => {
  it('surfaces release-ready messaging from successful staged pipeline metadata', () => {
    const workflow = derivePublisherWorkflowState({
      checks: [],
      lastBuild: {
        id: 'build-ready',
        createdAt: '2026-03-30T00:00:00.000Z',
        status: 'release-ready',
        stage: 'export',
        workingFailures: 0,
        releaseFailures: 0,
        warningCount: 0,
        artifacts: [],
        pipeline: {
          schemaVersion: '1.0.0',
          stageOrder: ['assemble', 'optimize', 'check', 'export'],
          deliveryStage: 'export',
          stages: [
            {
              stage: 'assemble',
              status: 'completed',
              summary: 'Assemble completed.',
              details: [],
            },
            {
              stage: 'optimize',
              status: 'completed',
              summary: 'Optimize completed.',
              details: [],
            },
            {
              stage: 'check',
              status: 'completed',
              summary: 'Check completed.',
              details: [],
            },
            {
              stage: 'export',
              status: 'completed',
              summary: 'Export completed.',
              details: [],
            },
          ],
          jobs: [],
          activeStage: 'export',
          publishContract: {
            schemaVersion: '1.0.0',
            buildId: 'build-ready',
            generatedAt: '2026-03-30T00:00:00.000Z',
            canPublish: true,
            publishWarnings: [],
            publishBlockers: [],
            sourceFingerprint: 's1',
            artifactFingerprint: 'a1',
            rollback: {
              strategy: 'rebuild',
              keepLastBuilds: 10,
            },
          },
        },
      },
    });

    expect(workflow.status).toBe('release-ready');
    expect(workflow.step).toBe('release');
    expect(workflow.nextAction).toContain('publish/export');
    expect(workflow.releaseStage).toBe('export');
    expect(workflow.releaseStageStatus).toBe('completed');
    expect(workflow.releaseFailureStage).toBeUndefined();
  });

  it('falls back to check-stage failure metadata when release blockers exist without pipeline details', () => {
    const workflow = derivePublisherWorkflowState({
      checks: [
        {
          name: 'site-url',
          status: 'fail',
          message: 'siteUrl is required',
          gate: 'release',
        },
      ],
    });

    expect(workflow.status).toBe('failed');
    expect(workflow.step).toBe('release');
    expect(workflow.blockingReason).toContain('Release blockers:');
    expect(workflow.blockingReason).toContain('site-url');
    expect(workflow.releaseStage).toBe('check');
    expect(workflow.releaseStageStatus).toBe('failed');
    expect(workflow.releaseFailureStage).toBe('check');
  });

  it('prefers failed staged metadata when build pipeline reports a non-check failure stage', () => {
    const workflow = derivePublisherWorkflowState({
      checks: [
        {
          name: 'release-gate',
          status: 'fail',
          message: 'Release gate failed.',
          gate: 'release',
        },
      ],
      lastBuild: {
        id: 'build-failed',
        createdAt: '2026-03-30T00:00:00.000Z',
        status: 'failed',
        stage: 'check',
        workingFailures: 0,
        releaseFailures: 1,
        warningCount: 0,
        artifacts: [],
        pipeline: {
          schemaVersion: '1.0.0',
          stageOrder: ['assemble', 'optimize', 'check', 'export'],
          deliveryStage: 'export',
          stages: [
            {
              stage: 'assemble',
              status: 'completed',
              summary: 'Assemble completed.',
              details: [],
            },
            {
              stage: 'optimize',
              status: 'failed',
              summary: 'Optimize failed.',
              details: ['optimizer exhausted memory budget'],
            },
            {
              stage: 'check',
              status: 'skipped',
              summary: 'Check skipped.',
              details: [],
            },
            {
              stage: 'export',
              status: 'skipped',
              summary: 'Export skipped.',
              details: [],
            },
          ],
          jobs: [],
          activeStage: 'optimize',
          failedStage: 'optimize',
          publishContract: {
            schemaVersion: '1.0.0',
            buildId: 'build-failed',
            generatedAt: '2026-03-30T00:00:00.000Z',
            canPublish: false,
            publishWarnings: [],
            publishBlockers: ['release:optimizer:memory'],
            sourceFingerprint: 's2',
            artifactFingerprint: 'a2',
            rollback: {
              strategy: 'rebuild',
              keepLastBuilds: 10,
            },
          },
        },
      },
    });

    expect(workflow.status).toBe('failed');
    expect(workflow.releaseStage).toBe('optimize');
    expect(workflow.releaseStageStatus).toBe('failed');
    expect(workflow.releaseFailureStage).toBe('optimize');
  });
});
