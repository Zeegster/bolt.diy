import type { IntakeScriptRun, IntakeSession } from '~/types/publisher';
import { parseIntakeSessionRecord } from './intake-files';

const STORAGE_KEY = 'bolt.publisher.intake.sessions';

interface PersistedIntakeSessionRecord {
  session: IntakeSession;
  updatedAt: string;
}

type PersistedIntakeSessionMap = Record<string, PersistedIntakeSessionRecord>;

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function loadSessionMap(): PersistedIntakeSessionMap {
  if (!canUseStorage()) {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as PersistedIntakeSessionMap) : {};
    const validatedEntries = Object.entries(parsed).flatMap(([sessionId, record]) => {
      const session = parseIntakeSessionRecord(record?.session);

      if (!session) {
        console.error(`Dropping invalid intake session from localStorage: ${sessionId}`);
        return [];
      }

      return [
        [
          session.id,
          {
            session,
            updatedAt: record?.updatedAt ?? session.updatedAt,
          },
        ] as const,
      ];
    });

    return Object.fromEntries(validatedEntries);
  } catch {
    return {};
  }
}

function saveSessionMap(nextState: PersistedIntakeSessionMap) {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
}

export function loadIntakeSession(sessionId?: string) {
  if (!sessionId) {
    return undefined;
  }

  return loadSessionMap()[sessionId]?.session;
}

export function listIntakeSessions() {
  return Object.values(loadSessionMap())
    .map((entry) => entry.session)
    .sort((left, right) => left.updatedAt.localeCompare(right.updatedAt));
}

export function saveIntakeSession(session: IntakeSession) {
  const current = loadSessionMap();
  const updatedAt = new Date().toISOString();

  current[session.id] = {
    session: {
      ...session,
      updatedAt,
    },
    updatedAt,
  };

  saveSessionMap(current);
}

export function updateIntakeSession(sessionId: string, patch: Partial<IntakeSession>) {
  const current = loadSessionMap();
  const previous = current[sessionId]?.session;

  if (!previous) {
    return;
  }

  const updatedAt = new Date().toISOString();

  current[sessionId] = {
    session: {
      ...previous,
      ...patch,
      updatedAt,
    },
    updatedAt,
  };

  saveSessionMap(current);
}

export function appendIntakeScriptRun(sessionId: string, run: IntakeScriptRun) {
  const current = loadSessionMap();
  const previous = current[sessionId]?.session;

  if (!previous) {
    return;
  }

  const updatedAt = new Date().toISOString();

  current[sessionId] = {
    session: {
      ...previous,
      scriptRuns: [...previous.scriptRuns, run],
      updatedAt,
    },
    updatedAt,
  };

  saveSessionMap(current);
}
