export const requiredPublisherZones = ['header', 'content', 'footer'] as const;
export const optionalPublisherZones = ['beforeContent', 'afterContent', 'sidebar'] as const;
export const publisherZoneTypes = [...requiredPublisherZones, ...optionalPublisherZones] as const;

export type ZoneType = (typeof publisherZoneTypes)[number];
export type PublisherBlockSource = 'library' | 'agent' | 'user';
export type PublisherCheckStatus = 'pass' | 'warn' | 'fail';
export type PublisherAgentMode = 'publisher' | 'editor' | 'general';
export type PublisherJobStage = 'intake' | 'contract' | 'assemble' | 'optimize' | 'check' | 'export';
export type PublisherProjectStatus =
  | 'draft'
  | 'intake-review'
  | 'contract-ready'
  | 'release-ready'
  | 'published'
  | 'failed';
export type PublisherWorkflowStep = 'intake' | 'review' | 'release' | 'published';
export type WorkspaceMode = 'default' | 'publisher';
export type PublisherStage = 'onboarding' | 'intake' | 'structure';
export type ActiveContentFamily = 'document' | 'html';
export type IntakeImportKind = ActiveContentFamily;
export type IntakeScenario =
  | 'document-import'
  | 'html-import'
  | 'template-plus-documents'
  | 'mixed-source-conflict'
  | 'needsDisambiguation';
export type IntakeSessionStatus = 'scanned' | 'pending-disambiguation' | 'reviewing' | 'ready' | 'applied';
export type IntakeSourceKind = 'file' | 'directory' | 'document' | 'html' | 'asset' | 'layout' | 'reference';
export type IntakeSourceFamily = ActiveContentFamily | 'asset' | 'unknown';
export type IntakePageRole = 'home' | 'article' | 'legal' | 'component-library' | 'reference' | 'generic' | 'backup';
export type IntakeWarningSeverity = 'info' | 'warn' | 'fail';
export type IntakeCheckSeverity = 'info' | 'warn' | 'fail';
export type IntakeScriptRunnerKind = 'local-parser' | 'ai-extraction' | 'tool-call';
export type IntakeAiProvider = 'openai' | 'anthropic';

export type DesignTokenSet = Record<string, string>;

export interface AssetRef {
  path: string;
  publicPath?: string;
  mimeType?: string;
  label?: string;
  storedPath?: string;
  previewPath?: string;
}

export interface IntakeSourceSnapshot {
  id: string;
  path: string;
  storedPath?: string;
  kind: IntakeSourceKind;
  mimeType?: string;
  size: number;
  hash?: string;
  label?: string;
  sourceUrl?: string;
  sourceFamilyHint?: IntakeSourceFamily;
  familyHint?: IntakeSourceFamily;
  isBinary: boolean;
  role?: 'template' | 'page' | 'page-reference' | 'asset' | 'layout-fragment' | 'reference-library' | 'noise';
  warnings?: string[];
  text?: string;
  html?: string;
}

export interface IntakeAssetDraft {
  kind: 'favicon' | 'logo' | 'metaImage';
  sourcePath?: string;
  storedPath?: string;
  previewPath?: string;
  mimeType?: string;
  label?: string;
  path?: string;
  publicPath?: string;
  previewUrl?: string;
}

export interface IntakeWarning {
  code: string;
  message: string;
  severity: IntakeWarningSeverity;
  pageId?: string;
  sourcePath?: string;
  path?: string;
  details?: string[];
}

export interface IntakeCheck {
  id: string;
  severity: IntakeCheckSeverity;
  message: string;
  details?: string[];
  pageId?: string;
  sourcePath?: string;
  name?: string;
  status?: PublisherCheckStatus;
}

export interface IntakeSectionDraft {
  id: string;
  kind: 'richtext' | 'faq' | 'legal' | 'hero' | 'html' | 'paragraph' | 'list' | 'table' | 'image' | 'code' | 'quote';
  content: string;
  heading?: string;
  level?: 1 | 2 | 3 | 4 | 5 | 6;
}

export interface IntakePageDraft {
  id: string;
  name: string;
  sourcePath: string;
  sourceFamily: ActiveContentFamily;
  role: IntakePageRole;
  slug: string;
  path: string;
  title: string;
  description?: string;
  h1?: string;
  sections: IntakeSectionDraft[];
  seo?: SEOContract;
  checks: IntakeCheck[];
  warnings: IntakeWarning[];
  confidence: number;
  contentRootHint?: string;
  companionSourcePath?: string;
  storedSourcePath?: string;
  rawSourceStoredPath?: string;
  bodyHtml?: string;
  assetHints?: {
    faviconPath?: string;
    metaImagePath?: string;
    logoPath?: string;
  };
  shellCandidates?: string[];
  rawSourcePreview?: string;
}

