import type {
  ActiveContentFamily,
  IntakeAiSuggestion,
  IntakeCheck,
  IntakeImportKind,
  IntakePageDraft,
  IntakeScenario,
  IntakeScenarioResult,
  IntakeScanCounts,
  IntakeScanResult,
  IntakeSession,
  IntakeSourceFamily,
  IntakeSourceManifest,
  IntakeSourceSnapshot,
  IntakeWarning,
} from '~/types/publisher';
import {
  inferSourceFamily,
  isAssetPath,
  isBlockLibraryPath,
  isDocumentSourcePath,
  isHomeCandidatePath,
  isHtmlSourcePath,
  isShellFragmentPath,
  isTemplateCandidatePath,
  shouldIgnoreSourcePath,
} from './intake-path';
import { extractDocumentPageDraft } from './intake-document';
import { extractHtmlPageDraftFromSource } from './intake-html';
import { buildHeadingChecks, buildUnsafeImportChecks } from './intake-checks';

export { extractDocumentPageDraft, parseDocumentSource } from './intake-document';
export {
  extractHtmlPageDraftFromDocument,
  extractHtmlPageDraftFromHtml,
  extractHtmlPageDraftFromSource,
} from './intake-html';

export interface IntakeScanOptions {
  rootPath?: string;
  htmlDocumentFactory?: (source: IntakeSourceSnapshot) => Document | undefined;
  importKind?: IntakeImportKind;
}

function createWarning(
  code: string,
  message: string,
  severity: IntakeWarning['severity'] = 'warn',
  path?: string,
  details: string[] = [],
): IntakeWarning {
  return {
    code,
    message,
    severity,
    path,
    details,
  };
}

function createCheck(
  id: string,
  message: string,
  severity: IntakeCheck['severity'],
  pageId?: string,
  sourcePath?: string,
  details: string[] = [],
): IntakeCheck {
  return {
    id,
    name: id,
    status: severity === 'fail' ? 'fail' : severity === 'warn' ? 'warn' : 'pass',
    severity,
    message,
    pageId,
    sourcePath,
    details,
  };
}

function cloneSource(source: IntakeSourceSnapshot, familyHint?: IntakeSourceFamily): IntakeSourceSnapshot {
  return {
    ...source,
    sourceFamilyHint: familyHint ?? source.sourceFamilyHint,
  };
}

function uniqueSorted(values: string[]) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function sourceFamilySignal(source: IntakeSourceSnapshot) {
  const family = inferSourceFamily(source.path, source.mimeType, source.isBinary);

  if (source.kind === 'directory') {
    return 'unknown' as const;
  }

  return family;
}

function getTopLevelSegment(path: string) {
  const segments = path.split('/').filter(Boolean);
  return segments[0] ?? '';
}

function collectAssetRoots(sources: IntakeSourceSnapshot[]) {
  const roots = new Set<string>();

  for (const source of sources) {
    if (source.sourceFamilyHint !== 'asset') {
      continue;
    }

    const root = getTopLevelSegment(source.path);

    if (root) {
      roots.add(root);
    }
  }

  return [...roots];
}

function collectNoiseRoots(sources: IntakeSourceSnapshot[]) {
  const roots = new Set<string>();

  for (const source of sources) {
    if (!shouldIgnoreSourcePath(source.path)) {
      continue;
    }

    const root = getTopLevelSegment(source.path);

    if (root) {
      roots.add(root);
    }
  }

  return [...roots];
}

function collectShellCandidates(sources: IntakeSourceSnapshot[]) {
  return sources
    .filter((source) => source.sourceFamilyHint === 'html' && isShellFragmentPath(source.path))
    .map((source) => source.path);
}

function collectBlockLibraryCandidates(sources: IntakeSourceSnapshot[]) {
  return sources
    .filter((source) => source.sourceFamilyHint === 'html' && isBlockLibraryPath(source.path))
    .map((source) => source.path);
}

function isHtmlPageCandidate(source: IntakeSourceSnapshot) {
  if (source.sourceFamilyHint !== 'html') {
    return false;
  }

  if (isShellFragmentPath(source.path) || isBlockLibraryPath(source.path) || isAssetPath(source.path)) {
    return false;
  }

  return true;
}

