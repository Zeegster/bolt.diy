import type {
  IntakeImportKind,
  IntakeProjectDraft,
  IntakeScenario,
  IntakeScanResult,
  IntakeSession,
  IntakeSourceSnapshot,
  IntakeWarning,
} from '~/types/publisher';
import {
  buildIntakeSessionChecks,
  buildIntakeSourceManifest,
  createIntakeSession,
  deriveIntakeWorkItems,
  detectIntakeScenario,
  scanIntakeSourceTree,
} from './intake';
import { getPublisherImportedSourcePath } from './constants';
import { serializeIntakeSessionFiles } from './intake-pipeline';

export interface ImportedBundleAdapterInput {
  sessionId: string;
  sourceLabel: string;
  sourceRoot?: string;
  importKind: IntakeImportKind;
  sources: IntakeSourceSnapshot[];
  project: Pick<IntakeProjectDraft, 'name' | 'domain' | 'defaultLanguage' | 'multilingual' | 'languages'> &
    Partial<IntakeProjectDraft>;
  templateCandidatePath?: string;
  homePageCandidatePath?: string;
  warnings?: IntakeWarning[];
  htmlDocumentFactory?: (source: IntakeSourceSnapshot) => Document | undefined;
  now?: string;
}

export interface ImportedBundleAdapterResult {
  scan: IntakeScanResult;
  session: IntakeSession;
  reservedFiles: Record<string, string>;
}

function resolveStoredPath(source: IntakeSourceSnapshot) {
  return source.storedPath ?? getPublisherImportedSourcePath(source.path);
}

function applyStoredSourcePaths(sources: IntakeSourceSnapshot[]) {
  return sources.map((source) => ({
    ...source,
    storedPath: resolveStoredPath(source),
  }));
}

function getResolvedCandidate(
  selectedPath: string | undefined,
  scenarioPath: string | undefined,
  candidates: string[],
  label: 'template' | 'home page',
) {
  const resolved = selectedPath ?? scenarioPath ?? candidates[0];

  if (resolved && candidates.length > 0 && !candidates.includes(resolved)) {
    throw new Error(`Selected ${label} candidate is not part of the detected candidates.`);
  }

  return resolved;
}

function shouldKeepPendingDisambiguation(
  scenario: IntakeScanResult['scenarioResult'],
  templateCandidates: string[],
  homeCandidates: string[],
  selectedTemplateCandidatePath: string | undefined,
  selectedHomeCandidatePath: string | undefined,
) {
  return Boolean(
    scenario?.needsUserChoice &&
      ((templateCandidates.length > 0 && !selectedTemplateCandidatePath) ||
        (homeCandidates.length > 0 && !selectedHomeCandidatePath)),
  );
}

function buildResolvedSelection(
  scan: IntakeScanResult,
  importKind: IntakeImportKind,
  selectedTemplateCandidatePath: string | undefined,
) {
  const htmlHasCompanionPages = scan.htmlPageDrafts.some(
    (draft) => draft.sourcePath !== selectedTemplateCandidatePath && draft.role !== 'backup',
  );

  const pages =
    importKind === 'html'
      ? scan.htmlPageDrafts.filter(
          (draft) =>
            draft.role !== 'backup' &&
            (htmlHasCompanionPages ? draft.sourcePath !== selectedTemplateCandidatePath : true),
        )
      : scan.documentPageDrafts.filter((draft) => draft.role !== 'backup');

  const references =
    importKind === 'html'
      ? scan.documentPageDrafts.filter((draft) => draft.role !== 'backup')
      : scan.htmlPageDrafts.filter(
          (draft) => draft.role !== 'backup' && draft.sourcePath !== selectedTemplateCandidatePath,
        );

  return { pages, references };
}

