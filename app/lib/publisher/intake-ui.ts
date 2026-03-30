import type { IntakeCheck, PageContract, PublisherMarkdownSource, ZoneType } from '~/types/publisher';
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
}

export type IntakeDiagnosticCategory = 'metadata' | 'zone' | 'ownership' | 'deprecated' | 'content';

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

  for (const zone of publisherZoneTypes) {
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

  if (!description.trim()) {
    warnings.push('Description is missing.');
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
