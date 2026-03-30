import {
  PUBLISHER_CHECKS_FILE,
  PUBLISHER_INTAKE_SCRIPT_RUNS_FILE,
  PUBLISHER_INTAKE_SESSION_FILE,
  PUBLISHER_INTAKE_SOURCE_MANIFEST_FILE,
  PUBLISHER_PROJECT_FILE,
  PUBLISHER_REFERENCES_FILE,
  PUBLISHER_THEME_FILE,
  getPublisherIntakePageFilePath,
  getPublisherPageFilePath,
} from './constants';
import { publisherBlockRegistry } from './block-registry';
import { sanitizePublisherSlotProps } from './contracts';
import { intakeAiBatchResultSchema } from './intake-files';
import { runPublisherChecks } from './checker';
import { buildIntakePageChecks, buildIntakeSessionChecks } from './intake';
import { getDefaultTokens } from './token-engine';
import type {
  AssetRef,
  CheckReport,
  IntakeAiBatchPageInput,
  IntakeAiBatchResult,
  IntakeAiSuggestion,
  IntakePageDraft,
  IntakeSectionDraft,
  IntakeSession,
  PageContract,
  PublisherMarkdownSource,
  PublisherReferenceState,
  PublisherSiteSettings,
  SiteProjectContract,
  ThemeContract,
} from '~/types/publisher';

export interface IntakeNormalizePromptInput {
  page: Pick<IntakePageDraft, 'id' | 'role' | 'slug' | 'path' | 'title' | 'description' | 'h1'>;
  sourceText: string;
  parserWarnings?: string[];
  sourceFamily: IntakePageDraft['sourceFamily'];
  provider?: string;
  model?: string;
}

export interface PublisherContractsFromIntakeResult {
  project: SiteProjectContract;
  theme: ThemeContract;
  pages: PageContract[];
  checks: CheckReport[];
  markdownSources: PublisherMarkdownSource[];
  referenceState: PublisherReferenceState;
  files: Record<string, string | Uint8Array>;
}

function sanitizeSegment(value: string) {
  let output = '';
  let previousWasDash = false;

  for (const rawCharacter of value.trim().toLowerCase()) {
    const isAlphaNumeric = (rawCharacter >= 'a' && rawCharacter <= 'z') || (rawCharacter >= '0' && rawCharacter <= '9');

    if (isAlphaNumeric) {
      output += rawCharacter;
      previousWasDash = false;
      continue;
    }

    const isSeparator =
      rawCharacter === ' ' ||
      rawCharacter === '-' ||
      rawCharacter === '_' ||
      rawCharacter === '/' ||
      rawCharacter === '.';

    if (isSeparator && !previousWasDash && output.length > 0) {
      output += '-';
      previousWasDash = true;
    }
  }

  while (output.endsWith('-')) {
    output = output.slice(0, -1);
  }

  return output || 'page';
}

function normalizeDomain(domain?: string) {
  if (!domain?.trim()) {
    return undefined;
  }

  const trimmed = domain.trim();

  return trimmed.startsWith('http://') || trimmed.startsWith('https://') ? trimmed : `https://${trimmed}`;
}

function normalizeLanguages(settings: Pick<PublisherSiteSettings, 'defaultLanguage' | 'multilingual' | 'languages'>) {
  const next = new Set<string>();
  const defaultLanguage = settings.defaultLanguage.trim().toLowerCase() || 'en';

  next.add(defaultLanguage);

  for (const language of settings.languages) {
    const normalized = language.trim().toLowerCase();

    if (normalized) {
      next.add(normalized);
    }
  }

  return settings.multilingual ? [...next] : [defaultLanguage];
}

function escapeHtml(value: string) {
  let output = '';

  for (const character of value) {
    switch (character) {
      case '&':
        output += '&amp;';
        break;
      case '<':
        output += '&lt;';
        break;
      case '>':
        output += '&gt;';
        break;
      case '"':
        output += '&quot;';
        break;
      case "'":
        output += '&#39;';
        break;
      default:
        output += character;
        break;
    }
  }

  return output;
}

function splitIntoParagraphs(text: string) {
  const paragraphs: string[] = [];
  const lines = text.replaceAll('\r', '').split('\n');
  let current: string[] = [];

  const flush = () => {
    const paragraph = current.join('\n').trim();

    if (paragraph) {
      paragraphs.push(paragraph);
    }

    current = [];
  };

  for (const line of lines) {
    if (!line.trim()) {
      flush();
      continue;
    }

    current.push(line);
  }

  flush();

  return paragraphs;
}

