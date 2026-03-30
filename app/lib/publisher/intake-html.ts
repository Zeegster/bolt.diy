import type { IntakePageDraft, IntakeSourceSnapshot, IntakeWarning, IntakeSectionDraft } from '~/types/publisher';
import {
  buildPagePathFromSourcePath,
  buildPageSlugFromSourcePath,
  buildRawSourcePreview,
  getSourceBaseName,
  inferPageRoleFromPath,
  normalizeSlug,
} from './intake-path';

const contentRootSelectors = [
  'main.page-main',
  'main',
  'article.article-page',
  'article',
  '[data-content-root]',
  '.page-content',
  '.content',
  'body',
];

function collapseWhitespace(value: string) {
  let output = '';
  let pendingSpace = false;

  for (const character of value.trim()) {
    const isSpace =
      character === ' ' ||
      character === '\n' ||
      character === '\t' ||
      character === '\r' ||
      character === '\f' ||
      character === '\v';

    if (isSpace) {
      pendingSpace = output.length > 0;
      continue;
    }

    if (pendingSpace && output.length > 0) {
      output += ' ';
      pendingSpace = false;
    }

    output += character;
  }

  return output;
}

function createWarning(code: string, message: string, details: string[] = []): IntakeWarning {
  return {
    code,
    message,
    severity: 'warn',
    details,
  };
}

function readMetaContent(document: Document, selector: string) {
  const element = document.querySelector(selector);
  const content = element?.getAttribute('content') ?? '';

  return collapseWhitespace(content);
}

function readTitle(document: Document) {
  const title = collapseWhitespace(document.querySelector('title')?.textContent ?? '');

  if (title) {
    return title;
  }

  const ogTitle = readMetaContent(document, 'meta[property="og:title"]');

  if (ogTitle) {
    return ogTitle;
  }

  return readMetaContent(document, 'meta[name="twitter:title"]');
}

function selectContentRoot(document: Document) {
  for (const selector of contentRootSelectors) {
    const candidate = document.querySelector(selector);

    if (candidate && collapseWhitespace(candidate.textContent ?? '').length > 0) {
      return candidate as HTMLElement;
    }
  }

  return (document.body ?? document.documentElement) as HTMLElement;
}

function firstTextFromSelector(document: Document, selector: string) {
  const element = document.querySelector(selector);
  return collapseWhitespace(element?.textContent ?? '');
}

function firstParagraphText(root: Element) {
  for (const paragraph of Array.from(root.querySelectorAll('p'))) {
    const text = collapseWhitespace(paragraph.textContent ?? '');

    if (text) {
      return text;
    }
  }

  const text = collapseWhitespace(root.textContent ?? '');

  return text.slice(0, 160);
}

function isHeadingElement(element: Element) {
  const tag = element.tagName.toUpperCase();
  return tag === 'H1' || tag === 'H2' || tag === 'H3' || tag === 'H4' || tag === 'H5' || tag === 'H6';
}

function headingLevel(element: Element) {
  const tag = element.tagName.toUpperCase();

  if (tag.length === 2 && tag.startsWith('H')) {
    const level = Number(tag.slice(1));
    return Number.isInteger(level) && level >= 1 && level <= 6 ? level : undefined;
  }

  return undefined;
}

function extractSectionContent(element: Element) {
  return element.outerHTML;
}

function createSection(
  id: string,
  kind: IntakeSectionDraft['kind'],
  content: string,
  heading?: string,
  level?: 1 | 2 | 3 | 4 | 5 | 6,
): IntakeSectionDraft {
  return {
    id,
    kind,
    content,
    heading,
    level,
  };
}

function buildSectionTextFromBlocks(blocks: string[]) {
  return blocks.join('\n');
}

function collectSectionsFromRoot(root: Element, baseId: string, titleState: { h1?: string }) {
  const sections: IntakeSectionDraft[] = [];
  let currentHeading: string | undefined;
  let currentLevel: 2 | 3 | 4 | 5 | 6 | undefined;
  let currentContent: string[] = [];

  const pushCurrent = () => {
    if (currentContent.length === 0 && !currentHeading) {
      return;
    }

    const content = buildSectionTextFromBlocks(currentContent).trim();

    if (!content && !currentHeading) {
      currentContent = [];
      currentHeading = undefined;
      currentLevel = undefined;

      return;
    }

    sections.push(
      createSection(
        `${baseId}-section-${sections.length + 1}`,
        currentHeading ? 'html' : 'paragraph',
        content,
        currentHeading,
        currentLevel,
      ),
    );
    currentContent = [];
    currentHeading = undefined;
    currentLevel = undefined;
  };

  for (const child of Array.from(root.children)) {
    const tag = child.tagName.toUpperCase();

    if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT') {
      continue;
    }

    if (isHeadingElement(child)) {
      const level = headingLevel(child);
      const text = collapseWhitespace(child.textContent ?? '');

      if (!text) {
        continue;
      }

      if (level === 1 && !titleState.h1) {
        titleState.h1 = text;
        continue;
      }

      if (!titleState.h1) {
        titleState.h1 = text;
      }

      pushCurrent();
      currentHeading = text;
      currentLevel = level && level >= 2 ? (level as 2 | 3 | 4 | 5 | 6) : 2;
      continue;
    }

    if (!currentHeading && currentContent.length === 0) {
      currentLevel = undefined;
    }

    currentContent.push(extractSectionContent(child));
  }

  pushCurrent();

  return sections;
}

