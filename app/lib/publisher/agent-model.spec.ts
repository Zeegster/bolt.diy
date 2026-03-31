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
    const sourceIntent = deriveRepairIntentFromCheck({
      name: 'missing-page-title',
      status: 'fail',
      message: 'Page "Home" is missing a title.',
      pageId: 'home',
      gate: 'working',
    });
    const templateIntent = deriveRepairIntentFromCheck({
      name: 'decorative-zone-content-injection',
      status: 'fail',
      message: 'Decorative zone carries article html.',
      pageId: 'home',
      zone: 'beforeContent',
      gate: 'release',
    });
    const outputIntent = deriveRepairIntentFromCheck({
      name: 'technical-file-consistency',
      status: 'fail',
      message: 'Generated output is missing required technical files.',
      pageId: 'home',
      gate: 'release',
    });

    expect(sourceIntent).toEqual({ action: 'repair', checkName: 'missing-page-title', pageId: 'home' });
    expect(templateIntent).toEqual({
      action: 'repair',
      checkName: 'decorative-zone-content-injection',
      pageId: 'home',
      zone: 'beforeContent',
    });
    expect(outputIntent).toEqual({
      action: 'repair',
      checkName: 'technical-file-consistency',
      pageId: 'home',
      zone: undefined,
    });
    expect(resolvePublisherActionFileScope(sourceIntent ?? undefined)).toBe('contracts-plus-checks');
    expect(resolvePublisherActionFileScope(outputIntent ?? undefined)).toBe('contracts-plus-checks');
    expect(
      buildPromptForRepairIntent(outputIntent!, {
        name: 'technical-file-consistency',
        status: 'fail',
        message: 'Generated output is missing required technical files.',
        pageId: 'home',
        gate: 'release',
      }),
    ).toContain('intentBoundaries: resolve only the named diagnostic without widening publisher output scope.');
  });

  it('returns null for diagnostics outside constrained repair mapping', () => {
    const unsupported = deriveRepairIntentFromCheck({
      name: 'metadata-completeness',
      status: 'fail',
      message: 'Project metadata is incomplete.',
      gate: 'release',
    });

    expect(unsupported).toBeNull();
  });
});
