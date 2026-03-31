import { z } from 'zod';
import type { PublisherActionFileScope, PublisherAgentActionContract, ZoneType, CheckReport } from '~/types/publisher';
import { publisherZoneTypes } from '~/types/publisher';
import { buildRepairRegeneratePrompt } from './prompt-context';

const zoneTypeSchema = z.enum(publisherZoneTypes);

const publisherAgentActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('normalize'),
    pageId: z.string().min(1),
  }),
  z.object({
    action: z.literal('map'),
    pageId: z.string().min(1),
    sourcePath: z.string().min(1),
  }),
  z.object({
    action: z.literal('fill'),
    pageId: z.string().min(1),
    zone: zoneTypeSchema,
    slotId: z.string().min(1),
  }),
  z.object({
    action: z.literal('repair'),
    checkName: z.string().min(1),
    pageId: z.string().min(1).optional(),
    zone: zoneTypeSchema.optional(),
  }),
]);

export function parsePublisherAgentAction(input: unknown): PublisherAgentActionContract {
  return publisherAgentActionSchema.parse(input);
}

export function safeParsePublisherAgentAction(input: unknown) {
  return publisherAgentActionSchema.safeParse(input);
}

export function resolvePublisherActionFileScope(action?: PublisherAgentActionContract): PublisherActionFileScope {
  return action?.action === 'repair' ? 'contracts-plus-checks' : 'contracts-only';
}

function getCheckPageId(check: CheckReport) {
  return check.pageId;
}

function getCheckZone(check: CheckReport): ZoneType | undefined {
  return check.zone;
}

function isSupportedRepairCheckName(name: string) {
  switch (name) {
    case 'missing-page-title':
    case 'missing-page-description':
    case 'missing-page-h1':
    case 'missing-page-sections':
    case 'template-heading-injection':
    case 'decorative-zone-content-injection':
    case 'decorative-zone-primary-content':
    case 'zone-link-policy':
    case 'technical-file-consistency':
    case 'table-media-wrapper':
      return true;
    default:
      return false;
  }
}

export function deriveRepairIntentFromCheck(check: CheckReport): PublisherAgentActionContract | null {
  if (!isSupportedRepairCheckName(check.name)) {
    return null;
  }

  const pageId = getCheckPageId(check);
  const zone = getCheckZone(check);

  return {
    action: 'repair',
    checkName: check.name,
    pageId,
    zone,
  };
}

export function buildPromptForRepairIntent(intent: PublisherAgentActionContract, check: CheckReport) {
  switch (intent.action) {
    case 'normalize':
      return [
        buildRepairRegeneratePrompt(check.name, intent.pageId),
        `intentScope: normalize metadata for page "${intent.pageId}" only.`,
        'intentBoundaries: return only metadata field repairs required by the named check.',
      ].join('\n');
    case 'map':
      return [
        buildRepairRegeneratePrompt(check.name, intent.pageId),
        `intentScope: map source "${intent.sourcePath}" into page "${intent.pageId}" only.`,
        'intentBoundaries: preserve unrelated pages, shell, and theme contracts.',
      ].join('\n');
    case 'fill':
      return [
        buildRepairRegeneratePrompt(check.name, intent.pageId, intent.zone),
        `intentScope: fill missing contract fields for page "${intent.pageId}" zone "${intent.zone}" only.`,
        `intentSlot: ${intent.slotId}`,
        'intentBoundaries: keep the repair inside the existing slot and zone contract surface.',
      ].join('\n');
    case 'repair':
      return [
        buildRepairRegeneratePrompt(intent.checkName, intent.pageId, intent.zone),
        'intentBoundaries: resolve only the named diagnostic without widening publisher output scope.',
      ].join('\n');
  }

  return buildRepairRegeneratePrompt(check.name, check.pageId, check.zone);
}