function renderPlainSectionContent(content: string) {
  return splitIntoParagraphs(content)
    .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
    .join('\n');
}

function renderSection(section: IntakeSectionDraft, sourceFamily: IntakePageDraft['sourceFamily']) {
  const blocks: string[] = [];

  if (section.heading?.trim()) {
    blocks.push(`<h2>${escapeHtml(section.heading.trim())}</h2>`);
  }

  const shouldPreserveHtml = sourceFamily === 'html' || section.kind === 'html';
  blocks.push(shouldPreserveHtml ? section.content.trim() : renderPlainSectionContent(section.content));

  return blocks.filter(Boolean).join('\n');
}

function renderPageContent(page: IntakePageDraft) {
  if (page.sections.length === 0) {
    return page.bodyHtml?.trim() || '';
  }

  return page.sections
    .map((section) => renderSection(section, page.sourceFamily))
    .filter(Boolean)
    .join('\n');
}

function createProjectAssetRef(asset?: IntakeSession['project']['favicon']): AssetRef | undefined {
  if (!asset) {
    return undefined;
  }

  const storedPath = asset.path ?? asset.storedPath ?? asset.sourcePath;

  if (!storedPath) {
    return undefined;
  }

  const fileName = storedPath.split('/').filter(Boolean).pop() ?? asset.label ?? 'asset';

  return {
    path: storedPath,
    publicPath: asset.publicPath ?? `/assets/site/${fileName}`,
    mimeType: asset.mimeType,
    label: asset.label,
    storedPath: asset.storedPath,
    previewPath: asset.previewPath ?? asset.previewUrl,
  };
}

function createDefaultHeader(settings: PublisherSiteSettings, homePath: string) {
  return {
    enabled: true,
    slots: [
      {
        id: 'site-header',
        blockId: 'site-header-basic',
        props: sanitizePublisherSlotProps({
          brandName: settings.name,
          primaryLinkLabel: 'Home',
          primaryLinkHref: homePath,
          secondaryLinkLabel: 'Contact',
          secondaryLinkHref: '#contact',
        }),
      },
    ],
  };
}

function createDefaultFooter(settings: PublisherSiteSettings) {
  return {
    enabled: true,
    slots: [
      {
        id: 'site-footer',
        blockId: 'site-footer-simple',
        props: sanitizePublisherSlotProps({
          copyright: `© ${new Date().getFullYear()} ${settings.name}`,
          footerLinkLabel: settings.domain ? 'Visit site' : 'Get in touch',
          footerLinkHref: settings.domain ? normalizeDomain(settings.domain) : '#contact',
        }),
      },
    ],
  };
}

function createPublisherSiteSettings(project: IntakeSession['project']): PublisherSiteSettings {
  return {
    name: project.name,
    domain: project.domain,
    defaultLanguage: project.defaultLanguage || 'en',
    multilingual: project.multilingual,
    languages: project.languages.length ? project.languages : [project.defaultLanguage || 'en'],
    favicon: createProjectAssetRef(project.favicon),
    metaImage: createProjectAssetRef(project.metaImage),
    logo: createProjectAssetRef(project.logo),
  };
}

function createSeoDescription(page: IntakePageDraft, siteName: string) {
  if (page.description?.trim()) {
    return page.description.trim();
  }

  const firstSection = page.sections.find((section) => section.content.trim());
  const summary = firstSection?.content.trim().slice(0, 160);

  if (summary) {
    return summary;
  }

  return `${page.title} · ${siteName}`;
}

function createPageContract(page: IntakePageDraft, siteName: string): PageContract {
  const bodyHtml = renderPageContent(page);
  const contentSlot = {
    id: `${page.id}-content`,
    blockId: 'content-prose',
    props: sanitizePublisherSlotProps({
      sectionTitle: page.h1 ?? page.title,
      html: bodyHtml,
    }),
  };

  return {
    id: page.id,
    slug: sanitizeSegment(page.slug || page.id),
    name: page.name || page.title,
    path: page.path || (page.role === 'home' ? '/' : `/${sanitizeSegment(page.slug || page.id)}/`),
    usesProjectShell: true,
    zones: {
      content: {
        enabled: true,
        slots: [contentSlot],
      },
    },
    seo: {
      title: page.title || page.name,
      description: createSeoDescription(page, siteName),
      schemaType: page.role === 'article' ? 'Article' : 'WebPage',
      canonicalPath: page.path || (page.role === 'home' ? '/' : `/${sanitizeSegment(page.slug || page.id)}/`),
      robots: 'index,follow',
    },
  };
}

