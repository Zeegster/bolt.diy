import { z } from 'zod';
import type {
  AssetRef,
  BlockMeta,
  CheckReport,
  PublisherBlockDefinition,
  PageContract,
  PublisherReferenceState,
  SiteProjectContract,
  ThemeContract,
  ZoneType,
} from '~/types/publisher';
import { publisherZoneTypes } from '~/types/publisher';

const zoneTypeSchema = z.enum(publisherZoneTypes);

const blockSlotDefinitionSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  required: z.boolean().optional(),
  description: z.string().optional(),
  kind: z.enum(['text', 'richtext', 'link', 'image', 'items']).optional(),
  enumValues: z.array(z.string()).optional(),
  defaultValue: z.string().optional(),
});

const blockMetaSchema = z.object({
  id: z.string().min(1),
  zone: zoneTypeSchema,
  schemaVersion: z.number().int().positive().optional().default(1),
  variant: z.string().min(1),
  name: z.string().min(1),
  tags: z.array(z.string()).default([]),
  slots: z.array(blockSlotDefinitionSchema).default([]),
  tokenKeys: z.array(z.string()).default([]),
  templateFile: z.string().min(1),
  source: z.enum(['library', 'agent', 'user']),
  allowedZones: z.array(zoneTypeSchema).optional(),
  slotCardinality: z
    .object({
      min: z.number().int().min(0).optional(),
      max: z.number().int().min(1).optional(),
    })
    .optional(),
  previewBehavior: z.enum(['inline', 'isolated', 'hidden']).optional(),
  buildBehavior: z.enum(['strict', 'tolerant']).optional(),
  deprecation: z
    .object({
      status: z.enum(['active', 'deprecated']),
      replacementBlockId: z.string().min(1).optional(),
      message: z.string().optional(),
    })
    .optional(),
});

const slotContractSchema = z.object({
  id: z.string().min(1),
  blockId: z.string().min(1),
  name: z.string().optional(),
  variant: z.string().optional(),
  props: z.record(z.unknown()).default({}),
});

const zoneContractSchema = z.object({
  enabled: z.boolean().optional(),
  slots: z.array(slotContractSchema).default([]),
});

const zonesSchema = z.object({
  header: zoneContractSchema.optional(),
  beforeContent: zoneContractSchema.optional(),
  content: zoneContractSchema.optional(),
  sidebar: zoneContractSchema.optional(),
  afterContent: zoneContractSchema.optional(),
  footer: zoneContractSchema.optional(),
});

const seoContractSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  schemaType: z.enum(['WebSite', 'WebPage', 'Article', 'Organization']).optional(),
  canonicalPath: z.string().optional(),
  robots: z.string().optional(),
});

const assetRefSchema = z.object({
  path: z.string().min(1),
  publicPath: z.string().optional(),
  mimeType: z.string().optional(),
  label: z.string().optional(),
  contentHash: z.string().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
});

const pageContractSchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  name: z.string().min(1),
  path: z.string().min(1),
  usesProjectShell: z.boolean().optional().default(true),
  zones: zonesSchema.default({}),
  seo: seoContractSchema,
});

const rawProjectContractSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  language: z.string().min(2).optional(),
  defaultLanguage: z.string().min(2).optional(),
  multilingual: z.boolean().optional(),
  languages: z.array(z.string().min(2)).optional(),
  mode: z.literal('publisher'),
  domain: z.string().optional(),
  siteUrl: z.string().url().optional(),
  favicon: assetRefSchema.optional(),
  metaImage: assetRefSchema.optional(),
  logo: assetRefSchema.optional(),
  pageOrder: z.array(z.string()).optional(),
  sharedShell: zonesSchema.optional(),
  siteSeo: z
    .object({
      siteName: z.string().optional(),
      organizationName: z.string().optional(),
      schemaType: z.enum(['WebSite', 'WebPage', 'Organization']).optional(),
    })
    .optional(),
  build: z
    .object({
      outputDir: z.string().optional(),
      assetDir: z.string().optional(),
      checks: z.array(z.enum(['working', 'release'])).optional(),
    })
    .optional(),
});

const projectContractSchema = rawProjectContractSchema
  .superRefine((value, ctx) => {
    const defaultLanguage = value.defaultLanguage ?? value.language;
    const languages = value.languages?.length ? value.languages : defaultLanguage ? [defaultLanguage] : [];
    const multilingual = value.multilingual ?? languages.length > 1;

    if (!defaultLanguage) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['defaultLanguage'],
        message: 'defaultLanguage is required',
      });
    }

    if (languages.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['languages'],
        message: 'languages must include at least one language',
      });
    }

    if (multilingual && languages.length < 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['languages'],
        message: 'multilingual projects require at least 2 languages',
      });
    }

    if (defaultLanguage && !languages.includes(defaultLanguage)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['languages'],
        message: 'languages must include the defaultLanguage value',
      });
    }
  })
  .transform((value): SiteProjectContract => {
    const defaultLanguage = value.defaultLanguage ?? value.language ?? 'en';
    const normalizedLanguages = new Set(
      (value.languages?.length ? value.languages : [defaultLanguage]).map((entry) => entry.trim()).filter(Boolean),
    );

    normalizedLanguages.add(defaultLanguage);

    const languages = [...normalizedLanguages];
    const multilingual = value.multilingual ?? languages.length > 1;

    return {
      id: value.id,
      name: value.name,
      description: value.description,
      defaultLanguage,
      multilingual,
      languages: multilingual ? languages : [defaultLanguage],
      mode: value.mode,
      domain: value.domain,
      siteUrl: value.siteUrl,
      favicon: value.favicon,
      metaImage: value.metaImage,
      logo: value.logo,
      pageOrder: value.pageOrder,
      sharedShell: value.sharedShell,
      siteSeo: value.siteSeo,
      build: value.build,
    };
  });

