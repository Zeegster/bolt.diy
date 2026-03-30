import type { IntakePageRole, IntakeSourceFamily, IntakeSourceSnapshot } from '~/types/publisher';

const noiseDirNames = new Set(['_pgbackup', '_pginfo', 'refs', '.git', '.svn', '.hg', 'node_modules', 'dist', 'build']);
const assetDirNames = new Set(['assets', 'asset', 'images', 'image', 'img', 'media', 'static', 'css', 'js', 'fonts']);
const sourceRootNames = new Set(['pages', 'content-source', 'content', 'docs', 'site']);
const legalTerms = new Set([
  'privacy',
  'terms',
  'cookie',
  'cookies',
  'legal',
  'disclaimer',
  'policy',
  'gdpr',
  'compliance',
]);
const referenceTerms = new Set(['reference', 'references', 'refs', 'source', 'sources']);

function getLastPathSegment(path: string) {
  const segments = path.split('/').filter(Boolean);
  return segments[segments.length - 1] ?? path;
}

function stripExtension(fileName: string) {
  const lastDot = fileName.lastIndexOf('.');

  if (lastDot <= 0) {
    return fileName;
  }

  return fileName.slice(0, lastDot);
}

function collapseToSlug(value: string) {
  let output = '';
  let pendingDash = false;

  for (const character of value.toLowerCase()) {
    const code = character.charCodeAt(0);
    const isLetter = code >= 97 && code <= 122;
    const isNumber = code >= 48 && code <= 57;

    if (isLetter || isNumber) {
      output += character;
      pendingDash = false;
      continue;
    }

    if (character === ' ' || character === '-' || character === '_' || character === '/' || character === '.') {
      if (!pendingDash && output.length > 0) {
        output += '-';
      }

      pendingDash = true;
    }
  }

  while (output.startsWith('-')) {
    output = output.slice(1);
  }

  while (output.endsWith('-')) {
    output = output.slice(0, -1);
  }

  return output;
}

function hasPathSegment(path: string, candidates: Set<string>) {
  return path
    .split('/')
    .filter(Boolean)
    .some((segment) => candidates.has(segment.toLowerCase()));
}

function isSupportedHtmlFile(path: string) {
  const lower = path.toLowerCase();
  return lower.endsWith('.html') || lower.endsWith('.htm');
}

function isSupportedDocumentFile(path: string) {
  const lower = path.toLowerCase();
  return lower.endsWith('.md') || lower.endsWith('.markdown') || lower.endsWith('.txt');
}

function isAssetFile(path: string) {
  const lower = path.toLowerCase();
  return (
    lower.endsWith('.png') ||
    lower.endsWith('.jpg') ||
    lower.endsWith('.jpeg') ||
    lower.endsWith('.webp') ||
    lower.endsWith('.gif') ||
    lower.endsWith('.svg') ||
    lower.endsWith('.ico') ||
    lower.endsWith('.avif') ||
    lower.endsWith('.webmanifest') ||
    lower.endsWith('.css') ||
    lower.endsWith('.js') ||
    lower.endsWith('.json') ||
    lower.endsWith('.woff') ||
    lower.endsWith('.woff2') ||
    lower.endsWith('.ttf') ||
    lower.endsWith('.otf')
  );
}

export function isNoisePath(path: string) {
  return hasPathSegment(path, noiseDirNames);
}

export function isAssetPath(path: string) {
  return hasPathSegment(path, assetDirNames) || isAssetFile(path);
}

export function isHtmlSourcePath(path: string) {
  return isSupportedHtmlFile(path);
}

export function isDocumentSourcePath(path: string) {
  return isSupportedDocumentFile(path);
}

export function isShellFragmentPath(path: string) {
  return hasPathSegment(path, new Set(['_layouts', '_partials', '_shell', 'layouts']));
}

export function isBlockLibraryPath(path: string) {
  const fileName = getLastPathSegment(path).toLowerCase();
  return (
    fileName === 'blocks.html' ||
    fileName === 'blocks.htm' ||
    fileName === 'blocks.md' ||
    hasPathSegment(path, new Set(['blocks', 'block-library']))
  );
}

