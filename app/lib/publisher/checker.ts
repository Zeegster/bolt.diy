import {
  optionalPublisherZones,
  type CheckReport,
  type LoadedPublisherState,
  type PageContract,
  type SlotContract,
} from '~/types/publisher';
import type { PublisherBlockRegistry } from './block-registry';
import { resolveEffectiveZoneContract, validatePublisherContractGuards } from './contracts';
import {
  buildCanonicalUrl,
  buildExpectedSitemapUrl,
  buildRobotsTxt,
  buildSchemaJson,
  buildSitemapXml,
  extractSitemapLocations,
  hasCompleteSeo,
  parseRobotsSitemapUrl,
} from './metadata';
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

function isGateSummaryReport(report: CheckReport) {
  return report.name === 'working-gate' || report.name === 'release-gate';
}

function formatPublishDiagnostic(report: CheckReport) {
  const gate = report.gate ?? 'working';
  const target = report.pageId ? `${report.pageId}${report.zone ? `/${report.zone}` : ''}` : 'project';

  return `${gate}:${report.name}:${target} — ${report.message}`;
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

function isUnsafeHref(value: string) {
  const normalized = value.trim().toLowerCase();
  return normalized.startsWith('javascript:') || normalized.startsWith('data:text/html');
}

function isExplicitExternalHref(value: string) {
  const normalized = value.trim().toLowerCase();
  return (
    normalized.startsWith('http://') ||
    normalized.startsWith('https://') ||
    normalized.startsWith('mailto:') ||
    normalized.startsWith('tel:') ||
    normalized.startsWith('#')
  );
}

function isManagedAssetPublicPath(value: string) {
  return value.startsWith('/assets/');
}

function hasHeadingTags(value: string) {
  return /<h[1-6][\s>]/i.test(value);
}

function containsArticleMarkup(value: string) {
  return /<(p|h[1-6]|ul|ol|li|blockquote|table)\b/i.test(value);
}

function collectManagedAssetPublicPaths(state: LoadedPublisherState) {
  const assetPaths = new Set<string>();

  [state.project?.favicon, state.project?.metaImage, state.project?.logo].forEach((assetRef) => {
    if (assetRef?.publicPath) {
      assetPaths.add(assetRef.publicPath);
    }
  });

  state.referenceState?.assetMaterialization.forEach((asset) => {
    if (asset.publicPath) {
      assetPaths.add(asset.publicPath);
    }
  });

  return assetPaths;
}

export function derivePublisherPublishSemantics(checks: CheckReport[]) {
  const workingFailures = countReports(checks, 'working', 'fail');
  const releaseFailures = countReports(checks, 'release', 'fail');
  const releaseWarnings = countReports(checks, 'release', 'warn');

  const publishBlockers = checks
    .filter((report) => report.status === 'fail' && !isGateSummaryReport(report))
    .map((report) => formatPublishDiagnostic(report));
  const publishWarnings = checks
    .filter((report) => report.gate === 'release' && report.status === 'warn' && !isGateSummaryReport(report))
    .map((report) => formatPublishDiagnostic(report));

  return {
    workingFailures,
    releaseFailures,
    releaseWarnings,
    canPublish: workingFailures === 0 && releaseFailures === 0,
    publishBlockers,
    publishWarnings,
  };
}

export function runPublisherChecks(state: LoadedPublisherState, registry: PublisherBlockRegistry): CheckReport[] {
  const reports: CheckReport[] = [
    ...state.issues,
    ...state.checks,
    ...validatePublisherContractGuards(state, registry),
  ];
  const themeTokens = normalizeTokens(state.theme);
  const managedAssetPublicPaths = collectManagedAssetPublicPaths(state);

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

    if (assetRef.publicPath && !isManagedAssetPublicPath(assetRef.publicPath)) {
      reports.push(
        createReleaseReport({
          name: 'project-asset-policy',
          status: 'warn',
          message: `Project ${assetName} uses a non-managed public asset path.`,
          details: [assetRef.publicPath, 'Prefer /assets/* paths so release output remains deterministic.'],
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

    const decorativeZones = ['header', ...optionalPublisherZones, 'footer'] as const;

    for (const zone of decorativeZones) {
      const effectiveZoneContract = resolveEffectiveZoneContract(page, zone, state.project.sharedShell);

      if (!effectiveZoneContract) {
        continue;
      }

      for (const slot of effectiveZoneContract.slots) {
        const block = registry.getById(slot.blockId);

        if (!block) {
          continue;
        }

        const template = registry.getTemplate(slot.blockId);

        if (typeof template === 'string' && hasHeadingTags(template)) {
          reports.push(
            createReport({
              name: 'template-heading-injection',
              status: 'fail',
              message: `Block "${block.name}" injects heading tags in a decorative zone template.`,
              details: [
                `${page.name}/${slot.id}: ${block.templateFile}`,
                'Keep heading semantics source-owned in content-zone prose instead of decorative templates.',
              ],
              pageId: page.id,
              zone,
            }),
          );
        }

        const decorativeArticlePayload = Object.entries(slot.props).filter(([key, value]) => {
          if (typeof value !== 'string') {
            return false;
          }

          const normalizedValue = value.trim();

          if (normalizedValue.length === 0) {
            return false;
          }

          const loweredKey = key.toLowerCase();

          if (loweredKey.includes('html')) {
            return true;
          }

          return loweredKey.includes('body') && containsArticleMarkup(normalizedValue);
        });

        if (decorativeArticlePayload.length > 0) {
          reports.push(
            createReport({
              name: 'decorative-zone-content-injection',
              status: 'fail',
              message: `Block "${block.name}" carries article payload in a decorative zone.`,
              details: decorativeArticlePayload.map(
                ([key, value]) => `${page.name}/${slot.id}/${key}: ${String(value).slice(0, 120)}`,
              ),
              pageId: page.id,
              zone,
            }),
          );
        }
      }
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
                details: [
                  `${page.name}/${slot.id}/${key}: ${value}`,
                  `Inspect the page contract for ${page.id} and the generated output for ${page.path}.`,
                ],
                pageId: page.id,
                zone,
              }),
            );
          }

          if ((loweredKey.includes('href') || loweredKey.includes('link')) && isUnsafeHref(value)) {
            reports.push(
              createReleaseReport({
                name: 'link-policy',
                status: 'fail',
                message: `Block "${block.name}" uses an unsafe link protocol.`,
                details: [`${page.name}/${slot.id}/${key}: ${value}`],
                pageId: page.id,
                zone,
              }),
            );
          }

          if (
            (loweredKey.includes('href') || loweredKey.includes('link')) &&
            !isInternalHref(value) &&
            !isExplicitExternalHref(value)
          ) {
            reports.push(
              createReleaseReport({
                name: 'link-format',
                status: 'warn',
                message: `Block "${block.name}" uses an ambiguous link format.`,
                details: [
                  `${page.name}/${slot.id}/${key}: ${value}`,
                  'Use internal links starting with "/" or explicit external protocols (https://, mailto:, tel:).',
                ],
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

          if ((loweredKey.includes('image') || loweredKey.includes('logo')) && value.startsWith('/.bolt/publisher/')) {
            reports.push(
              createReleaseReport({
                name: 'managed-asset-internal-path',
                status: 'fail',
                message: `Block "${block.name}" leaks an internal publisher asset path into output.`,
                details: [
                  `${page.name}/${slot.id}/${key}: ${value}`,
                  'Use the public /assets/* path instead of internal .bolt paths.',
                ],
                pageId: page.id,
                zone,
              }),
            );
          }

          if (
            (loweredKey.includes('image') || loweredKey.includes('logo')) &&
            isManagedAssetPublicPath(value) &&
            managedAssetPublicPaths.size > 0 &&
            !managedAssetPublicPaths.has(value)
          ) {
            reports.push(
              createReleaseReport({
                name: 'managed-asset-reference',
                status: 'warn',
                message: `Block "${block.name}" references an unmanaged public asset.`,
                details: [
                  `${page.name}/${slot.id}/${key}: ${value}`,
                  'Confirm this path is intentionally materialized by the publisher pipeline.',
                ],
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
          details: [
            'Release requires both title and description.',
            'Repair metadata in intake review or page contract.',
          ],
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
          details: [
            'Set project.siteUrl or save a domain in site settings before release.',
            'Inspect project.json or Publisher site settings.',
          ],
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

    if (state.project.siteUrl && canonicalUrl) {
      try {
        const schema = JSON.parse(buildSchemaJson(state, page)) as Record<string, unknown>;
        const schemaUrl = typeof schema.url === 'string' ? schema.url : undefined;
        const schemaType = typeof schema['@type'] === 'string' ? schema['@type'] : undefined;
        const expectedSchemaType = page.seo.schemaType ?? 'WebPage';

        if (!schemaUrl) {
          reports.push(
            createReleaseReport({
              name: 'schema-url',
              status: 'fail',
              message: `Page "${page.name}" schema is missing a URL field.`,
              details: ['Generated schema JSON-LD must include absolute url matching canonical output.'],
              pageId: page.id,
            }),
          );
        } else if (schemaUrl !== canonicalUrl) {
          reports.push(
            createReleaseReport({
              name: 'schema-canonical-consistency',
              status: 'fail',
              message: `Page "${page.name}" schema URL does not match canonical URL.`,
              details: [schemaUrl, canonicalUrl],
              pageId: page.id,
            }),
          );
        }

        if (schemaType !== expectedSchemaType) {
          reports.push(
            createReleaseReport({
              name: 'schema-type-consistency',
              status: 'warn',
              message: `Page "${page.name}" schema type drifted from SEO contract.`,
              details: [schemaType ?? 'undefined', expectedSchemaType],
              pageId: page.id,
            }),
          );
        }
      } catch {
        reports.push(
          createReleaseReport({
            name: 'schema-json',
            status: 'fail',
            message: `Page "${page.name}" generated invalid schema JSON-LD.`,
            details: ['Inspect metadata generator output before publish.'],
            pageId: page.id,
          }),
        );
      }
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
  const robotsTxt = buildRobotsTxt(state);

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

  if (state.project.siteUrl) {
    const robotsSitemapUrl = parseRobotsSitemapUrl(robotsTxt);
    const expectedSitemapUrl = buildExpectedSitemapUrl(state.project.siteUrl);

    if (!robotsSitemapUrl || robotsSitemapUrl !== expectedSitemapUrl) {
      reports.push(
        createReleaseReport({
          name: 'robots-sitemap-url',
          status: 'fail',
          message: 'robots.txt sitemap directive does not match release siteUrl.',
          details: [`actual: ${robotsSitemapUrl ?? 'missing'}`, `expected: ${expectedSitemapUrl}`],
        }),
      );
    }

    const sitemapLocations = new Set(extractSitemapLocations(sitemapXml));
    const expectedIndexedUrls = new Set<string>();
    const expectedNoindexUrls = new Set<string>();

    state.pages.forEach((page) => {
      const canonicalUrl = buildCanonicalUrl(page, state.project?.siteUrl);

      if (!canonicalUrl) {
        return;
      }

      if (page.seo.robots?.toLowerCase().includes('noindex')) {
        expectedNoindexUrls.add(canonicalUrl);
      } else {
        expectedIndexedUrls.add(canonicalUrl);
      }
    });

    const missingIndexedUrls = [...expectedIndexedUrls].filter((url) => !sitemapLocations.has(url));

    if (missingIndexedUrls.length > 0) {
      reports.push(
        createReleaseReport({
          name: 'sitemap-canonical-consistency',
          status: 'fail',
          message: 'Sitemap is missing canonical URLs for indexable pages.',
          details: missingIndexedUrls,
        }),
      );
    }

    const leakedNoindexUrls = [...expectedNoindexUrls].filter((url) => sitemapLocations.has(url));

    if (leakedNoindexUrls.length > 0) {
      reports.push(
        createReleaseReport({
          name: 'sitemap-noindex-leak',
          status: 'fail',
          message: 'Sitemap includes pages marked as noindex.',
          details: leakedNoindexUrls,
        }),
      );
    }
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