function serializePageContracts(pages: PageContract[]) {
  const files: Record<string, string> = {};

  for (const page of pages) {
    files[getPublisherPageFilePath(page.slug)] = JSON.stringify(page, null, 2);
  }

  return files;
}

function buildCanonicalChecks(
  project: SiteProjectContract,
  theme: ThemeContract,
  pages: PageContract[],
  session: IntakeSession,
  availableFilePaths: string[],
) {
  const appChecks = runPublisherChecks(
    {
      project,
      theme,
      pages,
      checks: [],
      issues: [],
      availableFilePaths,
    },
    publisherBlockRegistry,
  );

  const intakeChecks = [
    ...buildIntakeSessionChecks({
      ...session,
      pages: session.pages.map((page) => ({
        ...page,
        checks: buildIntakePageChecks(page),
      })),
    }),
  ].map((check) => {
    const status: CheckReport['status'] =
      check.severity === 'fail' ? 'fail' : check.severity === 'warn' ? 'warn' : 'pass';

    return {
      name: check.name ?? check.id,
      status,
      message: check.message,
      details: check.details,
      pageId: check.pageId,
      gate: 'working' as const,
    };
  });

  return [...intakeChecks, ...appChecks];
}

function takeFirstLines(text: string, limit: number) {
  const lines = text.replaceAll('\r', '').split('\n');
  return lines.slice(0, limit).join('\n').trim();
}

export function buildIntakeAiBatchPageInput(page: IntakePageDraft, rawSource: string): IntakeAiBatchPageInput {
  return {
    slug: page.slug,
    title: page.title?.trim() ? page.title.trim() : null,
    description: page.description?.trim() ? page.description.trim() : null,
    heading: page.h1?.trim() ? page.h1.trim() : null,
    source: takeFirstLines(rawSource, 10),
  };
}

export function buildIntakeNormalizePrompt(input: IntakeNormalizePromptInput) {
  const warningBlock = (input.parserWarnings ?? []).filter(Boolean).slice(0, 5);
  const sourceSnippet = takeFirstLines(input.sourceText, 10);

  return {
    system:
      'You extract structured page fields from an imported source. Do not rewrite, improve, translate, summarize, or invent content. Return strict JSON only.',
    user: [
      'Твоя задача — извлечь поля из исходного документа без переписывания текста.',
      'Не улучшай стиль, не сокращай, не добавляй новый текст, не переводи и не интерпретируй.',
      'Верни только JSON по схеме: { "title": string | null, "description": string | null, "h1": string | null, "sections": [{ "heading": string | null, "content": string }], "unresolved": string[], "notes": string[] }.',
      'Если поле не найдено, верни null.',
      'Если часть текста не удается уверенно классифицировать, помести ее в unresolved.',
      'Используй только текст из входных данных.',
      '',
      `pageId: ${input.page.id}`,
      `role: ${input.page.role}`,
      `path: ${input.page.path}`,
      `sourceFamily: ${input.sourceFamily}`,
      input.provider ? `provider: ${input.provider}` : '',
      input.model ? `model: ${input.model}` : '',
      '',
      'Current extracted fields:',
      JSON.stringify(
        {
          title: input.page.title,
          description: input.page.description ?? null,
          h1: input.page.h1 ?? null,
        },
        null,
        2,
      ),
      '',
      warningBlock.length ? `Parser warnings:\n- ${warningBlock.join('\n- ')}` : 'Parser warnings: none',
      '',
      'Problematic source snippet (first 10 lines of unresolved or raw source):',
      sourceSnippet || '[empty]',
    ]
      .filter(Boolean)
      .join('\n'),
  };
}

export function buildIntakeBatchNormalizePrompt(input: {
  pages: IntakeAiBatchPageInput[];
  provider?: string;
  model?: string;
}) {
  return {
    system:
      'You extract page metadata from imported source snippets. Do not rewrite, improve, translate, summarize, or invent content. Return strict JSON only.',
    user: [
      'Твоя задача — извлечь только metadata из проблемных страниц без переписывания текста.',
      'Не улучшай стиль, не сокращай, не добавляй новый текст, не переводи и не интерпретируй.',
      'Верни только JSON по схеме: { "pages": [{ "slug": string, "title": string | null, "description": string | null, "heading": string | null, "source": string }] }.',
      'Если поле не найдено, верни null.',
      'Используй только текст из входных данных.',
      input.provider ? `provider: ${input.provider}` : '',
      input.model ? `model: ${input.model}` : '',
      '',
      JSON.stringify({ pages: input.pages }, null, 2),
    ]
      .filter(Boolean)
      .join('\n'),
  };
}

