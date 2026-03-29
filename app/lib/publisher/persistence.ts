import type { PublisherAgentContext } from '~/types/publisher';

const STORAGE_KEY = 'bolt.publisher.projects';

export interface PersistedPublisherProjectState {
  selectedPageId?: string;
  agentHistory: PublisherAgentContext[];
  lastPrompt?: string;
  lastBuildAt?: string;
}

type PersistedPublisherMap = Record<string, PersistedPublisherProjectState>;

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function loadAllProjects(): PersistedPublisherMap {
  if (!canUseStorage()) {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PersistedPublisherMap) : {};
  } catch {
    return {};
  }
}

function saveAllProjects(nextState: PersistedPublisherMap) {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
}

export function loadPublisherProjectState(projectId?: string): PersistedPublisherProjectState | undefined {
  if (!projectId) {
    return undefined;
  }

  return loadAllProjects()[projectId];
}

export function savePublisherProjectState(
  projectId: string | undefined,
  patch: Partial<PersistedPublisherProjectState>,
) {
  if (!projectId) {
    return;
  }

  const current = loadAllProjects();
  const previous = current[projectId] ?? { agentHistory: [] };

  current[projectId] = {
    ...previous,
    ...patch,
    agentHistory: patch.agentHistory ?? previous.agentHistory,
  };

  saveAllProjects(current);
}

export function appendPublisherAgentContext(
  projectId: string | undefined,
  context: PublisherAgentContext,
  prompt: string,
) {
  if (!projectId) {
    return;
  }

  const current = loadPublisherProjectState(projectId) ?? { agentHistory: [] };
  const nextHistory = [...current.agentHistory, context].slice(-20);

  savePublisherProjectState(projectId, {
    agentHistory: nextHistory,
    lastPrompt: prompt,
  });
}
