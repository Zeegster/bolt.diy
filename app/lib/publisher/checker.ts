import { type CheckReport, type LoadedPublisherState, type PageContract, type SlotContract } from '~/types/publisher';
import type { PublisherBlockRegistry } from './block-registry';
import { resolveEffectiveZoneContract, validatePublisherContractGuards } from './contracts';
import { buildCanonicalUrl, buildSitemapXml, hasCompleteSeo } from './metadata';
import { normalizeTokens } from './token-engine';
import { hasNavigationTag } from './validator';

function createReport(report: CheckReport): CheckReport {
  return {
    gate: 'working',
    ...report,
  };
}

function createReleaseReport(report: CheckReport): CheckReport {
  return {
    gate: 'release',
    ...report,
  };
}

function countReports(reports: CheckReport[], gate: 'working' | 'release', status: 'warn' | 'fail') {
  return reports.filter((report) => report.gate === gate && report.status === status).length;
}

function normalizePath(path: string) {
  return path.replace(/\/+$/, '') || '/';
}

function isInternalHref(value: string) {
  return value.startsWith('/') && !value.startsWith('//');
}

function isKnownInternalHref(value: string, knownPaths: Set<string>) {
  if (!isInternalHref(value)) {
    return true;
  }

  return knownPaths.has(normalizePath(value.split('#')[0]));
}

