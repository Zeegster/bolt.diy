import { z } from 'zod';
import type { IntakePageDraft, IntakeScriptRun, IntakeSession, IntakeSourceSnapshot } from '~/types/publisher';
import type { FileMap } from '~/lib/stores/files';
import {
  PUBLISHER_INTAKE_PAGES_DIR,
  PUBLISHER_INTAKE_SCRIPT_RUNS_FILE,
  PUBLISHER_INTAKE_SESSION_FILE,
  PUBLISHER_INTAKE_SOURCE_MANIFEST_FILE,
} from './constants';

const sourceKindSchema = z.enum(['file', 'directory', 'document', 'html', 'asset', 'layout', 'reference']);
const sourceFamilySchema = z.enum(['document', 'html', 'asset', 'unknown']);
const pageRoleSchema = z.enum(['home', 'article', 'legal', 'component-library', 'reference', 'generic', 'backup']);
const warningSeveritySchema = z.enum(['info', 'warn', 'fail']);
const checkSeveritySchema = z.enum(['info', 'warn', 'fail']);
const scriptRunnerKindSchema = z.enum(['local-parser', 'ai-extraction', 'tool-call']);
const aiProviderSchema = z.enum(['openai', 'anthropic']);
const activeFamilySchema = z.enum(['document', 'html']);
const intakeScenarioSchema = z.enum([
  'document-import',
  'html-import',
  'template-plus-documents',
  'mixed-source-conflict',
  'needsDisambiguation',
]);
const intakeStatusSchema = z.enum(['scanned', 'pending-disambiguation', 'reviewing', 'ready', 'applied']);
const sectionKindSchema = z.enum([
  'richtext',
  'faq',
  'legal',
  'hero',
  'html',
  'paragraph',
  'list',
  'table',
  'image',
  'code',
  'quote',
]);

const intakeWarningSchema = z
  .object({
    code: z.string().min(1),
    message: z.string().min(1),
    severity: warningSeveritySchema,
    pageId: z.string().optional(),
    sourcePath: z.string().optional(),
    path: z.string().optional(),
    details: z.array(z.string()).optional(),
  })
  .passthrough();

const intakeCheckSchema = z
  .object({
    id: z.string().min(1),
    severity: checkSeveritySchema,
    message: z.string().min(1),
    details: z.array(z.string()).optional(),
    pageId: z.string().optional(),
    sourcePath: z.string().optional(),
    name: z.string().optional(),
    status: z.enum(['pass', 'warn', 'fail']).optional(),
  })
  .passthrough();

const intakeSectionSchema = z
  .object({
    id: z.string().min(1),
    kind: sectionKindSchema,
    content: z.string(),
    heading: z.string().optional(),
    level: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6)]).optional(),
  })
  .passthrough();

const intakeSeoSchema = z
  .object({
    title: z.string().min(1),
    description: z.string().optional(),
    schemaType: z.enum(['WebSite', 'WebPage', 'Article', 'Organization']).optional(),
    canonicalPath: z.string().optional(),
    robots: z.string().optional(),
  })
  .passthrough();

const intakeAssetDraftSchema = z
  .object({
    kind: z.enum(['favicon', 'logo', 'metaImage']),
    sourcePath: z.string().optional(),
    storedPath: z.string().optional(),
    previewPath: z.string().optional(),
    mimeType: z.string().optional(),
    label: z.string().optional(),
    path: z.string().optional(),
    publicPath: z.string().optional(),
    previewUrl: z.string().optional(),
    contentHash: z.string().optional(),
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
  })
  .passthrough();

const intakeProjectDraftSchema = z
  .object({
    name: z.string().min(1),
    domain: z.string().optional(),
    defaultLanguage: z.string().min(1).default('en'),
    multilingual: z.boolean().default(false),
    languages: z.array(z.string()).default(['en']),
    favicon: intakeAssetDraftSchema.optional(),
    metaImage: intakeAssetDraftSchema.optional(),
    logo: intakeAssetDraftSchema.optional(),
    sourceRoot: z.string().optional(),
    warnings: z.array(intakeWarningSchema).optional(),
  })
  .passthrough();

const intakeSourceSnapshotSchema: z.ZodType<IntakeSourceSnapshot> = z
  .object({
    id: z.string().min(1),
    path: z.string().min(1),
    storedPath: z.string().optional(),
    kind: sourceKindSchema,
    mimeType: z.string().optional(),
    size: z.number().nonnegative(),
    hash: z.string().optional(),
    label: z.string().optional(),
    sourceUrl: z.string().optional(),
    sourceFamilyHint: sourceFamilySchema.optional(),
    familyHint: sourceFamilySchema.optional(),
    isBinary: z.boolean(),
    role: z
      .enum(['template', 'page', 'page-reference', 'asset', 'layout-fragment', 'reference-library', 'noise'])
      .optional(),
    warnings: z.array(z.string()).optional(),
    text: z.string().optional(),
    html: z.string().optional(),
  })
  .passthrough();

const intakePageDraftSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    sourcePath: z.string().min(1),
    sourceFamily: activeFamilySchema,
    role: pageRoleSchema,
    slug: z.string().min(1),
    path: z.string().min(1),
    title: z.string(),
    description: z.string().optional(),
    h1: z.string().optional(),
    sections: z.array(intakeSectionSchema),
    seo: intakeSeoSchema.optional(),
    checks: z.array(intakeCheckSchema).default([]),
    warnings: z.array(intakeWarningSchema).default([]),
    confidence: z.number(),
    contentRootHint: z.string().optional(),
    companionSourcePath: z.string().optional(),
    storedSourcePath: z.string().optional(),
    rawSourceStoredPath: z.string().optional(),
    bodyHtml: z.string().optional(),
    assetHints: z
      .object({
        faviconPath: z.string().optional(),
        metaImagePath: z.string().optional(),
        logoPath: z.string().optional(),
      })
      .optional(),
    shellCandidates: z.array(z.string()).optional(),
    rawSourcePreview: z.string().optional(),
  })
  .passthrough();

const intakeScriptRunSchema: z.ZodType<IntakeScriptRun> = z
  .object({
    id: z.string().min(1),
    sessionId: z.string().optional(),
    pageId: z.string().optional(),
    runnerKind: scriptRunnerKindSchema,
    provider: aiProviderSchema.optional(),
    model: z.string().optional(),
    inputSummary: z.string(),
    outputSummary: z.string(),
    success: z.boolean(),
    createdAt: z.string().min(1),
  })
  .passthrough();

const intakeScenarioResultSchema = z
  .object({
    scenario: intakeScenarioSchema,
    activeContentFamily: activeFamilySchema,
    referenceSourceFamily: activeFamilySchema.optional(),
    templateCandidatePath: z.string().optional(),
    templateCandidatePaths: z.array(z.string()).optional(),
    homePageCandidatePath: z.string().optional(),
    homeCandidatePaths: z.array(z.string()).optional(),
    documentCandidatePaths: z.array(z.string()).optional(),
    needsUserChoice: z.boolean().optional(),
    confidence: z.number(),
    warnings: z.array(intakeWarningSchema).default([]),
  })
  .passthrough();

const intakeDisambiguationSchema = z
  .object({
    status: z.enum(['pending', 'resolved']),
    reason: z.string().optional(),
    candidateImportKinds: z.array(activeFamilySchema).default(['html', 'document']),
    templateCandidatePaths: z.array(z.string()).default([]),
    homeCandidatePaths: z.array(z.string()).default([]),
    selectedImportKind: activeFamilySchema.optional(),
    selectedTemplateCandidatePath: z.string().optional(),
    selectedHomePageCandidatePath: z.string().optional(),
  })
  .passthrough();

const intakeSessionCoreSchema = z
  .object({
    id: z.string().min(1),
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1),
    sourceLabel: z.string().min(1),
    sourceRoot: z.string().optional(),
    importKind: activeFamilySchema.optional(),
    status: intakeStatusSchema.optional(),
    scenario: intakeScenarioSchema,
    activeContentFamily: activeFamilySchema,
    referenceSourceFamily: activeFamilySchema.optional(),
    project: intakeProjectDraftSchema,
    shellCandidatePaths: z.array(z.string()).default([]),
    blockLibraryPaths: z.array(z.string()).default([]),
    templateCandidatePath: z.string().optional(),
    homePageCandidatePath: z.string().optional(),
    warnings: z.array(intakeWarningSchema).default([]),
    checks: z.array(intakeCheckSchema).default([]),
    currentPageId: z.string().optional(),
    sourceManifest: z
      .object({
        rootPath: z.string().optional(),
        generatedAt: z.string().min(1),
        sources: z.array(intakeSourceSnapshotSchema),
        ignoredPaths: z.array(z.string()).default([]),
      })
      .optional(),
    shellCandidates: z.array(z.string()).optional(),
    blockLibraryCandidates: z.array(z.string()).optional(),
    scenarioResult: intakeScenarioResultSchema.optional(),
    disambiguation: intakeDisambiguationSchema.optional(),
    pageSourcePaths: z.array(z.string()).optional(),
    documentSourcePaths: z.array(z.string()).optional(),
    assetSourcePaths: z.array(z.string()).optional(),
    ignoredPaths: z.array(z.string()).optional(),
    unsupportedPaths: z.array(z.string()).optional(),
    noiseRoots: z.array(z.string()).optional(),
    assetRoots: z.array(z.string()).optional(),
    supportedSources: z.array(intakeSourceSnapshotSchema).optional(),
    unsupportedSources: z.array(intakeSourceSnapshotSchema).optional(),
  })
  .passthrough();

export const intakeAiBatchPageResultSchema = z.object({
  slug: z.string().trim().min(1),
  title: z.string().nullable(),
  description: z.string().nullable(),
  heading: z.string().nullable(),
  source: z.string().trim().min(1),
  unresolved: z.array(z.string()).optional(),
  notes: z.array(z.string()).optional(),
});

export const intakeAiBatchResultSchema = z.object({
  pages: z.array(intakeAiBatchPageResultSchema),
});