function collectFallbackSection(root: Element, baseId: string) {
  const content = root.innerHTML.trim();

  if (!content) {
    return [];
  }

  return [createSection(`${baseId}-section-1`, 'html', content)];
}

function createConfidenceScore(values: Array<boolean>) {
  const score = values.filter(Boolean).length;
  return Math.max(0.35, Math.min(1, score / Math.max(values.length, 1)));
}

function normalizePageDraft(partial: {
  source: IntakeSourceSnapshot;
  title: string;
  description?: string;
  h1?: string;
  sections: IntakeSectionDraft[];
  warnings: IntakeWarning[];
  confidence: number;
  rawSourcePreview: string;
}): IntakePageDraft {
  const role = inferPageRoleFromPath(partial.source.path);
  const path = buildPagePathFromSourcePath(partial.source.path);
  const slug = buildPageSlugFromSourcePath(partial.source.path);

  return {
    id: slug,
    name: partial.title,
    sourcePath: partial.source.path,
    sourceFamily: 'html',
    role,
    slug: normalizeSlug(slug),
    path,
    title: partial.title,
    description: partial.description,
    h1: partial.h1,
    sections: partial.sections,
    seo: {
      title: partial.title,
      description: partial.description,
      schemaType: role === 'legal' ? 'Article' : 'WebPage',
      canonicalPath: path,
      robots: 'index,follow',
    },
    shellCandidates: [],
    warnings: partial.warnings,
    confidence: partial.confidence,
    checks: [],
    rawSourcePreview: partial.rawSourcePreview,
  };
}

export function extractHtmlPageDraftFromDocument(document: Document, source: IntakeSourceSnapshot): IntakePageDraft {
  const rawSource = source.html ?? source.text ?? '';
  const preview = buildRawSourcePreview(rawSource);
  const warnings: IntakeWarning[] = [];
  const root = selectContentRoot(document);
  const h1Text = collapseWhitespace(root.querySelector('h1')?.textContent ?? firstTextFromSelector(document, 'h1'));
  const metaTitle = readTitle(document);
  const metaDescription =
    readMetaContent(document, 'meta[name="description"]') ||
    readMetaContent(document, 'meta[property="og:description"]') ||
    readMetaContent(document, 'meta[name="twitter:description"]');
  const title = metaTitle || h1Text || collapseWhitespace(source.label ?? getSourceBaseName(source.path));
  const titleFromParagraph = firstParagraphText(root);
  const h1 = h1Text || title;
  const sections = collectSectionsFromRoot(root, normalizeSlug(getSourceBaseName(source.path) || 'page'), { h1 });

  let normalizedSections = sections;

  if (normalizedSections.length === 0) {
    normalizedSections = collectFallbackSection(root, normalizeSlug(getSourceBaseName(source.path) || 'page'));
  }

  if (!metaTitle) {
    warnings.push(createWarning('missing-html-title', `No document title found for ${source.path}.`));
  }

  if (!metaDescription) {
    warnings.push(createWarning('missing-html-description', `No meta description found for ${source.path}.`));
  }

  if (!h1Text) {
    warnings.push(createWarning('missing-html-h1', `No H1 found for ${source.path}.`));
  }

  if (normalizedSections.length === 0) {
    warnings.push(createWarning('empty-html-sections', `No content sections could be extracted from ${source.path}.`));
  }

  return normalizePageDraft({
    source,
    title,
    description:
      metaDescription ||
      (titleFromParagraph && titleFromParagraph !== title ? titleFromParagraph.slice(0, 160) : undefined),
    h1,
    sections: normalizedSections,
    warnings,
    confidence: createConfidenceScore([
      Boolean(metaTitle),
      Boolean(metaDescription),
      Boolean(h1Text),
      normalizedSections.length > 0,
    ]),
    rawSourcePreview: preview,
  });
}

export function extractHtmlPageDraftFromHtml(html: string, source: IntakeSourceSnapshot) {
  if (typeof DOMParser === 'undefined') {
    return normalizePageDraft({
      source,
      title: collapseWhitespace(source.label ?? getSourceBaseName(source.path)),
      h1: collapseWhitespace(source.label ?? getSourceBaseName(source.path)),
      sections: [],
      warnings: [createWarning('html-parser-unavailable', `DOMParser is not available for ${source.path}.`)],
      confidence: 0.35,
      rawSourcePreview: buildRawSourcePreview(html),
    });
  }

  const document = new DOMParser().parseFromString(html, 'text/html');

  return extractHtmlPageDraftFromDocument(document, source);
}

export function extractHtmlPageDraftFromSource(
  source: IntakeSourceSnapshot,
  documentFactory?: (source: IntakeSourceSnapshot) => Document | undefined,
) {
  const rawHtml = source.html ?? source.text ?? '';

  if (documentFactory) {
    const document = documentFactory(source);

    if (document) {
      return extractHtmlPageDraftFromDocument(document, source);
    }
  }

  return extractHtmlPageDraftFromHtml(rawHtml, source);
}