function normalizeSuggestionPayload(payload: unknown): IntakeAiSuggestion {
  const value = typeof payload === 'object' && payload ? payload : {};
  const record = value as Record<string, unknown>;
  const sections = Array.isArray(record.sections)
    ? record.sections
        .map((entry) => {
          if (!entry || typeof entry !== 'object') {
            return undefined;
          }

          const section = entry as Record<string, unknown>;
          const content = typeof section.content === 'string' ? section.content : '';

          if (!content.trim()) {
            return undefined;
          }

          return {
            heading: typeof section.heading === 'string' ? section.heading : null,
            content,
          };
        })
        .filter((entry): entry is { heading: string | null; content: string } => Boolean(entry))
    : [];

  return {
    title: typeof record.title === 'string' ? record.title : null,
    description: typeof record.description === 'string' ? record.description : null,
    h1: typeof record.h1 === 'string' ? record.h1 : null,
    sections,
    unresolved: Array.isArray(record.unresolved)
      ? record.unresolved.filter((entry): entry is string => typeof entry === 'string')
      : [],
    notes: Array.isArray(record.notes)
      ? record.notes.filter((entry): entry is string => typeof entry === 'string')
      : [],
  };
}

export function parseIntakeNormalizeOutput(raw: string): IntakeAiSuggestion {
  const trimmed = raw.trim();

  if (!trimmed) {
    throw new Error('AI normalize returned an empty response');
  }

  const attempts = [trimmed];
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');

  if (firstBrace >= 0 && lastBrace > firstBrace) {
    attempts.push(trimmed.slice(firstBrace, lastBrace + 1));
  }

  for (const candidate of attempts) {
    try {
      return normalizeSuggestionPayload(JSON.parse(candidate));
    } catch {
      continue;
    }
  }

  throw new Error('AI normalize returned invalid JSON');
}

function normalizeBatchSuggestionPayload(payload: unknown): IntakeAiBatchResult {
  const result = intakeAiBatchResultSchema.parse(payload);

  return {
    pages: result.pages.map((page) => ({
      slug: page.slug,
      title: page.title,
      description: page.description,
      heading: page.heading,
      source: page.source,
      unresolved: page.unresolved ?? [],
      notes: page.notes ?? [],
    })),
  };
}

export function parseIntakeBatchNormalizeOutput(raw: string): IntakeAiBatchResult {
  const trimmed = raw.trim();

  if (!trimmed) {
    throw new Error('AI batch normalize returned an empty response');
  }

  const attempts = [trimmed];
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');

  if (firstBrace >= 0 && lastBrace > firstBrace) {
    attempts.push(trimmed.slice(firstBrace, lastBrace + 1));
  }

  for (const candidate of attempts) {
    try {
      return normalizeBatchSuggestionPayload(JSON.parse(candidate));
    } catch {
      continue;
    }
  }

  throw new Error('AI batch normalize returned invalid JSON');
}

export function serializeIntakeSessionFiles(session: IntakeSession): Record<string, string> {
  const { pages, sources, scriptRuns, ...sessionPayload } = session;
  const files: Record<string, string> = {
    [PUBLISHER_INTAKE_SESSION_FILE]: JSON.stringify(sessionPayload, null, 2),
    [PUBLISHER_INTAKE_SOURCE_MANIFEST_FILE]: JSON.stringify(sources, null, 2),
    [PUBLISHER_INTAKE_SCRIPT_RUNS_FILE]: JSON.stringify(scriptRuns, null, 2),
  };

  for (const page of pages) {
    files[getPublisherIntakePageFilePath(page.id)] = JSON.stringify(page, null, 2);
  }

  return files;
}

