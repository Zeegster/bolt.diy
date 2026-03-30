import type { PublisherAgentContext, SlotContract, ZoneType } from '~/types/publisher';

export function buildPublisherRegeneratePrompt(context: PublisherAgentContext, instructions: string[]) {
  const lines = [
    'Work in Publisher Mode only.',
    'Allowed agent intents: normalize, map, fill, repair.',
    'Return only <boltArtifact> updates for reserved files under /home/project/.bolt/publisher/.',
    'Default deny writes to /home/project/.bolt/publisher/generated and /home/project/.bolt/publisher/intake unless explicitly requested by the operator.',
    'Do not invent new zones, block IDs, head fields, or metadata ownership boundaries.',
    'Never place canonical, robots, schema, jsonLd, favicon, metaImage, sitemap, or head payloads inside slot props.',
    `mode: ${context.mode}`,
    context.currentPage ? `currentPage: ${context.currentPage}` : undefined,
    context.currentZone ? `currentZone: ${context.currentZone}` : undefined,
    context.selectedBlockId ? `selectedBlockId: ${context.selectedBlockId}` : undefined,
    '',
    ...instructions,
  ].filter(Boolean);

  return lines.join('\n');
}

export function buildSlotRegeneratePrompt(pageId: string, zone: ZoneType, slot: SlotContract) {
  return buildPublisherRegeneratePrompt(
    {
      mode: 'publisher',
      currentPage: pageId,
      currentZone: zone,
      selectedBlockId: slot.blockId,
    },
    [
      'intent: fill',
      'targetFileScope: contract-only',
      `Regenerate only slot "${slot.id}" in page "${pageId}" and zone "${zone}".`,
      'Preserve the rest of the project contract.',
      `Update only the page contract file that contains slot "${slot.id}".`,
      'Stay inside the existing slot prop surface for this block and do not add reserved metadata keys.',
      'Keep output JSON-valid and machine-parseable.',
    ],
  );
}

export function buildPageRegeneratePrompt(pageId: string) {
  return buildPublisherRegeneratePrompt(
    {
      mode: 'publisher',
      currentPage: pageId,
    },
    [
      'intent: map',
      'targetFileScope: contract-only',
      `Regenerate the contract for page "${pageId}" only.`,
      'Preserve shared shell, theme, and unrelated pages.',
      'Do not invent new zones, new block IDs, or head-owned metadata fields.',
      'Return updated JSON only for the relevant page file.',
    ],
  );
}

export function buildRepairRegeneratePrompt(checkName: string, pageId?: string, zone?: ZoneType) {
  return buildPublisherRegeneratePrompt(
    {
      mode: 'publisher',
      currentPage: pageId,
      currentZone: zone,
    },
    [
      'intent: repair',
      'targetFileScope: contracts-plus-checks',
      `repairCheck: ${checkName}`,
      pageId ? `repairPage: ${pageId}` : undefined,
      zone ? `repairZone: ${zone}` : undefined,
      'Repair only the failing publisher contract fields needed to resolve the named check.',
      'Do not widen output scope beyond the current publisher contract and checks surfaces.',
    ].filter(Boolean) as string[],
  );
}

export function buildPreviewRebuildPrompt(projectId?: string) {
  return buildPublisherRegeneratePrompt(
    {
      mode: 'publisher',
      currentPage: projectId,
    },
    [
      'intent: repair',
      'targetFileScope: generated-rebuild-only',
      'Refresh generated output based on the current publisher contract.',
      'Do not rewrite user-authored HTML outside /home/project/.bolt/publisher/generated/.',
    ],
  );
}