function isDocumentPageCandidate(source: IntakeSourceSnapshot) {
  if (source.sourceFamilyHint !== 'document') {
    return false;
  }

  if (isAssetPath(source.path)) {
    return false;
  }

  return true;
}

function collectTemplateCandidatePaths(sources: IntakeSourceSnapshot[]) {
  return sources
    .filter((source) => source.sourceFamilyHint === 'html' && isTemplateCandidatePath(source.path))
    .map((source) => source.path)
    .sort((left, right) => left.localeCompare(right));
}

function collectHomeCandidatePaths(
  scan: IntakeScanResult,
  activeContentFamily: ActiveContentFamily,
  templateCandidatePaths: string[],
) {
  const drafts = activeContentFamily === 'html' ? scan.htmlPageDrafts : scan.documentPageDrafts;

  return drafts
    .filter((draft) => {
      if (draft.role === 'backup') {
        return false;
      }

      if (activeContentFamily === 'html' && templateCandidatePaths.includes(draft.sourcePath)) {
        return false;
      }

      return isHomeCandidatePath(draft.sourcePath) || draft.role === 'home';
    })
    .map((draft) => draft.sourcePath)
    .sort((left, right) => left.localeCompare(right));
}

function buildPageCandidates(
  sources: IntakeSourceSnapshot[],
  options: IntakeScanOptions,
  family: ActiveContentFamily,
): IntakePageDraft[] {
  const candidates = family === 'html' ? sources.filter(isHtmlPageCandidate) : sources.filter(isDocumentPageCandidate);

  return candidates.map((source) => {
    if (family === 'html') {
      return extractHtmlPageDraftFromSource(source, options.htmlDocumentFactory);
    }

    return extractDocumentPageDraft(source);
  });
}

export function buildIntakeSourceManifest(sources: IntakeSourceSnapshot[], rootPath?: string): IntakeSourceManifest {
  const ignoredPaths = sources.filter((source) => shouldIgnoreSourcePath(source.path)).map((source) => source.path);

  return {
    rootPath,
    generatedAt: new Date().toISOString(),
    sources: sources.map((source) => cloneSource(source, sourceFamilySignal(source))),
    ignoredPaths: uniqueSorted(ignoredPaths),
  };
}

function countSignals(sources: IntakeSourceSnapshot[]) {
  const counts: IntakeScanCounts = { html: 0, document: 0, assets: 0, ignored: 0, pages: 0, references: 0 };

  for (const source of sources) {
    const family = source.sourceFamilyHint ?? sourceFamilySignal(source);

    if (family === 'html') {
      counts.html += 1;
    } else if (family === 'document') {
      counts.document += 1;
    } else if (family === 'asset') {
      counts.assets += 1;
    }

    if (shouldIgnoreSourcePath(source.path)) {
      counts.ignored += 1;
    }
  }

  return counts;
}

function detectActiveFamily(scan: IntakeScanResult, importKind?: IntakeImportKind): ActiveContentFamily {
  if (importKind) {
    return importKind;
  }

  const htmlPageScore = scan.htmlPageSources.filter((source) => isHtmlPageCandidate(source)).length;
  const documentPageScore = scan.documentSources.filter((source) => isDocumentPageCandidate(source)).length;

  if (htmlPageScore === 0 && documentPageScore === 0) {
    return scan.htmlPageSources.length >= scan.documentSources.length ? 'html' : 'document';
  }

  if (htmlPageScore > documentPageScore) {
    return 'html';
  }

  if (documentPageScore > htmlPageScore) {
    return 'document';
  }

  if (scan.shellCandidates.length > 0 || scan.blockLibraryCandidates.length > 0) {
    return 'html';
  }

  return htmlPageScore >= documentPageScore ? 'html' : 'document';
}

