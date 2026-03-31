import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { PublisherBlockRegistry, publisherBlockRegistry } from './block-registry';
import { describePublisherSlotEditing, loadPublisherState } from './contracts';
import { assemblePublisherProject, buildTechnicalFileConsistencyChecks } from './assembler';
import { derivePublisherPublishSemantics, runPublisherChecks } from './checker';
import { buildCanonicalUrl, normalizeAbsoluteUrl } from './metadata';
import { derivePublisherWorkflowState } from './status';
import { buildIntakePageChecks } from './intake';
import { buildPublisherContractsFromIntakeSession } from './intake-pipeline';
import { buildImportedBundleAdapter } from './intake-adapter';
import { buildPromptForRepairIntent, deriveRepairIntentFromCheck } from './agent-model';
import {
  categorizePublisherDiagnostic,
  createIntakeReviewDraft,
  derivePublisherDiagnosticOrigin,
  getDiagnosticOriginLabel,
  getPublisherDiagnosticOriginLine,
} from './intake-ui';
import { createPublisherAssetRef } from './file-helpers';
import { normalizePublisherBuildSummary } from './persistence';
import { publisherTemplates } from './templates';
import { getPublisherPrompt } from '~/lib/common/prompts/publisher';
import {
  buildPageRegeneratePrompt,
  buildPreviewRebuildPrompt,
  buildRepairRegeneratePrompt,
  buildSlotRegeneratePrompt,
} from './prompt-context';
import type { FileMap } from '~/lib/stores/files';
import {
  PUBLISHER_PAGES_DIR,
  PUBLISHER_PROJECT_FILE,
  PUBLISHER_PROVENANCE_FILE,
  PUBLISHER_PUBLISH_CONTRACT_FILE,
  PUBLISHER_THEME_FILE,
} from './constants';
import { REQUIRED_STATIC_OUTPUT_FILES, STATIC_SHELL_LINKS } from './static-site-contract';
import type { PublisherBlockDefinition } from '~/types/publisher';
import type { IntakeSourceSnapshot } from '~/types/publisher';
import { PublisherReleaseWorkspace } from '~/components/publisher/PublisherReleaseWorkspace';

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

const importedHtmlBundleFixture: IntakeSourceSnapshot[] = [
  htmlSource(
    'index.html',
    '<!doctype html><html><head><title>Fixture Shell</title></head><body><header>Shell</header><main><h1>Fixture Shell</h1></main></body></html>',
  ),
  htmlSource(
    'pages/index.html',
    '<!doctype html><html><head><title>Fixture Home</title><meta name="description" content="Fixture home description"></head><body><article><h1>Fixture Home</h1><p>Welcome home.</p></article></body></html>',
  ),
  htmlSource(
    'pages/privacy.html',
    '<!doctype html><html><head><title>Privacy Policy</title><meta name="description" content="Privacy fixture page"></head><body><article><h1>Privacy Policy</h1><p>Privacy body.</p></article></body></html>',
  ),
  markdownSource(
    'content-source/index.md',
    `---
title: Fixture Home
description: Fixture reference home
h1: Fixture Home
---

# Fixture Home

Reference content.`,
  ),
];

function createImportedPublisherState(overrides?: {
  mutateSession?: (session: ReturnType<typeof buildImportedBundleAdapter>['session']) => void;
  mutateState?: (state: ReturnType<typeof loadPublisherState>) => void;
}) {
  const result = buildImportedBundleAdapter({
    sessionId: 'publisher-imported-fixture',
    sourceLabel: '/fixtures/imported-html-bundle',
    importKind: 'html',
    sources: importedHtmlBundleFixture,
    project: {
      name: 'Imported Fixture',
      domain: 'fixture.example',
      defaultLanguage: 'en',
      multilingual: false,
      languages: ['en'],
    },
    htmlDocumentFactory: (source) => createHtmlDocument(source.html ?? source.text ?? ''),
    now: '2026-03-30T12:30:00.000Z',
  });
  const session = {
    ...result.session,
    status: 'ready' as const,
  };

  overrides?.mutateSession?.(session);

  const applied = buildPublisherContractsFromIntakeSession(session);
  const files = Object.fromEntries(
    Object.entries(applied.files).map(([filePath, content]) => [
      filePath,
      {
        type: 'file',
        isBinary: content instanceof Uint8Array,
        content: content instanceof Uint8Array ? '' : content,
      },
    ]),
  ) as FileMap;

  const state = loadPublisherState(files);
  overrides?.mutateState?.(state);

  return state;
}

function createPublisherFiles(): FileMap {
  return {
    [PUBLISHER_PROJECT_FILE]: {
      type: 'file',
      isBinary: false,
      content: JSON.stringify(
        {
          id: 'demo-site',
          name: 'Demo Site',
          defaultLanguage: 'en',
          multilingual: false,
          languages: ['en'],
          mode: 'publisher',
          domain: 'demo.example',
          siteUrl: 'https://demo.example',
          pageOrder: ['home'],
          siteSeo: { siteName: 'Demo Site' },
          sharedShell: {
            header: {
              slots: [
                {
                  id: 'header-main',
                  blockId: 'site-header-basic',
                  props: {
                    brandName: 'Demo',
                    primaryLinkLabel: 'Home',
                    primaryLinkHref: '/',
                    secondaryLinkLabel: 'Contact',
                    secondaryLinkHref: '/contact/',
                  },
                },
              ],
            },
            footer: {
              slots: [
                {
                  id: 'footer-main',
                  blockId: 'site-footer-simple',
                  props: {
                    copyright: '© Demo',
                    footerLinkLabel: 'Privacy',
                    footerLinkHref: '/privacy/',
                  },
                },
              ],
            },
          },
        },
        null,
        2,
      ),
    },
    [PUBLISHER_THEME_FILE]: {
      type: 'file',
      isBinary: false,
      content: JSON.stringify(
        {
          themeId: 'default',
          tokens: {
            'color.primary': '#1d4ed8',
          },
        },
        null,
        2,
      ),
    },
    [`${PUBLISHER_PAGES_DIR}/home.json`]: {
      type: 'file',
      isBinary: false,
      content: JSON.stringify(
        {
          id: 'home',
          slug: 'home',
          name: 'Home',
          path: '/',
          zones: {
            content: {
              slots: [
                {
                  id: 'hero',
                  blockId: 'hero-centered',
                  props: {
                    eyebrow: 'Fast static delivery',
                    title: 'Publisher Mode',
                    body: 'Zone-first assembly for reusable static sites.',
                    primaryCtaLabel: 'Start',
                    primaryCtaHref: '/',
                  },
                },
              ],
            },
          },
          seo: {
            title: 'Publisher Mode',
            description: 'Structured static site generation',
            schemaType: 'WebPage',
          },
        },
        null,
        2,
      ),
    },
  };
}