export interface IntakeProjectDraft {
  name: string;
  domain?: string;
  defaultLanguage: string;
  multilingual: boolean;
  languages: string[];
  favicon?: IntakeAssetDraft;
  metaImage?: IntakeAssetDraft;
  logo?: IntakeAssetDraft;
  sourceRoot?: string;
  sharedShell?: Partial<Record<ZoneType, ZoneContract>>;
  warnings?: IntakeWarning[];
}

export interface IntakeScriptRun {
  id: string;
  sessionId?: string;
  pageId?: string;
  runnerKind: IntakeScriptRunnerKind;
  provider?: IntakeAiProvider;
  model?: string;
  inputSummary: string;
  outputSummary: string;
  success: boolean;
  createdAt: string;
}

export interface IntakeScenarioResult {
  scenario: IntakeScenario;
  activeContentFamily: ActiveContentFamily;
  referenceSourceFamily?: ActiveContentFamily;
  templateCandidatePath?: string;
  templateCandidatePaths?: string[];
  homePageCandidatePath?: string;
  homeCandidatePaths?: string[];
  documentCandidatePaths?: string[];
  needsUserChoice?: boolean;
  confidence: number;
  warnings: IntakeWarning[];
}

export interface IntakeDisambiguationState {
  status: 'pending' | 'resolved';
  reason?: string;
  candidateImportKinds: IntakeImportKind[];
  templateCandidatePaths: string[];
  homeCandidatePaths: string[];
  selectedImportKind?: IntakeImportKind;
  selectedTemplateCandidatePath?: string;
  selectedHomePageCandidatePath?: string;
}

export interface IntakeScanCounts {
  html: number;
  document: number;
  assets: number;
  ignored: number;
  pages: number;
  references: number;
}

export interface IntakeScanResult {
  scenario: IntakeScenario;
  activeContentFamily: ActiveContentFamily;
  referenceSourceFamily?: ActiveContentFamily;
  templateCandidatePath?: string;
  homePageCandidatePath?: string;
  pageSourcePaths: string[];
  documentSourcePaths: string[];
  assetSourcePaths: string[];
  shellCandidatePaths: string[];
  blockLibraryPaths: string[];
  warnings: IntakeWarning[];
  rootPath?: string;
  sources: IntakeSourceSnapshot[];
  supportedSources: IntakeSourceSnapshot[];
  unsupportedSources: IntakeSourceSnapshot[];
  ignoredPaths: string[];
  unsupportedPaths: string[];
  noiseRoots: string[];
  assetRoots: string[];
  htmlPageSources: IntakeSourceSnapshot[];
  documentSources: IntakeSourceSnapshot[];
  shellCandidates: string[];
  blockLibraryCandidates: string[];
  htmlPageDrafts: IntakePageDraft[];
  documentPageDrafts: IntakePageDraft[];
  pageCandidates: IntakePageDraft[];
  referenceCandidates: IntakePageDraft[];
  scenarioResult?: IntakeScenarioResult;
  counts: IntakeScanCounts;
}

export interface IntakeSourceManifest {
  rootPath?: string;
  generatedAt: string;
  sources: IntakeSourceSnapshot[];
  ignoredPaths: string[];
}

export interface IntakeSession {
  id: string;
  createdAt: string;
  updatedAt: string;
  sourceLabel: string;
  sourceRoot?: string;
  importKind: IntakeImportKind;
  status: IntakeSessionStatus;
  scenario: IntakeScenario;
  activeContentFamily: ActiveContentFamily;
  referenceSourceFamily?: ActiveContentFamily;
  project: IntakeProjectDraft;
  sources: IntakeSourceSnapshot[];
  pages: IntakePageDraft[];
  shellCandidatePaths: string[];
  blockLibraryPaths: string[];
  templateCandidatePath?: string;
  homePageCandidatePath?: string;
  warnings: IntakeWarning[];
  checks: IntakeCheck[];
  scriptRuns: IntakeScriptRun[];
  currentPageId?: string;
  sourceManifest?: IntakeSourceManifest;
  shellCandidates?: string[];
  blockLibraryCandidates?: string[];
  scenarioResult?: IntakeScenarioResult;
  disambiguation?: IntakeDisambiguationState;
  pageSourcePaths?: string[];
  documentSourcePaths?: string[];
  assetSourcePaths?: string[];
  ignoredPaths?: string[];
  unsupportedPaths?: string[];
  noiseRoots?: string[];
  assetRoots?: string[];
  supportedSources?: IntakeSourceSnapshot[];
  unsupportedSources?: IntakeSourceSnapshot[];
}

export interface IntakeAiSectionSuggestion {
  heading: string | null;
  content: string;
}

export interface IntakeAiSuggestion {
  title: string | null;
  description: string | null;
  h1: string | null;
  sections: IntakeAiSectionSuggestion[];
  unresolved: string[];
  notes: string[];
}

