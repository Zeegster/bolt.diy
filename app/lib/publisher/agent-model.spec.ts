import { describe, expect, it } from 'vitest';
import {
  buildPromptForRepairIntent,
  deriveRepairIntentFromCheck,
  parsePublisherAgentAction,
  resolvePublisherActionFileScope,
  safeParsePublisherAgentAction,
} from './agent-model';

describe('publisher agent model', () => {
  it('validates allowed agent intents', () => {
    expect(parsePublisherAgentAction({ action: 'normalize', pageId: 'home' })).toEqual({
      action: 'normalize',
      pageId: 'home',
    });
    expect(parsePublisherAgentAction({ action: 'map', pageId: 'home', sourcePath: 'content/home.md' })).toEqual({
      action: 'map',
      pageId: 'home',
      sourcePath: 'content/home.md',
    });
    expect(parsePublisherAgentAction({ action: 'fill', pageId: 'home', zone: 'content', slotId: 'hero' })).toEqual({
      action: 'fill',
      pageId: 'home',
      zone: 'content',
      slotId: 'hero',
    });
    expect(parsePublisherAgentAction({ action: 'repair', checkName: 'metadata-completeness', pageId: 'home' })).toEqual(
      {
        action: 'repair',
        checkName: 'metadata-completeness',
        pageId: 'home',
      },
    );
    expect(safeParsePublisherAgentAction({ action: 'invent', pageId: 'home' }).success).toBe(false);
    expect(safeParsePublisherAgentAction({ action: 'fill', pageId: 'home', slotId: 'hero' }).success).toBe(false);
  });

  it('maps release diagnostics to deterministic repair intents', () => {
    const metadataIntent = deriveRepairIntentFromCheck({
      name: 'metadata-completeness',
      status: 'fail',
      message: 'Page "Home" is missing release-grade metadata.',
      pageId: 'home',
      gate: 'release',
    });
    const compositionIntent = deriveRepairIntentFromCheck({
      name: 'missing-zone',
      status: 'fail',
      message: 'Page contract is missing a required zone.',
      pageId: 'home',
      zone: 'content',
      gate: 'working',
    });
    const outputIntent = deriveRepairIntentFromCheck({
      name: 'broken-internal-link',
      status: 'fail',
      message: 'Generated output references an unknown internal path.',
      pageId: 'home',
      gate: 'release',
    });

    expect(metadataIntent).toEqual({ action: 'normalize', pageId: 'home' });
    expect(compositionIntent).toEqual({ action: 'fill', pageId: 'home', zone: 'content', slotId: 'missing-zone' });
    expect(outputIntent).toEqual({
      action: 'repair',
      checkName: 'broken-internal-link',
      pageId: 'home',
      zone: undefined,
    });
    expect(resolvePublisherActionFileScope(metadataIntent)).toBe('contracts-only');
    expect(resolvePublisherActionFileScope(outputIntent)).toBe('contracts-plus-checks');
    expect(
      buildPromptForRepairIntent(outputIntent, {
        name: 'broken-internal-link',
        status: 'fail',
        message: 'Generated output references an unknown internal path.',
        pageId: 'home',
        gate: 'release',
      }),
    ).toContain('intentBoundaries: resolve only the named diagnostic without widening publisher output scope.');
  });

  it('falls back to bounded repair intents when scoped metadata or composition targets are missing', () => {
    const metadataWithoutPage = deriveRepairIntentFromCheck({
      name: 'metadata-completeness',
      status: 'fail',
      message: 'Project metadata is incomplete.',
      gate: 'release',
    });
    const compositionWithoutZone = deriveRepairIntentFromCheck({
      name: 'missing-zone',
      status: 'fail',
      message: 'Page contract is missing a required zone.',
      pageId: 'home',
      gate: 'working',
    });

    expect(metadataWithoutPage).toEqual({
      action: 'repair',
      checkName: 'metadata-completeness',
      pageId: undefined,
      zone: undefined,
    });
    expect(compositionWithoutZone).toEqual({
      action: 'repair',
      checkName: 'missing-zone',
      pageId: 'home',
      zone: undefined,
    });
  });
});
