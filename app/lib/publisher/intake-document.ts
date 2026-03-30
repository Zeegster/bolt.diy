import type { IntakePageDraft, IntakeSectionDraft, IntakeSourceSnapshot, IntakeWarning } from '~/types/publisher';
import {
  buildPagePathFromSourcePath,
  buildPageSlugFromSourcePath,
  buildRawSourcePreview,
  getSourceBaseName,
  inferPageRoleFromPath,
  normalizeSlug,
} from './intake-path';

interface DocumentAstBlock {
  kind: 'heading' | 'paragraph' | 'list' | 'quote' | 'code';
  text: string;
  level?: 1 | 2 | 3 | 4 | 5 | 6;
  items?: string[];
}

interface ParsedDocumentMeta {
  title?: string;
  description?: string;
  h1?: string;
}

interface ParsedDocumentAst {
  meta: ParsedDocumentMeta;
  blocks: DocumentAstBlock[];
  warnings: IntakeWarning[];
}

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

function escapeHtml(value: string) {
  let output = '';

  for (const character of value) {
    switch (character) {
      case '&':
        output += '&amp;';
        break;
      case '<':
        output += '&lt;';
        break;
      case '>':
        output += '&gt;';
        break;
      case '"':
        output += '&quot;';
        break;
      case "'":
        output += '&#39;';
        break;
      default:
        output += character;
        break;
    }
  }

  return output;
}

function splitLines(text: string) {
  const lines: string[] = [];
  let current = '';

  for (const character of text) {
    if (character === '\n') {
      lines.push(current);
      current = '';
      continue;
    }

    if (character === '\r') {
      continue;
    }

    current += character;
  }

  lines.push(current);

  return lines;
}

function isBlankLine(line: string) {
  return collapseWhitespace(line).length === 0;
}

function trimLine(line: string) {
  return collapseWhitespace(line);
}

function isHeadingLine(line: string) {
  const trimmed = line.trimStart();

  if (!trimmed.startsWith('#')) {
    return undefined;
  }

  let level = 0;

  for (const character of trimmed) {
    if (character === '#') {
      level += 1;
      continue;
    }

    break;
  }

  if (level < 1 || level > 6) {
    return undefined;
  }

  const headingText = collapseWhitespace(trimmed.slice(level).trim());

  if (!headingText) {
    return undefined;
  }

  return {
    level: level as 1 | 2 | 3 | 4 | 5 | 6,
    text: headingText,
  };
}

function isListMarker(line: string) {
  const trimmed = line.trimStart();

  if (trimmed.startsWith('- ') || trimmed.startsWith('* ') || trimmed.startsWith('+ ')) {
    return { markerLength: 2, text: collapseWhitespace(trimmed.slice(2)) };
  }

  let index = 0;

  while (index < trimmed.length && trimmed[index] >= '0' && trimmed[index] <= '9') {
    index += 1;
  }

  if (index > 0 && trimmed[index] === '.' && trimmed[index + 1] === ' ') {
    return { markerLength: index + 2, text: collapseWhitespace(trimmed.slice(index + 2)) };
  }

  return undefined;
}

function isQuoteLine(line: string) {
  const trimmed = line.trimStart();
  return trimmed.startsWith('> ') ? collapseWhitespace(trimmed.slice(2)) : undefined;
}

function parseKeyValue(line: string) {
  const index = line.indexOf(':');

  if (index <= 0) {
    return undefined;
  }

  const key = line.slice(0, index).trim().toLowerCase();
  const value = collapseWhitespace(line.slice(index + 1));

  if (!key || !value) {
    return undefined;
  }

  return { key, value };
}

