import {
  PUBLISHER_CHECKS_FILE,
  PUBLISHER_GENERATED_CSS_FILE,
  PUBLISHER_GENERATED_DIR,
  PUBLISHER_GENERATED_JS_FILE,
  PUBLISHER_MANIFEST_FILE,
  PUBLISHER_ROBOTS_FILE,
  PUBLISHER_SITEMAP_FILE,
  PUBLISHER_STATE_FILE,
} from './constants';
import { publisherBlockRegistry, type PublisherBlockRegistry } from './block-registry';
import { runPublisherChecks } from './checker';
import type {
  CheckReport,
  LoadedPublisherState,
  PageContract,
  PublisherAssemblyResult,
  PublisherAgentContext,
  PublisherJob,
  SlotContract,
  ZoneContract,
  ZoneType,
} from '~/types/publisher';
import { normalizeTokens, tokensToCssVariables } from './token-engine';

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderTemplateString(template: string, slot: SlotContract) {
  let result = '';
  let cursor = 0;

  while (cursor < template.length) {
    const start = template.indexOf('{{', cursor);

    if (start === -1) {
      result += template.slice(cursor);
      break;
    }

    result += template.slice(cursor, start);

    const end = template.indexOf('}}', start + 2);

    if (end === -1) {
      result += template.slice(start);
      break;
    }

    const expression = template.slice(start + 2, end).trim();
    const [scope, ...rest] = expression.split(':');
    const key = rest.join(':');
    const rawValue = scope === 'slot' ? slot.props[key] : '';
    const stringValue = rawValue === undefined || rawValue === null ? '' : String(rawValue);
    const formatted = key === 'html' ? stringValue : escapeHtml(stringValue);

    result += formatted;
    cursor = end + 2;
  }

  return result;
}

function resolveZone(page: PageContract, zone: ZoneType, sharedShell?: Partial<Record<ZoneType, ZoneContract>>) {
  const pageZone = page.zones[zone];

  if (pageZone?.enabled === false) {
    return pageZone;
  }

  if (pageZone && pageZone.slots.length > 0) {
    return pageZone;
  }

  if (page.usesProjectShell !== false && sharedShell?.[zone]) {
    return sharedShell[zone];
  }

  return pageZone;
}

function renderZone(zone: ZoneType, zoneContract: ZoneContract | undefined, registry: PublisherBlockRegistry): string {
  if (!zoneContract || zoneContract.enabled === false || zoneContract.slots.length === 0) {
    return '';
  }

  const renderedSlots = zoneContract.slots
    .map((slot) => {
      const template = registry.getTemplate(slot.blockId);

      if (!template) {
        return `<section class="publisher-missing-block" data-block-id="${slot.blockId}">Missing block template: ${escapeHtml(
          slot.blockId,
        )}</section>`;
      }

      return renderTemplateString(template, slot);
    })
    .join('\n');

  return `<div data-zone="${zone}" class="publisher-zone publisher-zone--${zone}">\n${renderedSlots}\n</div>`;
}

function buildBreadcrumbs(page: PageContract, pages: PageContract[]) {
  const home = pages[0];

  if (!home || home.id === page.id) {
    return '';
  }

  return `<nav class="publisher-breadcrumbs" aria-label="Breadcrumbs">
  <a href="${home.path}">${escapeHtml(home.name)}</a>
  <span>/</span>
  <span>${escapeHtml(page.name)}</span>
</nav>`;
}

function buildSchemaJson(state: LoadedPublisherState, page: PageContract) {
  const siteUrl = state.project?.siteUrl ?? 'https://example.com';
  const schemaType = page.seo.schemaType ?? 'WebPage';

  return JSON.stringify(
    {
      '@context': 'https://schema.org',
      '@type': schemaType,
      name: page.seo.title,
      description: page.seo.description,
      url: new URL(page.path, siteUrl).toString(),
      inLanguage: state.project?.language ?? 'en',
      breadcrumb:
        state.pages.length > 1
          ? {
              '@type': 'BreadcrumbList',
              itemListElement: state.pages.slice(0, 2).map((currentPage, index) => ({
                '@type': 'ListItem',
                position: index + 1,
                name: currentPage.name,
                item: new URL(currentPage.path, siteUrl).toString(),
              })),
            }
          : undefined,
    },
    null,
    2,
  );
}

