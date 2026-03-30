import type { LoadedPublisherState, PageContract, SEOContract } from '~/types/publisher';

function trimTrailingSlash(value: string) {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

export function normalizeSiteUrl(siteUrl?: string) {
  if (!siteUrl?.trim()) {
    return undefined;
  }

  return trimTrailingSlash(siteUrl.trim());
}

export function buildAbsoluteUrl(path: string, siteUrl?: string) {
  const normalizedSiteUrl = normalizeSiteUrl(siteUrl);

  if (!normalizedSiteUrl) {
    return undefined;
  }

  return new URL(path, normalizedSiteUrl).toString();
}

export function buildCanonicalUrl(page: Pick<PageContract, 'path' | 'seo'>, siteUrl?: string) {
  return buildAbsoluteUrl(page.seo.canonicalPath ?? page.path, siteUrl);
}

export function buildSchemaJson(state: LoadedPublisherState, page: PageContract) {
  const siteUrl = state.project?.siteUrl ?? (state.project?.domain ? `https://${state.project.domain}` : undefined);
  const schemaType = page.seo.schemaType ?? 'WebPage';
  const canonicalPath = page.seo.canonicalPath ?? page.path;

  return JSON.stringify(
    {
      '@context': 'https://schema.org',
      '@type': schemaType,
      name: page.seo.title,
      description: page.seo.description,
      url: buildAbsoluteUrl(canonicalPath, siteUrl),
      inLanguage: state.project?.defaultLanguage ?? 'en',
      breadcrumb:
        state.pages.length > 1 && siteUrl
          ? {
              '@type': 'BreadcrumbList',
              itemListElement: state.pages.slice(0, 2).map((currentPage, index) => ({
                '@type': 'ListItem',
                position: index + 1,
                name: currentPage.name,
                item: buildAbsoluteUrl(currentPage.path, siteUrl),
              })),
            }
          : undefined,
    },
    null,
    2,
  );
}

export function buildExpectedSitemapUrl(siteUrl?: string) {
  const normalizedSiteUrl = normalizeSiteUrl(siteUrl);

  if (!normalizedSiteUrl) {
    return '/sitemap.xml';
  }

  return `${normalizedSiteUrl}/sitemap.xml`;
}

export function parseRobotsSitemapUrl(robotsTxt: string) {
  const line = robotsTxt
    .split(/\r?\n/)
    .map((value) => value.trim())
    .find((value) => value.toLowerCase().startsWith('sitemap:'));

  if (!line) {
    return undefined;
  }

  const value = line.slice(line.indexOf(':') + 1).trim();
  return value.length > 0 ? value : undefined;
}

export function extractSitemapLocations(sitemapXml: string) {
  const matches = sitemapXml.matchAll(/<loc>(.*?)<\/loc>/g);

  return [...matches]
    .map((match) => match[1]?.trim())
    .filter((value): value is string => Boolean(value));
}

export function buildPageHeadMetadata(
  state: LoadedPublisherState,
  page: PageContract,
  assets: { faviconHref?: string; metaImageHref?: string },
) {
  const siteName = state.project?.siteSeo?.siteName ?? state.project?.name ?? page.name;
  const canonicalUrl = buildCanonicalUrl(page, state.project?.siteUrl);

  return {
    lang: state.project?.defaultLanguage ?? 'en',
    title: page.seo.title,
    description: page.seo.description ?? '',
    robots: page.seo.robots ?? 'index,follow',
    canonicalUrl,
    siteName,
    faviconHref: assets.faviconHref,
    metaImageHref: assets.metaImageHref,
    schemaJson: buildSchemaJson(state, page),
  };
}

export function buildSiteManifest(state: LoadedPublisherState, faviconHref?: string) {
  const name = state.project?.siteSeo?.siteName ?? state.project?.name ?? 'Publisher Site';

  return JSON.stringify(
    {
      name,
      short_name: name,
      start_url: '/',
      display: 'standalone',
      background_color: state.theme?.tokens?.['color.background'] ?? '#ffffff',
      theme_color: state.theme?.tokens?.['color.primary'] ?? '#111827',
      icons: faviconHref
        ? [
            {
              src: faviconHref,
              sizes: '512x512',
              type: state.project?.favicon?.mimeType ?? 'image/png',
            },
          ]
        : [],
    },
    null,
    2,
  );
}

export function buildRobotsTxt(state: LoadedPublisherState) {
  const sitemapUrl = buildExpectedSitemapUrl(state.project?.siteUrl);
  return `User-agent: *\nAllow: /\nSitemap: ${sitemapUrl}\n`;
}

export function buildSitemapXml(state: LoadedPublisherState) {
  const baseUrl = state.project?.siteUrl;

  if (!baseUrl) {
    return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>`;
  }

  const urls = state.pages
    .filter((page) => !page.seo.robots?.toLowerCase().includes('noindex'))
    .map((page) => `<url><loc>${buildAbsoluteUrl(page.path, baseUrl)}</loc></url>`)
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`;
}

export function hasCompleteSeo(seo: SEOContract) {
  return Boolean(seo.title.trim() && seo.description?.trim());
}