function parseFrontmatter(lines: string[]) {
  const meta: ParsedDocumentMeta = {};
  const consumed = new Set<number>();
  let startIndex = 0;

  for (let index = 0; index < lines.length; index += 1) {
    if (!isBlankLine(lines[index])) {
      startIndex = index;
      break;
    }
  }

  if (lines[startIndex]?.trim() !== '---') {
    return { meta, consumed, bodyStartIndex: 0 };
  }

  let endIndex = -1;

  for (let index = startIndex + 1; index < lines.length; index += 1) {
    if (lines[index].trim() === '---') {
      endIndex = index;
      break;
    }
  }

  if (endIndex === -1) {
    return { meta, consumed, bodyStartIndex: 0 };
  }

  for (let index = startIndex + 1; index < endIndex; index += 1) {
    const parsed = parseKeyValue(lines[index]);

    if (!parsed) {
      continue;
    }

    consumed.add(index);

    if (parsed.key === 'title') {
      meta.title = parsed.value;
    } else if (parsed.key === 'description' || parsed.key === 'desc' || parsed.key === 'summary') {
      meta.description = parsed.value;
    } else if (parsed.key === 'h1') {
      meta.h1 = parsed.value;
    }
  }

  consumed.add(startIndex);
  consumed.add(endIndex);

  return { meta, consumed, bodyStartIndex: endIndex + 1 };
}

function parseInlineMeta(lines: string[], startIndex: number, limit = 10) {
  const meta: ParsedDocumentMeta = {};
  const consumed = new Set<number>();

  const labels = new Set(['title', 'description', 'desc', 'summary', 'h1']);

  for (let index = startIndex; index < lines.length && index < startIndex + limit; index += 1) {
    const trimmed = trimLine(lines[index]);

    if (!trimmed) {
      continue;
    }

    const parsed = parseKeyValue(trimmed);

    if (parsed && labels.has(parsed.key)) {
      consumed.add(index);

      if (parsed.key === 'title') {
        meta.title = parsed.value;
      } else if (parsed.key === 'description' || parsed.key === 'desc' || parsed.key === 'summary') {
        meta.description = parsed.value;
      } else if (parsed.key === 'h1') {
        meta.h1 = parsed.value;
      }

      continue;
    }

    const label = trimmed.toLowerCase();

    if (!labels.has(label)) {
      continue;
    }

    for (
      let candidateIndex = index + 1;
      candidateIndex < lines.length && candidateIndex < startIndex + limit;
      candidateIndex += 1
    ) {
      const candidate = trimLine(lines[candidateIndex]);

      if (!candidate) {
        continue;
      }

      consumed.add(index);
      consumed.add(candidateIndex);

      if (label === 'title') {
        meta.title = candidate;
      } else if (label === 'description' || label === 'desc' || label === 'summary') {
        meta.description = candidate;
      } else if (label === 'h1') {
        meta.h1 = candidate;
      }

      break;
    }
  }

  return { meta, consumed };
}

function renderTextParagraph(lines: string[]) {
  const text = collapseWhitespace(lines.join(' '));

  if (!text) {
    return '';
  }

  return `<p>${escapeHtml(text)}</p>`;
}

function renderList(items: string[]) {
  if (items.length === 0) {
    return '';
  }

  return `<ul>${items.map((item) => `<li>${escapeHtml(collapseWhitespace(item))}</li>`).join('')}</ul>`;
}

function renderQuote(lines: string[]) {
  const text = collapseWhitespace(lines.join(' '));

  if (!text) {
    return '';
  }

  return `<blockquote>${escapeHtml(text)}</blockquote>`;
}

function renderCode(lines: string[]) {
  return `<pre><code>${escapeHtml(lines.join('\n'))}</code></pre>`;
}

function pushParagraphBlock(blocks: DocumentAstBlock[], lines: string[]) {
  const content = renderTextParagraph(lines);

  if (content) {
    blocks.push({ kind: 'paragraph', text: collapseWhitespace(lines.join(' ')) });
  }
}

