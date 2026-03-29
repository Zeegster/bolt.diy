import { describe, expect, it } from 'vitest';
import { isPublisherSystemFile, resolveWorkbenchAutoView, shouldConfirmDraftReplacement } from './ui-state';

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
    expect(isPublisherSystemFile('/home/project/.bolt/publisher/checks.json')).toBe(true);
    expect(isPublisherSystemFile('/home/project/.bolt/publisher/pages/home.json')).toBe(false);
  });

  it('requires confirmation only when replacement is requested and input is non-empty', () => {
    expect(shouldConfirmDraftReplacement('', true)).toBe(false);
    expect(shouldConfirmDraftReplacement('draft', false)).toBe(false);
    expect(shouldConfirmDraftReplacement('draft', true)).toBe(true);
  });
});
