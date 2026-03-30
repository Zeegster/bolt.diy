import { getDefaultTokens } from './token-engine';
import { sanitizePublisherSlotProps } from './contracts';
import type {
  AssetRef,
  PageContract,
  PublisherMarkdownSource,
  PublisherSiteSettings,
  SiteProjectContract,
  ThemeContract,
} from '~/types/publisher';

export interface ImportedMarkdownDocument {
  name: string;
  markdown: string;
  html: string;
  sourcePath: string;
}

export interface BuildPublisherContractsInput {
  projectId: string;
  settings: PublisherSiteSettings;
  markdownDocuments: ImportedMarkdownDocument[];
}

function slugifySegment(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replaceAll('&', ' and ')
    .replaceAll('/', ' ')
    .split('')
    .map((character) => {
      if ((character >= 'a' && character <= 'z') || (character >= '0' && character <= '9')) {
        return character;
      }

      if (character === ' ' || character === '-' || character === '_') {
        return '-';
      }

      return '';
    })
    .join('')
    .replaceAll('--', '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeLanguageList(defaultLanguage: string, multilingual: boolean, languages: string[]) {
  const next = new Set(
    languages
      .map((language) => language.trim())
      .filter(Boolean)
      .map((language) => language.toLowerCase()),
  );

  next.add(defaultLanguage.trim().toLowerCase());

  if (!multilingual) {
    return [defaultLanguage.trim().toLowerCase()];
  }

  return [...next];
}

function normalizeDomain(domain?: string) {
  if (!domain?.trim()) {
    return undefined;
  }

  const trimmed = domain.trim();

  return trimmed.startsWith('http://') || trimmed.startsWith('https://') ? trimmed : `https://${trimmed}`;
}

function extractMarkdownTitle(document: ImportedMarkdownDocument) {
  const lines = document.markdown.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith('# ')) {
      return trimmed.slice(2).trim();
    }
  }

  const baseName = document.name.replace(/\.[^/.]+$/, '');

  return baseName || 'Untitled page';
}

function createContentSlot(id: string, title: string, html: string) {
  return {
    id: `${id}-content`,
    blockId: 'content-prose',
    props: sanitizePublisherSlotProps({
      sectionTitle: title,
      html,
    }),
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

function cloneAssetRef(asset?: AssetRef) {
  return asset ? { ...asset } : undefined;
}

export function createPublisherProjectId(siteName: string) {
  const slug = slugifySegment(siteName) || 'publisher-site';
  return `${slug}-${Date.now().toString(36)}`;
}

export function buildPublisherContracts(input: BuildPublisherContractsInput): {
  project: SiteProjectContract;
  theme: ThemeContract;
  pages: PageContract[];
  markdownSources: PublisherMarkdownSource[];
} {
  const normalizedLanguages = normalizeLanguageList(
    input.settings.defaultLanguage,
    input.settings.multilingual,
    input.settings.languages,
  );

  const pages = input.markdownDocuments.map((document, index) => {
    const title = extractMarkdownTitle(document);
    const slug = index === 0 ? 'home' : slugifySegment(document.name.replace(/\.[^/.]+$/, '')) || `page-${index + 1}`;
    const path = index === 0 ? '/' : `/${slug}/`;

    return {
      id: slug,
      slug,
      name: title,
      path,
      usesProjectShell: true,
      zones: {
        content: {
          enabled: true,
          slots: [createContentSlot(slug, title, document.html)],
        },
      },
      seo: {
        title,
        description: `${title} · ${input.settings.name}`,
        schemaType: 'WebPage',
        canonicalPath: path,
        robots: 'index,follow',
      },
    } satisfies PageContract;
  });

  const homePath = pages[0]?.path ?? '/';

  const project: SiteProjectContract = {
    id: input.projectId,
    name: input.settings.name,
    defaultLanguage: input.settings.defaultLanguage.toLowerCase(),
    multilingual: input.settings.multilingual,
    languages: normalizedLanguages,
    mode: 'publisher',
    domain: input.settings.domain,
    siteUrl: normalizeDomain(input.settings.domain),
    favicon: cloneAssetRef(input.settings.favicon),
    metaImage: cloneAssetRef(input.settings.metaImage),
    logo: cloneAssetRef(input.settings.logo),
    pageOrder: pages.map((page) => page.id),
    sharedShell: {
      header: createDefaultHeader(input.settings, homePath),
      footer: createDefaultFooter(input.settings),
    },
    siteSeo: {
      siteName: input.settings.name,
      organizationName: input.settings.name,
      schemaType: 'WebSite',
    },
    build: {
      outputDir: 'dist',
      assetDir: 'assets',
      checks: ['working'],
    },
  };

  const theme: ThemeContract = {
    themeId: `${input.projectId}-theme`,
    tokens: getDefaultTokens(),
  };

  const markdownSources = input.markdownDocuments.map((document, index) => ({
    name: document.name,
    sourcePath: document.sourcePath,
    pageId: pages[index]?.id,
    pagePath: pages[index]?.path,
  }));

  return {
    project,
    theme,
    pages,
    markdownSources,
  };
}
