import { WORK_DIR } from '~/utils/constants';

export const PUBLISHER_ROOT = `${WORK_DIR}/.bolt/publisher`;
export const PUBLISHER_PROJECT_FILE = `${PUBLISHER_ROOT}/project.json`;
export const PUBLISHER_THEME_FILE = `${PUBLISHER_ROOT}/theme.json`;
export const PUBLISHER_CHECKS_FILE = `${PUBLISHER_ROOT}/checks.json`;
export const PUBLISHER_REFERENCES_FILE = `${PUBLISHER_ROOT}/references.json`;
export const PUBLISHER_PAGES_DIR = `${PUBLISHER_ROOT}/pages`;
export const PUBLISHER_ASSETS_DIR = `${PUBLISHER_ROOT}/assets`;
export const PUBLISHER_INTAKE_DIR = `${PUBLISHER_ROOT}/intake`;
export const PUBLISHER_INTAKE_SESSION_FILE = `${PUBLISHER_INTAKE_DIR}/session.json`;
export const PUBLISHER_INTAKE_SOURCE_MANIFEST_FILE = `${PUBLISHER_INTAKE_DIR}/sources/manifest.json`;
export const PUBLISHER_INTAKE_SCRIPT_RUNS_FILE = `${PUBLISHER_INTAKE_DIR}/script-runs.json`;
export const PUBLISHER_INTAKE_PAGES_DIR = `${PUBLISHER_INTAKE_DIR}/pages`;
export const PUBLISHER_INTAKE_IMPORTED_SOURCES_DIR = `${PUBLISHER_INTAKE_DIR}/sources/imported`;
export const PUBLISHER_GENERATED_DIR = `${PUBLISHER_ROOT}/generated`;
export const PUBLISHER_GENERATED_ASSETS_DIR = `${PUBLISHER_GENERATED_DIR}/assets`;
export const PUBLISHER_GENERATED_SITE_ASSETS_DIR = `${PUBLISHER_GENERATED_ASSETS_DIR}/site`;
export const PUBLISHER_GENERATED_CSS_FILE = `${PUBLISHER_GENERATED_ASSETS_DIR}/css/main.css`;
export const PUBLISHER_GENERATED_JS_FILE = `${PUBLISHER_GENERATED_ASSETS_DIR}/js/main.js`;
export const PUBLISHER_STATE_FILE = `${PUBLISHER_ROOT}/state.json`;
export const PUBLISHER_MANIFEST_FILE = `${PUBLISHER_GENERATED_DIR}/site.webmanifest`;
export const PUBLISHER_ROBOTS_FILE = `${PUBLISHER_GENERATED_DIR}/robots.txt`;
export const PUBLISHER_SITEMAP_FILE = `${PUBLISHER_GENERATED_DIR}/sitemap.xml`;
export const PUBLISHER_PROVENANCE_FILE = `${PUBLISHER_GENERATED_DIR}/provenance.json`;

export function getPublisherPageFilePath(slug: string) {
  return `${PUBLISHER_PAGES_DIR}/${slug}.json`;
}

export function getPublisherIntakePageFilePath(pageId: string) {
  return `${PUBLISHER_INTAKE_PAGES_DIR}/${pageId}.json`;
}

function normalizeImportedSourcePath(relativePath: string) {
  const normalized = relativePath
    .replaceAll('\\', '/')
    .replace(/^\/+/, '')
    .split('/')
    .filter(Boolean)
    .map((segment) => segment.trim())
    .join('/');

  return normalized;
}

function appendNumericSuffix(filePath: string, suffix: number) {
  const slash = filePath.lastIndexOf('/');
  const parent = slash >= 0 ? filePath.slice(0, slash + 1) : '';
  const fileName = slash >= 0 ? filePath.slice(slash + 1) : filePath;
  const dot = fileName.lastIndexOf('.');
  const hasExtension = dot > 0;
  const baseName = hasExtension ? fileName.slice(0, dot) : fileName;
  const extension = hasExtension ? fileName.slice(dot) : '';

  return `${parent}${baseName}__dup-${suffix}${extension}`;
}

export function getPublisherImportedSourcePath(relativePath: string, bucket?: string) {
  const normalized = normalizeImportedSourcePath(relativePath);

  if (!bucket) {
    return `${PUBLISHER_INTAKE_IMPORTED_SOURCES_DIR}/${normalized}`;
  }

  return `${PUBLISHER_INTAKE_IMPORTED_SOURCES_DIR}/${bucket}/${normalized}`;
}

export function resolveUniqueImportedSourcePath(basePath: string, existingPaths: Set<string>) {
  if (!existingPaths.has(basePath)) {
    return basePath;
  }

  let next = appendNumericSuffix(basePath, 2);
  let suffix = 3;

  while (existingPaths.has(next)) {
    next = appendNumericSuffix(basePath, suffix);
    suffix += 1;
  }

  return next;
}

export function parseImportedSourcePath(storedPath: string) {
  const normalized = normalizeImportedSourcePath(storedPath);

  if (!normalized.startsWith(`${PUBLISHER_INTAKE_IMPORTED_SOURCES_DIR.slice(1)}/`)) {
    return undefined;
  }

  const relativePath = normalized.slice(PUBLISHER_INTAKE_IMPORTED_SOURCES_DIR.length + 1);
  const firstSegmentEnd = relativePath.indexOf('/');

  return {
    bucket: firstSegmentEnd > 0 ? relativePath.slice(0, firstSegmentEnd) : undefined,
    path: firstSegmentEnd > 0 ? relativePath.slice(firstSegmentEnd + 1) : relativePath,
  };
}