export function detectIntakeScenario(scan: IntakeScanResult, importKind?: IntakeImportKind): IntakeScenarioResult {
  const htmlPageCount = scan.htmlPageSources.filter(isHtmlPageCandidate).length;
  const documentPageCount = scan.documentSources.filter(isDocumentPageCandidate).length;
  const templateCandidatePaths = collectTemplateCandidatePaths(scan.supportedSources);
  const hasTemplateCandidate = templateCandidatePaths.length > 0;
  const hasHtmlPageDir = scan.htmlPageSources.some((source) => source.path.split('/').includes('pages'));
  const hasDocumentCompanions = scan.documentSources.some((source) => {
    const segments = source.path.toLowerCase().split('/').filter(Boolean);
    return segments.includes('content-source') || segments.includes('content') || segments.includes('docs');
  });

  const activeContentFamily: ActiveContentFamily = detectActiveFamily(scan, importKind);
  const warnings: IntakeWarning[] = [];
  let scenario: IntakeScenario = 'mixed-source-conflict';
  let referenceSourceFamily: ActiveContentFamily | undefined;
  let needsUserChoice = false;

  if (!importKind && htmlPageCount > 0 && documentPageCount > 0) {
    scenario = 'needsDisambiguation';
    needsUserChoice = true;
    referenceSourceFamily = activeContentFamily === 'html' ? 'document' : 'html';
    warnings.push(
      createWarning(
        'mixed-source-needs-choice',
        'Both HTML and document families were detected. Choose the active family before continuing.',
        'fail',
      ),
    );
  } else if (activeContentFamily === 'html') {
    referenceSourceFamily = documentPageCount > 0 ? 'document' : undefined;
    scenario =
      hasTemplateCandidate && documentPageCount > 0
        ? 'template-plus-documents'
        : hasHtmlPageDir || htmlPageCount >= 1
          ? 'html-import'
          : 'mixed-source-conflict';
  } else {
    referenceSourceFamily = htmlPageCount > 0 ? 'html' : undefined;
    scenario =
      hasTemplateCandidate && documentPageCount > 0
        ? 'template-plus-documents'
        : documentPageCount >= 1
          ? 'document-import'
          : 'mixed-source-conflict';
  }

  if (htmlPageCount > 0 && documentPageCount > 0 && !needsUserChoice) {
    warnings.push(
      createWarning(
        'mixed-source',
        importKind
          ? `Both HTML and document source families were detected. ${importKind} remains the active family and the other family is kept as reference.`
          : 'Both HTML and document source families were detected. The active family was chosen automatically and the other family is kept as reference.',
        'warn',
      ),
    );
  }

  const templateCandidatePath = templateCandidatePaths.length === 1 ? templateCandidatePaths[0] : undefined;
  const htmlHasCompanionPages = scan.htmlPageDrafts.some(
    (draft) => draft.sourcePath !== templateCandidatePath && draft.role !== 'backup',
  );
  const homeCandidatePaths = collectHomeCandidatePaths(scan, activeContentFamily, templateCandidatePaths);
  const homePageCandidatePath =
    activeContentFamily === 'html'
      ? (scan.htmlPageDrafts.find((draft) => draft.role === 'home' && draft.sourcePath !== templateCandidatePath)
          ?.sourcePath ??
        scan.htmlPageDrafts.find((draft) => draft.role !== 'backup' && draft.sourcePath !== templateCandidatePath)
          ?.sourcePath ??
        (!htmlHasCompanionPages ? templateCandidatePath : undefined))
      : (scan.documentPageDrafts.find((draft) => draft.role === 'home')?.sourcePath ??
        scan.documentPageDrafts.find((draft) => draft.role !== 'backup')?.sourcePath);

  if (templateCandidatePaths.length > 1) {
    scenario = 'needsDisambiguation';
    needsUserChoice = true;
    warnings.push(
      createWarning(
        'template-candidate-conflict',
        'Multiple template index.html candidates were detected. Choose the template file before continuing.',
        'fail',
      ),
    );
  }

  if (homeCandidatePaths.length > 1) {
    scenario = 'needsDisambiguation';
    needsUserChoice = true;
    warnings.push(
      createWarning(
        'home-candidate-conflict',
        'Multiple home page candidates were detected. Choose the home page before continuing.',
        'fail',
      ),
    );
  }

  const confidence = Math.max(
    0.35,
    Math.min(
      1,
      (Math.max(htmlPageCount, documentPageCount) + (hasTemplateCandidate ? 1 : 0) + (hasDocumentCompanions ? 1 : 0)) /
        4,
    ),
  );

  return {
    scenario,
    activeContentFamily,
    referenceSourceFamily,
    templateCandidatePath: needsUserChoice ? undefined : templateCandidatePath,
    templateCandidatePaths,
    homePageCandidatePath: needsUserChoice ? undefined : homePageCandidatePath,
    homeCandidatePaths,
    documentCandidatePaths: scan.documentPageDrafts.map((draft) => draft.sourcePath),
    needsUserChoice,
    confidence,
    warnings,
  };
}