export function buildImportedBundleAdapter(input: ImportedBundleAdapterInput): ImportedBundleAdapterResult {
  const scan = scanIntakeSourceTree(input.sources, {
    rootPath: input.sourceRoot ?? input.sourceLabel,
    importKind: input.importKind,
    htmlDocumentFactory: input.htmlDocumentFactory,
  });
  const scenario = scan.scenarioResult ?? detectIntakeScenario(scan, input.importKind);
  const templateCandidates = scenario.templateCandidatePaths ?? [];
  const homeCandidates = scenario.homeCandidatePaths ?? [];
  const selectedTemplateCandidatePath = getResolvedCandidate(
    input.templateCandidatePath,
    scenario.templateCandidatePath,
    templateCandidates,
    'template',
  );
  const selectedHomeCandidatePath = getResolvedCandidate(
    input.homePageCandidatePath,
    scenario.homePageCandidatePath,
    homeCandidates,
    'home page',
  );
  const keepPending = shouldKeepPendingDisambiguation(
    scenario,
    templateCandidates,
    homeCandidates,
    selectedTemplateCandidatePath,
    selectedHomeCandidatePath,
  );
  const resolvedSelection = buildResolvedSelection(scan, input.importKind, selectedTemplateCandidatePath);
  const session = createIntakeSession({
    id: input.sessionId,
    sourceRoot: input.sourceRoot ?? input.sourceLabel,
    importKind: input.importKind,
    scenario: (keepPending
      ? scenario.scenario
      : input.importKind === 'html'
        ? scan.documentPageDrafts.length > 0
          ? 'template-plus-documents'
          : 'html-import'
        : 'document-import') as IntakeScenario,
    activeContentFamily: input.importKind,
    referenceSourceFamily:
      input.importKind === 'html' ? 'document' : scan.htmlPageDrafts.length > 0 ? 'html' : undefined,
    projectName: input.project.name,
    sourceLabel: input.sourceLabel,
    sourceManifest: buildIntakeSourceManifest(input.sources, input.sourceRoot ?? input.sourceLabel),
    pages: keepPending ? scan.pageCandidates : resolvedSelection.pages,
    shellCandidates: scan.shellCandidates,
    templateCandidatePath: selectedTemplateCandidatePath,
    homePageCandidatePath: selectedHomeCandidatePath,
    warnings: [...scan.warnings, ...scenario.warnings, ...(input.warnings ?? [])],
    scenarioResult: {
      ...scenario,
      scenario: (keepPending
        ? scenario.scenario
        : input.importKind === 'html'
          ? scan.documentPageDrafts.length > 0
            ? 'template-plus-documents'
            : 'html-import'
          : 'document-import') as IntakeScenario,
      needsUserChoice: keepPending,
      templateCandidatePath: selectedTemplateCandidatePath,
      homePageCandidatePath: selectedHomeCandidatePath,
      activeContentFamily: input.importKind,
    },
    disambiguation: keepPending
      ? {
          status: 'pending',
          reason: 'Ambiguous intake scan detected.',
          candidateImportKinds: [input.importKind],
          templateCandidatePaths: templateCandidates,
          homeCandidatePaths: homeCandidates,
          selectedImportKind: input.importKind,
          selectedTemplateCandidatePath,
          selectedHomePageCandidatePath: selectedHomeCandidatePath,
        }
      : {
          status: 'resolved',
          reason: 'Intake scan was deterministic.',
          candidateImportKinds: [input.importKind],
          templateCandidatePaths: templateCandidates,
          homeCandidatePaths: homeCandidates,
          selectedImportKind: input.importKind,
          selectedTemplateCandidatePath,
          selectedHomePageCandidatePath: selectedHomeCandidatePath,
        },
  });

  session.project = {
    ...session.project,
    ...input.project,
    sourceRoot: input.sourceLabel,
  };

  session.sources = applyStoredSourcePaths(session.sources);

  if (session.sourceManifest) {
    session.sourceManifest = {
      ...session.sourceManifest,
      sources: applyStoredSourcePaths(session.sourceManifest.sources),
    };
  }

  session.pages = session.pages.map((page) => ({
    ...page,
    storedSourcePath:
      page.storedSourcePath ??
      resolveStoredPath(
        input.sources.find((source) => source.path === page.sourcePath) ??
          ({ path: page.sourcePath } as IntakeSourceSnapshot),
      ),
  }));
  session.status = keepPending ? 'pending-disambiguation' : 'reviewing';
  session.checks = buildIntakeSessionChecks(session);

  const workItems = deriveIntakeWorkItems(session);
  session.completionBlockers = workItems.completionBlockers;
  session.reviewTasks = workItems.reviewTasks;

  session.supportedSources = scan.supportedSources;
  session.unsupportedSources = scan.unsupportedSources;
  session.ignoredPaths = scan.ignoredPaths;
  session.unsupportedPaths = scan.unsupportedPaths;
  session.noiseRoots = scan.noiseRoots;
  session.assetRoots = scan.assetRoots;
  session.blockLibraryPaths = scan.blockLibraryCandidates;
  session.blockLibraryCandidates = scan.blockLibraryCandidates;
  session.shellCandidatePaths = scan.shellCandidates;
  session.shellCandidates = scan.shellCandidates;
  session.pageSourcePaths = session.pages.map((page) => page.sourcePath);
  session.documentSourcePaths = (keepPending ? scan.referenceCandidates : resolvedSelection.references)
    .filter((page) => page.sourceFamily === 'document')
    .map((page) => page.sourcePath);
  session.assetSourcePaths = scan.supportedSources
    .filter((source) => source.sourceFamilyHint === 'asset')
    .map((source) => source.path);

  if (input.now) {
    session.createdAt = input.now;
    session.updatedAt = input.now;
  }

  return {
    scan,
    session,
    reservedFiles: serializeIntakeSessionFiles(session),
  };
}