export function buildPublisherContractsFromIntakeSession(session: IntakeSession): PublisherContractsFromIntakeResult {
  if (session.disambiguation?.status === 'pending' || session.scenario === 'needsDisambiguation') {
    throw new Error('Intake disambiguation must be resolved before contracts are generated.');
  }

  const siteSettings = createPublisherSiteSettings(session.project);
  const languages = normalizeLanguages(siteSettings);
  const project: SiteProjectContract = {
    id: session.id,
    name: siteSettings.name,
    defaultLanguage: siteSettings.defaultLanguage.toLowerCase(),
    multilingual: siteSettings.multilingual,
    languages,
    mode: 'publisher',
    domain: siteSettings.domain,
    siteUrl: normalizeDomain(siteSettings.domain),
    favicon: siteSettings.favicon,
    metaImage: siteSettings.metaImage,
    logo: siteSettings.logo,
    pageOrder: session.pages.map((page) => page.id),
    sharedShell: session.project.sharedShell ?? {
      header: createDefaultHeader(siteSettings, session.pages[0]?.path ?? '/'),
      footer: createDefaultFooter(siteSettings),
    },
    siteSeo: {
      siteName: siteSettings.name,
      organizationName: siteSettings.name,
      schemaType: 'WebSite',
    },
    build: {
      outputDir: 'dist',
      assetDir: 'assets',
      checks: ['working'],
    },
  };

  const theme: ThemeContract = {
    themeId: `${session.id}-theme`,
    tokens: getDefaultTokens(),
  };

  const pages = session.pages.map((page) => createPageContract(page, project.name));
  const sourceLookup = new Map(session.sources.map((source) => [source.path, source]));
  const referenceState: PublisherReferenceState = {
    intakeSessionId: session.id,
    importKind: session.importKind,
    activeContentFamily: session.activeContentFamily,
    referenceSourceFamily: session.referenceSourceFamily,
    sourceRoot: session.sourceRoot,
    sourceLabel: session.sourceLabel,
    templateCandidatePath: session.templateCandidatePath,
    homePageCandidatePath: session.homePageCandidatePath,
    shellCandidatePaths: session.shellCandidatePaths,
    referenceLibraryPaths: session.blockLibraryPaths,
    pageSourceMap: session.pages.map((page) => ({
      pageId: page.id,
      pagePath: page.path,
      sourcePath: page.sourcePath,
      storedPath: page.storedSourcePath ?? sourceLookup.get(page.sourcePath)?.storedPath,
      sourceFamily: page.sourceFamily,
      companionSourcePath: page.companionSourcePath,
      companionStoredPath: page.companionSourcePath
        ? sourceLookup.get(page.companionSourcePath)?.storedPath
        : undefined,
    })),
    assetMaterialization: [
      {
        kind: 'favicon' as const,
        sourcePath: session.project.favicon?.sourcePath,
        storedPath: session.project.favicon?.storedPath ?? session.project.favicon?.path,
        publicPath: session.project.favicon?.publicPath,
        previewPath: session.project.favicon?.previewPath,
      },
      {
        kind: 'logo' as const,
        sourcePath: session.project.logo?.sourcePath,
        storedPath: session.project.logo?.storedPath ?? session.project.logo?.path,
        publicPath: session.project.logo?.publicPath,
        previewPath: session.project.logo?.previewPath,
      },
      {
        kind: 'metaImage' as const,
        sourcePath: session.project.metaImage?.sourcePath,
        storedPath: session.project.metaImage?.storedPath ?? session.project.metaImage?.path,
        publicPath: session.project.metaImage?.publicPath,
        previewPath: session.project.metaImage?.previewPath,
      },
    ].filter((asset) => asset.sourcePath || asset.storedPath),
    sourceFiles: session.sources.map((source) => ({
      path: source.path,
      storedPath: source.storedPath,
      label: source.label,
      family: source.sourceFamilyHint ?? source.familyHint ?? 'unknown',
      role: source.role,
    })),
  };
  const markdownSources: PublisherMarkdownSource[] = session.pages
    .filter((page) => page.sourceFamily === 'document')
    .map((page) => ({
      name: page.name,
      sourcePath: page.storedSourcePath ?? page.sourcePath,
      pageId: page.id,
      pagePath: page.path,
    }));
  const files: Record<string, string | Uint8Array> = {
    [PUBLISHER_PROJECT_FILE]: JSON.stringify(project, null, 2),
    [PUBLISHER_THEME_FILE]: JSON.stringify(theme, null, 2),
    [PUBLISHER_REFERENCES_FILE]: JSON.stringify(referenceState, null, 2),
    ...serializePageContracts(pages),
    ...serializeIntakeSessionFiles({
      ...session,
      status: 'applied',
      updatedAt: new Date().toISOString(),
    }),
  };
  const availableFilePaths = Array.from(
    new Set([
      ...Object.keys(files),
      ...session.sources.flatMap((source) => [source.path, source.storedPath].filter(Boolean) as string[]),
      ...referenceState.assetMaterialization.flatMap(
        (asset) => [asset.sourcePath, asset.storedPath, asset.publicPath].filter(Boolean) as string[],
      ),
      ...([project.favicon?.path, project.logo?.path, project.metaImage?.path].filter(Boolean) as string[]),
    ]),
  );
  const checks = buildCanonicalChecks(project, theme, pages, session, availableFilePaths);
  files[PUBLISHER_CHECKS_FILE] = JSON.stringify(checks, null, 2);

  return {
    project,
    theme,
    pages,
    checks,
    markdownSources,
    referenceState,
    files,
  };
}