function parseDocumentAst(text: string): ParsedDocumentAst {
  const lines = splitLines(text);
  const warnings: IntakeWarning[] = [];
  const blocks: DocumentAstBlock[] = [];
  const frontmatter = parseFrontmatter(lines);
  const inlineMeta = parseInlineMeta(lines, frontmatter.bodyStartIndex);
  const consumed = new Set<number>([...frontmatter.consumed, ...inlineMeta.consumed]);
  const meta: ParsedDocumentMeta = {
    ...frontmatter.meta,
    ...inlineMeta.meta,
  };

  let inCode = false;
  const codeLines: string[] = [];
  let paragraphLines: string[] = [];
  let listItems: string[] = [];
  let quoteLines: string[] = [];

  const flushParagraph = () => {
    if (paragraphLines.length === 0) {
      return;
    }

    const content = collapseWhitespace(paragraphLines.join(' '));

    if (content) {
      blocks.push({ kind: 'paragraph', text: content });
    }

    paragraphLines = [];
  };

  const flushList = () => {
    if (listItems.length === 0) {
      return;
    }

    blocks.push({ kind: 'list', text: renderList(listItems), items: [...listItems] });
    listItems = [];
  };

  const flushQuote = () => {
    if (quoteLines.length === 0) {
      return;
    }

    const text = collapseWhitespace(quoteLines.join(' '));

    if (text) {
      blocks.push({ kind: 'quote', text });
    }

    quoteLines = [];
  };

  const flushCode = () => {
    if (codeLines.length === 0) {
      return;
    }

    blocks.push({ kind: 'code', text: codeLines.join('\n') });
    codeLines.length = 0;
  };

  for (let index = frontmatter.bodyStartIndex; index < lines.length; index += 1) {
    if (consumed.has(index)) {
      continue;
    }

    const line = lines[index];
    const trimmed = trimLine(line);

    if (trimmed.startsWith('```')) {
      if (inCode) {
        flushCode();
        inCode = false;
      } else {
        flushParagraph();
        flushList();
        flushQuote();
        inCode = true;
      }

      continue;
    }

    if (inCode) {
      codeLines.push(line);
      continue;
    }

    const heading = isHeadingLine(line);

    if (heading) {
      flushParagraph();
      flushList();
      flushQuote();
      blocks.push({ kind: 'heading', text: heading.text, level: heading.level });
      continue;
    }

    if (isBlankLine(line)) {
      flushParagraph();
      flushList();
      flushQuote();
      continue;
    }

    const list = isListMarker(line);

    if (list) {
      flushParagraph();
      flushQuote();
      listItems.push(list.text);
      continue;
    }

    const quote = isQuoteLine(line);

    if (quote) {
      flushParagraph();
      flushList();
      quoteLines.push(quote);
      continue;
    }

    flushList();
    flushQuote();
    paragraphLines.push(trimmed);
  }

  flushParagraph();
  flushList();
  flushQuote();
  flushCode();

  if (blocks.length === 0 && collapseWhitespace(text).length > 0) {
    pushParagraphBlock(blocks, lines.slice(frontmatter.bodyStartIndex));
  }

  return { meta, blocks, warnings };
}

function renderBlocksToSections(blocks: DocumentAstBlock[], baseId: string, meta: ParsedDocumentMeta) {
  const sections: IntakeSectionDraft[] = [];
  let currentHeading: string | undefined;
  let currentLevel: 2 | 3 | 4 | 5 | 6 | undefined;
  let currentContent: string[] = [];
  let primaryHeading = meta.h1;

  const pushCurrent = () => {
    if (currentContent.length === 0 && !currentHeading) {
      return;
    }

    const content = currentContent.join('\n').trim();

    if (!content && !currentHeading) {
      currentContent = [];
      currentHeading = undefined;
      currentLevel = undefined;

      return;
    }

    sections.push({
      id: `${baseId}-section-${sections.length + 1}`,
      kind: currentHeading ? 'html' : 'paragraph',
      heading: currentHeading,
      level: currentLevel,
      content,
    });

    currentContent = [];
    currentHeading = undefined;
    currentLevel = undefined;
  };

  for (const block of blocks) {
    if (block.kind === 'heading') {
      if (!primaryHeading) {
        primaryHeading = block.text;
      }

      if (block.level === 1 && !meta.h1) {
        primaryHeading = block.text;
        continue;
      }

      pushCurrent();
      currentHeading = block.text;
      currentLevel = block.level && block.level >= 2 ? (block.level as 2 | 3 | 4 | 5 | 6) : 2;
      continue;
    }

    if (block.kind === 'paragraph') {
      currentContent.push(`<p>${escapeHtml(block.text)}</p>`);
      continue;
    }

    if (block.kind === 'list' && block.items) {
      currentContent.push(renderList(block.items));
      continue;
    }

    if (block.kind === 'quote') {
      currentContent.push(renderQuote([block.text]));
      continue;
    }

    if (block.kind === 'code') {
      currentContent.push(renderCode([block.text]));
    }
  }

  pushCurrent();

  if (sections.length === 0 && blocks.length > 0) {
    const content = blocks
      .filter((block) => block.kind !== 'heading')
      .map((block) => {
        if (block.kind === 'paragraph') {
          return `<p>${escapeHtml(block.text)}</p>`;
        }

        if (block.kind === 'list' && block.items) {
          return renderList(block.items);
        }

        if (block.kind === 'quote') {
          return renderQuote([block.text]);
        }

        if (block.kind === 'code') {
          return renderCode([block.text]);
        }

        return '';
      })
      .filter(Boolean)
      .join('\n');

    if (content) {
      sections.push({
        id: `${baseId}-section-1`,
        kind: 'html',
        content,
      });
    }
  }

  return { sections, primaryHeading };
}

