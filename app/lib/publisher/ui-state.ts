import type { WorkbenchViewType } from '~/lib/stores/workbench';

export function resolveWorkbenchAutoView(options: {
  hadPreview: boolean;
  hasPreview: boolean;
  currentView: WorkbenchViewType;
  hasPublisherContract: boolean;
}): WorkbenchViewType | undefined {
  const { hadPreview, hasPreview, currentView, hasPublisherContract } = options;

  if (!hadPreview && hasPreview) {
    return 'preview';
  }

  if (hadPreview && !hasPreview && currentView === 'preview') {
    return hasPublisherContract ? 'structure' : 'code';
  }

  return undefined;
}

export function isPublisherSystemFile(filePath: string) {
  return (
    filePath.startsWith('/home/project/.bolt/publisher/generated/') ||
    filePath === '/home/project/.bolt/publisher/checks.json' ||
    filePath === '/home/project/.bolt/publisher/state.json'
  );
}

export function shouldConfirmDraftReplacement(currentInput: string, replaceRequested: boolean) {
  return replaceRequested && currentInput.trim().length > 0;
}
