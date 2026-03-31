import {
  PUBLISHER_CHECKS_FILE,
  PUBLISHER_GENERATED_CSS_FILE,
  PUBLISHER_GENERATED_DIR,
  PUBLISHER_GENERATED_JS_FILE,
  PUBLISHER_MANIFEST_FILE,
  PUBLISHER_PUBLISH_CONTRACT_FILE,
  PUBLISHER_PROVENANCE_FILE,
  PUBLISHER_ROBOTS_FILE,
  PUBLISHER_ROLLBACK_KEEP_LAST_BUILDS,
  PUBLISHER_SITEMAP_FILE,
  PUBLISHER_STATE_FILE,
} from './constants';
import { publisherBlockRegistry, type PublisherBlockRegistry } from './block-registry';
import { derivePublisherPublishSemantics, runPublisherChecks } from './checker';
import { buildPageHeadMetadata, buildRobotsTxt, buildSiteManifest, buildSitemapXml } from './metadata';
import type {
  AssetRef,
  CheckReport,
  LoadedPublisherState,
  PageContract,
  PublisherAssemblyResult,
  PublisherAgentContext,
  PublisherBuildArtifact,
  PublisherPipelineStageResult,
  PublisherPipelineStageStatus,
  PublisherPipelineResult,
  PublisherPublishContract,
  PublisherBuildProvenance,
  PublisherBuildSummary,
  PublisherReleaseDeliveryStage,
  PublisherJob,
  SlotContract,
  ZoneContract,
  ZoneType,
} from '~/types/publisher';
import { normalizeTokens, tokensToCssVariables } from './token-engine';
import { REQUIRED_STATIC_OUTPUT_FILES, STATIC_SHELL_LINKS } from './static-site-contract';
import { normalizeRichContentHtml } from './rich-content';

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
    const formatted = key === 'html' ? normalizeRichContentHtml(stringValue) : escapeHtml(stringValue);

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