function buildPageHtml(state: LoadedPublisherState, page: PageContract, registry: PublisherBlockRegistry): string {
  const tokens = normalizeTokens(state.theme);
  const header = renderZone('header', resolveZone(page, 'header', state.project?.sharedShell), registry);
  const beforeContent = renderZone(
    'beforeContent',
    resolveZone(page, 'beforeContent', state.project?.sharedShell),
    registry,
  );
  const content = renderZone('content', resolveZone(page, 'content', state.project?.sharedShell), registry);
  const sidebar = renderZone('sidebar', resolveZone(page, 'sidebar', state.project?.sharedShell), registry);
  const afterContent = renderZone(
    'afterContent',
    resolveZone(page, 'afterContent', state.project?.sharedShell),
    registry,
  );
  const footer = renderZone('footer', resolveZone(page, 'footer', state.project?.sharedShell), registry);
  const breadcrumbs = buildBreadcrumbs(page, state.pages);
  const siteName = state.project?.siteSeo?.siteName ?? state.project?.name ?? page.name;

  return `<!doctype html>
<html lang="${escapeHtml(state.project?.language ?? 'en')}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(page.seo.title)}</title>
    <meta name="description" content="${escapeHtml(page.seo.description ?? '')}" />
    <meta name="robots" content="${escapeHtml(page.seo.robots ?? 'index,follow')}" />
    <meta property="og:site_name" content="${escapeHtml(siteName)}" />
    <link rel="canonical" href="${escapeHtml(page.seo.canonicalPath ?? page.path)}" />
    <link rel="manifest" href="/site.webmanifest" />
    <link rel="stylesheet" href="/assets/css/main.css" />
    <script type="application/ld+json">${buildSchemaJson(state, page)}</script>
  </head>
  <body data-page-id="${escapeHtml(page.id)}" data-page-slug="${escapeHtml(page.slug)}">
    ${header}
    ${beforeContent}
    ${breadcrumbs}
    <main class="publisher-layout ${sidebar ? 'publisher-layout--with-sidebar' : ''}">
      <div class="publisher-layout__content">${content}</div>
      ${sidebar ? `<div class="publisher-layout__sidebar">${sidebar}</div>` : ''}
    </main>
    ${afterContent}
    ${footer}
    <script>
      window.__PUBLISHER_THEME__ = ${JSON.stringify(tokens, null, 2)};
    </script>
    <script src="/assets/js/main.js"></script>
  </body>
</html>`;
}

function buildMainCss(state: LoadedPublisherState) {
  const tokenCss = tokensToCssVariables(normalizeTokens(state.theme));

  return `${tokenCss}

* { box-sizing: border-box; }
html { color-scheme: light; }
body {
  margin: 0;
  font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
  background: var(--color-background);
  color: var(--color-text);
}
a { color: inherit; text-decoration: none; }
.publisher-shell { width: min(1120px, calc(100vw - 2rem)); margin: 0 auto; }
.publisher-shell--narrow { width: min(760px, calc(100vw - 2rem)); }
.publisher-shell--row { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
.publisher-shell--cta { align-items: flex-start; }
.publisher-zone { width: 100%; }
.publisher-block { border-bottom: 1px solid var(--color-border); }
.publisher-header, .publisher-footer { background: var(--color-surface); }
.publisher-header .publisher-shell, .publisher-footer .publisher-shell { padding: 1rem 0; }
.publisher-brand { font-size: 1.1rem; font-weight: 700; }
.publisher-nav, .publisher-sidebar-nav { display: flex; gap: 1rem; flex-wrap: wrap; }
.publisher-band { background: var(--color-accent); color: var(--color-accentText); }
.publisher-band .publisher-shell { padding: 0.75rem 0; display: flex; gap: 0.75rem; flex-wrap: wrap; }
.publisher-band__eyebrow { font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.12em; font-weight: 700; }
.publisher-hero .publisher-shell, .publisher-prose .publisher-shell, .publisher-cta .publisher-shell { padding: 4rem 0; }
.publisher-hero h1 { font-size: clamp(2.5rem, 5vw, 4.5rem); line-height: 0.95; margin: 0.5rem 0 1rem; }
.publisher-hero__body, .publisher-richtext { font-size: 1.05rem; line-height: 1.7; color: var(--color-text); }
.publisher-eyebrow { display: inline-block; color: var(--color-primary); text-transform: uppercase; letter-spacing: 0.12em; font-size: 0.8rem; font-weight: 700; }
.publisher-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 2.75rem;
  padding: 0 1.1rem;
  border-radius: 999px;
  background: var(--color-primary);
  color: var(--color-primaryText);
  font-weight: 700;
}
.publisher-button--inverse { background: var(--color-surface); color: var(--color-text); }
.publisher-layout {
  width: min(1120px, calc(100vw - 2rem));
  margin: 0 auto;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 1.5rem;
}
.publisher-layout--with-sidebar { grid-template-columns: minmax(0, 2.5fr) minmax(240px, 1fr); align-items: start; }
.publisher-layout__sidebar { position: sticky; top: 1rem; }
.publisher-sidebar-block {
  margin: 2rem 0;
  padding: 1.25rem;
  background: var(--color-surfaceMuted);
  border: 1px solid var(--color-border);
  border-radius: 1rem;
}
.publisher-cta { background: linear-gradient(135deg, var(--color-primary), var(--color-accent)); color: var(--color-primaryText); }
.publisher-cta h2, .publisher-cta p { margin-top: 0; }
.publisher-breadcrumbs {
  width: min(1120px, calc(100vw - 2rem));
  margin: 1rem auto 0;
  display: flex;
  gap: 0.5rem;
  color: var(--color-textMuted);
  font-size: 0.875rem;
}
@media (max-width: 900px) {
  .publisher-shell--row, .publisher-layout--with-sidebar {
    grid-template-columns: 1fr;
    display: grid;
  }
}`;
}

