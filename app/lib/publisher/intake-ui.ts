import type {
  CheckReport,
  IntakeCheck,
  IntakeSession,
  IntakePageDraft as IntakeReviewPage,
  PageContract,
  PublisherMarkdownSource,
  ZoneType,
} from '~/types/publisher';
import { publisherZoneTypes } from '~/types/publisher';

export type IntakeSourceKind = 'document' | 'html';

export interface IntakeSourceReference {
  sourcePath: string;
  label: string;
  kind: IntakeSourceKind;
  rawContent?: string;
  pageId?: string;
  pagePath?: string;
  warnings?: string[];
}

export interface IntakePageSectionDraft {
  id: string;
  heading: string;
  content: string;
  sourceZone?: ZoneType;
}

export interface IntakePageDraft {
  pageId: string;
  slug: string;
  path: string;
  name: string;
  title: string;
  description: string;
  h1: string;
  sections: IntakePageSectionDraft[];
  rawSource?: string;
  sourcePath?: string;
  sourceLabel?: string;
  sourceKind?: IntakeSourceKind;
  warnings: string[];
  status: 'ready' | 'warn' | 'needs-review';
  missingFields: Array<'title' | 'description' | 'h1'>;
  repairSummary: string;
  repairGuidance: string;
  metadataIssueCount: number;
  extractionIssueCount: number;
  contractIssueCount: number;
}

export interface IntakeBatchNormalizeReviewState {
  brokenPageIds: string[];
  selectedPageIds: string[];
  selectedCount: number;
  totalBrokenCount: number;
  selectionSummary: string;
  affectedPages: Array<{
    id: string;
    name: string;
    path: string;
    missingFields: Array<'title' | 'description' | 'h1'>;
  }>;
  latestBatchRun?: {
    id: string;
    provider?: string;
    model?: string;
    createdAt: string;
    inputSummary: string;
    outputSummary: string;
    success: boolean;
  };
}

export type IntakeDiagnosticCategory = 'metadata' | 'zone' | 'ownership' | 'deprecated' | 'content';
export type PublisherDiagnosticCategory =
  | 'metadata'
  | 'composition'
  | 'ownership'
  | 'deprecated'
  | 'output'
  | 'content';

export function categorizeIntakeCheck(
  check: Pick<IntakeCheck, 'id' | 'message' | 'details'>,
): IntakeDiagnosticCategory {
  const haystack = [check.id, check.message, ...(check.details ?? [])].join(' ').toLowerCase();

  if (haystack.includes('metadata') || haystack.includes('canonical') || haystack.includes('robots')) {
    return 'metadata';
  }

  if (haystack.includes('override') || haystack.includes('ownership') || haystack.includes('reserved')) {
    return 'ownership';
  }

  if (haystack.includes('deprecated')) {
    return 'deprecated';
  }

  if (haystack.includes('zone') || haystack.includes('block')) {
    return 'zone';
  }

  return 'content';
}

export function getIntakeDiagnosticLabel(category: IntakeDiagnosticCategory) {
  switch (category) {
    case 'metadata':
      return 'Missing required metadata';
    case 'zone':
      return 'Invalid zone or block composition';
    case 'ownership':
      return 'Forbidden metadata override';
    case 'deprecated':
      return 'Deprecated block warning';
    default:
      return 'Content or contract issue';
  }
}

export function categorizePublisherDiagnostic(
  check: Pick<CheckReport, 'name' | 'message' | 'details'>,
): PublisherDiagnosticCategory {
  const haystack = [check.name, check.message, ...(check.details ?? [])].join(' ').toLowerCase();

  if (haystack.includes('ownership') || haystack.includes('reserved')) {
    return 'ownership';
  }

  if (
    haystack.includes('canonical') ||
    haystack.includes('metadata') ||
    haystack.includes('seo') ||
    haystack.includes('site-url') ||
    haystack.includes('robots')
  ) {
    return 'metadata';
  }

  if (haystack.includes('deprecated')) {
    return 'deprecated';
  }

  if (
    haystack.includes('sitemap') ||
    haystack.includes('manifest') ||
    haystack.includes('artifact') ||
    haystack.includes('image') ||
    haystack.includes('link') ||
    haystack.includes('output')
  ) {
    return 'output';
  }

  if (
    haystack.includes('zone') ||
    haystack.includes('slot') ||
    haystack.includes('navigation') ||
    haystack.includes('token') ||
    haystack.includes('page') ||
    haystack.includes('contract')
  ) {
    return 'composition';
  }

  return 'content';
}

export function getPublisherDiagnosticLabel(category: PublisherDiagnosticCategory) {
  switch (category) {
    case 'metadata':
      return 'Metadata and SEO';
    case 'composition':
      return 'Contract composition';
    case 'ownership':
      return 'Ownership boundary';
    case 'deprecated':
      return 'Deprecated blocks';
    case 'output':
      return 'Generated output';
    default:
      return 'Content quality';
  }
}

export function getPublisherEditingConstraintLabel(reason: 'ownership' | 'composition') {
  return reason === 'ownership' ? 'Reserved by metadata ownership' : 'Blocked by contract composition';
}