function parseJson<T>(content?: string): T | undefined {
  if (!content) {
    return undefined;
  }

  try {
    return JSON.parse(content) as T;
  } catch {
    return undefined;
  }
}

function normalizeSession(
  core: z.infer<typeof intakeSessionCoreSchema>,
  pages: IntakePageDraft[],
  sources: IntakeSourceSnapshot[],
  scriptRuns: IntakeScriptRun[],
): IntakeSession {
  const importKind = core.importKind ?? core.activeContentFamily;
  const defaultLanguage = core.project.defaultLanguage || 'en';
  const languages = core.project.languages.length > 0 ? core.project.languages : [defaultLanguage];
  const scenarioResult = core.scenarioResult;
  const disambiguation =
    core.disambiguation ??
    (core.scenario === 'needsDisambiguation'
      ? {
          status: 'pending',
          reason: 'Ambiguous intake scan. Select family/template/home before continuing.',
          candidateImportKinds: ['html', 'document'],
          templateCandidatePaths: scenarioResult?.templateCandidatePaths ?? [],
          homeCandidatePaths: scenarioResult?.homeCandidatePaths ?? [],
          selectedImportKind: importKind,
          selectedTemplateCandidatePath: core.templateCandidatePath,
          selectedHomePageCandidatePath: core.homePageCandidatePath,
        }
      : undefined);

  const status =
    disambiguation?.status === 'pending' || core.scenario === 'needsDisambiguation'
      ? 'pending-disambiguation'
      : (core.status ?? 'scanned');

  return {
    ...(core as Omit<IntakeSession, 'pages' | 'sources' | 'scriptRuns' | 'importKind' | 'status'>),
    importKind,
    status,
    project: {
      ...core.project,
      defaultLanguage,
      languages,
      multilingual: core.project.multilingual ?? languages.length > 1,
    },
    pages: pages.sort((left, right) => left.path.localeCompare(right.path)),
    sources,
    scriptRuns,
    disambiguation,
  };
}

export function parseIntakeSessionRecord(record: unknown): IntakeSession | undefined {
  const parsed = intakeSessionCoreSchema.safeParse(record);

  if (!parsed.success) {
    console.error('Failed to parse intake session record', parsed.error.issues);
    return undefined;
  }

  const core = parsed.data;
  const pages = intakePageDraftSchema.array().safeParse((record as any)?.pages ?? []);
  const sources = intakeSourceSnapshotSchema.array().safeParse((record as any)?.sources ?? []);
  const scriptRuns = intakeScriptRunSchema.array().safeParse((record as any)?.scriptRuns ?? []);

  if (!pages.success) {
    console.error('Failed to parse intake pages', pages.error.issues);
    return undefined;
  }

  if (!sources.success) {
    console.error('Failed to parse intake sources', sources.error.issues);
    return undefined;
  }

  if (!scriptRuns.success) {
    console.error('Failed to parse intake script runs', scriptRuns.error.issues);
    return undefined;
  }

  return normalizeSession(core, pages.data, sources.data, scriptRuns.data);
}

export function loadIntakeSession(files: FileMap): IntakeSession | undefined {
  const sessionFile = files[PUBLISHER_INTAKE_SESSION_FILE];

  if (sessionFile?.type !== 'file') {
    return undefined;
  }

  const sessionCore = parseJson<unknown>(sessionFile.content);

  if (!sessionCore) {
    console.error(`Failed to parse intake session JSON at ${PUBLISHER_INTAKE_SESSION_FILE}`);
    return undefined;
  }

  const pages: unknown[] = [];

  for (const [filePath, file] of Object.entries(files)) {
    if (
      file?.type !== 'file' ||
      !filePath.startsWith(`${PUBLISHER_INTAKE_PAGES_DIR}/`) ||
      !filePath.endsWith('.json')
    ) {
      continue;
    }

    const page = parseJson<unknown>(file.content);

    if (!page) {
      console.error(`Failed to parse intake page JSON at ${filePath}`);
      return undefined;
    }

    pages.push(page);
  }

  const sourceFile = files[PUBLISHER_INTAKE_SOURCE_MANIFEST_FILE];
  const scriptRunsFile = files[PUBLISHER_INTAKE_SCRIPT_RUNS_FILE];
  const sourcePayload = sourceFile?.type === 'file' ? parseJson<unknown[]>(sourceFile.content) : ([] as unknown[]);
  const scriptRunPayload =
    scriptRunsFile?.type === 'file' ? parseJson<unknown[]>(scriptRunsFile.content) : ([] as unknown[]);

  if (sourceFile?.type === 'file' && !sourcePayload) {
    console.error(`Failed to parse intake source manifest at ${PUBLISHER_INTAKE_SOURCE_MANIFEST_FILE}`);
    return undefined;
  }

  if (scriptRunsFile?.type === 'file' && !scriptRunPayload) {
    console.error(`Failed to parse intake script runs at ${PUBLISHER_INTAKE_SCRIPT_RUNS_FILE}`);
    return undefined;
  }

  return parseIntakeSessionRecord({
    ...(sessionCore as Record<string, unknown>),
    pages,
    sources: sourcePayload,
    scriptRuns: scriptRunPayload,
  });
}
