import { z } from 'zod';
import type {
  BlockMeta,
  CheckReport,
  PageContract,
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
});

const blockMetaSchema = z.object({
  id: z.string().min(1),
  zone: zoneTypeSchema,
  variant: z.string().min(1),
  name: z.string().min(1),
  tags: z.array(z.string()).default([]),
  slots: z.array(blockSlotDefinitionSchema).default([]),
  tokenKeys: z.array(z.string()).default([]),
  templateFile: z.string().min(1),
  source: z.enum(['library', 'agent', 'user']),
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

const pageContractSchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  name: z.string().min(1),
  path: z.string().min(1),
  usesProjectShell: z.boolean().optional().default(true),
  zones: zonesSchema.default({}),
  seo: seoContractSchema,
});

const projectContractSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  language: z.string().min(2),
  mode: z.literal('publisher'),
  siteUrl: z.string().url().optional(),
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

export function parseBlockManifest(input: unknown): BlockMeta[] {
  return blockMetaSchema.array().parse(input);
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

export function hasNavigationTag(block: BlockMeta | undefined) {
  return Boolean(block?.tags.some((tag) => tag === 'navigation'));
}

export function normalizeZoneRecord<T>(zones: Partial<Record<ZoneType, T>>) {
  return zones;
}