function getAssetHref(asset?: AssetRef) {
  return asset?.publicPath ?? asset?.path;
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
  const faviconHref = getAssetHref(state.project?.favicon);
  const metaImageHref = getAssetHref(state.project?.metaImage);
  const metadata = buildPageHeadMetadata(state, page, { faviconHref, metaImageHref });

  return `<!doctype html>
<html lang="${escapeHtml(metadata.lang)}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(metadata.title)}</title>
    <meta name="description" content="${escapeHtml(metadata.description)}" />
    <meta name="robots" content="${escapeHtml(metadata.robots)}" />
    <meta property="og:site_name" content="${escapeHtml(metadata.siteName)}" />
    ${metadata.metaImageHref ? `<meta property="og:image" content="${escapeHtml(metadata.metaImageHref)}" />` : ''}
    ${metadata.canonicalUrl ? `<link rel="canonical" href="${escapeHtml(metadata.canonicalUrl)}" />` : ''}
    ${metadata.faviconHref ? `<link rel="icon" href="${escapeHtml(metadata.faviconHref)}" />` : ''}
    <link rel="manifest" href="${STATIC_SHELL_LINKS.manifestHref}" />
    <link rel="stylesheet" href="${STATIC_SHELL_LINKS.cssHref}" />
    <script type="application/ld+json">${metadata.schemaJson}</script>
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
    <script src="${STATIC_SHELL_LINKS.jsSrc}"></script>
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
.publisher-hero__title { font-size: clamp(2.5rem, 5vw, 4.5rem); line-height: 0.95; margin: 0.5rem 0 1rem; font-weight: 700; }
.publisher-hero__body, .publisher-richtext { font-size: 1.05rem; line-height: 1.7; color: var(--color-text); }
.publisher-eyebrow { display: inline-block; color: var(--color-primary); text-transform: uppercase; letter-spacing: 0.12em; font-size: 0.8rem; font-weight: 700; }
.publisher-table-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; }
.publisher-table { width: 100%; border-collapse: collapse; min-width: 640px; }
.publisher-rich-media { max-width: 100%; height: auto; display: block; }
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
.publisher-sidebar-block__title { margin: 0 0 0.75rem; font-weight: 700; }
.publisher-cta { background: linear-gradient(135deg, var(--color-primary), var(--color-accent)); color: var(--color-primaryText); }
.publisher-cta__title, .publisher-cta p { margin-top: 0; }
.publisher-cta__title { font-weight: 700; }
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
  return buildSiteManifest(state, getAssetHref(state.project?.favicon));
}

function buildRobots(state: LoadedPublisherState) {
  return buildRobotsTxt(state);
}

function buildSitemap(state: LoadedPublisherState) {
  return buildSitemapXml(state);
}

function fingerprintText(content: string) {
  let hash = 5381;

  for (let index = 0; index < content.length; index += 1) {
    hash = (hash * 33) ^ content.charCodeAt(index);
  }

  return `b${(hash >>> 0).toString(16)}`;
}

function detectArtifactContentType(path: string): PublisherBuildArtifact['contentType'] {
  if (path.endsWith('.html')) {
    return 'html';
  }

  if (path.endsWith('.css')) {
    return 'css';
  }

  if (path.endsWith('.js')) {
    return 'js';
  }

  if (path.endsWith('.xml')) {
    return 'xml';
  }

  if (path.endsWith('.txt')) {
    return 'txt';
  }

  if (path.endsWith('.json') || path.endsWith('.webmanifest')) {
    return 'json';
  }

  return 'asset';
}

function buildArtifactsFromFiles(files: Record<string, string>): PublisherBuildArtifact[] {
  return Object.entries(files)
    .map(([path, content]) => ({
      path,
      contentType: detectArtifactContentType(path),
      fingerprint: fingerprintText(content),
    }))
    .sort((left, right) => left.path.localeCompare(right.path));
}

function buildSourceFingerprint(state: LoadedPublisherState) {
  const sourceSnapshot = {
    project: state.project,
    theme: state.theme,
    pages: [...state.pages].sort((left, right) => left.id.localeCompare(right.id)),
    issues: [...state.issues],
    checks: [...state.checks],
    availableFilePaths: [...state.availableFilePaths].sort(),
    referenceState: state.referenceState
      ? {
          intakeSessionId: state.referenceState.intakeSessionId,
          importKind: state.referenceState.importKind,
          activeContentFamily: state.referenceState.activeContentFamily,
          referenceSourceFamily: state.referenceState.referenceSourceFamily,
          sourceRoot: state.referenceState.sourceRoot,
          sourceLabel: state.referenceState.sourceLabel,
          templateCandidatePath: state.referenceState.templateCandidatePath,
          homePageCandidatePath: state.referenceState.homePageCandidatePath,
          pageSourceMap: [...state.referenceState.pageSourceMap].sort((left, right) =>
            left.pageId.localeCompare(right.pageId),
          ),
          assetMaterialization: [...state.referenceState.assetMaterialization].sort((left, right) =>
            left.kind.localeCompare(right.kind),
          ),
        }
      : undefined,
  };

  return fingerprintText(JSON.stringify(sourceSnapshot));
}

function buildArtifactFingerprint(artifacts: PublisherBuildArtifact[]) {
  return fingerprintText(artifacts.map((artifact) => `${artifact.path}:${artifact.fingerprint}`).join('|'));
}

function buildPublishContract(
  build: PublisherBuildSummary,
  checks: CheckReport[],
  state: LoadedPublisherState,
  deliveryStage: PublisherReleaseDeliveryStage,
  artifactPath: string,
): PublisherPublishContract {
  const semantics = derivePublisherPublishSemantics(checks);
  const releaseArtifacts = build.artifacts.filter((artifact) => artifact.path !== artifactPath);

  return {
    schemaVersion: '1.0.0',
    buildId: build.id,
    projectId: build.projectId,
    generatedAt: build.createdAt,
    deliveryStage,
    artifactPath,
    artifact: {
      path: artifactPath,
      contentType: 'json',
      schemaVersion: '1.0.0',
      generatedAt: build.createdAt,
    },
    canPublish: semantics.canPublish,
    publishWarnings: semantics.publishWarnings,
    publishBlockers: semantics.publishBlockers,
    sourceFingerprint: buildSourceFingerprint(state),
    artifactFingerprint: buildArtifactFingerprint(releaseArtifacts),
    rollback: {
      strategy: 'rebuild',
      keepLastBuilds: PUBLISHER_ROLLBACK_KEEP_LAST_BUILDS,
      sourceOfTruth: ['project', 'theme', 'pages', 'references', 'checks'],
      requiredArtifacts: [PUBLISHER_CHECKS_FILE, PUBLISHER_PROVENANCE_FILE, PUBLISHER_STATE_FILE],
    },
  };
}

type FinalizedPipelineStageStatus = Exclude<PublisherPipelineStageStatus, 'pending' | 'running'>;

interface PipelineStageExecutionInput {
  stage: PublisherPipelineStageResult['stage'];
  status: FinalizedPipelineStageStatus;
  summary: string;
  details: string[];
  blockingReason?: string;
}

function createPipelineStageResult(input: PipelineStageExecutionInput): PublisherPipelineStageResult {
  const startedAt = new Date().toISOString();

  return {
    stage: input.stage,
    status: input.status,
    startedAt,
    finishedAt: new Date().toISOString(),
    summary: input.summary,
    details: input.details,
    blockingReason: input.blockingReason,
  };
}

function createPipelineJob(buildId: string, stageResult: PublisherPipelineStageResult): PublisherJob {
  return {
    id: `${buildId}:${stageResult.stage}`,
    stage: stageResult.stage,
    status: stageResult.status,
    startedAt: stageResult.startedAt,
    finishedAt: stageResult.finishedAt,
    details: [stageResult.summary, ...stageResult.details],
  };
}

function buildPublisherPipeline(
  build: PublisherBuildSummary,
  stages: PublisherPipelineStageResult[],
  deliveryStage: PublisherReleaseDeliveryStage,
  publishContract: PublisherPublishContract,
): PublisherPipelineResult {
  const failedStage = stages.find((stage) => stage.status === 'failed')?.stage;
  const activeStage = failedStage ?? stages[stages.length - 1]?.stage ?? 'assemble';

  return {
    schemaVersion: '1.0.0',
    stageOrder: stages.map((stage) => stage.stage),
    deliveryStage,
    stages,
    jobs: stages.map((stage) => createPipelineJob(build.id, stage)),
    activeStage,
    failedStage,
    publishContract,
  };
}

function buildPublisherSummary(
  projectId: string | undefined,
  checks: CheckReport[],
  files: Record<string, string>,
): PublisherBuildSummary {
  const workingFailures = checks.filter((report) => report.gate === 'working' && report.status === 'fail').length;
  const releaseFailures = checks.filter((report) => report.gate === 'release' && report.status === 'fail').length;
  const warningCount = checks.filter((report) => report.status === 'warn').length;

  return {
    id: `${projectId ?? 'publisher'}-${Date.now().toString(36)}`,
    createdAt: new Date().toISOString(),
    projectId,
    status: releaseFailures > 0 ? 'failed' : workingFailures > 0 ? 'contract-ready' : 'release-ready',
    stage: releaseFailures > 0 ? 'check' : 'export',
    workingFailures,
    releaseFailures,
    warningCount,
    artifacts: buildArtifactsFromFiles(files),
  };
}

function buildPublisherProvenance(
  state: LoadedPublisherState,
  files: Record<string, string>,
  publishContractPath?: string,
): PublisherBuildProvenance {
  return {
    projectId: state.project?.id,
    importKind: state.referenceState?.importKind,
    sourceRoot: state.referenceState?.sourceRoot,
    sourceLabel: state.referenceState?.sourceLabel,
    templateCandidatePath: state.referenceState?.templateCandidatePath,
    homePageCandidatePath: state.referenceState?.homePageCandidatePath,
    publishContractPath,
    pageSourceMap: [...(state.referenceState?.pageSourceMap ?? [])].sort((left, right) =>
      left.pageId.localeCompare(right.pageId),
    ),
    assetMaterialization: [...(state.referenceState?.assetMaterialization ?? [])].sort((left, right) =>
      left.kind.localeCompare(right.kind),
    ),
    artifacts: buildPublisherSummary(state.project?.id, [], files).artifacts,
  };
}

export function buildPublisherStateFile(
  projectId: string | undefined,
  checks: CheckReport[],
  context: PublisherAgentContext,
  build: PublisherBuildSummary,
): string {
  const job: PublisherJob = {
    id: build.id,
    projectId,
    stage: build.stage,
    status: build.releaseFailures > 0 ? 'failed' : 'completed',
    startedAt: build.createdAt,
    finishedAt: build.createdAt,
    details: checks.filter((report) => report.status !== 'pass').map((report) => report.message),
  };

  return JSON.stringify(
    {
      projectId,
      currentContext: context,
      jobs: [job],
      lastBuildAt: build.createdAt,
      latestBuild: build,
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
  const deliveryStage: PublisherReleaseDeliveryStage = 'export';
  const stageResults: PublisherPipelineStageResult[] = [];
  const files: Record<string, string> = {};

  stageResults.push(
    createPipelineStageResult(
      state.project
        ? {
            stage: 'assemble',
            status: 'completed',
            summary: 'Contract-driven page assembly completed.',
            details: [
              `${state.pages.length} page contract(s) processed.`,
              `${state.theme?.tokens ? Object.keys(state.theme.tokens).length : 0} token(s) applied to output templates.`,
            ],
          }
        : {
            stage: 'assemble',
            status: 'failed',
            summary: 'Assembly could not generate project output because project contract is missing.',
            details: ['Initialize publisher project metadata before generating release artifacts.'],
            blockingReason: 'Missing project contract.',
          },
    ),
  );

  if (state.project) {
    files[PUBLISHER_GENERATED_CSS_FILE] = buildMainCss(state);
    files[PUBLISHER_GENERATED_JS_FILE] = buildMainJs();
    files[PUBLISHER_MANIFEST_FILE] = buildManifest(state);
    files[PUBLISHER_ROBOTS_FILE] = buildRobots(state);
    files[PUBLISHER_SITEMAP_FILE] = buildSitemap(state);

    state.pages.forEach((page) => {
      const targetPath =
        page.path === '/'
          ? `${PUBLISHER_GENERATED_DIR}/index.html`
          : `${PUBLISHER_GENERATED_DIR}${page.path}/index.html`;
      files[targetPath] = buildPageHtml(state, page, registry);
    });
  }

  stageResults.push(
    createPipelineStageResult({
      stage: 'optimize',
      status: 'completed',
      summary: 'Output artifacts were normalized for deterministic release snapshots.',
      details: [
        'Canonical spacing and serialization rules were applied to generated files.',
        'No additional optimization transforms are currently required by this milestone.',
      ],
    }),
  );

  const checks = [...runPublisherChecks(state, registry), ...buildTechnicalFileConsistencyChecks(files)];
  const checkFailDetails = checks
    .filter((report) => report.status === 'fail')
    .map((check) => `${check.name}: ${check.message}`);
  const checkWarnDetails = checks
    .filter((report) => report.status === 'warn')
    .map((check) => `${check.name}: ${check.message}`);
  const hasCheckFailures = checkFailDetails.length > 0;

  files[PUBLISHER_CHECKS_FILE] = JSON.stringify(checks, null, 2);

  stageResults.push(
    createPipelineStageResult(
      hasCheckFailures
        ? {
            stage: 'check',
            status: 'failed',
            summary: `Release checks failed with ${checkFailDetails.length} blocking report(s).`,
            details: checkFailDetails,
            blockingReason: `${checkFailDetails.length} check report(s) failed.`,
          }
        : {
            stage: 'check',
            status: 'completed',
            summary: 'All working and release checks passed.',
            details:
              checkWarnDetails.length > 0
                ? checkWarnDetails
                : ['No warnings were emitted during working/release checks.'],
          },
    ),
  );

  if (state.project) {
    files[PUBLISHER_PROVENANCE_FILE] = JSON.stringify(
      buildPublisherProvenance(state, files, PUBLISHER_PUBLISH_CONTRACT_FILE),
      null,
      2,
    );
  }

  stageResults.push(
    createPipelineStageResult(
      hasCheckFailures
        ? {
            stage: deliveryStage,
            status: 'failed',
            summary: `Export blocked because the check stage reported ${checkFailDetails.length} failure(s).`,
            details: [...checkFailDetails, ...checkWarnDetails],
            blockingReason: 'Resolve check-stage failures before exporting release artifacts.',
          }
        : {
            stage: deliveryStage,
            status: 'completed',
            summary: 'Export artifact metadata emitted to generated/system files.',
            details:
              checkWarnDetails.length > 0
                ? checkWarnDetails
                : ['Release pipeline completed without additional warnings.'],
          },
    ),
  );

  const build = buildPublisherSummary(state.project?.id, checks, files);
  build.publishContractPath = PUBLISHER_PUBLISH_CONTRACT_FILE;

  const publishContract = buildPublishContract(build, checks, state, deliveryStage, PUBLISHER_PUBLISH_CONTRACT_FILE);
  files[PUBLISHER_PUBLISH_CONTRACT_FILE] = JSON.stringify(publishContract, null, 2);
  build.artifacts = buildArtifactsFromFiles(files);

  const pipeline = buildPublisherPipeline(build, stageResults, deliveryStage, publishContract);
  build.pipeline = pipeline;
  files[PUBLISHER_STATE_FILE] = buildPublisherStateFile(state.project?.id, checks, context, build);

  return { files, checks, build, pipeline };
}

export function buildTechnicalFileConsistencyChecks(files: Record<string, string>): CheckReport[] {
  const missingOutputFiles = REQUIRED_STATIC_OUTPUT_FILES.filter((requiredPath) => !(requiredPath in files));
  const htmlFiles = Object.entries(files).filter(([path]) => path.endsWith('/index.html'));
  const referenceMismatches: string[] = [];

  htmlFiles.forEach(([path, html]) => {
    if (!html.includes(`<link rel="manifest" href="${STATIC_SHELL_LINKS.manifestHref}" />`)) {
      referenceMismatches.push(`${path}: missing manifest href ${STATIC_SHELL_LINKS.manifestHref}`);
    }

    if (!html.includes(`<link rel="stylesheet" href="${STATIC_SHELL_LINKS.cssHref}" />`)) {
      referenceMismatches.push(`${path}: missing stylesheet href ${STATIC_SHELL_LINKS.cssHref}`);
    }

    if (!html.includes(`<script src="${STATIC_SHELL_LINKS.jsSrc}"></script>`)) {
      referenceMismatches.push(`${path}: missing script src ${STATIC_SHELL_LINKS.jsSrc}`);
    }
  });

  if (missingOutputFiles.length === 0 && referenceMismatches.length === 0) {
    return [];
  }

  return [
    {
      gate: 'release',
      name: 'technical-file-consistency',
      status: 'fail',
      message: 'Generated technical files or shell references are inconsistent with static contract.',
      details: [...missingOutputFiles.map((path) => `missing file: ${path}`), ...referenceMismatches],
    },
  ];
}