export function scanIntakeSourceTree(
  sources: IntakeSourceSnapshot[],
  options: IntakeScanOptions = {},
): IntakeScanResult {
  const normalizedSources = sources.map((source) => cloneSource(source, sourceFamilySignal(source)));
  const ignoredPaths = normalizedSources
    .filter((source) => shouldIgnoreSourcePath(source.path))
    .map((source) => source.path);
  const supportedSources = normalizedSources.filter(
    (source) => source.kind === 'file' && !shouldIgnoreSourcePath(source.path),
  );
  const unsupportedSources = normalizedSources.filter((source) => {
    const family = source.sourceFamilyHint ?? sourceFamilySignal(source);
    return (
      source.kind === 'directory' ||
      (family === 'unknown' && !isAssetPath(source.path) && !shouldIgnoreSourcePath(source.path))
    );
  });
  const htmlPageSources = supportedSources.filter(
    (source) => source.sourceFamilyHint === 'html' && isHtmlSourcePath(source.path),
  );
  const documentSources = supportedSources.filter(
    (source) => source.sourceFamilyHint === 'document' && isDocumentSourcePath(source.path),
  );
  const shellCandidates = collectShellCandidates(supportedSources);
  const blockLibraryCandidates = collectBlockLibraryCandidates(supportedSources);
  const assetRoots = collectAssetRoots(supportedSources);
  const noiseRoots = collectNoiseRoots(normalizedSources);
  const htmlPageDrafts = buildPageCandidates(htmlPageSources, options, 'html');
  const documentPageDrafts = buildPageCandidates(documentSources, options, 'document');
  const rawScan: IntakeScanResult = {
    rootPath: options.rootPath,
    scenario: 'mixed-source-conflict',
    activeContentFamily: 'html',
    sources: normalizedSources,
    supportedSources,
    unsupportedSources,
    ignoredPaths,
    unsupportedPaths: unsupportedSources.map((source) => source.path),
    noiseRoots,
    assetRoots,
    htmlPageSources,
    documentSources,
    shellCandidates,
    blockLibraryCandidates,
    pageSourcePaths: [],
    documentSourcePaths: [],
    assetSourcePaths: [],
    shellCandidatePaths: [],
    blockLibraryPaths: [],
    htmlPageDrafts,
    documentPageDrafts,
    pageCandidates: [],
    referenceCandidates: [],
    warnings: [],
    counts: countSignals(normalizedSources),
  };

  const scenario = detectIntakeScenario(rawScan, options.importKind);
  const referenceCandidates = scenario.needsUserChoice
    ? []
    : scenario.activeContentFamily === 'html'
      ? documentPageDrafts.filter((draft) => draft.role !== 'backup')
      : htmlPageDrafts.filter(
          (draft) => draft.sourcePath !== scenario.templateCandidatePath && draft.role !== 'backup',
        );
  const htmlHasCompanionPages = htmlPageDrafts.some(
    (draft) => draft.sourcePath !== scenario.templateCandidatePath && draft.role !== 'backup',
  );
  const activePageCandidates = scenario.needsUserChoice
    ? []
    : scenario.activeContentFamily === 'html'
      ? htmlPageDrafts.filter(
          (draft) =>
            draft.role !== 'backup' &&
            (htmlHasCompanionPages ? draft.sourcePath !== scenario.templateCandidatePath : true),
        )
      : documentPageDrafts.filter((draft) => draft.role !== 'backup');

  return {
    ...rawScan,
    scenario: scenario.scenario,
    activeContentFamily: scenario.activeContentFamily,
    referenceSourceFamily: scenario.referenceSourceFamily,
    templateCandidatePath: scenario.templateCandidatePath,
    homePageCandidatePath: scenario.homePageCandidatePath,
    scenarioResult: scenario,
    pageSourcePaths: activePageCandidates.map((page) => page.sourcePath),
    documentSourcePaths: documentPageDrafts.map((page) => page.sourcePath),
    assetSourcePaths: supportedSources
      .filter((source) => source.sourceFamilyHint === 'asset')
      .map((source) => source.path),
    shellCandidatePaths: shellCandidates,
    blockLibraryPaths: blockLibraryCandidates,
    pageCandidates: activePageCandidates,
    referenceCandidates,
    counts: {
      ...rawScan.counts,
      pages: activePageCandidates.length,
      references: referenceCandidates.length,
    },
    warnings: [...scenario.warnings],
  };
}