function buildWarnings(meta: ParsedDocumentMeta, sections: IntakeSectionDraft[], text: string): IntakeWarning[] {
  const warnings: IntakeWarning[] = [];

  if (!meta.title) {
    warnings.push({
      code: 'missing-document-title',
      message: 'No title could be extracted from the document.',
      severity: 'warn',
    });
  }

  if (!meta.description) {
    warnings.push({
      code: 'missing-document-description',
      message: 'No description could be extracted from the document.',
      severity: 'warn',
    });
  }

  if (!meta.h1) {
    warnings.push({
      code: 'missing-document-h1',
      message: 'No H1 could be extracted from the document.',
      severity: 'warn',
    });
  }

  if (sections.length === 0 && collapseWhitespace(text).length > 0) {
    warnings.push({
      code: 'empty-document-sections',
      message: 'No document sections were extracted.',
      severity: 'warn',
    });
  }

  return warnings;
}

function toPageDraft(
  source: IntakeSourceSnapshot,
  meta: ParsedDocumentMeta,
  blocks: DocumentAstBlock[],
  warnings: IntakeWarning[],
): IntakePageDraft {
  const baseId = normalizeSlug(buildPageSlugFromSourcePath(source.path));
  const path = buildPagePathFromSourcePath(source.path);
  const role = inferPageRoleFromPath(source.path);
  const sectionResult = renderBlocksToSections(blocks, baseId, meta);
  const title = meta.title || meta.h1 || collapseWhitespace(source.label ?? getSourceBaseName(source.path));
  const h1 = meta.h1 || meta.title || sectionResult.primaryHeading || title;
  const description = meta.description || firstParagraphFromBlocks(blocks);
  const confidence = createConfidenceScore([
    Boolean(meta.title),
    Boolean(meta.description),
    Boolean(meta.h1),
    sectionResult.sections.length > 0,
  ]);

  return {
    id: baseId,
    name: title,
    sourcePath: source.path,
    sourceFamily: 'document',
    role,
    slug: baseId,
    path,
    title,
    description,
    h1,
    sections: sectionResult.sections,
    seo: {
      title,
      description,
      schemaType: role === 'legal' ? 'Article' : 'WebPage',
      canonicalPath: path,
      robots: 'index,follow',
    },
    shellCandidates: [],
    warnings,
    confidence,
    checks: [],
    rawSourcePreview: buildRawSourcePreview(source.text ?? source.html ?? ''),
  };
}

function firstParagraphFromBlocks(blocks: DocumentAstBlock[]) {
  for (const block of blocks) {
    if (block.kind === 'paragraph' && block.text) {
      return block.text.slice(0, 160);
    }
  }

  return undefined;
}

function createConfidenceScore(values: Array<boolean>) {
  const score = values.filter(Boolean).length;
  return Math.max(0.35, Math.min(1, score / Math.max(values.length, 1)));
}

export function extractDocumentPageDraft(source: IntakeSourceSnapshot): IntakePageDraft {
  const text = source.text ?? source.html ?? '';
  const ast = parseDocumentAst(text);
  const sectionResult = renderBlocksToSections(
    ast.blocks,
    normalizeSlug(buildPageSlugFromSourcePath(source.path)),
    ast.meta,
  );
  const warnings = [...ast.warnings, ...buildWarnings(ast.meta, sectionResult.sections, text)];

  if (ast.blocks.length === 0 && collapseWhitespace(text).length > 0) {
    warnings.push({
      code: 'document-parse-empty',
      message: `The document at ${source.path} produced no blocks.`,
      severity: 'warn',
    });
  }

  return toPageDraft(source, ast.meta, ast.blocks, warnings);
}

export function parseDocumentSource(text: string) {
  return parseDocumentAst(text);
}
