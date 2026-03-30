import { getCurrentChatId } from '~/utils/fileLocks';
import type { PublisherStage, WorkspaceMode } from '~/types/publisher';

const STORAGE_KEY = 'bolt.publisher.workspace-sessions';

export interface PersistedWorkspaceSession {
  mode: WorkspaceMode;
  stage?: PublisherStage;
  onboardingCompleted?: boolean;
  projectId?: string;
  intakeSessionId?: string;
}

type PersistedWorkspaceSessionMap = Record<string, PersistedWorkspaceSession>;

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function loadSessionMap(): PersistedWorkspaceSessionMap {
  if (!canUseStorage()) {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PersistedWorkspaceSessionMap) : {};
  } catch {
    return {};
  }
}

function saveSessionMap(nextState: PersistedWorkspaceSessionMap) {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
}

export function loadWorkspaceSession(chatId = getCurrentChatId()): PersistedWorkspaceSession | undefined {
  return loadSessionMap()[chatId];
}

export function saveWorkspaceSession(patch: Partial<PersistedWorkspaceSession>, chatId = getCurrentChatId()) {
  const current = loadSessionMap();
  const previous = current[chatId] ?? { mode: 'default' as WorkspaceMode, stage: 'onboarding' as PublisherStage };

  current[chatId] = {
    ...previous,
    ...patch,
    mode: patch.mode ?? previous.mode,
    stage: patch.stage ?? previous.stage,
  };

  saveSessionMap(current);
}
