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
