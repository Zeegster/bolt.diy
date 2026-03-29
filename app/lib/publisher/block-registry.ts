import blockManifest from './block-library.json';
import { publisherTemplates } from './templates';
import type { BlockMeta, ZoneType } from '~/types/publisher';
import { parseBlockManifest } from './validator';

const parsedManifest = parseBlockManifest(blockManifest);

export class PublisherBlockRegistry {
  readonly blocks: BlockMeta[];
  readonly templates: Record<string, string>;

  constructor(blocks: BlockMeta[] = parsedManifest, templates: Record<string, string> = publisherTemplates) {
    this.blocks = blocks;
    this.templates = templates;
  }

  listAll() {
    return [...this.blocks];
  }

  listByZone(zone: ZoneType) {
    return this.blocks.filter((block) => block.zone === zone);
  }

  getById(id: string) {
    return this.blocks.find((block) => block.id === id);
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