const themeContractSchema = z.object({
  themeId: z.string().optional(),
  tokens: z.record(z.string()).default({}),
});

const checkReportSchema = z.object({
  name: z.string().min(1),
  status: z.enum(['pass', 'warn', 'fail']),
  message: z.string().min(1),
  details: z.array(z.string()).optional(),
  pageId: z.string().optional(),
  zone: zoneTypeSchema.optional(),
  gate: z.enum(['working', 'release']).optional(),
});

const publisherReferenceSourceSchema = z.object({
  path: z.string().min(1),
  storedPath: z.string().optional(),
  label: z.string().optional(),
  family: z.enum(['document', 'html', 'asset', 'unknown']),
  role: z
    .enum(['template', 'page', 'page-reference', 'asset', 'layout-fragment', 'reference-library', 'noise'])
    .optional(),
});

const publisherPageSourceMappingSchema = z.object({
  pageId: z.string().min(1),
  pagePath: z.string().min(1),
  sourcePath: z.string().min(1),
  storedPath: z.string().optional(),
  sourceFamily: z.enum(['document', 'html']),
  companionSourcePath: z.string().optional(),
  companionStoredPath: z.string().optional(),
});

const publisherAssetMaterializationSchema = z.object({
  kind: z.enum(['favicon', 'logo', 'metaImage']),
  sourcePath: z.string().optional(),
  storedPath: z.string().optional(),
  publicPath: z.string().optional(),
  previewPath: z.string().optional(),
  contentHash: z.string().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
});

const publisherReferenceStateSchema = z.object({
  intakeSessionId: z.string().min(1),
  importKind: z.enum(['document', 'html']),
  activeContentFamily: z.enum(['document', 'html']),
  referenceSourceFamily: z.enum(['document', 'html']).optional(),
  sourceRoot: z.string().optional(),
  sourceLabel: z.string().optional(),
  templateCandidatePath: z.string().optional(),
  homePageCandidatePath: z.string().optional(),
  shellCandidatePaths: z.array(z.string()).default([]),
  referenceLibraryPaths: z.array(z.string()).default([]),
  pageSourceMap: z.array(publisherPageSourceMappingSchema).default([]),
  assetMaterialization: z.array(publisherAssetMaterializationSchema).default([]),
  sourceFiles: z.array(publisherReferenceSourceSchema).default([]),
});

function toValidationReport(name: string, message: string, details: string[] = []): CheckReport {
  return {
    name,
    status: 'fail',
    message,
    details,
    gate: 'working',
  };
}

export function validateProjectContract(input: unknown) {
  return projectContractSchema.safeParse(input);
}

export function validatePageContract(input: unknown) {
  return pageContractSchema.safeParse(input);
}

export function validateThemeContract(input: unknown) {
  return themeContractSchema.safeParse(input);
}

export function validateCheckReports(input: unknown) {
  return z.array(checkReportSchema).safeParse(input);
}

export function validatePublisherReferenceState(input: unknown) {
  return publisherReferenceStateSchema.safeParse(input);
}

export function validateBlockManifest(input: unknown) {
  return z.array(blockMetaSchema).safeParse(input);
}

export function parseProjectContract(input: unknown): SiteProjectContract {
  return projectContractSchema.parse(input);
}

export function parsePageContract(input: unknown): PageContract {
  return pageContractSchema.parse(input);
}

export function parseThemeContract(input: unknown): ThemeContract {
  return themeContractSchema.parse(input);
}

export function parsePublisherReferenceState(input: unknown): PublisherReferenceState {
  return publisherReferenceStateSchema.parse(input);
}

export function normalizeBlockMeta(block: BlockMeta): PublisherBlockDefinition {
  return {
    ...block,
    schemaVersion: block.schemaVersion ?? 1,
    allowedZones: block.allowedZones?.length ? [...block.allowedZones] : [block.zone],
  };
}

export function parseBlockManifest(input: unknown): PublisherBlockDefinition[] {
  return blockMetaSchema
    .array()
    .parse(input)
    .map((block) => normalizeBlockMeta(block));
}

export function createJsonParseReport(filePath: string, error: unknown): CheckReport {
  return toValidationReport('publisher-json', `Invalid JSON in ${filePath}`, [
    error instanceof Error ? error.message : 'Unknown JSON parsing error',
  ]);
}

export function createSchemaReport(filePath: string, issues: z.ZodIssue[]): CheckReport {
  return toValidationReport('publisher-schema', `Invalid publisher contract in ${filePath}`, [
    ...issues.map((issue) => `${issue.path.join('.') || 'root'}: ${issue.message}`),
  ]);
}

export function serializeProjectContract(project: SiteProjectContract): string {
  return JSON.stringify(project, null, 2);
}

export function serializeAssetRef(asset?: AssetRef) {
  return asset ? { ...asset } : undefined;
}

export function hasNavigationTag(block: BlockMeta | undefined) {
  return Boolean(block?.tags.some((tag) => tag === 'navigation'));
}

export function normalizeZoneRecord<T>(zones: Partial<Record<ZoneType, T>>) {
  return zones;
}