export function getPublisherEditingConstraintDescription(reason: 'ownership' | 'composition') {
  return reason === 'ownership'
    ? 'This field stays under page/project metadata ownership and is not editable through block props.'
    : 'This field is outside the block schema or invalid for the current zone, so the contract must be repaired first.';
}

function isMetadataCheck(check: IntakeCheck) {
  return (
    categorizeIntakeCheck(check) === 'metadata' ||
    check.id === 'missing-page-title' ||
    check.id === 'missing-page-description' ||
    check.id === 'missing-page-h1'
  );
}

function getMissingMetadataFields(page: IntakeReviewPage): Array<'title' | 'description' | 'h1'> {
  return [
    !page.title.trim() ? 'title' : undefined,
    !page.description?.trim() ? 'description' : undefined,
    !page.h1?.trim() ? 'h1' : undefined,
  ].filter((value): value is 'title' | 'description' | 'h1' => Boolean(value));
}

function isBatchNormalizeRun(run: IntakeSession['scriptRuns'][number]) {
  return run.runnerKind === 'ai-extraction' && run.inputSummary.startsWith('batch:');
}

export function deriveBatchNormalizeReviewState(
  session: IntakeSession,
  selectedBrokenPageIds: string[],
): IntakeBatchNormalizeReviewState {
  const affectedPages = session.pages
    .map((page) => ({
      id: page.id,
      name: page.name,
      path: page.path,
      missingFields: getMissingMetadataFields(page),
    }))
    .filter((page) => page.missingFields.length > 0);
  const brokenPageIds = affectedPages.map((page) => page.id);
  const selectedPageIds =
    selectedBrokenPageIds.length > 0
      ? selectedBrokenPageIds.filter((pageId) => brokenPageIds.includes(pageId))
      : brokenPageIds;
  const latestBatchRun = [...session.scriptRuns].reverse().find(isBatchNormalizeRun);

  return {
    brokenPageIds,
    selectedPageIds,
    selectedCount: selectedPageIds.length,
    totalBrokenCount: brokenPageIds.length,
    selectionSummary:
      brokenPageIds.length === 0
        ? 'No broken pages'
        : `${selectedPageIds.length} selected of ${brokenPageIds.length} broken · missing metadata only`,
    affectedPages,
    latestBatchRun: latestBatchRun
      ? {
          id: latestBatchRun.id,
          provider: latestBatchRun.provider,
          model: latestBatchRun.model,
          createdAt: latestBatchRun.createdAt,
          inputSummary: latestBatchRun.inputSummary,
          outputSummary: latestBatchRun.outputSummary,
          success: latestBatchRun.success,
        }
      : undefined,
  };
}

function isExtractionCheck(check: IntakeCheck) {
  return (
    categorizeIntakeCheck(check) === 'content' ||
    check.id === 'missing-page-sections' ||
    check.id === 'low-confidence-extraction' ||
    check.id === 'page-warnings'
  );
}

function buildRepairSummary(
  missingFields: Array<'title' | 'description' | 'h1'>,
  metadataIssueCount: number,
  extractionIssueCount: number,
  contractIssueCount: number,
) {
  if (missingFields.length > 0) {
    return `Repair ${missingFields.join(', ')} before applying this page.`;
  }

  if (extractionIssueCount > 0) {
    return 'Compare extracted sections with the source preview before applying the import.';
  }

  if (contractIssueCount > 0 || metadataIssueCount > 0) {
    return 'Resolve the remaining review diagnostics before moving to release.';
  }

  return 'Page metadata and extracted content are ready for operator review.';
}

function buildRepairGuidance(metadataIssueCount: number, extractionIssueCount: number) {
  if (metadataIssueCount > 0) {
    return 'Edit title, description, and H1 here. Reserved head metadata stays contract-owned and is not repaired via block props.';
  }

  if (extractionIssueCount > 0) {
    return 'Keep the source preview open while you repair sections so edits stay anchored to the original document.';
  }

  return 'Use this page editor for operator-level metadata and content repair only.';
}

function valueToText(value: unknown) {
  if (typeof value === 'string') {
    return value;
  }

  if (value === undefined || value === null) {
    return '';
  }

  return JSON.stringify(value, null, 2);
}

function collectPageSections(page: PageContract) {
  const sections: IntakePageSectionDraft[] = [];
  const orderedZones: ZoneType[] = [
    'content',
    ...publisherZoneTypes.filter((zone): zone is ZoneType => zone !== 'content'),
  ];

  for (const zone of orderedZones) {
    const zoneContract = page.zones[zone];

    if (!zoneContract?.slots?.length) {
      continue;
    }

    zoneContract.slots.forEach((slot, index) => {
      const rawContent =
        valueToText(slot.props.html) ||
        valueToText(slot.props.content) ||
        valueToText(slot.props.body) ||
        valueToText(slot.props.text) ||
        valueToText(slot.props.sections);

      sections.push({
        id: slot.id,
        heading: slot.name ?? `${zone} · ${index + 1}`,
        content: rawContent || `Slot ${slot.id}`,
        sourceZone: zone,
      });
    });
  }

  if (sections.length === 0) {
    sections.push({
      id: `${page.id}-section-1`,
      heading: page.name,
      content: page.seo.description ?? page.seo.title ?? page.name,
    });
  }

  return sections;
}