export function runPublisherChecks(state: LoadedPublisherState, registry: PublisherBlockRegistry): CheckReport[] {
  const reports: CheckReport[] = [
    ...state.issues,
    ...state.checks,
    ...validatePublisherContractGuards(state, registry),
  ];
  const themeTokens = normalizeTokens(state.theme);

  if (!state.project) {
    return [
      ...reports,
      createReport({
        name: 'publisher-project',
        status: 'warn',
        message: 'Publisher contract has not been created yet.',
        details: ['Create .bolt/publisher/project.json and at least one page contract.'],
      }),
    ];
  }

  if (state.pages.length === 0) {
    reports.push(
      createReport({
        name: 'publisher-pages',
        status: 'fail',
        message: 'No page contracts found.',
        details: ['Add at least one file under .bolt/publisher/pages/*.json.'],
      }),
    );
  }

  if (state.project.multilingual && state.project.languages.length < 2) {
    reports.push(
      createReport({
        name: 'multilingual-config',
        status: 'fail',
        message: 'Multilingual mode requires at least two languages.',
        details: ['Add at least 2 language codes to project.languages or disable multilingual mode.'],
      }),
    );
  }

  if (!state.project.languages.includes(state.project.defaultLanguage)) {
    reports.push(
      createReport({
        name: 'default-language',
        status: 'fail',
        message: 'The default language must be present in project.languages.',
        details: [state.project.defaultLanguage],
      }),
    );
  }

  const projectAssets = [
    ['favicon', state.project.favicon],
    ['metaImage', state.project.metaImage],
    ['logo', state.project.logo],
  ] as const;

  for (const [assetName, assetRef] of projectAssets) {
    if (!assetRef?.path) {
      reports.push(
        createReport({
          name: 'project-assets',
          status: 'warn',
          message: `Project ${assetName} is not configured yet.`,
          details: ['Add the asset in Publisher site settings to improve branding and SEO readiness.'],
        }),
      );
      continue;
    }

    if (!state.availableFilePaths.includes(assetRef.path)) {
      reports.push(
        createReport({
          name: 'project-assets',
          status: 'fail',
          message: `Configured ${assetName} asset could not be found.`,
          details: [assetRef.path],
        }),
      );
    }
  }

  const seenPaths = new Map<string, string>();
  const seenCanonicals = new Map<string, string>();
  const knownPagePaths = new Set(state.pages.map((page) => normalizePath(page.path)));

  for (const page of state.pages) {
    if (seenPaths.has(page.path)) {
      reports.push(
        createReport({
          name: 'page-path-collision',
          status: 'fail',
          message: `Duplicate page path "${page.path}" detected.`,
          details: [seenPaths.get(page.path) || '', page.id],
          pageId: page.id,
        }),
      );
    } else {
      seenPaths.set(page.path, page.id);
    }

    const canonicalUrl = buildCanonicalUrl(page, state.project.siteUrl);

    if (canonicalUrl) {
      if (seenCanonicals.has(canonicalUrl)) {
        reports.push(
          createReleaseReport({
            name: 'canonical-collision',
            status: 'fail',
            message: `Page "${page.name}" resolves to a duplicate canonical URL.`,
            details: [seenCanonicals.get(canonicalUrl) || '', page.id, canonicalUrl],
            pageId: page.id,
          }),
        );
      } else {
        seenCanonicals.set(canonicalUrl, page.id);
      }
    }

    const headerHasNavigation = resolveEffectiveZoneContract(page, 'header', state.project.sharedShell)?.slots.some(
      (slot: SlotContract) => hasNavigationTag(registry.getById(slot.blockId)),
    );
    const sidebarHasNavigation = resolveEffectiveZoneContract(page, 'sidebar', state.project.sharedShell)?.slots.some(
      (slot: SlotContract) => hasNavigationTag(registry.getById(slot.blockId)),
    );

    if (headerHasNavigation && sidebarHasNavigation) {
      reports.push(
        createReport({
          name: 'navigation-guard',
          status: 'warn',
          message: `Page "${page.name}" defines navigation in both header and sidebar.`,
          details: ['Choose one primary navigation surface to avoid duplicate menu UX.'],
          pageId: page.id,
        }),
      );
    }

    if (state.project.multilingual && page.seo.title.trim().length === 0) {
      reports.push(
        createReport({
          name: 'multilingual-seo',
          status: 'warn',
          message: `Page "${page.name}" is missing language-aware SEO content.`,
          details: ['Populate localized title/description before export if pages diverge by locale.'],
          pageId: page.id,
        }),
      );
    }

    for (const [zone, zoneContract] of Object.entries(page.zones) as Array<
      [keyof PageContract['zones'], NonNullable<PageContract['zones'][keyof PageContract['zones']]>]
    >) {
      for (const slot of zoneContract.slots) {
        const block = registry.getById(slot.blockId);

        if (!block) {
          continue;
        }

        const assetWarnings = Object.entries(slot.props)
          .filter(([key]) => key.toLowerCase().includes('image') || key.toLowerCase().includes('logo'))
          .filter(([_key, value]) => typeof value !== 'string' || value.trim().length === 0);

        if (assetWarnings.length > 0) {
          reports.push(
            createReport({
              name: 'asset-sanity',
              status: 'warn',
              message: `Block "${block.name}" has empty asset references.`,
              details: assetWarnings.map(([key]) => `${page.name}/${slot.id}: ${key}`),
              pageId: page.id,
              zone,
            }),
          );
        }

        for (const [key, value] of Object.entries(slot.props)) {
          if (typeof value !== 'string' || value.trim().length === 0) {
            continue;
          }

          const loweredKey = key.toLowerCase();

          if (
            (loweredKey.includes('href') || loweredKey.includes('link')) &&
            !isKnownInternalHref(value, knownPagePaths)
          ) {
            reports.push(
              createReleaseReport({
                name: 'broken-internal-link',
                status: 'fail',
                message: `Block "${block.name}" references an unknown internal path.`,
                details: [`${page.name}/${slot.id}/${key}: ${value}`],
                pageId: page.id,
                zone,
              }),
            );
          }

          if (
            (loweredKey.includes('image') || loweredKey.includes('logo')) &&
            !value.startsWith('/assets/') &&
            !value.startsWith('http')
          ) {
            reports.push(
              createReleaseReport({
                name: 'image-policy',
                status: 'warn',
                message: `Block "${block.name}" uses an image reference outside the managed asset conventions.`,
                details: [`${page.name}/${slot.id}/${key}: ${value}`],
                pageId: page.id,
                zone,
              }),
            );
          }
        }
      }
    }

    if (!hasCompleteSeo(page.seo)) {
      reports.push(
        createReleaseReport({
          name: 'metadata-completeness',
          status: 'fail',
          message: `Page "${page.name}" is missing release-grade metadata.`,
          details: ['Release requires both title and description.'],
          pageId: page.id,
        }),
      );
    }

    if (!state.project.siteUrl) {
      reports.push(
        createReleaseReport({
          name: 'site-url',
          status: 'fail',
          message: `Page "${page.name}" cannot emit an absolute canonical URL because siteUrl is not configured.`,
          details: ['Set project.siteUrl or save a domain in site settings before release.'],
          pageId: page.id,
        }),
      );
    } else if (!canonicalUrl) {
      reports.push(
        createReleaseReport({
          name: 'canonical-url',
          status: 'fail',
          message: `Page "${page.name}" is missing an absolute canonical URL.`,
          details: ['Release output must emit canonical URLs using project.siteUrl.'],
          pageId: page.id,
        }),
      );
    }

    if (page.seo.robots?.toLowerCase().includes('noindex')) {
      reports.push(
        createReleaseReport({
          name: 'robots-sitemap-consistency',
          status: 'warn',
          message: `Page "${page.name}" is marked noindex and will be excluded from sitemap.xml.`,
          details: ['Confirm this is intentional before publish.'],
          pageId: page.id,
        }),
      );
    }
  }

  const usedTokenKeys = new Set<string>();

  for (const page of state.pages) {
    for (const zoneContract of Object.values(page.zones)) {
      zoneContract?.slots.forEach((slot) => {
        const block = registry.getById(slot.blockId);
        block?.tokenKeys.forEach((tokenKey) => usedTokenKeys.add(tokenKey));
      });
    }
  }

  const missingTokens = [...usedTokenKeys].filter((tokenKey) => !(tokenKey in themeTokens));

  if (missingTokens.length > 0) {
    reports.push(
      createReport({
        name: 'missing-tokens',
        status: 'warn',
        message: 'Some block token keys are not explicitly defined in theme.json.',
        details: missingTokens,
      }),
    );
  }

  const sitemapXml = buildSitemapXml(state);

  if (state.project.siteUrl && !sitemapXml.includes('<url><loc>')) {
    reports.push(
      createReleaseReport({
        name: 'sitemap-pages',
        status: 'warn',
        message: 'Sitemap is empty after release filtering.',
        details: ['Check robots directives and page registration before publish.'],
      }),
    );
  }

  const workingFailures = countReports(reports, 'working', 'fail');
  const releaseFailures = countReports(reports, 'release', 'fail');

  reports.push(
    createReport({
      name: 'working-gate',
      status: workingFailures > 0 ? 'warn' : 'pass',
      message:
        workingFailures > 0
          ? 'Publisher working gate found issues that should be fixed before export.'
          : 'Publisher working gate passed.',
    }),
  );

  reports.push(
    createReleaseReport({
      name: 'release-gate',
      status: releaseFailures > 0 ? 'fail' : 'pass',
      message:
        releaseFailures > 0
          ? 'Publisher release gate is blocking publish until release checks pass.'
          : 'Publisher release gate passed.',
    }),
  );

  return reports;
}
