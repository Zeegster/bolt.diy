export const requiredPublisherZones = ['header', 'content', 'footer'] as const;
export const optionalPublisherZones = ['beforeContent', 'afterContent', 'sidebar'] as const;
export const publisherZoneTypes = [...requiredPublisherZones, ...optionalPublisherZones] as const;

export type ZoneType = (typeof publisherZoneTypes)[number];
export type PublisherBlockSource = 'library' | 'agent' | 'user';
export type PublisherCheckStatus = 'pass' | 'warn' | 'fail';
export type PublisherAgentMode = 'publisher' | 'editor' | 'general';
export type PublisherJobStage = 'intake' | 'contract' | 'assemble' | 'optimize' | 'check' | 'export';

export type DesignTokenSet = Record<string, string>;

export interface PublisherAgentContext {
  mode: PublisherAgentMode;
  currentPage?: string;
  currentZone?: ZoneType;
  selectedBlockId?: string;
}

export interface BlockSlotDefinition {
  key: string;
  label: string;
  required?: boolean;
  description?: string;
  kind?: 'text' | 'richtext' | 'link' | 'image' | 'items';
}

export interface BlockMeta {
  id: string;
  zone: ZoneType;
  variant: string;
  name: string;
  tags: string[];
  slots: BlockSlotDefinition[];
  tokenKeys: string[];
  templateFile: string;
  source: PublisherBlockSource;
}

export interface SlotContract {
  id: string;
  blockId: string;
  name?: string;
  variant?: string;
  props: Record<string, unknown>;
}

export interface ZoneContract {
  enabled?: boolean;
  slots: SlotContract[];
}

export interface SEOContract {
  title: string;
  description?: string;
  schemaType?: 'WebSite' | 'WebPage' | 'Article' | 'Organization';
  canonicalPath?: string;
  robots?: string;
}

export interface PageContract {
  id: string;
  slug: string;
  name: string;
  path: string;
  usesProjectShell?: boolean;
  zones: Partial<Record<ZoneType, ZoneContract>>;
  seo: SEOContract;
}

export interface SiteProjectContract {
  id: string;
  name: string;
  description?: string;
  language: string;
  mode: 'publisher';
  siteUrl?: string;
  pageOrder?: string[];
  sharedShell?: Partial<Record<ZoneType, ZoneContract>>;
  siteSeo?: {
    siteName?: string;
    organizationName?: string;
    schemaType?: 'WebSite' | 'WebPage' | 'Organization';
  };
  build?: {
    outputDir?: string;
    assetDir?: string;
    checks?: Array<'working' | 'release'>;
  };
}

export interface ThemeContract {
  themeId?: string;
  tokens: DesignTokenSet;
}

export interface CheckReport {
  name: string;
  status: PublisherCheckStatus;
  message: string;
  details?: string[];
  pageId?: string;
  zone?: ZoneType;
  gate?: 'working' | 'release';
}

export interface PublisherJob {
  id: string;
  stage: PublisherJobStage;
  status: 'idle' | 'running' | 'completed' | 'failed';
  startedAt?: string;
  finishedAt?: string;
  projectId?: string;
  details?: string[];
}

export interface LoadedPublisherState {
  project?: SiteProjectContract;
  pages: PageContract[];
  theme?: ThemeContract;
  checks: CheckReport[];
  issues: CheckReport[];
}

export interface PublisherAssemblyResult {
  files: Record<string, string>;
  checks: CheckReport[];
}
