import blockManifest from './block-library.json';
import { publisherTemplates } from './templates';
import type { PublisherBlockDefinition, ZoneType } from '~/types/publisher';
import { parseBlockManifest } from './validator';

const parsedManifest = parseBlockManifest(blockManifest);

export class PublisherBlockRegistry {
  readonly blocks: PublisherBlockDefinition[];
  readonly templates: Record<string, string>;

  constructor(
    blocks: PublisherBlockDefinition[] = parsedManifest,
    templates: Record<string, string> = publisherTemplates,
  ) {
    this.blocks = blocks;
    this.templates = templates;
  }

  listAll() {
    return [...this.blocks];
  }

  listByZone(zone: ZoneType) {
    return this.blocks.filter((block) => this.getAllowedZones(block.id).includes(zone));
  }

  getById(id: string) {
    return this.blocks.find((block) => block.id === id);
  }

  getAllowedZones(blockId: string) {
    return this.getById(blockId)?.allowedZones ?? [];
  }

  getEffectiveSchemaVersion(blockId: string) {
    return this.getById(blockId)?.schemaVersion ?? 1;
  }

  getDeprecationMeta(blockId: string) {
    return this.getById(blockId)?.deprecation;
  }

  getNormalizedMeta(blockId: string) {
    return this.getById(blockId);
  }

  getTemplate(blockId: string) {
    const block = this.getById(blockId);

    if (!block) {
      return undefined;
    }

    return this.templates[block.templateFile];
  }
}

export const publisherBlockRegistry = new PublisherBlockRegistry();