export function buildIntakePageChecks(page: IntakePageDraft): IntakeCheck[] {
  const checks: IntakeCheck[] = [];

  if (!page.title.trim()) {
    checks.push(
      createCheck('missing-page-title', `Page ${page.id} is missing a title.`, 'fail', page.id, page.sourcePath, [
        'Repair the page title in intake review before applying the import.',
      ]),
    );
  }

  if (!page.description?.trim()) {
    checks.push(
      createCheck(
        'missing-page-description',
        `Page ${page.id} is missing a description.`,
        'warn',
        page.id,
        page.sourcePath,
        ['Add a source-grounded summary in intake review.'],
      ),
    );
  }

  if (!page.h1?.trim()) {
    checks.push(
      createCheck('missing-page-h1', `Page ${page.id} is missing an H1.`, 'fail', page.id, page.sourcePath, [
        'Repair the main heading in intake review before continuing.',
      ]),
    );
  }

  if (page.sections.length === 0) {
    checks.push(
      createCheck(
        'missing-page-sections',
        `Page ${page.id} does not contain any extracted sections.`,
        'fail',
        page.id,
        page.sourcePath,
        ['Open the source preview and add or regenerate sections for this page.'],
      ),
    );
  }

  if (page.confidence < 0.6) {
    checks.push(
      createCheck(
        'low-confidence-extraction',
        `Extraction confidence for ${page.id} is low.`,
        'warn',
        page.id,
        page.sourcePath,
        [`Confidence: ${page.confidence.toFixed(2)}`, 'Compare extracted sections with the source preview.'],
      ),
    );
  }

  if (page.warnings.length > 0) {
    checks.push(
      createCheck(
        'page-warnings',
        `Page ${page.id} has parser warnings.`,
        page.warnings.some((warning) => warning.severity === 'fail') ? 'fail' : 'warn',
        page.id,
        page.sourcePath,
        page.warnings.map((warning) => `${warning.code}: ${warning.message}`),
      ),
    );
  }

  checks.push(...buildUnsafeImportChecks(page));
  checks.push(...buildHeadingChecks(page));

  return checks;
}

export function buildIntakeSessionChecks(session: IntakeSession): IntakeCheck[] {
  const checks: IntakeCheck[] = [];

  if (session.scenario === 'needsDisambiguation' || session.disambiguation?.status === 'pending') {
    checks.push(
      createCheck(
        'intake-needs-disambiguation',
        'This intake session requires an explicit family/template/home selection before review.',
        'fail',
        undefined,
        undefined,
        [
          'Select the active family and resolve template/home candidates, then continue to intake review.',
          ...(session.scenarioResult?.templateCandidatePaths ?? []),
          ...(session.scenarioResult?.homeCandidatePaths ?? []),
        ],
      ),
    );
  }

  if (session.scenario === 'mixed-source-conflict') {
    checks.push(
      createCheck(
        'mixed-source-conflict',
        'This intake session contains both HTML and document sources.',
        'warn',
        undefined,
        undefined,
        ['Review the active content family and companion reference sources before applying the import.'],
      ),
    );
  }

  for (const page of session.pages) {
    checks.push(...buildIntakePageChecks(page));

    const matchingSource = session.sources.find(
      (source) => source.path === page.sourcePath || source.storedPath === page.storedSourcePath,
    );
    const rawSource = matchingSource?.text ?? matchingSource?.html;

    if (rawSource?.trim()) {
      checks.push(...buildHeadingChecks(page, rawSource));
    }
  }

  return checks;
}

