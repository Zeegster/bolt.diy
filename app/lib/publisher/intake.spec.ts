import { afterEach, describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import type { IntakeSourceSnapshot } from '~/types/publisher';
import { getPublisherImportedSourcePath, resolveUniqueImportedSourcePath } from './constants';
import { loadIntakeSession as loadIntakeSessionFromFiles } from './intake-files';
import {
  buildIntakeSourceManifest,
  buildIntakePageChecks,
  createIntakeSession,
  deriveIntakeWorkItems,
  detectIntakeScenario,
  extractDocumentPageDraft,
  extractHtmlPageDraftFromDocument,
  scanIntakeSourceTree,
} from './intake';
import {
  buildIntakeAiBatchPageInput,
  buildIntakeBatchNormalizePrompt,
  buildIntakeNormalizePrompt,
  buildPublisherContractsFromIntakeSession,
  parseIntakeBatchNormalizeOutput,
  parseIntakeNormalizeOutput,
  serializeIntakeSessionFiles,
} from './intake-pipeline';
import {
  appendIntakeScriptRun,
  loadIntakeSession as loadStoredIntakeSession,
  saveIntakeSession,
} from './intake-session';
import { buildImportedBundleAdapter } from './intake-adapter';
import { createIntakePageDraft, deriveBatchNormalizeReviewState } from './intake-ui';
import { deriveCanonicalIntakeLifecycleState } from './status';
import { runPublisherChecks } from './checker';
import { publisherBlockRegistry } from './block-registry';

function createHtmlDocument(html: string) {
  return new JSDOM(html).window.document;
}

function htmlSource(path: string, html: string): IntakeSourceSnapshot {
  return {
    id: path,
    path,
    kind: 'file',
    mimeType: 'text/html',
    size: html.length,
    isBinary: false,
    html,
  };
}

function markdownSource(path: string, text: string): IntakeSourceSnapshot {
  return {
    id: path,
    path,
    kind: 'file',
    mimeType: 'text/markdown',
    size: text.length,
    isBinary: false,
    text,
  };
}

function binarySource(path: string): IntakeSourceSnapshot {
  return {
    id: path,
    path,
    kind: 'file',
    mimeType: 'application/pdf',
    size: 1,
    isBinary: true,
  };
}

function createMemoryStorage() {
  const store = new Map<string, string>();

  return {
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
    removeItem(key: string) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
  };
}

const hybridSources: IntakeSourceSnapshot[] = [
  htmlSource(
    'index.html',
    `<!doctype html>
<html lang="en">
  <head>
    <title>Spinaura Casino</title>
    <meta name="description" content="Homepage shell for the casino project">
  </head>
  <body>
    <header>Header shell</header>
    <main>
      <h1>Spinaura Casino</h1>
      <p>Shell content and hero.</p>
    </main>
    <footer>Footer shell</footer>
  </body>
</html>`,
  ),
  htmlSource(
    'pages/index.html',
    `<!doctype html>
<html lang="en">
  <head>
    <title>Home</title>
    <meta name="description" content="Home page for the casino site">
  </head>
  <body>
    <article class="article-page">
      <h1>Home</h1>
      <p>Welcome to the home page.</p>
      <h2>Highlights</h2>
      <p>Fast and clear content.</p>
    </article>
  </body>
</html>`,
  ),
  htmlSource(
    'pages/privacy.html',
    `<!doctype html>
<html lang="en">
  <head>
    <title>Privacy Policy</title>
    <meta name="description" content="Privacy policy page">
  </head>
  <body>
    <article class="article-page">
      <h1>Privacy Policy</h1>
      <p>This page explains privacy terms.</p>
      <h2>Data</h2>
      <p>We collect minimal data.</p>
    </article>
  </body>
</html>`,
  ),
  htmlSource('_layouts/header.html', `<header><nav><a href="/">Home</a></nav></header>`),
  htmlSource('_layouts/footer.html', `<footer><p>Footer fragment</p></footer>`),
  htmlSource('_layouts/before-content.html', `<div class="before-content">Before content fragment</div>`),
  htmlSource('blocks.html', `<section data-block="hero">Block library</section>`),
  markdownSource(
    'content-source/index.md',
    `---
title: Reference Home
description: Source markdown companion
h1: Reference Home
---

# Reference Home

Reference body content.`,
  ),
  markdownSource(
    'content-source/bonus.md',
    `---
title: Bonus Page
description: Secondary reference doc
h1: Bonus Heading
---

# Bonus Heading

First paragraph.

## Details

- Alpha
- Beta`,
  ),
  markdownSource('content-source/legal.md', `# Legal Notes\n\nImportant legal copy.`),
  {
    id: 'assets/css/main.css',
    path: 'assets/css/main.css',
    kind: 'file',
    mimeType: 'text/css',
    size: 'body { color: #111; }'.length,
    isBinary: false,
    text: 'body { color: #111; }',
  },
  {
    id: 'assets/js/script.js',
    path: 'assets/js/script.js',
    kind: 'file',
    mimeType: 'application/javascript',
    size: 'console.log("ok");'.length,
    isBinary: false,
    text: 'console.log("ok");',
  },
  {
    id: 'refs/readme.txt',
    path: 'refs/readme.txt',
    kind: 'file',
    mimeType: 'text/plain',
    size: 'This should be ignored as reference noise.'.length,
    isBinary: false,
    text: 'This should be ignored as reference noise.',
  },
  htmlSource('_pgbackup/legacy.html', '<p>Legacy backup</p>'),
  {
    id: '_pginfo/info.json',
    path: '_pginfo/info.json',
    kind: 'file',
    mimeType: 'application/json',
    size: 2,
    isBinary: false,
    text: '{}',
  },
  binarySource('brochure.pdf'),
];

const contentSourceFixture: IntakeSourceSnapshot[] = [
  markdownSource(
    'content-source/index.md',
    `---
title: Fixture Home
description: Fixture markdown homepage
h1: Fixture Home
---

# Fixture Home

Primary content.`,
  ),
  markdownSource(
    'content-source/about.md',
    `---
title: About Fixture
description: Fixture about page
h1: About Fixture
---

# About Fixture

Secondary content.`,
  ),
];

afterEach(() => {
  const globalWithWindow = globalThis as any;
  delete globalWithWindow.window;
});

describe('intake pipeline', () => {
  it('canonical intake lifecycle moves from scan to review to release-ready for supported packs', () => {
    const adapted = buildImportedBundleAdapter({
      sessionId: 'canonical-supported',
      sourceLabel: '/imports/spinaura',
      importKind: 'html',
      sources: hybridSources,
      project: {
        name: 'Spinaura Casino',
        defaultLanguage: 'en',
        multilingual: false,
        languages: ['en'],
      },
      htmlDocumentFactory: (source) => createHtmlDocument(source.html ?? source.text ?? ''),
    });

    expect(deriveCanonicalIntakeLifecycleState({ intakeSession: adapted.session, checks: [] })).toBe('intake-review');

    const appliedSession = {
      ...adapted.session,
      status: 'applied' as const,
    };

    expect(deriveCanonicalIntakeLifecycleState({ intakeSession: appliedSession, checks: [] })).toBe('contract-ready');
    expect(
      deriveCanonicalIntakeLifecycleState({
        intakeSession: appliedSession,
        checks: [],
        lastBuild: {
          id: 'build-1',
          createdAt: '2026-03-31T10:00:00.000Z',
          status: 'release-ready',
          stage: 'check',
          workingFailures: 0,
          releaseFailures: 0,
          warningCount: 0,
          artifacts: [],
          pipeline: {
            schemaVersion: '1.0.0',
            stageOrder: ['assemble', 'optimize', 'check', 'publish', 'export'],
            deliveryStage: 'publish',
            stages: [{ stage: 'check', status: 'completed', summary: 'ok', details: [] }],
            jobs: [],
            activeStage: 'check',
            publishContract: {
              schemaVersion: '1.0.0',
              buildId: 'build-1',
              generatedAt: '2026-03-31T10:00:00.000Z',
              canPublish: true,
              publishWarnings: [],
              publishBlockers: [],
              sourceFingerprint: 'src-hash',
              artifactFingerprint: 'artifact-hash',
              rollback: {
                strategy: 'rebuild',
                keepLastBuilds: 2,
              },
            },
          },
        },
      }),
    ).toBe('release-ready');
  });

  it('canonical intake lifecycle remains blocked when critical intake data is missing', () => {
    const session = createIntakeSession({
      id: 'canonical-blocked',
      sourceRoot: '/fixtures',
      importKind: 'document',
      scenario: 'needsDisambiguation',
      activeContentFamily: 'document',
      projectName: 'Blocked Fixture',
      sourceManifest: buildIntakeSourceManifest(contentSourceFixture, '/fixtures'),
      pages: [],
      warnings: [],
    });

    session.disambiguation = {
      status: 'pending',
      reason: 'Needs operator decision',
      candidateImportKinds: ['document'],
      templateCandidatePaths: [],
      homeCandidatePaths: [],
      selectedImportKind: 'document',
    };

    expect(deriveCanonicalIntakeLifecycleState({ intakeSession: session, checks: [] })).toBe('pending-disambiguation');
  });

  it('completion blockers vs review tasks separates ambiguous work from hard blockers', () => {
    const session = createIntakeSession({
      id: 'work-items-split',
      sourceRoot: '/fixtures',
      importKind: 'document',
      scenario: 'mixed-source-conflict',
      activeContentFamily: 'document',
      projectName: 'Split Fixture',
      sourceManifest: buildIntakeSourceManifest(contentSourceFixture, '/fixtures'),
      pages: [],
      warnings: [],
    });

    session.checks = [
      {
        id: 'mixed-source-conflict',
        severity: 'warn',
        message: 'Mixed pack requires review',
      },
      {
        id: 'missing-home-page-source',
        severity: 'fail',
        message: 'Cannot continue without a home page source',
      },
    ];

    const workItems = deriveIntakeWorkItems(session);
    expect(workItems.reviewTasks.map((item) => item.id)).toContain('mixed-source-conflict');
    expect(workItems.completionBlockers.map((item) => item.id)).toContain('missing-home-page-source');
  });

  it('completion blockers vs review tasks gates blocked state from blockers only', () => {
    const session = createIntakeSession({
      id: 'work-items-gating',
      sourceRoot: '/fixtures',
      importKind: 'document',
      scenario: 'document-import',
      activeContentFamily: 'document',
      projectName: 'Gating Fixture',
      sourceManifest: buildIntakeSourceManifest(contentSourceFixture, '/fixtures'),
      pages: [],
      warnings: [],
    });

    session.status = 'reviewing';
    session.checks = [
      {
        id: 'mixed-source-conflict',
        severity: 'warn',
        message: 'Needs review only',
      },
    ];
    session.completionBlockers = [];
    session.reviewTasks = session.checks;

    expect(deriveCanonicalIntakeLifecycleState({ intakeSession: session, checks: [] })).toBe('intake-review');

    session.completionBlockers = [
      {
        id: 'missing-home-page-source',
        severity: 'fail',
        message: 'Cannot continue',
      },
    ];

    expect(deriveCanonicalIntakeLifecycleState({ intakeSession: session, checks: [] })).toBe('pending-disambiguation');
  });

  it('classifies a hybrid site as template-plus-documents when html is forced', () => {
    const scan = scanIntakeSourceTree(hybridSources, {
      rootPath: '/work/pinegrow/spinaura-casino-fr.com',
      importKind: 'html',
      htmlDocumentFactory: (source) => createHtmlDocument(source.html ?? source.text ?? ''),
    });

    expect(scan.scenario).toBe('template-plus-documents');
    expect(scan.scenarioResult?.scenario).toBe('template-plus-documents');
    expect(scan.scenarioResult?.activeContentFamily).toBe('html');
    expect(scan.scenarioResult?.referenceSourceFamily).toBe('document');
    expect(scan.scenarioResult?.templateCandidatePath).toBe('index.html');
    expect(scan.scenarioResult?.homePageCandidatePath).toBe('pages/index.html');
    expect(scan.shellCandidates).toEqual(expect.arrayContaining(['_layouts/header.html', '_layouts/footer.html']));
    expect(scan.blockLibraryCandidates).toContain('blocks.html');
    expect(scan.ignoredPaths).toEqual(
      expect.arrayContaining(['_pgbackup/legacy.html', '_pginfo/info.json', 'refs/readme.txt']),
    );
    expect(scan.unsupportedPaths).toContain('brochure.pdf');
    expect(scan.pageCandidates.every((page) => page.sourceFamily === 'html')).toBe(true);
    expect(scan.referenceCandidates.every((page) => page.sourceFamily === 'document')).toBe(true);
    expect(scan.pageCandidates.map((page) => page.sourcePath)).toEqual(
      expect.arrayContaining(['pages/index.html', 'pages/privacy.html']),
    );
    expect(scan.referenceCandidates.map((page) => page.sourcePath)).toEqual(
      expect.arrayContaining(['content-source/index.md', 'content-source/bonus.md']),
    );

    const scenario = detectIntakeScenario(scan, 'html');

    expect(scenario.scenario).toBe('template-plus-documents');
    expect(scenario.activeContentFamily).toBe('html');
    expect(scenario.referenceSourceFamily).toBe('document');
  });

  it('blocks mixed intake without explicit family selection', () => {
    const scan = scanIntakeSourceTree(hybridSources, {
      rootPath: '/work/pinegrow/spinaura-casino-fr.com',
      htmlDocumentFactory: (source) => createHtmlDocument(source.html ?? source.text ?? ''),
    });

    expect(scan.scenarioResult?.scenario).toBe('needsDisambiguation');
    expect(scan.scenarioResult?.needsUserChoice).toBe(true);
    expect(scan.scenarioResult?.templateCandidatePaths).toContain('index.html');
    expect(scan.scenarioResult?.homeCandidatePaths).toContain('pages/index.html');
    expect(scan.pageCandidates).toHaveLength(0);
  });

  it('blocks when multiple template candidates are detected', () => {
    const sources: IntakeSourceSnapshot[] = [
      htmlSource('index.html', '<html><head><title>Root A</title></head><body><h1>A</h1></body></html>'),
      htmlSource('site/index.html', '<html><head><title>Root B</title></head><body><h1>B</h1></body></html>'),
      htmlSource('pages/index.html', '<html><head><title>Home</title></head><body><h1>Home</h1></body></html>'),
    ];
    const scan = scanIntakeSourceTree(sources, {
      importKind: 'html',
      htmlDocumentFactory: (source) => createHtmlDocument(source.html ?? source.text ?? ''),
    });

    expect(scan.scenarioResult?.scenario).toBe('needsDisambiguation');
    expect(scan.scenarioResult?.needsUserChoice).toBe(true);
    expect(scan.scenarioResult?.templateCandidatePaths).toEqual(['index.html', 'site/index.html']);
  });

  it('respects the onboarding import kind as a hard override', () => {
    const scan = scanIntakeSourceTree(hybridSources, {
      rootPath: '/work/pinegrow/spinaura-casino-fr.com',
      importKind: 'document',
      htmlDocumentFactory: (source) => createHtmlDocument(source.html ?? source.text ?? ''),
    });

    expect(scan.activeContentFamily).toBe('document');
    expect(scan.pageCandidates.every((page) => page.sourceFamily === 'document')).toBe(true);
    expect(scan.referenceCandidates.some((page) => page.sourceFamily === 'html')).toBe(true);
  });

  it('extracts html and markdown pages into structured drafts', () => {
    const htmlDraft = extractHtmlPageDraftFromDocument(
      createHtmlDocument(
        `<!doctype html>
<html lang="en">
  <head>
    <title>Home</title>
    <meta name="description" content="Home page for the casino site">
  </head>
  <body>
    <article class="article-page">
      <h1>Home</h1>
      <p>Welcome to the home page.</p>
      <h2>Highlights</h2>
      <p>Fast and clear content.</p>
    </article>
  </body>
</html>`,
      ),
      htmlSource('pages/index.html', ''),
    );

    expect(htmlDraft.title).toBe('Home');
    expect(htmlDraft.description).toBe('Home page for the casino site');
    expect(htmlDraft.h1).toBe('Home');
    expect(htmlDraft.path).toBe('/');
    expect(htmlDraft.sections.length).toBeGreaterThan(0);
    expect(htmlDraft.sections[0].content).toContain('<p>Welcome to the home page.</p>');

    const documentDraft = extractDocumentPageDraft(
      markdownSource(
        'content-source/bonus.md',
        `---
title: Bonus Page
description: Secondary reference doc
h1: Bonus Heading
---

# Bonus Heading

First paragraph.

## Details

- Alpha
- Beta`,
      ),
    );

    expect(documentDraft.title).toBe('Bonus Page');
    expect(documentDraft.description).toBe('Secondary reference doc');
    expect(documentDraft.h1).toBe('Bonus Heading');
    expect(documentDraft.path).toBe('/bonus/');
    expect(documentDraft.sections.some((section) => section.heading === 'Details')).toBe(true);
    expect(buildIntakePageChecks(documentDraft).some((check) => check.status === 'fail')).toBe(false);
  });

  it('rejects unsafe imported html', () => {
    const unsafeDraft = extractHtmlPageDraftFromDocument(
      createHtmlDocument(
        `<!doctype html>
<html lang="en">
  <head>
    <title>Unsafe Page</title>
    <meta name="description" content="Unsafe import">
  </head>
  <body>
    <main>
      <h1>Unsafe Page</h1>
      <a href="javascript:alert('x')">Bad link</a>
      <button onclick="evil()">Click</button>
      <script>alert('x')</script>
    </main>
  </body>
</html>`,
      ),
      htmlSource('pages/unsafe.html', ''),
    );

    const checks = buildIntakePageChecks(unsafeDraft);

    expect(checks.filter((check) => check.status === 'fail').map((check) => check.id)).toEqual(
      expect.arrayContaining(['unsafe-imported-html']),
    );
    expect(unsafeDraft.warnings.map((warning) => warning.code)).toEqual(
      expect.arrayContaining(['unsafe-inline-script', 'unsafe-event-handler', 'unsafe-url-protocol']),
    );
  });

  it('preserves markdown heading integrity', () => {
    const draft = extractDocumentPageDraft(
      markdownSource(
        'content-source/heading-integrity.md',
        `---
title: Heading Integrity
description: Deterministic heading structure
h1: Heading Integrity
robots: noindex
canonical: https://example.com/ignored
---

# Heading Integrity

## Details

Body copy.

#### Skipped Level

More copy.

## Details

Repeated heading.`,
      ),
    );

    const checks = buildIntakePageChecks(draft);

    expect(draft.title).toBe('Heading Integrity');
    expect(draft.description).toBe('Deterministic heading structure');
    expect(checks.map((check) => check.id)).toEqual(
      expect.arrayContaining(['duplicate-headings', 'heading-increment']),
    );
    expect(draft.seo?.robots).toBe('index,follow');
    expect(draft.seo?.canonicalPath).toBe('/heading-integrity/');
  });

  it('round-trips intake sessions and script runs in local storage', () => {
    const localStorage = createMemoryStorage();
    const globalWithWindow = globalThis as any;
    globalWithWindow.window = {
      localStorage,
    };

    const manifest = buildIntakeSourceManifest(hybridSources, '/work/pinegrow/spinaura-casino-fr.com');
    const session = createIntakeSession({
      id: 'session-1',
      sourceRoot: '/work/pinegrow/spinaura-casino-fr.com',
      importKind: 'html',
      scenario: 'template-plus-documents',
      activeContentFamily: 'html',
      projectName: 'Spinaura Casino',
      sourceManifest: manifest,
      pages: scanIntakeSourceTree(hybridSources, {
        importKind: 'html',
        htmlDocumentFactory: (source) => createHtmlDocument(source.html ?? source.text ?? ''),
      }).pageCandidates,
      shellCandidates: ['_layouts/header.html', '_layouts/footer.html'],
      templateCandidatePath: 'index.html',
      homePageCandidatePath: 'pages/index.html',
      warnings: [],
      referenceSourceFamily: 'document',
    });

    saveIntakeSession(session);

    const loaded = loadStoredIntakeSession('session-1');

    expect(loaded?.id).toBe('session-1');
    expect(loaded?.pages.length).toBeGreaterThan(0);

    appendIntakeScriptRun('session-1', {
      id: 'run-1',
      sessionId: 'session-1',
      pageId: loaded?.pages[0]?.id,
      runnerKind: 'local-parser',
      inputSummary: 'parse hybrid source',
      outputSummary: 'parsed successfully',
      success: true,
      createdAt: new Date().toISOString(),
    });

    const updated = loadStoredIntakeSession('session-1');

    expect(updated?.scriptRuns).toHaveLength(1);
    expect(updated?.scriptRuns[0].runnerKind).toBe('local-parser');
  });

  it('builds deterministic AI normalize prompts and parses JSON output', () => {
    const prompt = buildIntakeNormalizePrompt({
      page: {
        id: 'bonus',
        role: 'article',
        slug: 'bonus',
        path: '/bonus/',
        title: 'Bonus Page',
        description: 'Secondary reference doc',
        h1: 'Bonus Heading',
      },
      sourceText: 'Title: Bonus Page\nDescription: Secondary reference doc\n# Bonus Heading\n\nParagraph',
      parserWarnings: ['meta preamble was low confidence'],
      sourceFamily: 'document',
      provider: 'openai',
      model: 'gpt-codex-spark',
    });

    expect(prompt.user).toContain('Problematic source snippet');
    expect(prompt.user).toContain('meta preamble was low confidence');

    const suggestion = parseIntakeNormalizeOutput(
      '```json\n{"title":"Bonus Page","description":"Secondary reference doc","h1":"Bonus Heading","sections":[{"heading":"Details","level":2,"content":"Alpha"}],"unresolved":["tail"],"notes":["ok"]}\n```',
    );

    expect(suggestion.title).toBe('Bonus Page');
    expect(suggestion.sections).toHaveLength(1);
    expect(suggestion.sections[0]?.level).toBe(2);
    expect(suggestion.unresolved).toEqual(['tail']);
  });

  it('applies an intake session into canonical publisher contracts without mixing draft storage', () => {
    const manifest = buildIntakeSourceManifest(hybridSources, '/work/pinegrow/spinaura-casino-fr.com');
    const session = createIntakeSession({
      id: 'session-apply',
      sourceRoot: '/work/pinegrow/spinaura-casino-fr.com',
      importKind: 'html',
      scenario: 'template-plus-documents',
      activeContentFamily: 'html',
      projectName: 'Spinaura Casino',
      sourceManifest: manifest,
      pages: scanIntakeSourceTree(hybridSources, {
        importKind: 'html',
        htmlDocumentFactory: (source) => createHtmlDocument(source.html ?? source.text ?? ''),
      }).pageCandidates,
      shellCandidates: ['_layouts/header.html', '_layouts/footer.html'],
      templateCandidatePath: 'index.html',
      homePageCandidatePath: 'pages/index.html',
      warnings: [],
      referenceSourceFamily: 'document',
    });

    session.project.domain = 'spinaura.example';
    session.project.defaultLanguage = 'fr';
    session.project.languages = ['fr', 'en'];
    session.project.multilingual = true;
    session.project.logo = {
      kind: 'logo',
      storedPath: '/home/project/.bolt/publisher/intake/sources/imported/assets/images/logo.svg',
      label: 'logo.svg',
      mimeType: 'image/svg+xml',
    };

    const applied = buildPublisherContractsFromIntakeSession(session);
    const intakeArtifacts = serializeIntakeSessionFiles(session);

    expect(applied.project.mode).toBe('publisher');
    expect(applied.project.languages).toEqual(expect.arrayContaining(['fr', 'en']));
    expect(applied.pages[0]?.zones.content?.slots[0]?.blockId).toBe('content-prose');
    expect(applied.files['/home/project/.bolt/publisher/project.json']).toBeDefined();
    expect(applied.files['/home/project/.bolt/publisher/pages/home.json']).toBeDefined();
    expect(applied.files['/home/project/.bolt/publisher/references.json']).toBeDefined();
    expect(intakeArtifacts['/home/project/.bolt/publisher/intake/session.json']).toBeDefined();
    expect(applied.markdownSources).toHaveLength(0);
    expect(applied.referenceState.templateCandidatePath).toBe('index.html');
    expect(applied.referenceState.shellCandidatePaths).toEqual(
      expect.arrayContaining(['_layouts/header.html', '_layouts/footer.html']),
    );
    expect(applied.referenceState.pageSourceMap[0]?.sourcePath).toBeTruthy();

    const homeContentHtml = String(
      applied.pages.find((page) => page.id === 'home')?.zones.content?.slots[0]?.props?.html ?? '',
    );
    expect(homeContentHtml).toContain('<h1>Home</h1>');
    expect(homeContentHtml).toContain('<h2>Highlights</h2>');
  });

  it('preserves source heading level when rendering document sections', () => {
    const sources: IntakeSourceSnapshot[] = [
      markdownSource(
        'content-source/policy.md',
        `---
title: Policy
description: Policy details
h1: Policy
---

# Policy

## Rules

Only source text.`,
      ),
    ];
    const manifest = buildIntakeSourceManifest(sources, '/work/imports/policy-site');
    const session = createIntakeSession({
      id: 'session-policy',
      sourceRoot: '/work/imports/policy-site',
      importKind: 'document',
      scenario: 'document-import',
      activeContentFamily: 'document',
      projectName: 'Policy Site',
      sourceManifest: manifest,
      pages: [
        {
          id: 'policy',
          name: 'Policy',
          sourcePath: 'content-source/policy.md',
          sourceFamily: 'document',
          role: 'article',
          slug: 'policy',
          path: '/policy/',
          title: 'Policy',
          description: 'Policy details',
          h1: 'Policy',
          sections: [
            {
              id: 'policy-rules',
              kind: 'richtext',
              heading: 'Rules',
              level: 3,
              content: 'Only source text.',
            },
          ],
          checks: [],
          warnings: [],
          confidence: 0.9,
        },
      ],
      warnings: [],
    });

    const applied = buildPublisherContractsFromIntakeSession(session);
    const html = String(applied.pages[0]?.zones.content?.slots[0]?.props?.html ?? '');

    expect(html).toContain('<h3>Rules</h3>');
    expect(html).toContain('<p>Only source text.</p>');
  });

  it('does not inject synthetic headings for sections without explicit levels', () => {
    const sources: IntakeSourceSnapshot[] = [
      markdownSource(
        'content-source/fallback.md',
        `---
title: Fallback
description: Fallback details
h1: Fallback
---

# Fallback

## Details

Alpha`,
      ),
    ];
    const manifest = buildIntakeSourceManifest(sources, '/work/imports/fallback-site');
    const session = createIntakeSession({
      id: 'session-fallback',
      sourceRoot: '/work/imports/fallback-site',
      importKind: 'document',
      scenario: 'document-import',
      activeContentFamily: 'document',
      projectName: 'Fallback Site',
      sourceManifest: manifest,
      pages: [
        {
          id: 'fallback',
          name: 'Fallback',
          sourcePath: 'content-source/fallback.md',
          sourceFamily: 'document',
          role: 'article',
          slug: 'fallback',
          path: '/fallback/',
          title: 'Fallback',
          description: 'Fallback details',
          h1: 'Fallback',
          sections: [
            {
              id: 'fallback-main',
              kind: 'richtext',
              heading: 'Fallback',
              content: 'Main copy.',
            },
            {
              id: 'fallback-details',
              kind: 'richtext',
              heading: 'Details',
              content: 'Alpha.',
            },
          ],
          checks: [],
          warnings: [],
          confidence: 0.9,
        },
      ],
      warnings: [],
    });

    const applied = buildPublisherContractsFromIntakeSession(session);
    const html = String(applied.pages[0]?.zones.content?.slots[0]?.props?.html ?? '');

    expect(html).not.toContain('<h1>');
    expect(html).not.toContain('<h2>');
    expect(html).toContain('<p>Main copy.</p>');
    expect(html).toContain('<p>Alpha.</p>');
  });

  it('does not prepend h1 when source page heading is absent', () => {
    const sources: IntakeSourceSnapshot[] = [
      markdownSource(
        'content-source/plain.md',
        `---
title: Plain Title
description: Plain details
---

Paragraph only.`,
      ),
    ];
    const manifest = buildIntakeSourceManifest(sources, '/work/imports/plain-site');
    const session = createIntakeSession({
      id: 'session-plain',
      sourceRoot: '/work/imports/plain-site',
      importKind: 'document',
      scenario: 'document-import',
      activeContentFamily: 'document',
      projectName: 'Plain Site',
      sourceManifest: manifest,
      pages: [
        {
          id: 'plain',
          name: 'Plain',
          sourcePath: 'content-source/plain.md',
          sourceFamily: 'document',
          role: 'article',
          slug: 'plain',
          path: '/plain/',
          title: 'Plain Title',
          description: 'Plain details',
          h1: '',
          sections: [
            {
              id: 'plain-body',
              kind: 'paragraph',
              content: 'Paragraph only.',
            },
          ],
          checks: [],
          warnings: [],
          confidence: 0.8,
        },
      ],
      warnings: [],
    });

    const applied = buildPublisherContractsFromIntakeSession(session);
    const html = String(applied.pages[0]?.zones.content?.slots[0]?.props?.html ?? '');

    expect(html).not.toContain('<h1>');
    expect(html).toContain('<p>Paragraph only.</p>');
  });

  it('prioritizes content zone sections in intake draft extraction', () => {
    const page = {
      id: 'zone-order',
      slug: 'zone-order',
      name: 'Zone Order',
      path: '/zone-order/',
      usesProjectShell: true,
      zones: {
        header: {
          enabled: true,
          slots: [
            {
              id: 'header-slot',
              blockId: 'site-header-basic',
              props: { brandName: 'Brand', primaryLinkLabel: 'Home', primaryLinkHref: '/' },
            },
          ],
        },
        content: {
          enabled: true,
          slots: [
            {
              id: 'content-slot',
              blockId: 'content-prose',
              props: { sectionTitle: 'Body', html: '<p>Main article content.</p>' },
            },
          ],
        },
        sidebar: {
          enabled: true,
          slots: [{ id: 'sidebar-slot', blockId: 'sidebar-links', props: { title: 'Links' } }],
        },
      },
      seo: {
        title: 'Zone Order',
        description: 'Zone extraction order',
        schemaType: 'WebPage',
        robots: 'index,follow',
      },
    };

    const draft = createIntakePageDraft(page as any);

    expect(draft.sections[0]?.sourceZone).toBe('content');
    expect(draft.sections[0]?.content).toContain('<p>Main article content.</p>');
  });

  it('fails when decorative zone carries primary content while content is minimal', () => {
    const manifest = buildIntakeSourceManifest(hybridSources, '/work/pinegrow/spinaura-casino-fr.com');
    const session = createIntakeSession({
      id: 'session-zone-ownership-fail',
      sourceRoot: '/work/pinegrow/spinaura-casino-fr.com',
      importKind: 'html',
      scenario: 'template-plus-documents',
      activeContentFamily: 'html',
      projectName: 'Spinaura Casino',
      sourceManifest: manifest,
      pages: scanIntakeSourceTree(hybridSources, {
        importKind: 'html',
        htmlDocumentFactory: (source) => createHtmlDocument(source.html ?? source.text ?? ''),
      }).pageCandidates,
      shellCandidates: ['_layouts/header.html', '_layouts/footer.html'],
      templateCandidatePath: 'index.html',
      homePageCandidatePath: 'pages/index.html',
      warnings: [],
      referenceSourceFamily: 'document',
    });
    const applied = buildPublisherContractsFromIntakeSession(session);
    const home = applied.pages.find((page) => page.id === 'home');

    if (!home) {
      throw new Error('Missing home page fixture');
    }

    home.zones.beforeContent = {
      enabled: true,
      slots: [
        {
          id: 'decorative-primary',
          blockId: 'before-content-band',
          props: {
            eyebrow: 'Notice',
            message: 'Summary',
            html: '<p>This decorative slot now holds the full primary article payload.</p><p>Extra paragraph.</p>',
          },
        },
      ],
    };
    home.zones.content = {
      enabled: true,
      slots: [
        {
          id: 'content-minimal',
          blockId: 'content-prose',
          props: {
            sectionTitle: 'Body',
            html: '<p>Short.</p>',
          },
        },
      ],
    };

    const checks = runPublisherChecks(
      {
        project: applied.project,
        theme: applied.theme,
        pages: applied.pages,
        checks: [],
        issues: [],
        availableFilePaths: Object.keys(applied.files),
      },
      publisherBlockRegistry,
    );

    expect(checks.some((check) => check.name === 'decorative-zone-primary-content' && check.status === 'fail')).toBe(
      true,
    );
  });

  it('passes decorative-zone primary-content check when content zone owns primary prose', () => {
    const manifest = buildIntakeSourceManifest(hybridSources, '/work/pinegrow/spinaura-casino-fr.com');
    const session = createIntakeSession({
      id: 'session-zone-ownership-pass',
      sourceRoot: '/work/pinegrow/spinaura-casino-fr.com',
      importKind: 'html',
      scenario: 'template-plus-documents',
      activeContentFamily: 'html',
      projectName: 'Spinaura Casino',
      sourceManifest: manifest,
      pages: scanIntakeSourceTree(hybridSources, {
        importKind: 'html',
        htmlDocumentFactory: (source) => createHtmlDocument(source.html ?? source.text ?? ''),
      }).pageCandidates,
      shellCandidates: ['_layouts/header.html', '_layouts/footer.html'],
      templateCandidatePath: 'index.html',
      homePageCandidatePath: 'pages/index.html',
      warnings: [],
      referenceSourceFamily: 'document',
    });
    const applied = buildPublisherContractsFromIntakeSession(session);
    const home = applied.pages.find((page) => page.id === 'home');

    if (!home) {
      throw new Error('Missing home page fixture');
    }

    home.zones.beforeContent = {
      enabled: true,
      slots: [
        {
          id: 'decorative-supporting',
          blockId: 'before-content-band',
          props: {
            eyebrow: 'Notice',
            message: 'Supporting note',
          },
        },
      ],
    };
    home.zones.content = {
      enabled: true,
      slots: [
        {
          id: 'content-primary',
          blockId: 'content-prose',
          props: {
            sectionTitle: 'Body',
            html: '<p>This is the primary article prose with meaningful depth and multiple clauses for ownership.</p>',
          },
        },
      ],
    };

    const checks = runPublisherChecks(
      {
        project: applied.project,
        theme: applied.theme,
        pages: applied.pages,
        checks: [],
        issues: [],
        availableFilePaths: Object.keys(applied.files),
      },
      publisherBlockRegistry,
    );

    expect(checks.some((check) => check.name === 'decorative-zone-primary-content')).toBe(false);
  });

  it('does not build publisher contracts while disambiguation is pending', () => {
    const manifest = buildIntakeSourceManifest(hybridSources, '/work/pinegrow/spinaura-casino-fr.com');
    const session = createIntakeSession({
      id: 'session-pending',
      sourceRoot: '/work/pinegrow/spinaura-casino-fr.com',
      importKind: 'html',
      scenario: 'needsDisambiguation',
      activeContentFamily: 'html',
      projectName: 'Spinaura Casino',
      sourceManifest: manifest,
      pages: [],
      shellCandidates: ['_layouts/header.html', '_layouts/footer.html'],
      warnings: [],
      referenceSourceFamily: 'document',
      disambiguation: {
        status: 'pending',
        reason: 'Conflicting template candidates',
        candidateImportKinds: ['html'],
        templateCandidatePaths: ['index.html', 'site/index.html'],
        homeCandidatePaths: ['pages/index.html'],
        selectedImportKind: 'html',
      },
    });

    expect(() => buildPublisherContractsFromIntakeSession(session)).toThrow(
      'Intake disambiguation must be resolved before contracts are generated.',
    );
  });

  it('builds batch metadata prompts and parses strict JSON payloads', () => {
    const pageInput = buildIntakeAiBatchPageInput(
      {
        id: 'bonus',
        name: 'Bonus',
        sourcePath: 'content-source/bonus.md',
        sourceFamily: 'document',
        role: 'article',
        slug: 'bonus',
        path: '/bonus/',
        title: '',
        description: '',
        h1: '',
        sections: [],
        checks: [],
        warnings: [],
        confidence: 0.45,
      },
      'Title\nDescription\n# Bonus\n\nLine 4\nLine 5\nLine 6\nLine 7\nLine 8\nLine 9\nLine 10\nLine 11',
    );
    const prompt = buildIntakeBatchNormalizePrompt({
      pages: [pageInput],
      provider: 'openai',
      model: 'gpt-codex-spark',
    });

    expect(prompt.user).toContain('"slug": "bonus"');
    expect(prompt.user).toContain('Line 9');
    expect(prompt.user).not.toContain('Line 10');

    const result = parseIntakeBatchNormalizeOutput(
      '{"pages":[{"slug":"bonus","title":"Bonus Page","description":"Secondary reference doc","heading":"Bonus Heading","source":"# Bonus Heading"}]}',
    );

    expect(result.pages).toHaveLength(1);
    expect(result.pages[0].heading).toBe('Bonus Heading');
    expect(result.pages[0].source).toContain('Bonus');
  });

  it('rejects incomplete batch metadata payloads', () => {
    expect(() =>
      parseIntakeBatchNormalizeOutput(
        '{"pages":[{"slug":"bonus","title":"Bonus Page","description":"Secondary reference doc","heading":"Bonus Heading"}]}',
      ),
    ).toThrow();
  });

  it('parses batch normalize payload', () => {
    expect(() =>
      parseIntakeBatchNormalizeOutput(
        JSON.stringify({
          pages: [
            {
              slug: 'bonus',
              title: 'Bonus Page',
              description: 'Secondary reference doc',
              heading: 'Bonus Heading',
              source: '# Bonus Heading',
              extra: 'nope',
            },
          ],
          meta: {
            widened: true,
          },
        }),
      ),
    ).toThrow();
  });

  it('keeps imported source paths unique across collisions', () => {
    const basePath = getPublisherImportedSourcePath('foo/index.md', 'bucket-a');
    const existing = new Set([basePath, `${basePath.replace('.md', '__dup-2.md')}`]);
    const resolved = resolveUniqueImportedSourcePath(basePath, existing);

    expect(resolved).toContain('__dup-3.md');
  });

  it('builds deterministic intake session from imported bundle', () => {
    const result = buildImportedBundleAdapter({
      sessionId: 'imported-html-bundle',
      sourceLabel: '/imports/spinaura',
      importKind: 'html',
      sources: hybridSources,
      project: {
        name: 'Spinaura Casino',
        domain: 'spinaura.example',
        defaultLanguage: 'fr',
        multilingual: true,
        languages: ['fr', 'en'],
      },
      htmlDocumentFactory: (source) => createHtmlDocument(source.html ?? source.text ?? ''),
      now: '2026-03-30T12:00:00.000Z',
    });

    expect(result.scan.scenario).toBe('template-plus-documents');
    expect(result.session.id).toBe('imported-html-bundle');
    expect(result.session.status).toBe('reviewing');
    expect(result.session.templateCandidatePath).toBe('index.html');
    expect(result.session.homePageCandidatePath).toBe('pages/index.html');
    expect(result.session.referenceSourceFamily).toBe('document');
    expect(result.session.documentSourcePaths).toEqual(
      expect.arrayContaining(['content-source/index.md', 'content-source/bonus.md']),
    );
    expect(result.reservedFiles['/home/project/.bolt/publisher/intake/session.json']).toBeDefined();
    expect(result.reservedFiles['/home/project/.bolt/publisher/intake/sources/manifest.json']).toBeDefined();
  });

  it('normalizes imported bundle references', () => {
    const result = buildImportedBundleAdapter({
      sessionId: 'imported-html-references',
      sourceLabel: '/imports/spinaura',
      importKind: 'html',
      sources: hybridSources,
      project: {
        name: 'Spinaura Casino',
        defaultLanguage: 'fr',
        multilingual: true,
        languages: ['fr', 'en'],
      },
      htmlDocumentFactory: (source) => createHtmlDocument(source.html ?? source.text ?? ''),
    });
    const sourceManifest = result.session.sourceManifest;
    expect(sourceManifest).toBeDefined();

    const page = result.session.pages.find((entry) => entry.sourcePath === 'pages/privacy.html');
    const manifestEntry = sourceManifest?.sources.find((source) => source.path === 'assets/css/main.css');

    expect(page?.storedSourcePath).toBe('/home/project/.bolt/publisher/intake/sources/imported/pages/privacy.html');
    expect(result.session.assetSourcePaths).toEqual(
      expect.arrayContaining(['assets/css/main.css', 'assets/js/script.js']),
    );
    expect(manifestEntry?.storedPath).toBe('/home/project/.bolt/publisher/intake/sources/imported/assets/css/main.css');
    expect(manifestEntry?.sourceFamilyHint).toBe('asset');
  });

  it('round-trips imported bundle intake sessions', () => {
    const result = buildImportedBundleAdapter({
      sessionId: 'imported-html-roundtrip',
      sourceLabel: '/imports/spinaura',
      importKind: 'html',
      sources: hybridSources,
      project: {
        name: 'Spinaura Casino',
        domain: 'spinaura.example',
        defaultLanguage: 'fr',
        multilingual: true,
        languages: ['fr', 'en'],
      },
      htmlDocumentFactory: (source) => createHtmlDocument(source.html ?? source.text ?? ''),
      now: '2026-03-30T12:00:00.000Z',
    });
    const files = Object.fromEntries(
      Object.entries(result.reservedFiles).map(([path, content]) => [path, { type: 'file', content }]),
    ) as any;
    const globalWithWindow = globalThis as any;

    globalWithWindow.window = { localStorage: createMemoryStorage() };
    saveIntakeSession(result.session);

    const loadedFromFiles = loadIntakeSessionFromFiles(files);
    const loadedFromStorage = loadStoredIntakeSession(result.session.id);
    const sourceManifest = result.session.sourceManifest;
    expect(sourceManifest).toBeDefined();

    expect(loadedFromFiles?.pages.map((page) => page.sourcePath)).toEqual(
      result.session.pages.map((page) => page.sourcePath),
    );
    expect(loadedFromFiles?.sources[0]?.storedPath).toBe(result.session.sources[0]?.storedPath);
    expect(loadedFromStorage?.sourceManifest?.sources.map((source) => source.storedPath)).toEqual(
      sourceManifest?.sources.map((source) => source.storedPath),
    );
    expect(loadedFromStorage?.scriptRuns).toEqual(result.session.scriptRuns);
  });

  it('intake session persistence round-trip keeps unresolved choices, selected fixes, and completion markers', () => {
    const result = buildImportedBundleAdapter({
      sessionId: 'intake-persistence-roundtrip',
      sourceLabel: '/imports/spinaura',
      importKind: 'html',
      sources: hybridSources,
      project: {
        name: 'Spinaura Casino',
        defaultLanguage: 'en',
        multilingual: false,
        languages: ['en'],
      },
      htmlDocumentFactory: (source) => createHtmlDocument(source.html ?? source.text ?? ''),
      now: '2026-03-31T12:00:00.000Z',
    });
    const firstPage = result.session.pages[0];

    result.session.reviewState = {
      unresolvedSourceChoices: {
        'home-candidate': 'pages/index.html',
      },
      selectedFixes: firstPage
        ? {
            [firstPage.id]: {
              title: 'Resolved Home Title',
              h1: 'Resolved Home Heading',
              updatedAt: '2026-03-31T12:05:00.000Z',
            },
          }
        : {},
      completionMarkers: {
        reviewReady: false,
        intakeApplied: false,
        updatedAt: '2026-03-31T12:06:00.000Z',
      },
      selectedBrokenPageIds: firstPage ? [firstPage.id] : [],
    };

    const files = Object.fromEntries(
      Object.entries(serializeIntakeSessionFiles(result.session)).map(([path, content]) => [
        path,
        { type: 'file', content },
      ]),
    ) as any;
    const globalWithWindow = globalThis as any;
    globalWithWindow.window = { localStorage: createMemoryStorage() };

    saveIntakeSession(result.session);

    const loadedFromFiles = loadIntakeSessionFromFiles(files);
    const loadedFromStorage = loadStoredIntakeSession(result.session.id);

    expect(loadedFromFiles?.reviewState?.unresolvedSourceChoices['home-candidate']).toBe('pages/index.html');
    expect(loadedFromFiles?.reviewState?.selectedFixes[firstPage?.id ?? '']?.title).toBe('Resolved Home Title');
    expect(loadedFromFiles?.reviewState?.completionMarkers.updatedAt).toBe('2026-03-31T12:06:00.000Z');
    expect(loadedFromStorage?.reviewState?.selectedBrokenPageIds).toEqual(firstPage ? [firstPage.id] : []);
  });

  it('batch normalize only targets missing metadata pages', () => {
    const result = buildImportedBundleAdapter({
      sessionId: 'imported-batch-review',
      sourceLabel: '/imports/spinaura',
      importKind: 'html',
      sources: hybridSources,
      project: {
        name: 'Spinaura Casino',
        defaultLanguage: 'fr',
        multilingual: true,
        languages: ['fr', 'en'],
      },
      htmlDocumentFactory: (source) => createHtmlDocument(source.html ?? source.text ?? ''),
    });
    const [firstPage, secondPage] = result.session.pages;
    const session = {
      ...result.session,
      pages: result.session.pages.map((page) => {
        if (page.id === firstPage?.id) {
          return {
            ...page,
            title: '',
            description: '',
            h1: '',
          };
        }

        if (page.id === secondPage?.id) {
          return {
            ...page,
            title: page.title || 'Complete title',
            description: page.description || 'Complete description',
            h1: page.h1 || 'Complete heading',
          };
        }

        return page;
      }),
      scriptRuns: [
        {
          id: 'batch-run-1',
          runnerKind: 'ai-extraction' as const,
          provider: 'openai' as const,
          model: 'gpt-4.1-mini',
          inputSummary: `batch:1 pages · ${firstPage?.slug ?? 'home'}`,
          outputSummary: 'pages:1 · missing metadata only',
          success: true,
          createdAt: '2026-03-30T12:05:00.000Z',
        },
      ],
    };

    const reviewState = deriveBatchNormalizeReviewState(session, secondPage?.id ? [secondPage.id] : []);

    expect(reviewState.brokenPageIds).toEqual([firstPage?.id]);
    expect(reviewState.selectedPageIds).toEqual([]);
    expect(reviewState.selectionSummary).toContain('missing metadata only');
    expect(reviewState.affectedPages[0]?.missingFields).toEqual(['title', 'description', 'h1']);
    expect(reviewState.latestBatchRun?.outputSummary).toBe('pages:1 · missing metadata only');
  });

  it('classifies imported pack fixtures', () => {
    const htmlBundle = buildImportedBundleAdapter({
      sessionId: 'fixture-html-bundle',
      sourceLabel: '/fixtures/html-bundle',
      importKind: 'html',
      sources: hybridSources,
      project: {
        name: 'Fixture HTML',
        defaultLanguage: 'en',
        multilingual: false,
        languages: ['en'],
      },
      htmlDocumentFactory: (source) => createHtmlDocument(source.html ?? source.text ?? ''),
    });
    const contentSource = buildImportedBundleAdapter({
      sessionId: 'fixture-content-source',
      sourceLabel: '/fixtures/content-source',
      importKind: 'document',
      sources: contentSourceFixture,
      project: {
        name: 'Fixture Markdown',
        defaultLanguage: 'en',
        multilingual: false,
        languages: ['en'],
      },
    });

    expect(htmlBundle.session.scenario).toBe('template-plus-documents');
    expect(htmlBundle.session.activeContentFamily).toBe('html');
    expect(htmlBundle.session.referenceSourceFamily).toBe('document');
    expect(contentSource.session.scenario).toBe('document-import');
    expect(contentSource.session.activeContentFamily).toBe('document');
    expect(contentSource.session.pages.map((page) => page.sourcePath)).toEqual(
      expect.arrayContaining(['content-source/index.md', 'content-source/about.md']),
    );
  });

  it('preserves raw markdown source across intake artifact roundtrip', () => {
    const source = markdownSource('content-source/raw.md', '# Raw Title\n\nBody');
    const manifest = buildIntakeSourceManifest([source], '/work/content');
    const scan = scanIntakeSourceTree([source], { importKind: 'document' });
    const session = createIntakeSession({
      id: 'session-raw',
      sourceRoot: '/work/content',
      importKind: 'document',
      scenario: 'document-import',
      activeContentFamily: 'document',
      projectName: 'Raw Session',
      sourceManifest: manifest,
      pages: scan.pageCandidates,
      warnings: [],
    });
    const artifacts = serializeIntakeSessionFiles(session);
    const files = Object.fromEntries(
      Object.entries(artifacts).map(([path, content]) => [path, { type: 'file', content }]),
    ) as any;
    const loaded = loadIntakeSessionFromFiles(files);

    expect(loaded?.sources[0]?.text).toBe(source.text);
  });

  it('invalid persisted intake state is rejected', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const files = {
      '/home/project/.bolt/publisher/intake/session.json': {
        type: 'file',
        content: JSON.stringify({
          id: 'broken-session',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          sourceLabel: 'broken',
          importKind: 'html',
          status: 'reviewing',
          scenario: 'html-import',
          activeContentFamily: 'html',
          project: {
            name: 'Broken',
            defaultLanguage: 'en',
            multilingual: false,
            languages: ['en'],
          },
          shellCandidatePaths: [],
          blockLibraryPaths: [],
          warnings: [],
          checks: [],
        }),
      },
      '/home/project/.bolt/publisher/intake/sources/manifest.json': {
        type: 'file',
        content: JSON.stringify([{ id: 's1', path: 'index.html', kind: 'file', size: 10, isBinary: false }]),
      },
      '/home/project/.bolt/publisher/intake/script-runs.json': {
        type: 'file',
        content: JSON.stringify([]),
      },
      '/home/project/.bolt/publisher/intake/pages/home.json': {
        type: 'file',
        content: JSON.stringify({
          id: 'home',
          name: 'Home',
          sourcePath: 'index.html',
          sourceFamily: 'html',
          role: 'home',
          slug: 'home',
          path: '/',
          title: 'Home',
          sections: [],
          checks: [],
          warnings: [],
          confidence: 1,
        }),
      },
    } as any;

    files['/home/project/.bolt/publisher/intake/pages/home.json'].content = JSON.stringify({
      id: 'home',
      name: 'Home',
      sourcePath: 'index.html',
      sourceFamily: 'html',
      role: 'home',
      slug: 'home',
      path: '/',
      title: 'Home',
      sections: [{ id: 's1', kind: 'broken', content: 'x' }],
      checks: [],
      warnings: [],
      confidence: 1,
    });

    expect(loadIntakeSessionFromFiles(files)).toBeUndefined();
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Invalid intake artifacts (/home/project/.bolt/publisher/intake/session.json) pages'),
    );
    errorSpy.mockRestore();
  });

  it('rejects partial completion markers from persisted review state', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const files = {
      '/home/project/.bolt/publisher/intake/session.json': {
        type: 'file',
        content: JSON.stringify({
          id: 'broken-review-state',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          sourceLabel: 'broken',
          importKind: 'html',
          status: 'ready',
          scenario: 'html-import',
          activeContentFamily: 'html',
          project: {
            name: 'Broken',
            defaultLanguage: 'en',
            multilingual: false,
            languages: ['en'],
          },
          shellCandidatePaths: [],
          blockLibraryPaths: [],
          warnings: [],
          checks: [],
          completionBlockers: [],
          reviewTasks: [],
          reviewState: {
            unresolvedSourceChoices: {},
            selectedFixes: {},
            completionMarkers: {
              reviewReady: true,
              intakeApplied: false,
            },
            selectedBrokenPageIds: [],
          },
        }),
      },
      '/home/project/.bolt/publisher/intake/sources/manifest.json': {
        type: 'file',
        content: JSON.stringify([{ id: 's1', path: 'index.html', kind: 'file', size: 10, isBinary: false }]),
      },
      '/home/project/.bolt/publisher/intake/script-runs.json': {
        type: 'file',
        content: JSON.stringify([]),
      },
      '/home/project/.bolt/publisher/intake/pages/home.json': {
        type: 'file',
        content: JSON.stringify({
          id: 'home',
          name: 'Home',
          sourcePath: 'index.html',
          sourceFamily: 'html',
          role: 'home',
          slug: 'home',
          path: '/',
          title: 'Home',
          sections: [],
          checks: [],
          warnings: [],
          confidence: 1,
        }),
      },
    } as any;

    expect(loadIntakeSessionFromFiles(files)).toBeUndefined();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('reviewState.completionMarkers.updatedAt: Required'));
    errorSpy.mockRestore();
  });
});
