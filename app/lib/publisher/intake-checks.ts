import { unified } from 'unified';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import remarkLintHeadingIncrement from 'remark-lint-heading-increment';
import remarkLintNoDuplicateHeadings from 'remark-lint-no-duplicate-headings';
import { VFile } from 'vfile';
import type { IntakeCheck, IntakePageDraft } from '~/types/publisher';

function createCheck(
  id: string,
  message: string,
  severity: IntakeCheck['severity'],
  page: Pick<IntakePageDraft, 'id' | 'sourcePath'>,
  details: string[] = [],
): IntakeCheck {
  return {
    id,
    name: id,
    status: severity === 'fail' ? 'fail' : severity === 'warn' ? 'warn' : 'pass',
    severity,
    message,
    pageId: page.id,
    sourcePath: page.sourcePath,
    details,
  };
}

function normalizeHeadingSequence(page: IntakePageDraft) {
  return page.sections
    .filter((section) => section.heading?.trim())
    .map((section) => ({
      id: section.id,
      heading: section.heading?.trim() ?? '',
      level: section.level ?? 2,
    }));
}

function runStructuredHeadingChecks(page: IntakePageDraft): IntakeCheck[] {
  const checks: IntakeCheck[] = [];
  const headings = normalizeHeadingSequence(page);

  if (!page.h1?.trim()) {
    return checks;
  }

  const duplicateHeadings = new Set<string>();
  const seenHeadings = new Set<string>();

  for (const heading of headings) {
    const normalized = heading.heading.toLowerCase();

    if (seenHeadings.has(normalized)) {
      duplicateHeadings.add(heading.heading);
    } else {
      seenHeadings.add(normalized);
    }
  }

  if (duplicateHeadings.size > 0) {
    checks.push(
      createCheck('duplicate-headings', `Page ${page.id} contains duplicate section headings.`, 'warn', page, [
        ...duplicateHeadings,
      ]),
    );
  }

  let previousLevel = 1;

  for (const heading of headings) {
    if (heading.level > previousLevel + 1) {
      checks.push(
        createCheck(
          'heading-increment',
          `Page ${page.id} skips heading levels in the extracted structure.`,
          'warn',
          page,
          [`${heading.heading}: h${previousLevel} -> h${heading.level}`],
        ),
      );
      break;
    }

    previousLevel = heading.level;
  }

  return checks;
}

function runMarkdownHeadingLint(page: IntakePageDraft, rawSource: string): IntakeCheck[] {
  try {
    const file = new VFile({ path: page.sourcePath, value: rawSource });
    const processor = unified()
      .use(remarkParse)
      .use(remarkGfm)
      .use(remarkLintHeadingIncrement)
      .use(remarkLintNoDuplicateHeadings);
    const tree = processor.parse(file);

    processor.runSync(tree, file);

    return file.messages.map((message) =>
      createCheck(`markdown-${message.ruleId ?? 'heading-lint'}`, message.reason, 'warn', page, [
        message.line ? `line ${message.line}` : 'unknown position',
      ]),
    );
  } catch {
    return [];
  }
}

export function buildHeadingChecks(page: IntakePageDraft, rawSource?: string): IntakeCheck[] {
  const checks = runStructuredHeadingChecks(page);

  if (page.sourceFamily === 'document' && rawSource?.trim()) {
    checks.push(...runMarkdownHeadingLint(page, rawSource));
  }

  return checks;
}

const unsafeWarningCodes = new Set(['unsafe-inline-script', 'unsafe-event-handler', 'unsafe-url-protocol']);

export function buildUnsafeImportChecks(page: IntakePageDraft): IntakeCheck[] {
  const unsafeWarnings = page.warnings.filter((warning) => unsafeWarningCodes.has(warning.code));

  if (unsafeWarnings.length === 0) {
    return [];
  }

  return [
    createCheck(
      'unsafe-imported-html',
      `Page ${page.id} contains unsafe imported HTML that must be repaired before contract generation.`,
      'fail',
      page,
      unsafeWarnings.map((warning) => warning.message),
    ),
  ];
}