export function createIntakePageDraft(page: PageContract, source?: IntakeSourceReference): IntakePageDraft {
  const sections = collectPageSections(page);
  const title = page.seo.title || page.name;
  const description = page.seo.description ?? '';
  const h1 = page.name || title;
  const warnings: string[] = [];
  const missingFields: Array<'title' | 'description' | 'h1'> = [];

  if (!title.trim()) {
    missingFields.push('title');
  }

  if (!description.trim()) {
    missingFields.push('description');
    warnings.push('Description is missing.');
  }

  if (!h1.trim()) {
    missingFields.push('h1');
  }

  if (sections.every((section) => !section.content.trim())) {
    warnings.push('No extracted content sections were found.');
  }

  if (source?.warnings?.length) {
    warnings.push(...source.warnings);
  }

  return {
    pageId: page.id,
    slug: page.slug,
    path: page.path,
    name: page.name,
    title,
    description,
    h1,
    sections,
    rawSource: source?.rawContent ?? sections.map((section) => section.content).join('\n\n'),
    sourcePath: source?.sourcePath,
    sourceLabel: source?.label,
    sourceKind: source?.kind,
    warnings,
    status: warnings.length > 1 ? 'needs-review' : warnings.length === 1 ? 'warn' : 'ready',
    missingFields,
    repairSummary: buildRepairSummary(missingFields, missingFields.length, warnings.length, 0),
    repairGuidance: buildRepairGuidance(missingFields.length, warnings.length),
    metadataIssueCount: missingFields.length,
    extractionIssueCount: warnings.length,
    contractIssueCount: 0,
  };
}

export function createIntakeReviewDraft(page: IntakeReviewPage, source?: IntakeSourceReference): IntakePageDraft {
  const sections = page.sections.map((section, index) => ({
    id: section.id,
    heading: section.heading ?? `${page.name} · ${index + 1}`,
    content: section.content,
  }));
  const missingFields: Array<'title' | 'description' | 'h1'> = [];

  if (!page.title.trim()) {
    missingFields.push('title');
  }

  if (!page.description?.trim()) {
    missingFields.push('description');
  }

  if (!page.h1?.trim()) {
    missingFields.push('h1');
  }

  const metadataIssueCount = page.checks.filter(isMetadataCheck).length;
  const extractionIssueCount = page.checks.filter(isExtractionCheck).length;
  const contractIssueCount = page.checks.length - metadataIssueCount - extractionIssueCount;
  const warnings = [...page.warnings.map((warning) => warning.message), ...(source?.warnings ?? [])];

  return {
    pageId: page.id,
    slug: page.slug,
    path: page.path,
    name: page.name,
    title: page.title,
    description: page.description ?? '',
    h1: page.h1 ?? '',
    sections,
    rawSource:
      source?.rawContent ??
      page.rawSourcePreview ??
      page.bodyHtml ??
      sections.map((section) => section.content).join('\n\n'),
    sourcePath: source?.sourcePath ?? page.storedSourcePath ?? page.sourcePath,
    sourceLabel: source?.label ?? page.sourcePath.split('/').pop() ?? page.name,
    sourceKind: source?.kind ?? page.sourceFamily,
    warnings,
    status:
      page.checks.some((check) => check.severity === 'fail') || warnings.length > 1
        ? 'needs-review'
        : page.checks.length > 0 || warnings.length === 1
          ? 'warn'
          : 'ready',
    missingFields,
    repairSummary: buildRepairSummary(missingFields, metadataIssueCount, extractionIssueCount, contractIssueCount),
    repairGuidance: buildRepairGuidance(metadataIssueCount, extractionIssueCount),
    metadataIssueCount,
    extractionIssueCount,
    contractIssueCount,
  };
}

export function applyIntakeReviewDraft(page: IntakeReviewPage, draft: IntakePageDraft): IntakeReviewPage {
  return {
    ...page,
    title: draft.title,
    description: draft.description,
    h1: draft.h1,
    sections: draft.sections.map((section, index) => ({
      ...page.sections[index],
      id: section.id,
      kind: page.sections[index]?.kind ?? 'paragraph',
      heading: section.heading,
      content: section.content,
    })),
  };
}

export function createIntakeSourceReferences(sources: PublisherMarkdownSource[], rawByPath: Record<string, string>) {
  return sources.map((source) => ({
    sourcePath: source.sourcePath,
    label: source.name,
    kind: 'document' as const,
    rawContent: rawByPath[source.sourcePath],
    pageId: source.pageId,
    pagePath: source.pagePath,
  }));
}

export function findSourceReferenceForPage(
  page: PageContract,
  sources: IntakeSourceReference[],
): IntakeSourceReference | undefined {
  return sources.find((source) => source.pageId === page.id || source.pagePath === page.path);
}
