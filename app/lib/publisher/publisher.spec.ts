import { describe, expect, it } from 'vitest';
import { publisherBlockRegistry } from './block-registry';
import { loadPublisherState } from './contracts';
import { assemblePublisherProject } from './assembler';
import { runPublisherChecks } from './checker';
import type { FileMap } from '~/lib/stores/files';
import { PUBLISHER_PAGES_DIR, PUBLISHER_PROJECT_FILE, PUBLISHER_THEME_FILE } from './constants';

function createPublisherFiles(): FileMap {
  return {
    [PUBLISHER_PROJECT_FILE]: {
      type: 'file',
      isBinary: false,
      content: JSON.stringify(
        {
          id: 'demo-site',
          name: 'Demo Site',
          language: 'en',
          mode: 'publisher',
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
                    primaryCtaHref: '/start/',
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
    expect(state.pages).toHaveLength(1);
    expect(state.issues).toHaveLength(0);
  });

  it('builds normalized checks', () => {
    const state = loadPublisherState(createPublisherFiles());
    const checks = runPublisherChecks(state, publisherBlockRegistry);

    expect(checks.some((report) => report.name === 'working-gate')).toBe(true);
    expect(checks.some((report) => report.status === 'fail')).toBe(false);
  });

  it('assembles preview-ready static output', () => {
    const state = loadPublisherState(createPublisherFiles());
    const result = assemblePublisherProject(state, publisherBlockRegistry, { mode: 'publisher', currentPage: 'home' });

    expect(result.files['/home/project/.bolt/publisher/generated/index.html']).toContain('Publisher Mode');
    expect(result.files['/home/project/.bolt/publisher/generated/assets/css/main.css']).toContain('--color-primary');
    expect(result.files['/home/project/.bolt/publisher/checks.json']).toContain('working-gate');
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
});
