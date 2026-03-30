import { describe, expect, it } from 'vitest';
import { PublisherBlockRegistry, publisherBlockRegistry } from './block-registry';
import { loadPublisherState } from './contracts';
import { assemblePublisherProject } from './assembler';
import { runPublisherChecks } from './checker';
import { buildCanonicalUrl } from './metadata';
import { getPublisherPrompt } from '~/lib/common/prompts/publisher';
import { buildPageRegeneratePrompt, buildSlotRegeneratePrompt } from './prompt-context';
import type { FileMap } from '~/lib/stores/files';
import { PUBLISHER_PAGES_DIR, PUBLISHER_PROJECT_FILE, PUBLISHER_THEME_FILE } from './constants';
import type { PublisherBlockDefinition } from '~/types/publisher';

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

  it('assembles preview-ready static output', () => {
    const state = loadPublisherState(createPublisherFiles());
    const result = assemblePublisherProject(state, publisherBlockRegistry, { mode: 'publisher', currentPage: 'home' });

    expect(result.files['/home/project/.bolt/publisher/generated/index.html']).toContain('Publisher Mode');
    expect(result.files['/home/project/.bolt/publisher/generated/index.html']).toContain(
      '<link rel="canonical" href="https://demo.example/"',
    );
    expect(result.files['/home/project/.bolt/publisher/generated/assets/css/main.css']).toContain('--color-primary');
    expect(result.files['/home/project/.bolt/publisher/checks.json']).toContain('working-gate');
    expect(result.build.artifacts.length).toBeGreaterThan(0);
    expect(result.build.releaseFailures).toBe(0);
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
    const slotPrompt = buildSlotRegeneratePrompt('home', 'content', {
      id: 'hero',
      blockId: 'hero-centered',
      props: {},
    });

    expect(publisherPrompt).toContain('canonicalUrl');
    expect(publisherPrompt).toContain('schema JSON-LD');
    expect(pagePrompt).toContain('Do not invent new zones');
    expect(slotPrompt).toContain('reserved metadata keys');
  });
});
