import { describe, expect, it } from 'vitest';
import { buildRepairRegeneratePrompt } from './prompt-context';
import {
  createPublisherOrchestrationEnvelope,
  parsePublisherOrchestrationAction,
  safeParsePublisherOrchestrationAction,
} from './orchestration';

describe('publisher orchestration', () => {
  it('validates orchestration actions', () => {
    expect(parsePublisherOrchestrationAction({ action: 'enqueue-intake-review', projectId: 'site-a' })).toEqual({
      action: 'enqueue-intake-review',
      projectId: 'site-a',
    });
    expect(
      parsePublisherOrchestrationAction({ action: 'rebuild-preview', projectId: 'site-a', pageId: 'home' }),
    ).toEqual({
      action: 'rebuild-preview',
      projectId: 'site-a',
      pageId: 'home',
    });
    expect(parsePublisherOrchestrationAction({ action: 'run-release-checks', projectId: 'site-a' })).toEqual({
      action: 'run-release-checks',
      projectId: 'site-a',
    });
    expect(parsePublisherOrchestrationAction({ action: 'publish-export', projectId: 'site-a' })).toEqual({
      action: 'publish-export',
      projectId: 'site-a',
    });
    expect(
      parsePublisherOrchestrationAction({
        action: 'retry-repair-loop',
        projectId: 'site-a',
        checkName: 'metadata-completeness',
      }),
    ).toEqual({
      action: 'retry-repair-loop',
      projectId: 'site-a',
      checkName: 'metadata-completeness',
    });
    expect(safeParsePublisherOrchestrationAction({ action: 'invent', projectId: 'site-a' }).success).toBe(false);
  });

  it('reserves optional quality-extension hook for future lighthouse-style checks', () => {
    const envelope = createPublisherOrchestrationEnvelope(
      {
        action: 'publish-export',
        projectId: 'site-a',
      },
      {
        requestedAt: '2026-03-30T18:31:00.000Z',
        qualityExtensions: [{ kind: 'lighthouse', profile: 'mobile', minScore: 0.9, optional: true }],
      },
    );

    expect(envelope.transport).toBe('local');
    expect(envelope.qualityExtensions).toEqual([
      { kind: 'lighthouse', profile: 'mobile', minScore: 0.9, optional: true },
    ]);
  });

  it('repair intent prompt encodes constrained scope and origin marker', () => {
    const sourcePrompt = buildRepairRegeneratePrompt('missing-page-h1', 'home');
    const templatePrompt = buildRepairRegeneratePrompt('decorative-zone-primary-content', 'home', 'beforeContent');
    const runtimePrompt = buildRepairRegeneratePrompt('table-media-wrapper', 'home', 'content');

    expect(sourcePrompt).toContain('targetFileScope: contracts-plus-checks');
    expect(sourcePrompt).toContain('repairOrigin: source');
    expect(templatePrompt).toContain('repairOrigin: template');
    expect(runtimePrompt).toContain('repairOrigin: runtime');
    expect(runtimePrompt).toContain(
      'Repair only the failing publisher contract fields needed to resolve the named check.',
    );
  });
});
