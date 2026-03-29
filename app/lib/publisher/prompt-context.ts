import type { PublisherAgentContext, SlotContract, ZoneType } from '~/types/publisher';

export function buildPublisherRegeneratePrompt(context: PublisherAgentContext, instructions: string[]) {
  const lines = [
    'Work in Publisher Mode only.',
    'Return only <boltArtifact> updates for reserved files under /home/project/.bolt/publisher/.',
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
      `Regenerate only slot "${slot.id}" in page "${pageId}" and zone "${zone}".`,
      'Preserve the rest of the project contract.',
      `Update only the page contract file that contains slot "${slot.id}".`,
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
      `Regenerate the contract for page "${pageId}" only.`,
      'Preserve shared shell, theme, and unrelated pages.',
      'Return updated JSON only for the relevant page file.',
    ],
  );
}

export function buildPreviewRebuildPrompt(projectId?: string) {
  return buildPublisherRegeneratePrompt(
    {
      mode: 'publisher',
      currentPage: projectId,
    },
    [
      'Refresh generated output based on the current publisher contract.',
      'Do not rewrite user-authored HTML outside /home/project/.bolt/publisher/generated/.',
    ],
  );
}