export function inferSourceFamily(path: string, mimeType?: string, _isBinary?: boolean): IntakeSourceFamily {
  if (isAssetPath(path)) {
    return 'asset';
  }

  const lowerMime = mimeType?.toLowerCase();

  if (lowerMime?.startsWith('image/') || lowerMime === 'text/css' || lowerMime === 'application/javascript') {
    return 'asset';
  }

  if (isHtmlSourcePath(path)) {
    return 'html';
  }

  if (isDocumentSourcePath(path)) {
    return 'document';
  }

  return 'unknown';
}

export function inferPageRoleFromPath(path: string): IntakePageRole {
  const lowerPath = path.toLowerCase();
  const fileName = getLastPathSegment(lowerPath);

  if (isNoisePath(path)) {
    return 'backup';
  }

  if (isBlockLibraryPath(path)) {
    return 'component-library';
  }

  if (hasPathSegment(path, referenceTerms)) {
    return 'reference';
  }

  if (fileName.startsWith('index.')) {
    return 'home';
  }

  if (
    hasPathSegment(path, legalTerms) ||
    fileName.includes('privacy') ||
    fileName.includes('terms') ||
    fileName.includes('cookie')
  ) {
    return 'legal';
  }

  return 'article';
}

export function buildPagePathFromSourcePath(path: string) {
  const segments = path.split('/').filter(Boolean);
  const fileName = segments[segments.length - 1] ?? path;
  const baseName = stripExtension(fileName);

  if (baseName.toLowerCase() === 'index') {
    return '/';
  }

  const pathSegments = [...segments];
  pathSegments.pop();

  if (pathSegments.length > 0 && sourceRootNames.has(pathSegments[0].toLowerCase())) {
    pathSegments.shift();
  }

  const slugSegments = pathSegments
    .concat(baseName)
    .map((segment) => collapseToSlug(segment))
    .filter(Boolean);

  if (slugSegments.length === 0) {
    return '/';
  }

  return `/${slugSegments.join('/')}/`;
}

export function buildPageSlugFromSourcePath(path: string) {
  const pagePath = buildPagePathFromSourcePath(path);

  if (pagePath === '/') {
    return 'home';
  }

  const segments = pagePath.split('/').filter(Boolean);

  return segments[segments.length - 1] ?? 'page';
}

export function isTemplateCandidatePath(path: string) {
  const lower = path.toLowerCase();
  const segments = lower.split('/').filter(Boolean);
  const fileName = segments[segments.length - 1] ?? lower;
  const depth = segments.length;

  if (fileName !== 'index.html') {
    return false;
  }

  if (hasPathSegment(path, new Set(['pages', 'content-source', 'content', 'docs']))) {
    return false;
  }

  return depth <= 2;
}

export function isHomeCandidatePath(path: string) {
  const lower = path.toLowerCase();
  const fileName = getLastPathSegment(lower);

  if (fileName.startsWith('index.')) {
    return true;
  }

  return false;
}

export function isPageLikeSource(source: IntakeSourceSnapshot) {
  const family = inferSourceFamily(source.path, source.mimeType, source.isBinary);
  return family === 'html' || family === 'document';
}

export function shouldIgnoreSourcePath(path: string) {
  return isNoisePath(path);
}

export function buildRawSourcePreview(text: string, maxLines = 10) {
  const lines = text.split('\n');
  const previewLines: string[] = [];

  for (const line of lines) {
    previewLines.push(line);

    if (previewLines.length >= maxLines) {
      break;
    }
  }

  return previewLines.join('\n');
}

export function getSourceFileName(path: string) {
  return getLastPathSegment(path);
}

export function getSourceBaseName(path: string) {
  return stripExtension(getSourceFileName(path));
}

export function normalizeSlug(value: string) {
  return collapseToSlug(value) || 'page';
}

export function normalizePathFromSegments(segments: string[]) {
  const cleaned = segments.map((segment) => normalizeSlug(segment)).filter(Boolean);

  if (cleaned.length === 0) {
    return '/';
  }

  if (cleaned.length === 1 && cleaned[0] === 'home') {
    return '/';
  }

  return `/${cleaned.join('/')}/`;
}
