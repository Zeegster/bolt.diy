import type { WorkbenchViewType } from '~/lib/stores/workbench';
import {
  PUBLISHER_CHECKS_FILE,
  PUBLISHER_INTAKE_DIR,
  PUBLISHER_INTAKE_SESSION_FILE,
  PUBLISHER_INTAKE_SOURCE_MANIFEST_FILE,
  PUBLISHER_INTAKE_SCRIPT_RUNS_FILE,
  PUBLISHER_STATE_FILE,
  PUBLISHER_GENERATED_DIR,
  PUBLISHER_PAGES_DIR,
  PUBLISHER_PROJECT_FILE,
  PUBLISHER_REFERENCES_FILE,
  PUBLISHER_THEME_FILE,
} from './constants';

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
    filePath.startsWith(`${PUBLISHER_GENERATED_DIR}/`) ||
    filePath.startsWith(`${PUBLISHER_INTAKE_DIR}/`) ||
    filePath === PUBLISHER_INTAKE_SESSION_FILE ||
    filePath === PUBLISHER_INTAKE_SOURCE_MANIFEST_FILE ||
    filePath === PUBLISHER_INTAKE_SCRIPT_RUNS_FILE ||
    filePath === PUBLISHER_STATE_FILE
  );
}

export function isPublisherContractFile(filePath: string) {
  return (
    filePath === PUBLISHER_PROJECT_FILE ||
    filePath === PUBLISHER_THEME_FILE ||
    filePath === PUBLISHER_CHECKS_FILE ||
    filePath === PUBLISHER_REFERENCES_FILE ||
    filePath.startsWith(`${PUBLISHER_PAGES_DIR}/`)
  );
}

export function shouldWritePublisherFileToProject(filePath: string) {
  return isPublisherContractFile(filePath);
}

export function shouldConfirmDraftReplacement(currentInput: string, replaceRequested: boolean) {
  return replaceRequested && currentInput.trim().length > 0;
}