describe('publisher workflow', () => {
  it('keeps block templates heading-free', () => {
    const combinedTemplates = Object.values(publisherTemplates).join('\n').toLowerCase();

    expect(combinedTemplates).not.toMatch(/<h[1-6][\s>]/);
  });

  it('keeps prose ownership in content zone only', () => {
    const blocks = publisherBlockRegistry.listAll();
    const contentProse = blocks.find((block) => block.id === 'content-prose');

    expect(contentProse).toBeDefined();
    expect(contentProse?.allowedZones).toEqual(['content']);

    const proseSlotBlockIds = blocks
      .filter((block) => block.slots.some((slot) => slot.kind === 'richtext'))
      .map((block) => block.id)
      .sort();

    expect(proseSlotBlockIds).toEqual(['content-prose']);
  });

  it('prevents non-content blocks from carrying html payload slots', () => {
    const htmlSlotOutsideContent = publisherBlockRegistry
      .listAll()
      .filter(
        (block) =>
          block.allowedZones.some((zone) => zone !== 'content') &&
          block.slots.some((slot) => slot.key === 'html' || slot.kind === 'richtext'),
      )
      .map((block) => block.id);

    expect(htmlSlotOutsideContent).toEqual([]);
  });

  it('loads project contracts from reserved files', () => {
    const state = loadPublisherState(createPublisherFiles());

    expect(state.project?.id).toBe('demo-site');
    expect(state.project?.defaultLanguage).toBe('en');
    expect(state.pages).toHaveLength(1);
    expect(state.issues).toHaveLength(0);
  });

  it('migrates legacy language contracts to defaultLanguage', () => {
    const files = createPublisherFiles();
    files[PUBLISHER_PROJECT_FILE] = {
      type: 'file',
      isBinary: false,
      content: JSON.stringify(
        {
          id: 'legacy-site',
          name: 'Legacy Site',
          language: 'de',
          mode: 'publisher',
        },
        null,
        2,
      ),
    };

    const state = loadPublisherState(files);

    expect(state.project?.defaultLanguage).toBe('de');
    expect(state.project?.languages).toEqual(['de']);
  });

  it('builds normalized checks', () => {
    const state = loadPublisherState(createPublisherFiles());
    const checks = runPublisherChecks(state, publisherBlockRegistry);

    expect(checks.some((report) => report.name === 'working-gate')).toBe(true);
    expect(checks.some((report) => report.name === 'release-gate')).toBe(true);
    expect(checks.some((report) => report.status === 'fail')).toBe(false);
  });

  it('template integrity diagnostics catch heading tags in decorative templates', () => {
    const state = loadPublisherState(createPublisherFiles());
    const registry = new PublisherBlockRegistry(publisherBlockRegistry.listAll(), {
      ...publisherTemplates,
      'site-header-basic.html': '<header><h2>Injected</h2></header>',
    });
    const checks = runPublisherChecks(state, registry);
    const headingInjection = checks.find((report) => report.name === 'template-heading-injection');

    expect(headingInjection?.status).toBe('fail');
    expect(headingInjection?.pageId).toBe('home');
    expect(headingInjection?.zone).toBe('header');
  });

  it('template integrity diagnostics flag decorative zones with html payload', () => {
    const files = createPublisherFiles();
    files[`${PUBLISHER_PAGES_DIR}/home.json`] = {
      type: 'file',
      isBinary: false,
      content: JSON.stringify(
        {
          id: 'home',
          slug: 'home',
          name: 'Home',
          path: '/',
          zones: {
            beforeContent: {
              slots: [
                {
                  id: 'banner',
                  blockId: 'before-content-band',
                  props: {
                    eyebrow: 'Notice',
                    message: 'Summary',
                    html: '<p>Full article text should not live here.</p>',
                  },
                },
              ],
            },
            content: {
              slots: [
                {
                  id: 'hero',
                  blockId: 'hero-centered',
                  props: {
                    eyebrow: 'Fast static delivery',
                    title: 'Publisher Mode',
                    body: 'Zone-first assembly for reusable static sites.',
                    primaryCtaLabel: 'Start',
                    primaryCtaHref: '/',
                  },
                },
              ],
            },
          },
          seo: {
            title: 'Publisher Mode',
            description: 'Structured static site generation',
            schemaType: 'WebPage',
          },
        },
        null,
        2,
      ),
    };

    const checks = runPublisherChecks(loadPublisherState(files), publisherBlockRegistry);
    const payloadInjection = checks.find((report) => report.name === 'decorative-zone-content-injection');

    expect(payloadInjection?.status).toBe('fail');
    expect(payloadInjection?.pageId).toBe('home');
    expect(payloadInjection?.zone).toBe('beforeContent');
  });

  it('template integrity diagnostics flag decorative zones that own primary prose', () => {
    const files = createPublisherFiles();
    files[`${PUBLISHER_PAGES_DIR}/home.json`] = {
      type: 'file',
      isBinary: false,
      content: JSON.stringify(
        {
          id: 'home',
          slug: 'home',
          name: 'Home',
          path: '/',
          zones: {
            beforeContent: {
              slots: [
                {
                  id: 'banner',
                  blockId: 'before-content-band',
                  props: {
                    eyebrow: 'Notice',
                    message: 'Summary',
                    html: '<p>This decorative band carries the entire primary article narrative with extra details.</p><p>Another paragraph.</p>',
                  },
                },
              ],
            },
            content: {
              slots: [
                {
                  id: 'main',
                  blockId: 'content-prose',
                  props: {
                    sectionTitle: 'Body',
                    html: '<p>Short.</p>',
                  },
                },
              ],
            },
          },
          seo: {
            title: 'Publisher Mode',
            description: 'Structured static site generation',
            schemaType: 'WebPage',
          },
        },
        null,
        2,
      ),
    };

    const checks = runPublisherChecks(loadPublisherState(files), publisherBlockRegistry);
    const primaryOwnership = checks.find((report) => report.name === 'decorative-zone-primary-content');

    expect(primaryOwnership?.status).toBe('fail');
    expect(primaryOwnership?.pageId).toBe('home');
    expect(primaryOwnership?.zone).toBe('beforeContent');
  });

  it('assembles preview-ready static output', () => {
    const state = loadPublisherState(createPublisherFiles());
    const result = assemblePublisherProject(state, publisherBlockRegistry, { mode: 'publisher', currentPage: 'home' });
    const indexHtml = result.files['/home/project/.bolt/publisher/generated/index.html'];

    expect(indexHtml).toContain('Publisher Mode');
    expect(indexHtml).toContain('<link rel="canonical" href="https://demo.example/"');
    REQUIRED_STATIC_OUTPUT_FILES.forEach((requiredFilePath) => {
      expect(result.files).toHaveProperty(requiredFilePath);
    });
    expect(indexHtml).toContain(`<link rel="manifest" href="${STATIC_SHELL_LINKS.manifestHref}" />`);
    expect(indexHtml).toContain(`<link rel="stylesheet" href="${STATIC_SHELL_LINKS.cssHref}" />`);
    expect(indexHtml).toContain(`<script src="${STATIC_SHELL_LINKS.jsSrc}"></script>`);
    expect(result.files['/home/project/.bolt/publisher/generated/assets/css/main.css']).toContain('--color-primary');
    expect(result.files['/home/project/.bolt/publisher/generated/provenance.json']).toContain('"pageSourceMap"');
    expect(result.files['/home/project/.bolt/publisher/generated/provenance.json']).toContain('"artifacts"');
    expect(result.files[PUBLISHER_PUBLISH_CONTRACT_FILE]).toContain('"schemaVersion": "1.0.0"');
    expect(result.files[PUBLISHER_PUBLISH_CONTRACT_FILE]).toContain('"rollback"');
    expect(result.files['/home/project/.bolt/publisher/checks.json']).toContain('working-gate');
    expect(result.build.artifacts.length).toBeGreaterThan(0);
    expect(result.build.publishContractPath).toBe(PUBLISHER_PUBLISH_CONTRACT_FILE);
    expect(result.build.releaseFailures).toBe(0);
    expect(result.pipeline.schemaVersion).toBe('1.0.0');
    expect(result.pipeline.stageOrder).toEqual(['assemble', 'optimize', 'check', 'export']);
    expect(result.pipeline.deliveryStage).toBe('export');
    expect(result.pipeline.stages.map((stage) => stage.stage)).toEqual(['assemble', 'optimize', 'check', 'export']);
    expect(result.pipeline.stages.every((stage) => stage.summary.length > 0)).toBe(true);
    expect(result.pipeline.activeStage).toBe('export');
    expect(result.pipeline.failedStage).toBeUndefined();
    expect(result.pipeline.jobs).toHaveLength(4);
    expect(result.pipeline.jobs.map((job) => job.stage)).toEqual(['assemble', 'optimize', 'check', 'export']);
    expect(result.pipeline.publishContract.canPublish).toBe(true);
    expect(result.pipeline.publishContract.publishBlockers).toEqual([]);
    expect(result.pipeline.publishContract.artifactPath).toBe(PUBLISHER_PUBLISH_CONTRACT_FILE);
    expect(
      result.checks.some((report) => report.name === 'technical-file-consistency' && report.status === 'fail'),
    ).toBe(false);
    expect(JSON.parse(result.files['/home/project/.bolt/publisher/state.json']).latestBuild.pipeline.jobs).toHaveLength(
      4,
    );
  });

  it('fails technical-file-consistency when required static output files are missing', () => {
    const state = loadPublisherState(createPublisherFiles());
    const result = assemblePublisherProject(state, publisherBlockRegistry, { mode: 'publisher', currentPage: 'home' });
    const mutatedFiles = { ...result.files };

    delete mutatedFiles['/home/project/.bolt/publisher/generated/assets/js/main.js'];

    const checks = buildTechnicalFileConsistencyChecks(mutatedFiles);
    const semantics = derivePublisherPublishSemantics([...result.checks, ...checks]);

    expect(checks.some((report) => report.name === 'technical-file-consistency' && report.status === 'fail')).toBe(
      true,
    );
    expect(checks[0]?.details?.some((detail) => detail.startsWith('Rule:'))).toBe(true);
    expect(checks[0]?.details?.some((detail) => detail.startsWith('Fix:'))).toBe(true);
    expect(checks[0]?.details?.some((detail) => detail.includes('assets/js/main.js'))).toBe(true);
    expect(semantics.canPublish).toBe(false);
    expect(semantics.publishBlockers.some((value) => value.includes('technical-file-consistency'))).toBe(true);
  });

  it('preserves source heading hierarchy in generated html', () => {
    const state = createImportedPublisherState({
      mutateSession: (session) => {
        const home = session.pages.find((page) => page.id === 'home');

        if (!home) {
          throw new Error('Expected home page fixture');
        }

        home.sections = [
          {
            id: 'overview',
            kind: 'richtext',
            heading: 'Overview',
            level: 2,
            content: 'Primary overview copy.',
          },
          {
            id: 'details',
            kind: 'richtext',
            heading: 'Details',
            level: 3,
            content: 'Nested details copy.',
          },
        ];
      },
    });

    const assembled = assemblePublisherProject(state, publisherBlockRegistry, {
      mode: 'publisher',
      currentPage: 'home',
    });
    const html = assembled.files['/home/project/.bolt/publisher/generated/index.html'];

    expect(html).toContain('<h2>Overview</h2>');
    expect(html).toContain('<h3>Details</h3>');
    expect(html).not.toContain('<h1>Overview</h1>');
  });

  it('table and media wrappers are normalized in rich html output', () => {
    const files = createPublisherFiles();
    files[`${PUBLISHER_PAGES_DIR}/home.json`] = {
      type: 'file',
      isBinary: false,
      content: JSON.stringify(
        {
          id: 'home',
          slug: 'home',
          name: 'Home',
          path: '/',
          zones: {
            content: {
              slots: [
                {
                  id: 'main',
                  blockId: 'content-prose',
                  props: {
                    sectionTitle: 'Body',
                    html: '<table><tr><td>Cell</td></tr></table><p><img src="/assets/image.png" alt="Demo" /></p>',
                  },
                },
              ],
            },
          },
          seo: {
            title: 'Publisher Mode',
            description: 'Structured static site generation',
            schemaType: 'WebPage',
          },
        },
        null,
        2,
      ),
    };

    const result = assemblePublisherProject(loadPublisherState(files), publisherBlockRegistry, {
      mode: 'publisher',
      currentPage: 'home',
    });
    const html = result.files['/home/project/.bolt/publisher/generated/index.html'];

    expect(html).toContain(
      '<div class="publisher-table-scroll" data-contract="table-scroll"><table class="publisher-table">',
    );
    expect(html).toContain('class="publisher-rich-media"');
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('decoding="async"');
  });

  it('mobile readability css includes table and rich media rules', () => {
    const result = assemblePublisherProject(loadPublisherState(createPublisherFiles()), publisherBlockRegistry, {
      mode: 'publisher',
      currentPage: 'home',
    });
    const css = result.files['/home/project/.bolt/publisher/generated/assets/css/main.css'];

    expect(css).toContain('.publisher-table-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; }');
    expect(css).toContain('.publisher-table { width: 100%; border-collapse: collapse; min-width: 640px; }');
    expect(css).toContain('.publisher-rich-media { max-width: 100%; height: auto; display: block; }');
  });

  it('mobile readability release checks fail unnormalized rich table and media payloads', () => {
    const files = createPublisherFiles();
    files[`${PUBLISHER_PAGES_DIR}/home.json`] = {
      type: 'file',
      isBinary: false,
      content: JSON.stringify(
        {
          id: 'home',
          slug: 'home',
          name: 'Home',
          path: '/',
          zones: {
            content: {
              slots: [
                {
                  id: 'main',
                  blockId: 'content-prose',
                  props: {
                    sectionTitle: 'Body',
                    html: '<table><tr><td>Cell</td></tr></table><p><img src="/assets/image.png" alt="Demo" /></p>',
                  },
                },
              ],
            },
          },
          seo: {
            title: 'Publisher Mode',
            description: 'Structured static site generation',
            schemaType: 'WebPage',
          },
        },
        null,
        2,
      ),
    };

    const checks = runPublisherChecks(loadPublisherState(files), publisherBlockRegistry);
    const wrapperCheck = checks.find((check) => check.name === 'table-media-wrapper');

    expect(wrapperCheck?.status).toBe('fail');
    expect(wrapperCheck?.gate).toBe('release');
    expect(wrapperCheck?.details?.some((detail) => detail.startsWith('Rule:'))).toBe(true);
    expect(wrapperCheck?.details?.some((detail) => detail.startsWith('Fix:'))).toBe(true);
  });

  it('mobile readability release checks pass when rich table and media payloads are normalized', () => {
    const files = createPublisherFiles();
    files[`${PUBLISHER_PAGES_DIR}/home.json`] = {
      type: 'file',
      isBinary: false,
      content: JSON.stringify(
        {
          id: 'home',
          slug: 'home',
          name: 'Home',
          path: '/',
          zones: {
            content: {
              slots: [
                {
                  id: 'main',
                  blockId: 'content-prose',
                  props: {
                    sectionTitle: 'Body',
                    html: '<div class="publisher-table-scroll" data-contract="table-scroll"><table class="publisher-table"><tr><td>Cell</td></tr></table></div><p><img class="publisher-rich-media" src="/assets/image.png" alt="Demo" loading="lazy" decoding="async" /></p>',
                  },
                },
              ],
            },
          },
          seo: {
            title: 'Publisher Mode',
            description: 'Structured static site generation',
            schemaType: 'WebPage',
          },
        },
        null,
        2,
      ),
    };

    const checks = runPublisherChecks(loadPublisherState(files), publisherBlockRegistry);

    expect(checks.some((check) => check.name === 'table-media-wrapper' && check.status === 'fail')).toBe(false);
  });

  it('blocks publish contract when release checks fail', () => {
    const files = createPublisherFiles();
    files[PUBLISHER_PROJECT_FILE] = {
      type: 'file',
      isBinary: false,
      content: JSON.stringify(
        {
          id: 'demo-site',
          name: 'Demo Site',
          defaultLanguage: 'en',
          multilingual: false,
          languages: ['en'],
          mode: 'publisher',
        },
        null,
        2,
      ),
    };

    const state = loadPublisherState(files);
    const result = assemblePublisherProject(state, publisherBlockRegistry, { mode: 'publisher', currentPage: 'home' });

    expect(result.build.releaseFailures).toBeGreaterThan(0);
    expect(result.pipeline.publishContract.canPublish).toBe(false);
    expect(result.pipeline.publishContract.publishBlockers.some((value) => value.includes('site-url'))).toBe(true);
    expect(result.pipeline.failedStage).toBe('check');
    expect(result.pipeline.activeStage).toBe('check');
    expect(result.pipeline.stages.find((stage) => stage.stage === 'check')?.status).toBe('failed');
    expect(result.pipeline.jobs.find((job) => job.stage === 'check')?.status).toBe('failed');
    expect(result.pipeline.stages.find((stage) => stage.stage === 'export')?.status).toBe('failed');
    expect(result.pipeline.jobs.find((job) => job.stage === 'export')?.status).toBe('failed');
  });

  it('records staged execution metadata with deterministic stage-to-job linkage', () => {
    const state = loadPublisherState(createPublisherFiles());
    const result = assemblePublisherProject(state, publisherBlockRegistry, { mode: 'publisher', currentPage: 'home' });

    expect(result.pipeline.stages).toHaveLength(4);
    expect(result.pipeline.stages.every((stage) => Boolean(stage.startedAt) && Boolean(stage.finishedAt))).toBe(true);
    expect(result.pipeline.stages.map((stage) => stage.status)).toEqual([
      'completed',
      'completed',
      'completed',
      'completed',
    ]);
    expect(result.pipeline.jobs).toHaveLength(result.pipeline.stages.length);
    expect(result.pipeline.jobs.every((job) => job.id.startsWith(`${result.build.id}:`))).toBe(true);
    expect(result.pipeline.jobs.map((job) => job.details?.[0])).toEqual(
      result.pipeline.stages.map((stage) => stage.summary),
    );
    expect(result.build.stage).toBe('export');
    expect(result.build.pipeline?.activeStage).toBe('export');
  });

  it('propagates check-stage failures into export diagnostics and generated publish artifacts', () => {
    const files = createPublisherFiles();
    files[PUBLISHER_PROJECT_FILE] = {
      type: 'file',
      isBinary: false,
      content: JSON.stringify(
        {
          id: 'demo-site',
          name: 'Demo Site',
          defaultLanguage: 'en',
          multilingual: false,
          languages: ['en'],
          mode: 'publisher',
        },
        null,
        2,
      ),
    };

    const state = loadPublisherState(files);
    const result = assemblePublisherProject(state, publisherBlockRegistry, { mode: 'publisher', currentPage: 'home' });
    const checkStage = result.pipeline.stages.find((stage) => stage.stage === 'check');
    const exportStage = result.pipeline.stages.find((stage) => stage.stage === 'export');
    const publishContractArtifact = JSON.parse(
      result.files[PUBLISHER_PUBLISH_CONTRACT_FILE],
    ) as typeof result.pipeline.publishContract;
    const provenance = JSON.parse(result.files[PUBLISHER_PROVENANCE_FILE]) as { publishContractPath?: string };

    expect(checkStage?.status).toBe('failed');
    expect(checkStage?.details.some((detail) => detail.includes('site-url'))).toBe(true);
    expect(exportStage?.status).toBe('failed');
    expect(exportStage?.blockingReason).toContain('check-stage failures');
    expect(exportStage?.details).toEqual(expect.arrayContaining(checkStage?.details ?? []));
    expect(result.pipeline.publishContract.publishBlockers.some((value) => value.startsWith('release:site-url:'))).toBe(
      true,
    );
    expect(publishContractArtifact.canPublish).toBe(false);
    expect(publishContractArtifact.publishBlockers).toEqual(result.pipeline.publishContract.publishBlockers);
    expect(provenance.publishContractPath).toBe(PUBLISHER_PUBLISH_CONTRACT_FILE);
  });

  it('surfaces invalid page JSON as issues', () => {
    const files = createPublisherFiles();
    files[`${PUBLISHER_PAGES_DIR}/home.json`] = {
      type: 'file',
      isBinary: false,
      content: '{"id":"home"}',
    };

    const state = loadPublisherState(files);

    expect(state.issues.some((report) => report.name === 'publisher-schema')).toBe(true);
  });

  it('fails release checks when siteUrl is missing', () => {
    const files = createPublisherFiles();
    files[PUBLISHER_PROJECT_FILE] = {
      type: 'file',
      isBinary: false,
      content: JSON.stringify(
        {
          id: 'demo-site',
          name: 'Demo Site',
          defaultLanguage: 'en',
          multilingual: false,
          languages: ['en'],
          mode: 'publisher',
        },
        null,
        2,
      ),
    };

    const state = loadPublisherState(files);
    const checks = runPublisherChecks(state, publisherBlockRegistry);

    expect(checks.some((report) => report.name === 'site-url' && report.status === 'fail')).toBe(true);
    expect(checks.some((report) => report.name === 'release-gate' && report.status === 'fail')).toBe(true);
  });

  it('normalizes canonical URL variants before sitemap consistency checks', () => {
    const files = createPublisherFiles();
    files[`${PUBLISHER_PAGES_DIR}/home.json`] = {
      type: 'file',
      isBinary: false,
      content: JSON.stringify(
        {
          id: 'home',
          slug: 'home',
          name: 'Home',
          path: '/',
          zones: {
            content: {
              slots: [
                {
                  id: 'hero',
                  blockId: 'hero-centered',
                  props: {
                    eyebrow: 'Fast static delivery',
                    title: 'Publisher Mode',
                    body: 'Zone-first assembly for reusable static sites.',
                    primaryCtaLabel: 'Start',
                    primaryCtaHref: '/',
                  },
                },
              ],
            },
          },
          seo: {
            title: 'Publisher Mode',
            description: 'Structured static site generation',
            schemaType: 'WebPage',
            canonicalPath: '/landing',
          },
        },
        null,
        2,
      ),
    };

    const state = loadPublisherState(files);
    const checks = runPublisherChecks(state, publisherBlockRegistry);

    expect(checks.some((report) => report.name === 'sitemap-canonical-consistency' && report.status === 'fail')).toBe(
      false,
    );
  });

  it('canonical URL normalization still fails true canonical collisions', () => {
    const files = createPublisherFiles();
    files[`${PUBLISHER_PAGES_DIR}/about.json`] = {
      type: 'file',
      isBinary: false,
      content: JSON.stringify(
        {
          id: 'about',
          slug: 'about',
          name: 'About',
          path: '/about',
          zones: {
            content: {
              slots: [],
            },
          },
          seo: {
            title: 'About',
            description: 'About page',
            canonicalPath: '/landing/',
          },
        },
        null,
        2,
      ),
    };
    files[`${PUBLISHER_PAGES_DIR}/home.json`] = {
      type: 'file',
      isBinary: false,
      content: JSON.stringify(
        {
          id: 'home',
          slug: 'home',
          name: 'Home',
          path: '/landing',
          zones: {
            content: {
              slots: [],
            },
          },
          seo: {
            title: 'Home',
            description: 'Home page',
            canonicalPath: '/landing',
          },
        },
        null,
        2,
      ),
    };

    const checks = runPublisherChecks(loadPublisherState(files), publisherBlockRegistry);

    expect(checks.some((report) => report.name === 'canonical-collision' && report.status === 'fail')).toBe(true);
    expect(normalizeAbsoluteUrl('https://demo.example/page/')).toBe(normalizeAbsoluteUrl('https://demo.example/page'));
    expect(normalizeAbsoluteUrl('https://demo.example/page-a/')).not.toBe(
      normalizeAbsoluteUrl('https://demo.example/page-b/'),
    );
  });

  it('fails release checks when a block uses unsafe link protocols', () => {
    const files = createPublisherFiles();
    files[`${PUBLISHER_PAGES_DIR}/home.json`] = {
      type: 'file',
      isBinary: false,
      content: JSON.stringify(
        {
          id: 'home',
          slug: 'home',
          name: 'Home',
          path: '/',
          zones: {
            content: {
              slots: [
                {
                  id: 'hero',
                  blockId: 'hero-centered',
                  props: {
                    eyebrow: 'Fast static delivery',
                    title: 'Publisher Mode',
                    body: 'Zone-first assembly for reusable static sites.',
                    primaryCtaLabel: 'Start',
                    primaryCtaHref: 'javascript:alert(1)',
                  },
                },
              ],
            },
          },
          seo: {
            title: 'Publisher Mode',
            description: 'Structured static site generation',
            schemaType: 'WebPage',
          },
        },
        null,
        2,
      ),
    };

    const state = loadPublisherState(files);
    const checks = runPublisherChecks(state, publisherBlockRegistry);

    expect(checks.some((report) => report.name === 'link-policy' && report.status === 'fail')).toBe(true);
    expect(checks.some((report) => report.name === 'release-gate' && report.status === 'fail')).toBe(true);
  });

  it('zone link policy fails decorative-zone ambiguous host links', () => {
    const files = createPublisherFiles();
    files[PUBLISHER_PROJECT_FILE] = {
      type: 'file',
      isBinary: false,
      content: JSON.stringify(
        {
          id: 'demo-site',
          name: 'Demo Site',
          defaultLanguage: 'en',
          multilingual: false,
          languages: ['en'],
          mode: 'publisher',
          domain: 'demo.example',
          siteUrl: 'https://demo.example',
          pageOrder: ['home'],
          siteSeo: { siteName: 'Demo Site' },
          sharedShell: {
            header: {
              slots: [
                {
                  id: 'header-main',
                  blockId: 'site-header-basic',
                  props: {
                    brandName: 'Demo',
                    primaryLinkLabel: 'Home',
                    primaryLinkHref: 'www.example.com',
                    secondaryLinkLabel: 'Contact',
                    secondaryLinkHref: '/contact/',
                  },
                },
              ],
            },
          },
        },
        null,
        2,
      ),
    };

    const checks = runPublisherChecks(loadPublisherState(files), publisherBlockRegistry);
    const zoneReport = checks.find((report) => report.name === 'zone-link-policy' && report.zone === 'header');

    expect(zoneReport?.status).toBe('fail');
    expect(zoneReport?.pageId).toBe('home');
    expect(checks.some((report) => report.name === 'release-gate' && report.status === 'fail')).toBe(true);
  });

  it('zone link policy allows normalized decorative links and keeps content policy strict', () => {
    const files = createPublisherFiles();
    files[PUBLISHER_PROJECT_FILE] = {
      type: 'file',
      isBinary: false,
      content: JSON.stringify(
        {
          id: 'demo-site',
          name: 'Demo Site',
          defaultLanguage: 'en',
          multilingual: false,
          languages: ['en'],
          mode: 'publisher',
          domain: 'demo.example',
          siteUrl: 'https://demo.example',
          pageOrder: ['home'],
          siteSeo: { siteName: 'Demo Site' },
          sharedShell: {
            header: {
              slots: [
                {
                  id: 'header-main',
                  blockId: 'site-header-basic',
                  props: {
                    brandName: 'Demo',
                    primaryLinkLabel: 'Home',
                    primaryLinkHref: 'https://www.example.com',
                    secondaryLinkLabel: 'Contact',
                    secondaryLinkHref: '/contact/',
                  },
                },
              ],
            },
          },
        },
        null,
        2,
      ),
    };
    files[`${PUBLISHER_PAGES_DIR}/home.json`] = {
      type: 'file',
      isBinary: false,
      content: JSON.stringify(
        {
          id: 'home',
          slug: 'home',
          name: 'Home',
          path: '/',
          zones: {
            content: {
              slots: [
                {
                  id: 'hero',
                  blockId: 'hero-centered',
                  props: {
                    eyebrow: 'Fast static delivery',
                    title: 'Publisher Mode',
                    body: 'Zone-first assembly for reusable static sites.',
                    primaryCtaLabel: 'Start',
                    primaryCtaHref: 'javascript:alert(1)',
                  },
                },
              ],
            },
          },
          seo: {
            title: 'Publisher Mode',
            description: 'Structured static site generation',
            schemaType: 'WebPage',
          },
        },
        null,
        2,
      ),
    };

    const checks = runPublisherChecks(loadPublisherState(files), publisherBlockRegistry);

    expect(checks.some((report) => report.name === 'zone-link-policy')).toBe(false);
    expect(checks.some((report) => report.name === 'link-policy' && report.status === 'fail')).toBe(true);
  });

  it('fails release checks when output references internal publisher asset paths', () => {
    const files = createPublisherFiles();
    files[`${PUBLISHER_PAGES_DIR}/home.json`] = {
      type: 'file',
      isBinary: false,
      content: JSON.stringify(
        {
          id: 'home',
          slug: 'home',
          name: 'Home',
          path: '/',
          zones: {
            content: {
              slots: [
                {
                  id: 'hero',
                  blockId: 'hero-centered',
                  props: {
                    eyebrow: 'Fast static delivery',
                    title: 'Publisher Mode',
                    body: 'Zone-first assembly for reusable static sites.',
                    heroImage: '/.bolt/publisher/assets/hero-logo-a123.png',
                    primaryCtaLabel: 'Start',
                    primaryCtaHref: '/',
                  },
                },
              ],
            },
          },
          seo: {
            title: 'Publisher Mode',
            description: 'Structured static site generation',
            schemaType: 'WebPage',
          },
        },
        null,
        2,
      ),
    };

    const state = loadPublisherState(files);
    const checks = runPublisherChecks(state, publisherBlockRegistry);

    expect(checks.some((report) => report.name === 'managed-asset-internal-path' && report.status === 'fail')).toBe(
      true,
    );
  });

  it('maps publish blockers from canonical release diagnostics without synthetic gate duplicates', () => {
    const files = createPublisherFiles();
    files[PUBLISHER_PROJECT_FILE] = {
      type: 'file',
      isBinary: false,
      content: JSON.stringify(
        {
          id: 'demo-site',
          name: 'Demo Site',
          defaultLanguage: 'en',
          multilingual: false,
          languages: ['en'],
          mode: 'publisher',
        },
        null,
        2,
      ),
    };

    const state = loadPublisherState(files);
    const result = assemblePublisherProject(state, publisherBlockRegistry, { mode: 'publisher', currentPage: 'home' });
    const blockers = result.pipeline.publishContract.publishBlockers;
    const warnings = result.pipeline.publishContract.publishWarnings;

    expect(blockers.length).toBeGreaterThan(0);
    expect(blockers.some((value) => value.startsWith('release:site-url:'))).toBe(true);
    expect(blockers.some((value) => value.includes('release-gate'))).toBe(false);
    expect(warnings.every((value) => value.startsWith('release:'))).toBe(true);
  });

  it('writes publish contract artifact aligned with pipeline metadata and rebuild strategy', () => {
    const state = loadPublisherState(createPublisherFiles());
    const result = assemblePublisherProject(state, publisherBlockRegistry, { mode: 'publisher', currentPage: 'home' });
    const publishContract = JSON.parse(
      result.files[PUBLISHER_PUBLISH_CONTRACT_FILE],
    ) as typeof result.pipeline.publishContract;

    expect(publishContract.buildId).toBe(result.build.id);
    expect(publishContract.artifactPath).toBe(PUBLISHER_PUBLISH_CONTRACT_FILE);
    expect(publishContract.deliveryStage).toBe(result.pipeline.deliveryStage);
    expect(publishContract.canPublish).toBe(result.pipeline.publishContract.canPublish);
    expect(publishContract.publishBlockers).toEqual(result.pipeline.publishContract.publishBlockers);
    expect(publishContract.publishWarnings).toEqual(result.pipeline.publishContract.publishWarnings);
    expect(publishContract.rollback.strategy).toBe('rebuild');
    expect(publishContract.rollback.keepLastBuilds).toBeGreaterThan(0);
    expect(publishContract.rollback.sourceOfTruth).toContain('project');
    expect(publishContract.rollback.requiredArtifacts).toContain('/home/project/.bolt/publisher/checks.json');
  });

  it('keeps publish contract semantics deterministic across rebuilds', () => {
    const state = loadPublisherState(createPublisherFiles());
    const first = assemblePublisherProject(state, publisherBlockRegistry, { mode: 'publisher', currentPage: 'home' });
    const second = assemblePublisherProject(state, publisherBlockRegistry, { mode: 'publisher', currentPage: 'home' });

    const normalizeContract = (value: typeof first.pipeline.publishContract) => {
      const { buildId: _buildId, generatedAt: _generatedAt, artifact, ...rest } = value;

      return {
        ...rest,
        artifact: artifact
          ? {
              ...artifact,
              generatedAt: '<normalized>',
            }
          : undefined,
      };
    };

    const firstContract = normalizeContract(JSON.parse(first.files[PUBLISHER_PUBLISH_CONTRACT_FILE]));
    const secondContract = normalizeContract(JSON.parse(second.files[PUBLISHER_PUBLISH_CONTRACT_FILE]));

    expect(firstContract).toEqual(secondContract);
    expect(firstContract.artifactFingerprint).toBe(secondContract.artifactFingerprint);
    expect(firstContract.sourceFingerprint).toBe(secondContract.sourceFingerprint);
  });

  it('builds absolute canonical URLs from project siteUrl', () => {
    const state = loadPublisherState(createPublisherFiles());
    const canonical = buildCanonicalUrl(state.pages[0], state.project?.siteUrl);

    expect(canonical).toBe('https://demo.example/');
  });

  it('normalizes legacy block manifests and exposes effective registry metadata', () => {
    const registry = new PublisherBlockRegistry([
      {
        id: 'legacy-hero',
        zone: 'content',
        variant: 'legacy',
        name: 'Legacy Hero',
        tags: ['hero'],
        slots: [{ key: 'title', label: 'Title', required: true, kind: 'text' }],
        tokenKeys: [],
        templateFile: 'hero-centered.html',
        source: 'library',
        schemaVersion: 1,
        allowedZones: ['content', 'beforeContent'],
        deprecation: {
          status: 'deprecated',
          replacementBlockId: 'hero-centered',
          message: 'Use the centered hero.',
        },
      } satisfies PublisherBlockDefinition,
    ]);

    expect(registry.getEffectiveSchemaVersion('legacy-hero')).toBe(1);
    expect(registry.getAllowedZones('legacy-hero')).toEqual(['content', 'beforeContent']);
    expect(registry.listByZone('beforeContent').map((block) => block.id)).toContain('legacy-hero');
    expect(registry.getDeprecationMeta('legacy-hero')?.replacementBlockId).toBe('hero-centered');
  });

  it('fails when required zones are missing from the effective page contract', () => {
    const files = createPublisherFiles();
    files[PUBLISHER_PROJECT_FILE] = {
      type: 'file',
      isBinary: false,
      content: JSON.stringify(
        {
          id: 'demo-site',
          name: 'Demo Site',
          defaultLanguage: 'en',
          multilingual: false,
          languages: ['en'],
          mode: 'publisher',
          siteUrl: 'https://demo.example',
        },
        null,
        2,
      ),
    };

    const state = loadPublisherState(files);
    const checks = runPublisherChecks(state, publisherBlockRegistry);

    expect(checks.some((report) => report.name === 'missing-zone' && report.zone === 'header')).toBe(true);
    expect(checks.some((report) => report.name === 'missing-zone' && report.zone === 'footer')).toBe(true);
  });

  it('blocks forbidden block placement and reserved metadata overrides', () => {
    const files = createPublisherFiles();
    files[`${PUBLISHER_PAGES_DIR}/home.json`] = {
      type: 'file',
      isBinary: false,
      content: JSON.stringify(
        {
          id: 'home',
          slug: 'home',
          name: 'Home',
          path: '/',
          zones: {
            content: {
              slots: [
                {
                  id: 'hero',
                  blockId: 'site-header-basic',
                  props: {
                    brandName: 'Demo',
                    primaryLinkLabel: 'Home',
                    primaryLinkHref: '/',
                    canonicalUrl: 'https://malicious.example',
                  },
                },
              ],
            },
          },
          seo: {
            title: 'Publisher Mode',
            description: 'Structured static site generation',
            schemaType: 'WebPage',
          },
        },
        null,
        2,
      ),
    };

    const state = loadPublisherState(files);
    const checks = runPublisherChecks(state, publisherBlockRegistry);

    expect(checks.some((report) => report.name === 'block-zone-guard')).toBe(true);
    expect(checks.some((report) => report.name === 'metadata-ownership')).toBe(true);
  });

  it('flags required slot prop failures with deterministic diagnostics', () => {
    const files = createPublisherFiles();
    files[`${PUBLISHER_PAGES_DIR}/home.json`] = {
      type: 'file',
      isBinary: false,
      content: JSON.stringify(
        {
          id: 'home',
          slug: 'home',
          name: 'Home',
          path: '/',
          zones: {
            content: {
              slots: [
                {
                  id: 'hero',
                  blockId: 'hero-centered',
                  props: {
                    body: 'Body copy only',
                    primaryCtaLabel: 'Start',
                    primaryCtaHref: '/',
                  },
                },
              ],
            },
          },
          seo: {
            title: 'Publisher Mode',
            description: 'Structured static site generation',
            schemaType: 'WebPage',
          },
        },
        null,
        2,
      ),
    };

    const state = loadPublisherState(files);
    const checks = runPublisherChecks(state, publisherBlockRegistry);

    expect(checks.some((report) => report.name === 'missing-slot-props')).toBe(true);
  });

  it('documents reserved ownership rules in prompts', () => {
    const publisherPrompt = getPublisherPrompt('/home/project');
    const pagePrompt = buildPageRegeneratePrompt('home');
    const previewPrompt = buildPreviewRebuildPrompt('demo-site');
    const repairPrompt = buildRepairRegeneratePrompt('metadata-completeness', 'home', 'content');
    const slotPrompt = buildSlotRegeneratePrompt('home', 'content', {
      id: 'hero',
      blockId: 'hero-centered',
      props: {},
    });

    expect(publisherPrompt).toContain('Allowed agent intents: normalize, map, fill, repair.');
    expect(publisherPrompt).toContain(
      'Default deny writes to /home/project/.bolt/publisher/generated and /home/project/.bolt/publisher/intake unless explicitly requested by the operator.',
    );
    expect(publisherPrompt).toContain('canonicalUrl');
    expect(publisherPrompt).toContain('schema JSON-LD');
    expect(publisherPrompt).toContain('Never create new zones or new block IDs unless explicitly requested.');
    expect(pagePrompt).toContain('intent: map');
    expect(pagePrompt).toContain('targetFileScope: contract-only');
    expect(pagePrompt).toContain('Do not invent new zones');
    expect(slotPrompt).toContain('intent: fill');
    expect(slotPrompt).toContain('targetFileScope: contract-only');
    expect(slotPrompt).toContain('reserved metadata keys');
    expect(repairPrompt).toContain('intent: repair');
    expect(repairPrompt).toContain('targetFileScope: contracts-plus-checks');
    expect(repairPrompt).toContain('repairCheck: metadata-completeness');
    expect(previewPrompt).toContain('intent: repair');
    expect(previewPrompt).toContain('targetFileScope: generated-rebuild-only');
  });

  it('builds bounded repair prompt copy from release diagnostics', () => {
    const intent = deriveRepairIntentFromCheck({
      name: 'technical-file-consistency',
      status: 'fail',
      message: 'Missing technical static file output.',
      pageId: 'home',
      gate: 'working',
    });
    expect(intent).not.toBeNull();

    const prompt = buildPromptForRepairIntent(intent!, {
      name: 'technical-file-consistency',
      status: 'fail',
      message: 'Missing technical static file output.',
      pageId: 'home',
      gate: 'working',
    });

    expect(intent).toEqual({
      action: 'repair',
      checkName: 'technical-file-consistency',
      pageId: 'home',
    });
    expect(prompt).toContain('intent: repair');
    expect(prompt).toContain('repairOrigin: runtime');
    expect(prompt).toContain('repairStrategy: runtime-contract-fix');
    expect(prompt).toContain('Repair only the failing publisher contract fields needed to resolve the named check.');
  });

  it('encodes family-specific repair strategies in constrained prompts', () => {
    const sourcePrompt = buildRepairRegeneratePrompt('missing-page-title', 'home');
    const templatePrompt = buildRepairRegeneratePrompt('template-heading-injection', 'home', 'beforeContent');
    const runtimePrompt = buildRepairRegeneratePrompt('zone-link-policy', 'home', 'content');

    expect(sourcePrompt).toContain('repairOrigin: source');
    expect(sourcePrompt).toContain('repairStrategy: source-reextract');
    expect(templatePrompt).toContain('repairOrigin: template');
    expect(templatePrompt).toContain('repairStrategy: template-adjust');
    expect(runtimePrompt).toContain('repairOrigin: runtime');
    expect(runtimePrompt).toContain('repairStrategy: runtime-contract-fix');
    expect(runtimePrompt).toContain('targetFileScope: contracts-plus-checks');
  });

  it('repair intent maps known diagnostics to constrained repair action', () => {
    const sourceIntent = deriveRepairIntentFromCheck({
      name: 'missing-page-title',
      status: 'fail',
      message: 'missing title',
      pageId: 'home',
      gate: 'working',
    });
    const templateIntent = deriveRepairIntentFromCheck({
      name: 'template-heading-injection',
      status: 'fail',
      message: 'template heading',
      pageId: 'home',
      zone: 'beforeContent',
      gate: 'release',
    });
    const runtimeIntent = deriveRepairIntentFromCheck({
      name: 'technical-file-consistency',
      status: 'fail',
      message: 'missing static file',
      pageId: 'home',
      gate: 'release',
    });

    expect(sourceIntent).toEqual({
      action: 'repair',
      checkName: 'missing-page-title',
      pageId: 'home',
    });
    expect(templateIntent).toEqual({
      action: 'repair',
      checkName: 'template-heading-injection',
      pageId: 'home',
      zone: 'beforeContent',
    });
    expect(runtimeIntent).toEqual({
      action: 'repair',
      checkName: 'technical-file-consistency',
      pageId: 'home',
    });
  });

  it('repair intent returns null for unsupported diagnostics', () => {
    const intent = deriveRepairIntentFromCheck({
      name: 'metadata-completeness',
      status: 'fail',
      message: 'unsupported for constrained repair',
      pageId: 'home',
      gate: 'release',
    });

    expect(intent).toBeNull();
  });

  it('derives intake review workflow state from unapplied intake sessions', () => {
    const workflow = derivePublisherWorkflowState({
      intakeSession: {
        id: 'session-1',
        createdAt: '2026-03-30T00:00:00.000Z',
        updatedAt: '2026-03-30T00:00:00.000Z',
        sourceLabel: 'Imported docs',
        importKind: 'document',
        status: 'reviewing',
        scenario: 'document-import',
        activeContentFamily: 'document',
        project: {
          name: 'Demo',
          defaultLanguage: 'en',
          multilingual: false,
          languages: ['en'],
        },
        sources: [],
        pages: [],
        shellCandidatePaths: [],
        blockLibraryPaths: [],
        warnings: [],
        checks: [],
        scriptRuns: [],
      },
      checks: [],
    });

    expect(workflow.status).toBe('intake-review');
    expect(workflow.step).toBe('intake');
    expect(workflow.nextAction).toContain('Apply the intake session');
  });

  it('derives contract review workflow state from working check failures', () => {
    const workflow = derivePublisherWorkflowState({
      checks: [
        {
          name: 'missing-zone',
          status: 'fail',
          message: 'Missing header',
          gate: 'working',
        },
      ],
    });

    expect(workflow.status).toBe('contract-ready');
    expect(workflow.step).toBe('review');
    expect(workflow.blockingReason).toContain('1 working check');
  });

  it('derives release readiness workflow state from successful builds', () => {
    const workflow = derivePublisherWorkflowState({
      checks: [],
      lastBuild: {
        id: 'build-1',
        createdAt: '2026-03-30T00:00:00.000Z',
        status: 'release-ready',
        stage: 'export',
        workingFailures: 0,
        releaseFailures: 0,
        warningCount: 0,
        artifacts: [],
      },
    });

    expect(workflow.status).toBe('release-ready');
    expect(workflow.step).toBe('release');
    expect(workflow.nextAction).toContain('Inspect artifacts');
  });

  it('derives stage-aware workflow details from latest pipeline metadata', () => {
    const state = loadPublisherState(createPublisherFiles());
    const result = assemblePublisherProject(state, publisherBlockRegistry, { mode: 'publisher', currentPage: 'home' });
    const workflow = derivePublisherWorkflowState({
      checks: [],
      lastBuild: result.build,
    });

    expect(workflow.status).toBe('release-ready');
    expect(workflow.releaseStage).toBe('export');
    expect(workflow.releaseStageStatus).toBe('completed');
    expect(workflow.releaseFailureStage).toBeUndefined();
  });

  it('derives failed workflow stage handoff from failed pipeline builds', () => {
    const files = createPublisherFiles();
    files[PUBLISHER_PROJECT_FILE] = {
      type: 'file',
      isBinary: false,
      content: JSON.stringify(
        {
          id: 'demo-site',
          name: 'Demo Site',
          defaultLanguage: 'en',
          multilingual: false,
          languages: ['en'],
          mode: 'publisher',
        },
        null,
        2,
      ),
    };

    const state = loadPublisherState(files);
    const result = assemblePublisherProject(state, publisherBlockRegistry, { mode: 'publisher', currentPage: 'home' });
    const workflow = derivePublisherWorkflowState({
      checks: result.checks,
      lastBuild: result.build,
    });

    expect(workflow.status).toBe('failed');
    expect(workflow.releaseStage).toBe('check');
    expect(workflow.releaseStageStatus).toBe('failed');
    expect(workflow.releaseFailureStage).toBe('check');
  });

  it('derives failed workflow state from release blockers', () => {
    const workflow = derivePublisherWorkflowState({
      checks: [
        {
          name: 'canonical-url',
          status: 'fail',
          message: 'Missing canonical URL',
          gate: 'release',
        },
      ],
    });

    expect(workflow.status).toBe('failed');
    expect(workflow.step).toBe('release');
    expect(workflow.blockingReason).toBe('Release blockers: canonical-url');
  });

  it('builds repair-oriented review drafts from intake pages', () => {
    const reviewDraft = createIntakeReviewDraft(
      {
        id: 'pricing',
        name: 'Pricing',
        sourcePath: 'content/pricing.md',
        sourceFamily: 'document',
        role: 'article',
        slug: 'pricing',
        path: '/pricing/',
        title: '',
        description: '',
        h1: '',
        sections: [],
        seo: undefined,
        checks: [
          {
            id: 'missing-page-title',
            severity: 'fail',
            message: 'Page pricing is missing a title.',
          },
          {
            id: 'missing-page-sections',
            severity: 'fail',
            message: 'Page pricing does not contain any extracted sections.',
          },
        ],
        warnings: [{ code: 'parser-warning', message: 'Broken markdown list.', severity: 'warn' }],
        confidence: 0.42,
      },
      {
        sourcePath: 'content/pricing.md',
        label: 'pricing.md',
        kind: 'document',
        rawContent: '# Pricing\n\nBroken list',
      },
    );

    expect(reviewDraft.missingFields).toEqual(['title', 'description', 'h1']);
    expect(reviewDraft.metadataIssueCount).toBe(1);
    expect(reviewDraft.extractionIssueCount).toBe(2);
    expect(reviewDraft.repairSummary).toContain('title, description, h1');
    expect(reviewDraft.repairGuidance).toContain('Reserved head metadata');
    expect(reviewDraft.status).toBe('needs-review');
  });

  it('emits actionable repair details for missing metadata and extraction gaps', () => {
    const checks = buildIntakePageChecks({
      id: 'pricing',
      name: 'Pricing',
      sourcePath: 'content/pricing.md',
      sourceFamily: 'document',
      role: 'article',
      slug: 'pricing',
      path: '/pricing/',
      title: '',
      description: '',
      h1: '',
      sections: [],
      seo: undefined,
      checks: [],
      warnings: [],
      confidence: 0.5,
    });

    expect(checks.find((check) => check.id === 'missing-page-title')?.details).toContain(
      'Repair the page title in intake review before applying the import.',
    );
    expect(checks.find((check) => check.id === 'missing-page-sections')?.details).toContain(
      'Open the source preview and add or regenerate sections for this page.',
    );
    expect(checks.find((check) => check.id === 'low-confidence-extraction')?.details).toContain(
      'Compare extracted sections with the source preview.',
    );
  });

  it('groups publisher diagnostics into operator-facing categories', () => {
    expect(
      categorizePublisherDiagnostic({
        name: 'metadata-completeness',
        message: 'Page is missing release-grade metadata.',
        details: ['Repair metadata in intake review or page contract.'],
      }),
    ).toBe('metadata');

    expect(
      categorizePublisherDiagnostic({
        name: 'metadata-ownership',
        message: 'Reserved metadata override detected.',
      }),
    ).toBe('ownership');

    expect(
      categorizePublisherDiagnostic({
        name: 'broken-internal-link',
        message: 'Generated output references an unknown internal path.',
        details: ['Inspect the page contract and generated output.'],
      }),
    ).toBe('output');

    expect(
      categorizePublisherDiagnostic({
        name: 'missing-zone',
        message: 'Page contract is missing a required zone.',
      }),
    ).toBe('composition');

    expect(
      categorizePublisherDiagnostic({
        name: 'template-heading-injection',
        message: 'Decorative template introduced heading tags.',
      }),
    ).toBe('content');

    expect(
      categorizePublisherDiagnostic({
        name: 'decorative-zone-content-injection',
        message: 'Decorative zone carries article html.',
      }),
    ).toBe('composition');

    expect(
      categorizePublisherDiagnostic({
        name: 'decorative-zone-primary-content',
        message: 'Decorative zone owns primary narrative.',
      }),
    ).toBe('composition');
  });

  it('Origin: maps publisher diagnostics to deterministic origin layers', () => {
    expect(derivePublisherDiagnosticOrigin({ name: 'template-heading-injection' })).toBe('template');
    expect(derivePublisherDiagnosticOrigin({ name: 'decorative-zone-content-injection' })).toBe('template');
    expect(derivePublisherDiagnosticOrigin({ name: 'decorative-zone-primary-content' })).toBe('template');
    expect(derivePublisherDiagnosticOrigin({ name: 'missing-page-title' })).toBe('source');
    expect(derivePublisherDiagnosticOrigin({ name: 'missing-page-description' })).toBe('source');
    expect(derivePublisherDiagnosticOrigin({ name: 'missing-page-h1' })).toBe('source');
    expect(derivePublisherDiagnosticOrigin({ name: 'missing-page-sections' })).toBe('source');
    expect(derivePublisherDiagnosticOrigin({ name: 'zone-link-policy' })).toBe('runtime');
    expect(derivePublisherDiagnosticOrigin({ name: 'technical-file-consistency' })).toBe('runtime');
    expect(derivePublisherDiagnosticOrigin({ name: 'table-media-wrapper' })).toBe('runtime');
    expect(getDiagnosticOriginLabel('source')).toBe('Source input');
    expect(getDiagnosticOriginLabel('template')).toBe('Template composition');
    expect(getDiagnosticOriginLabel('runtime')).toBe('Runtime generation');
    expect(getPublisherDiagnosticOriginLine({ name: 'missing-page-h1' })).toBe('Origin: Source input');
    expect(getPublisherDiagnosticOriginLine({ name: 'template-heading-injection' })).toBe(
      'Origin: Template composition',
    );
    expect(getPublisherDiagnosticOriginLine({ name: 'technical-file-consistency' })).toBe('Origin: Runtime generation');
  });

  it('describes constrained slot editing boundaries for reserved and invalid props', () => {
    const state = describePublisherSlotEditing(
      {
        id: 'home',
        slug: 'home',
        name: 'Home',
        path: '/',
        usesProjectShell: true,
        zones: {
          content: {
            slots: [
              {
                id: 'hero',
                blockId: 'hero-centered',
                props: {
                  title: 'Publisher Mode',
                  body: 'Structured editing',
                  canonicalUrl: 'https://malicious.example',
                  customScript: 'alert(1)',
                },
              },
            ],
          },
        },
        seo: {
          title: 'Publisher Mode',
          description: 'Structured static site generation',
          schemaType: 'WebPage',
        },
      },
      'content',
      {
        id: 'hero',
        blockId: 'hero-centered',
        props: {
          title: 'Publisher Mode',
          body: 'Structured editing',
          canonicalUrl: 'https://malicious.example',
          customScript: 'alert(1)',
        },
      },
      publisherBlockRegistry,
    );

    expect(state?.editableFields.map((field) => field.key)).toContain('title');
    expect(state?.blockedFields.find((field) => field.key === 'canonicalUrl')?.reason).toBe('ownership');
    expect(state?.blockedFields.find((field) => field.key === 'customScript')?.reason).toBe('composition');
  });

  it('creates deterministic hashed asset refs with image metadata', () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const assetRef = createPublisherAssetRef('logo', 'Brand Logo.png', 'image/png', {
      bytes,
      width: 320,
      height: 80,
    });

    expect(assetRef.path).toContain('/.bolt/publisher/assets/logo-brand-logo-');
    expect(assetRef.publicPath).toContain('/assets/site/logo-brand-logo-');
    expect(assetRef.contentHash).toMatch(/^a[0-9a-f]+$/);
    expect(assetRef.width).toBe(320);
    expect(assetRef.height).toBe(80);
  });

  it('preserves normalized asset materialization metadata in applied publisher contracts', () => {
    const applied = buildPublisherContractsFromIntakeSession({
      id: 'session-asset',
      createdAt: '2026-03-30T00:00:00.000Z',
      updatedAt: '2026-03-30T00:00:00.000Z',
      sourceLabel: 'Imported docs',
      sourceRoot: '/work/content',
      importKind: 'document',
      status: 'ready',
      scenario: 'document-import',
      activeContentFamily: 'document',
      project: {
        name: 'Demo',
        domain: 'demo.example',
        defaultLanguage: 'en',
        multilingual: false,
        languages: ['en'],
        logo: {
          kind: 'logo',
          path: '/home/project/.bolt/publisher/assets/logo-demo-a123.svg',
          publicPath: '/assets/site/logo-demo-a123.svg',
          mimeType: 'image/svg+xml',
          label: 'logo.svg',
          contentHash: 'a123',
          width: 320,
          height: 80,
        },
      },
      sources: [],
      pages: [
        {
          id: 'home',
          name: 'Home',
          sourcePath: 'content/home.md',
          sourceFamily: 'document',
          role: 'home',
          slug: 'home',
          path: '/',
          title: 'Home',
          description: 'Demo home page',
          h1: 'Home',
          sections: [
            {
              id: 'section-1',
              kind: 'paragraph',
              content: 'Welcome to the demo site.',
            },
          ],
          seo: undefined,
          checks: [],
          warnings: [],
          confidence: 0.95,
        },
      ],
      shellCandidatePaths: [],
      blockLibraryPaths: [],
      warnings: [],
      checks: [],
      scriptRuns: [],
    });

    expect(applied.project.logo?.contentHash).toBe('a123');
    expect(applied.referenceState.assetMaterialization[0]?.contentHash).toBe('a123');
    expect(applied.referenceState.assetMaterialization[0]?.width).toBe(320);
    expect(applied.referenceState.assetMaterialization[0]?.height).toBe(80);
  });

  it('normalizes persisted build history artifacts for provenance-facing release UI', () => {
    const normalized = normalizePublisherBuildSummary({
      id: 'build-1',
      createdAt: '2026-03-30T00:00:00.000Z',
      status: 'release-ready',
      stage: 'export',
      workingFailures: 0,
      releaseFailures: 0,
      warningCount: 0,
      artifacts: [
        {
          path: '/home/project/.bolt/publisher/generated/robots.txt',
          contentType: 'txt',
          fingerprint: 'b2',
        },
        {
          path: '/home/project/.bolt/publisher/generated/provenance.json',
          contentType: 'json',
          fingerprint: 'b1',
        },
      ],
    });

    expect(normalized.artifacts[0]?.path).toContain('provenance.json');
    expect(normalized.artifacts[1]?.path).toContain('robots.txt');
  });

  it('source pack to release-ready canonical fixture reaches release-ready output when normalized correctly', () => {
    const state = createImportedPublisherState();
    const result = assemblePublisherProject(state, publisherBlockRegistry, { mode: 'publisher', currentPage: 'home' });
    const workflow = derivePublisherWorkflowState({
      checks: result.checks,
      lastBuild: result.build,
    });

    expect(result.build.releaseFailures).toBe(0);
    expect(result.pipeline.publishContract.canPublish).toBe(true);
    expect(workflow.status).toBe('release-ready');
    expect(result.files['/home/project/.bolt/publisher/generated/index.html']).toContain('Fixture Home');
  });

  it('fails release checks for imported pack fixtures when metadata remains unresolved', () => {
    const state = createImportedPublisherState();
    const home = state.pages.find((page) => page.slug === 'home');

    if (home) {
      home.seo.title = '';
      home.seo.description = '';
    }

    const checks = runPublisherChecks(state, publisherBlockRegistry);

    expect(checks.some((check) => check.status === 'fail')).toBe(true);
    expect(checks.some((check) => check.name === 'metadata-completeness')).toBe(true);
  });

  it('fails release checks for imported pack fixtures on unsafe links and internal publisher leaks', () => {
    const state = createImportedPublisherState();
    const home = state.pages.find((page) => page.slug === 'home');
    const firstSlot = home?.zones.content?.slots[0];

    if (firstSlot) {
      firstSlot.props.primaryCtaHref = 'javascript:alert(1)';
      firstSlot.props.image = '/.bolt/publisher/assets/private.png';
    }

    const checks = runPublisherChecks(state, publisherBlockRegistry);
    const failureNames = checks.filter((check) => check.status === 'fail').map((check) => check.name);

    expect(failureNames).toContain('link-policy');
    expect(failureNames).toContain('managed-asset-internal-path');
  });

  it('release rule diagnostics: invariant checks emit release-fail with Rule:/Fix: details', () => {
    const state = createImportedPublisherState({
      mutateState: (loadedState) => {
        const home = loadedState.pages.find((page) => page.slug === 'home');

        if (!home) {
          return;
        }

        const contentSlot = home.zones.content?.slots?.[0];

        if (!contentSlot) {
          return;
        }

        contentSlot.props.html =
          '<table><tr><td>Cell</td></tr></table><p><img src="/assets/image.png" alt="Demo" /></p>';

        if (loadedState.project?.sharedShell?.header?.slots?.[0]) {
          loadedState.project.sharedShell.header.slots[0].props.primaryLinkHref = 'example.com/legal';
        }
      },
    });
    const checks = runPublisherChecks(state, publisherBlockRegistry);
    const requiredNames = ['zone-link-policy', 'table-media-wrapper'] as const;

    requiredNames.forEach((name) => {
      const report = checks.find((check) => check.name === name);

      expect(report?.gate).toBe('release');
      expect(report?.status).toBe('fail');
      expect(report?.details?.some((detail) => detail.startsWith('Rule:'))).toBe(true);
      expect(report?.details?.some((detail) => detail.startsWith('Fix:'))).toBe(true);
    });

    const assemblerResult = assemblePublisherProject(state, publisherBlockRegistry, {
      mode: 'publisher',
      currentPage: 'home',
    });
    const mutatedFiles = { ...assemblerResult.files };
    delete mutatedFiles['/home/project/.bolt/publisher/generated/assets/js/main.js'];

    const technicalFileCheck = buildTechnicalFileConsistencyChecks(mutatedFiles).find(
      (check) => check.name === 'technical-file-consistency',
    );

    expect(technicalFileCheck?.gate).toBe('release');
    expect(technicalFileCheck?.status).toBe('fail');
    expect(technicalFileCheck?.details?.some((detail) => detail.startsWith('Rule:'))).toBe(true);
    expect(technicalFileCheck?.details?.some((detail) => detail.startsWith('Fix:'))).toBe(true);
  });

  it('source pack to release-ready broken fixture reports Release blockers: with invariant names', () => {
    const state = createImportedPublisherState({
      mutateState: (loadedState) => {
        const home = loadedState.pages.find((page) => page.slug === 'home');

        if (!home) {
          return;
        }

        const contentSlot = home.zones.content?.slots?.[0];

        if (!contentSlot) {
          return;
        }

        contentSlot.props.html =
          '<table><tr><td>Cell</td></tr></table><p><img src="/assets/image.png" alt="Demo" /></p>';

        if (loadedState.project?.sharedShell?.header?.slots?.[0]) {
          loadedState.project.sharedShell.header.slots[0].props.primaryLinkHref = 'example.com/legal';
        }
      },
    });
    const checksFirst = runPublisherChecks(state, publisherBlockRegistry);
    const checksSecond = runPublisherChecks(state, publisherBlockRegistry);
    const workflow = derivePublisherWorkflowState({ checks: checksFirst });
    const failuresFirst = checksFirst
      .filter((check) => check.gate === 'release' && check.status === 'fail')
      .map((check) => check.name)
      .sort();
    const failuresSecond = checksSecond
      .filter((check) => check.gate === 'release' && check.status === 'fail')
      .map((check) => check.name)
      .sort();

    expect(failuresFirst).toContain('zone-link-policy');
    expect(failuresFirst).toContain('table-media-wrapper');
    expect(failuresFirst).toEqual(failuresSecond);
    expect(workflow.blockingReason?.startsWith('Release blockers:')).toBe(true);
    expect(workflow.blockingReason).toContain('zone-link-policy');
  });

  it('renders queue repair action for mapped constrained repair diagnostics', () => {
    const html = renderToStaticMarkup(
      createElement(PublisherReleaseWorkspace, {
        status: 'failed',
        workflow: {
          status: 'failed',
          step: 'release',
          label: 'Release readiness',
          summary: 'Release blockers detected.',
          nextAction: 'Resolve release blockers.',
        },
        checks: [
          {
            gate: 'release',
            name: 'technical-file-consistency',
            status: 'fail',
            message: 'Missing static files',
            pageId: 'home',
            details: ['Rule: required static files must exist', 'Fix: restore missing files'],
          },
        ],
        buildHistory: [],
        onQueueRepairIntent: () => undefined,
      }),
    );

    expect(html).toContain('Queue repair prompt');
    expect(html).not.toContain(
      'No constrained repair prompt available for this diagnostic. Resolve through source/template review first.',
    );
  });

  it('renders constrained repair prompt fallback guidance for unmapped diagnostics', () => {
    const html = renderToStaticMarkup(
      createElement(PublisherReleaseWorkspace, {
        status: 'failed',
        workflow: {
          status: 'failed',
          step: 'release',
          label: 'Release readiness',
          summary: 'Release blockers detected.',
          nextAction: 'Resolve release blockers.',
        },
        checks: [
          {
            gate: 'release',
            name: 'metadata-completeness',
            status: 'fail',
            message: 'Missing metadata',
            pageId: 'home',
            details: ['Rule: metadata must be complete', 'Fix: fill required metadata fields'],
          },
        ],
        buildHistory: [],
        onQueueRepairIntent: () => undefined,
      }),
    );

    expect(html).not.toContain('Queue repair prompt');
    expect(html).toContain(
      'No constrained repair prompt available for this diagnostic. Resolve through source/template review first.',
    );
    expect(
      html.match(
        /No constrained repair prompt available for this diagnostic\. Resolve through source\/template review first\./g,
      )?.length ?? 0,
    ).toBe(1);
  });
});
