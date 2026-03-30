import type {
  PublisherAgentContext,
  PublisherBuildSummary,
  PublisherMarkdownSource,
  PublisherProjectStatus,
  PublisherReferenceState,
  PublisherSiteSettings,
} from '~/types/publisher';
import { PUBLISHER_ROLLBACK_KEEP_LAST_BUILDS } from './constants';

const STORAGE_KEY = 'bolt.publisher.projects';

export interface PersistedPublisherProjectState {
  selectedPageId?: string;
  status?: PublisherProjectStatus;
  agentHistory: PublisherAgentContext[];
  lastPrompt?: string;
  lastBuildAt?: string;
  onboardingCompleted?: boolean;
  siteSettings?: PublisherSiteSettings;
  markdownSources?: PublisherMarkdownSource[];
  referenceState?: PublisherReferenceState;
  buildHistory?: PublisherBuildSummary[];
}

type PersistedPublisherMap = Record<string, PersistedPublisherProjectState>;

function normalizePublisherPipeline(build: PublisherBuildSummary) {
  const pipeline = build.pipeline;

  if (!pipeline) {
    return undefined;
  }

  const publishContractPath = build.publishContractPath ?? pipeline.publishContract.artifactPath;
  const rollback = pipeline.publishContract.rollback ?? {
    strategy: 'rebuild' as const,
    keepLastBuilds: PUBLISHER_ROLLBACK_KEEP_LAST_BUILDS,
  };

  return {
    ...pipeline,
    publishContract: {
      ...pipeline.publishContract,
      deliveryStage: pipeline.publishContract.deliveryStage ?? pipeline.deliveryStage,
      artifactPath: pipeline.publishContract.artifactPath ?? publishContractPath,
      artifact:
        pipeline.publishContract.artifact ??
        (publishContractPath
          ? {
              path: publishContractPath,
              contentType: 'json' as const,
              schemaVersion: '1.0.0' as const,
              generatedAt: pipeline.publishContract.generatedAt ?? build.createdAt,
            }
          : undefined),
      rollback: {
        strategy: 'rebuild',
        keepLastBuilds: rollback.keepLastBuilds ?? PUBLISHER_ROLLBACK_KEEP_LAST_BUILDS,
        sourceOfTruth: rollback.sourceOfTruth ?? ['project', 'theme', 'pages', 'references', 'checks'],
        requiredArtifacts: rollback.requiredArtifacts ?? (publishContractPath ? [publishContractPath] : []),
      },
    },
  };
}

export function normalizePublisherBuildSummary(build: PublisherBuildSummary): PublisherBuildSummary {
  const publishContractPath = build.publishContractPath ?? build.pipeline?.publishContract.artifactPath;

  return {
    ...build,
    publishContractPath,
    artifacts: [...(build.artifacts ?? [])].sort((left, right) => left.path.localeCompare(right.path)),
    pipeline: normalizePublisherPipeline(build),
  };
}

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

  const project = loadAllProjects()[projectId];

  if (!project) {
    return undefined;
  }

  return {
    ...project,
    buildHistory: project.buildHistory?.map(normalizePublisherBuildSummary) ?? [],
  };
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
    buildHistory: (patch.buildHistory ?? previous.buildHistory ?? []).map(normalizePublisherBuildSummary),
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