function buildMainJs() {
  return `document.documentElement.dataset.publisherReady = 'true';`;
}

function buildManifest(state: LoadedPublisherState) {
  const name = state.project?.siteSeo?.siteName ?? state.project?.name ?? 'Publisher Site';
  return JSON.stringify(
    {
      name,
      short_name: name,
      start_url: '/',
      display: 'standalone',
      background_color: normalizeTokens(state.theme)['color.background'],
      theme_color: normalizeTokens(state.theme)['color.primary'],
    },
    null,
    2,
  );
}

function buildRobots(state: LoadedPublisherState) {
  const sitemapUrl = state.project?.siteUrl
    ? `${state.project.siteUrl.replace(/\/$/, '')}/sitemap.xml`
    : '/sitemap.xml';
  return `User-agent: *\nAllow: /\nSitemap: ${sitemapUrl}\n`;
}

function buildSitemap(state: LoadedPublisherState) {
  const baseUrl = state.project?.siteUrl ?? 'https://example.com';
  const urls = state.pages.map((page) => `<url><loc>${new URL(page.path, baseUrl).toString()}</loc></url>`).join('');

  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`;
}

export function buildPublisherStateFile(
  projectId: string | undefined,
  checks: CheckReport[],
  context: PublisherAgentContext,
): string {
  const job: PublisherJob = {
    id: `${projectId ?? 'publisher'}-${Date.now()}`,
    projectId,
    stage: 'assemble',
    status: checks.some((report) => report.status === 'fail') ? 'failed' : 'completed',
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    details: checks.filter((report) => report.status !== 'pass').map((report) => report.message),
  };

  return JSON.stringify(
    {
      projectId,
      currentContext: context,
      jobs: [job],
      lastBuildAt: new Date().toISOString(),
    },
    null,
    2,
  );
}

export function assemblePublisherProject(
  state: LoadedPublisherState,
  registry: PublisherBlockRegistry = publisherBlockRegistry,
  context: PublisherAgentContext = { mode: 'publisher' },
): PublisherAssemblyResult {
  const checks = runPublisherChecks(state, registry);

  if (!state.project) {
    return {
      files: {
        [PUBLISHER_CHECKS_FILE]: JSON.stringify(checks, null, 2),
      },
      checks,
    };
  }

  const files: Record<string, string> = {
    [PUBLISHER_CHECKS_FILE]: JSON.stringify(checks, null, 2),
    [PUBLISHER_GENERATED_CSS_FILE]: buildMainCss(state),
    [PUBLISHER_GENERATED_JS_FILE]: buildMainJs(),
    [PUBLISHER_MANIFEST_FILE]: buildManifest(state),
    [PUBLISHER_ROBOTS_FILE]: buildRobots(state),
    [PUBLISHER_SITEMAP_FILE]: buildSitemap(state),
    [PUBLISHER_STATE_FILE]: buildPublisherStateFile(state.project.id, checks, context),
  };

  state.pages.forEach((page) => {
    const targetPath =
      page.path === '/' ? `${PUBLISHER_GENERATED_DIR}/index.html` : `${PUBLISHER_GENERATED_DIR}${page.path}/index.html`;
    files[targetPath] = buildPageHtml(state, page, registry);
  });

  return { files, checks };
}