export function deriveIntakeWorkItems(session: Pick<IntakeSession, 'checks'>): {
  completionBlockers: IntakeCheck[];
  reviewTasks: IntakeCheck[];
} {
  const completionBlockers = session.checks.filter((check) => check.severity === 'fail');
  const reviewTasks = session.checks.filter((check) => check.severity !== 'fail');

  return {
    completionBlockers,
    reviewTasks,
  };
}

export function buildIntakeAiSuggestionFromText(text: string): IntakeAiSuggestion {
  return {
    title: null,
    description: null,
    h1: null,
    sections: text
      .split('\n')
      .filter(Boolean)
      .slice(0, 3)
      .map((line) => ({
        heading: null,
        content: line,
      })),
    unresolved: [],
    notes: ['AI suggestion placeholder.'],
  };
}

export function createIntakeSession(options: {
  id: string;
  sourceRoot: string;
  importKind: IntakeImportKind;
  scenario: IntakeScenario;
  activeContentFamily: ActiveContentFamily;
  projectName: string;
  sourceManifest: IntakeSourceManifest;
  pages: IntakePageDraft[];
  shellCandidates?: string[];
  templateCandidatePath?: string;
  homePageCandidatePath?: string;
  warnings?: IntakeWarning[];
  referenceSourceFamily?: ActiveContentFamily;
  sourceLabel?: string;
  scenarioResult?: IntakeScenarioResult;
  disambiguation?: IntakeSession['disambiguation'];
}): IntakeSession {
  const now = new Date().toISOString();
  const sourceLabel = options.sourceLabel ?? options.projectName;
  const sources = options.sourceManifest.sources;
  const sourceLookup = new Map(sources.map((source) => [source.path, source]));
  const shellCandidatePaths = options.shellCandidates ?? [];
  const blockLibraryPaths: string[] = [];

  return {
    id: options.id,
    sourceLabel,
    sourceRoot: options.sourceRoot,
    importKind: options.importKind,
    status: 'scanned',
    scenario: options.scenario,
    activeContentFamily: options.activeContentFamily,
    referenceSourceFamily: options.referenceSourceFamily,
    project: {
      name: options.projectName,
      defaultLanguage: 'en',
      multilingual: false,
      languages: ['en'],
      warnings: [],
    },
    pages: options.pages.map((page) => ({
      ...page,
      storedSourcePath: page.storedSourcePath ?? sourceLookup.get(page.sourcePath)?.storedPath,
      companionSourcePath: page.companionSourcePath,
    })),
    sources,
    shellCandidatePaths,
    blockLibraryPaths,
    shellCandidates: shellCandidatePaths,
    templateCandidatePath: options.templateCandidatePath,
    homePageCandidatePath: options.homePageCandidatePath,
    sourceManifest: options.sourceManifest,
    warnings: options.warnings ?? [],
    checks: [],
    completionBlockers: [],
    reviewTasks: [],
    reviewState: {
      unresolvedSourceChoices: {},
      selectedFixes: {},
      completionMarkers: {
        reviewReady: false,
        intakeApplied: false,
        updatedAt: now,
      },
      selectedBrokenPageIds: [],
    },
    scriptRuns: [],
    currentPageId: options.pages[0]?.id,
    pageSourcePaths: options.pages.map((page) => page.sourcePath),
    documentSourcePaths: sources
      .filter((source) => source.sourceFamilyHint === 'document')
      .map((source) => source.path),
    assetSourcePaths: sources.filter((source) => source.sourceFamilyHint === 'asset').map((source) => source.path),
    ignoredPaths: options.sourceManifest.ignoredPaths,
    unsupportedPaths: sources.filter((source) => source.sourceFamilyHint === 'unknown').map((source) => source.path),
    noiseRoots: [],
    assetRoots: [],
    supportedSources: sources,
    unsupportedSources: [],
    scenarioResult: options.scenarioResult,
    disambiguation: options.disambiguation,
    createdAt: now,
    updatedAt: now,
  };
}

export function summarizeIntakeSession(session: IntakeSession) {
  return {
    id: session.id,
    scenario: session.scenario,
    activeContentFamily: session.activeContentFamily,
    pages: session.pages.length,
    warnings: session.warnings.length,
    checks: session.checks.length,
  };
}