export interface IntakeAiBatchPageInput {
  slug: string;
  title: string | null;
  description: string | null;
  heading: string | null;
  source: string;
}

export interface IntakeAiBatchPageResult {
  slug: string;
  title: string | null;
  description: string | null;
  heading: string | null;
  source: string;
  unresolved?: string[];
  notes?: string[];
}

export interface IntakeAiBatchRequest {
  pages: IntakeAiBatchPageInput[];
}

export interface IntakeAiBatchResult {
  pages: IntakeAiBatchPageResult[];
}

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
  enumValues?: string[];
  defaultValue?: string;
}

export interface BlockDeprecationMeta {
  status: 'active' | 'deprecated';
  replacementBlockId?: string;
  message?: string;
}

export interface NormalizedBlockMeta {
  schemaVersion: number;
  allowedZones: ZoneType[];
  slotCardinality?: {
    min?: number;
    max?: number;
  };
  deprecation?: BlockDeprecationMeta;
}

export interface BlockMeta {
  id: string;
  zone: ZoneType;
  schemaVersion?: number;
  variant: string;
  name: string;
  tags: string[];
  slots: BlockSlotDefinition[];
  tokenKeys: string[];
  templateFile: string;
  source: PublisherBlockSource;
  allowedZones?: ZoneType[];
  slotCardinality?: {
    min?: number;
    max?: number;
  };
  previewBehavior?: 'inline' | 'isolated' | 'hidden';
  buildBehavior?: 'strict' | 'tolerant';
  deprecation?: BlockDeprecationMeta;
}

export interface PublisherBlockDefinition extends Omit<BlockMeta, keyof NormalizedBlockMeta> {
  schemaVersion: number;
  allowedZones: ZoneType[];
  slotCardinality?: NormalizedBlockMeta['slotCardinality'];
  deprecation?: BlockDeprecationMeta;
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
  defaultLanguage: string;
  multilingual: boolean;
  languages: string[];
  mode: 'publisher';
  domain?: string;
  siteUrl?: string;
  favicon?: AssetRef;
  metaImage?: AssetRef;
  logo?: AssetRef;
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

export interface PublisherBuildArtifact {
  path: string;
  contentType: 'html' | 'css' | 'js' | 'json' | 'xml' | 'txt' | 'asset';
  fingerprint: string;
}

export interface PublisherBuildSummary {
  id: string;
  createdAt: string;
  projectId?: string;
  status: PublisherProjectStatus;
  stage: PublisherJobStage;
  workingFailures: number;
  releaseFailures: number;
  warningCount: number;
  artifacts: PublisherBuildArtifact[];
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

export interface PublisherWorkflowState {
  status: PublisherProjectStatus;
  step: PublisherWorkflowStep;
  label: string;
  summary: string;
  nextAction: string;
  blockingReason?: string;
}

export interface LoadedPublisherState {
  project?: SiteProjectContract;
  pages: PageContract[];
  theme?: ThemeContract;
  referenceState?: PublisherReferenceState;
  checks: CheckReport[];
  issues: CheckReport[];
  availableFilePaths: string[];
}

export interface PublisherSiteSettings {
  name: string;
  domain?: string;
  defaultLanguage: string;
  multilingual: boolean;
  languages: string[];
  favicon?: AssetRef;
  metaImage?: AssetRef;
  logo?: AssetRef;
}

export interface PublisherMarkdownSource {
  name: string;
  sourcePath: string;
  pageId?: string;
  pagePath?: string;
}

export interface PublisherReferenceSource {
  path: string;
  storedPath?: string;
  label?: string;
  family: IntakeSourceFamily;
  role?: IntakeSourceSnapshot['role'];
}

export interface PublisherPageSourceMapping {
  pageId: string;
  pagePath: string;
  sourcePath: string;
  storedPath?: string;
  sourceFamily: ActiveContentFamily;
  companionSourcePath?: string;
  companionStoredPath?: string;
}

export interface PublisherAssetMaterialization {
  kind: 'favicon' | 'logo' | 'metaImage';
  sourcePath?: string;
  storedPath?: string;
  publicPath?: string;
  previewPath?: string;
}

export interface PublisherReferenceState {
  intakeSessionId: string;
  importKind: IntakeImportKind;
  activeContentFamily: ActiveContentFamily;
  referenceSourceFamily?: ActiveContentFamily;
  sourceRoot?: string;
  sourceLabel?: string;
  templateCandidatePath?: string;
  homePageCandidatePath?: string;
  shellCandidatePaths: string[];
  referenceLibraryPaths: string[];
  pageSourceMap: PublisherPageSourceMapping[];
  assetMaterialization: PublisherAssetMaterialization[];
  sourceFiles: PublisherReferenceSource[];
}

export interface PublisherAssemblyResult {
  files: Record<string, string>;
  checks: CheckReport[];
  build: PublisherBuildSummary;
}
