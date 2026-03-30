import { useEffect, useMemo, useState } from 'react';
import { useStore } from '@nanostores/react';
import Cookies from 'js-cookie';
import { toast } from 'react-toastify';
import { PublisherIntakeReviewWorkspace } from '~/components/publisher/PublisherIntakeReviewWorkspace';
import { PublisherIntakeWorkspace } from '~/components/publisher/PublisherIntakeWorkspace';
import type { PublisherSiteSettingsSubmitPayload } from '~/components/publisher/PublisherSiteSettingsEditor';
import { useSettings } from '~/lib/hooks/useSettings';
import { assemblePublisherProject } from '~/lib/publisher/assembler';
import { publisherBlockRegistry } from '~/lib/publisher/block-registry';
import { runPublisherChecks } from '~/lib/publisher/checker';
import {
  PUBLISHER_CHECKS_FILE,
  PUBLISHER_GENERATED_DIR,
  PUBLISHER_MANIFEST_FILE,
  PUBLISHER_PROVENANCE_FILE,
  PUBLISHER_PROJECT_FILE,
  PUBLISHER_ROBOTS_FILE,
  PUBLISHER_REFERENCES_FILE,
  PUBLISHER_SITEMAP_FILE,
  PUBLISHER_STATE_FILE,
  PUBLISHER_THEME_FILE,
  getPublisherPageFilePath,
} from '~/lib/publisher/constants';
import { loadPublisherState } from '~/lib/publisher/contracts';
import {
  createPublisherAssetRef,
  fileToUint8Array,
  getGeneratedAssetPath,
  readImageDimensions,
} from '~/lib/publisher/file-helpers';
import { loadIntakeSession } from '~/lib/publisher/intake-files';
import { buildIntakePageChecks, buildIntakeSessionChecks } from '~/lib/publisher/intake';
import { normalizeIntakePageWithProvider, normalizeIntakePagesWithProvider } from '~/lib/publisher/intake-ai';
import { buildImportedBundleAdapter } from '~/lib/publisher/intake-adapter';
import {
  buildIntakeAiBatchPageInput,
  buildPublisherContractsFromIntakeSession,
  serializeIntakeSessionFiles,
} from '~/lib/publisher/intake-pipeline';
import {
  appendPublisherAgentContext,
  loadPublisherProjectState,
  savePublisherProjectState,
} from '~/lib/publisher/persistence';
import { buildPageRegeneratePrompt, buildSlotRegeneratePrompt } from '~/lib/publisher/prompt-context';
import { derivePublisherProjectStatus, derivePublisherWorkflowState } from '~/lib/publisher/status';
import { shouldWritePublisherFileToProject } from '~/lib/publisher/ui-state';
import { saveWorkspaceSession } from '~/lib/publisher/workspace-session';
import { chatStore } from '~/lib/stores/chat';
import { usePreviewStore } from '~/lib/stores/previews';
import { workbenchStore } from '~/lib/stores/workbench';
import type {
  AssetRef,
  IntakeImportKind,
  IntakePageDraft,
  IntakeProjectDraft,
  IntakeSession,
  PageContract,
  PublisherReferenceState,
  PublisherSiteSettings,
  PublisherBuildSummary,
  SiteProjectContract,
  SlotContract,
  ZoneType,
} from '~/types/publisher';

function inferSiteSettings(
  project: SiteProjectContract | undefined,
  fallback?: PublisherSiteSettings,
): PublisherSiteSettings | undefined {
  if (!project && !fallback) {
    return undefined;
  }

  return {
    name: project?.name ?? fallback?.name ?? '',
    domain: project?.domain ?? fallback?.domain,
    defaultLanguage: project?.defaultLanguage ?? fallback?.defaultLanguage ?? 'en',
    multilingual: project?.multilingual ?? fallback?.multilingual ?? false,
    languages: project?.languages ?? fallback?.languages ?? ['en'],
    favicon: project?.favicon ?? fallback?.favicon,
    metaImage: project?.metaImage ?? fallback?.metaImage,
    logo: project?.logo ?? fallback?.logo,
  };
}

function decodeBase64(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function buildUpdatedProjectContract(
  project: SiteProjectContract,
  settings: PublisherSiteSettings,
  assetOverrides: Partial<Record<'favicon' | 'metaImage' | 'logo', AssetRef | undefined>>,
): SiteProjectContract {
  const normalizedLanguages = settings.multilingual
    ? Array.from(new Set(settings.languages.map((language) => language.toLowerCase())))
    : [settings.defaultLanguage.toLowerCase()];

  return {
    ...project,
    name: settings.name,
    domain: settings.domain,
    siteUrl: settings.domain
      ? settings.domain.startsWith('http://') || settings.domain.startsWith('https://')
        ? settings.domain
        : `https://${settings.domain}`
      : undefined,
    defaultLanguage: settings.defaultLanguage.toLowerCase(),
    multilingual: settings.multilingual,
    languages: normalizedLanguages,
    favicon: assetOverrides.favicon ?? settings.favicon,
    metaImage: assetOverrides.metaImage ?? settings.metaImage,
    logo: assetOverrides.logo ?? settings.logo,
    siteSeo: {
      ...project.siteSeo,
      siteName: settings.name,
      organizationName: project.siteSeo?.organizationName ?? settings.name,
    },
  };
}

function buildNormalizePrompt(pageId: string) {
  return [
    'Work in Publisher Mode only.',
    'Normalize the current page by extracting structured contract fields without rewriting content.',
    'Return only the page contract fields that need to be updated.',
    `currentPage: ${pageId}`,
    '',
    'Keep the output machine-parseable and limited to title, description, H1, ordered sections, and unresolved snippets.',
  ].join('\n');
}

function createIntakeSiteSettings(project?: IntakeProjectDraft): PublisherSiteSettings | undefined {
  if (!project) {
    return undefined;
  }

  const toAssetRef = (asset?: IntakeProjectDraft['favicon']): AssetRef | undefined => {
    const path = asset?.path ?? asset?.storedPath ?? asset?.sourcePath;

    if (!path) {
      return undefined;
    }

    return {
      path,
      publicPath: asset?.publicPath,
      mimeType: asset?.mimeType,
      label: asset?.label,
      storedPath: asset?.storedPath,
      previewPath: asset?.previewPath ?? asset?.previewUrl,
    };
  };

  return {
    name: project.name,
    domain: project.domain,
    defaultLanguage: project.defaultLanguage,
    multilingual: project.multilingual,
    languages: project.languages,
    favicon: toAssetRef(project.favicon),
    metaImage: toAssetRef(project.metaImage),
    logo: toAssetRef(project.logo),
  };
}

function isBrokenMetadataPage(page: IntakePageDraft) {
  return !page.title.trim() || !page.description?.trim() || !page.h1?.trim();
}

function buildSourceSnapshot(referenceState?: PublisherReferenceState) {
  const snapshot: Record<string, { storedPath?: string; family: string; label?: string }> = {};

  for (const source of referenceState?.sourceFiles ?? []) {
    snapshot[source.path] = {
      storedPath: source.storedPath,
      family: source.family,
      label: source.label,
    };

    if (source.storedPath) {
      snapshot[source.storedPath] = {
        storedPath: source.storedPath,
        family: source.family,
        label: source.label,
      };
    }
  }

  return snapshot;
}

function getGeneratedPagePath(page: PageContract) {
  return page.path === '/'
    ? `${PUBLISHER_GENERATED_DIR}/index.html`
    : `${PUBLISHER_GENERATED_DIR}${page.path}/index.html`;
}

export function StructureView() {
  const files = useStore(workbenchStore.files);
  const previewStore = usePreviewStore();
  const { promptId, setPromptId } = useSettings();
  const publisherState = useMemo(() => loadPublisherState(files), [files]);
  const intakeSession = useMemo(() => loadIntakeSession(files), [files]);
  const persistedProjectState = useMemo(
    () => loadPublisherProjectState(publisherState.project?.id ?? intakeSession?.id),
    [intakeSession?.id, publisherState.project?.id],
  );
  const [selectedPageId, setSelectedPageId] = useState<string | undefined>(
    persistedProjectState?.selectedPageId ?? publisherState.pages[0]?.id,
  );
  const [intakeDraft, setIntakeDraft] = useState<IntakeSession | undefined>(intakeSession);
  const [intakeSelectedPageId, setIntakeSelectedPageId] = useState<string | undefined>(intakeSession?.currentPageId);
  const [savingSettings, setSavingSettings] = useState(false);
  const [normalizingPageId, setNormalizingPageId] = useState<string>();
  const [selectedBrokenPageIds, setSelectedBrokenPageIds] = useState<string[]>([]);
  const checks = useMemo(() => runPublisherChecks(publisherState, publisherBlockRegistry), [publisherState]);
  const selectedPage = publisherState.pages.find((page) => page.id === selectedPageId) ?? publisherState.pages[0];
  const siteSettings = useMemo(
    () => inferSiteSettings(publisherState.project, persistedProjectState?.siteSettings),
    [persistedProjectState?.siteSettings, publisherState.project],
  );
  const buildHistory = useMemo(
    () =>
      [...(persistedProjectState?.buildHistory ?? [])].sort((left, right) =>
        right.createdAt.localeCompare(left.createdAt),
      ),
    [persistedProjectState?.buildHistory],
  );
  const projectStatus = useMemo(
    () =>
      derivePublisherProjectStatus({
        intakeSession: intakeDraft,
        checks,
        lastBuild: buildHistory[0],
        currentStatus: persistedProjectState?.status,
      }),
    [buildHistory, checks, intakeDraft, persistedProjectState?.status],
  );
  const publisherWorkflow = useMemo(
    () =>
      derivePublisherWorkflowState({
        intakeSession: intakeDraft,
        checks,
        lastBuild: buildHistory[0],
        currentStatus: persistedProjectState?.status,
      }),
    [buildHistory, checks, intakeDraft, persistedProjectState?.status],
  );

  useEffect(() => {
    setIntakeDraft(intakeSession);
    setIntakeSelectedPageId(intakeSession?.currentPageId ?? intakeSession?.pages[0]?.id);
  }, [intakeSession?.currentPageId, intakeSession?.id, intakeSession?.pages]);

  useEffect(() => {
    if (!intakeSession) {
      setSelectedBrokenPageIds([]);
      return;
    }

    setSelectedBrokenPageIds((current) => {
      const brokenIds = intakeSession.pages.filter(isBrokenMetadataPage).map((page) => page.id);

      if (current.length === 0) {
        return brokenIds;
      }

      const next = current.filter((pageId) => brokenIds.includes(pageId));

      return next.length > 0 || brokenIds.length === 0 ? next : brokenIds;
    });
  }, [intakeSession]);

  useEffect(() => {
    if (!selectedPage && publisherState.pages[0]) {
      setSelectedPageId(publisherState.pages[0].id);
    }
  }, [publisherState.pages, selectedPage]);

  useEffect(() => {
    if (!selectedPage?.id) {
      return;
    }

    savePublisherProjectState(publisherState.project?.id, {
      selectedPageId: selectedPage.id,
    });
  }, [publisherState.project?.id, selectedPage?.id]);

  const sourceContentByPath = useMemo(() => {
    const snapshot: Record<string, string> = {};

    if (intakeDraft) {
      for (const source of intakeDraft.sources) {
        const file = files[source.storedPath ?? source.path];

        if (file?.type === 'file' && !file.isBinary) {
          snapshot[source.storedPath ?? source.path] = file.content;
          snapshot[source.path] = file.content;
        }
      }
    }

    for (const source of persistedProjectState?.markdownSources ?? []) {
      const file = files[source.sourcePath];

      if (file?.type === 'file') {
        snapshot[source.sourcePath] = file.content;
      }
    }

    const referenceSnapshot = buildSourceSnapshot(
      publisherState.referenceState ?? persistedProjectState?.referenceState,
    );

    for (const [path, source] of Object.entries(referenceSnapshot)) {
      const primaryPath = source.storedPath ?? path;
      const file = files[primaryPath] ?? files[path];

      if (file?.type === 'file' && !file.isBinary) {
        snapshot[path] = file.content;
        snapshot[primaryPath] = file.content;
      }
    }

    return snapshot;
  }, [
    files,
    intakeDraft,
    persistedProjectState?.markdownSources,
    persistedProjectState?.referenceState,
    publisherState.referenceState,
  ]);

  const prefillPrompt = (prompt: string, context?: { pageId?: string; zone?: ZoneType; blockId?: string }) => {
    if (promptId !== 'publisher') {
      setPromptId('publisher');
      toast.info('Prompt switched to Publisher Mode');
    }

    appendPublisherAgentContext(
      publisherState.project?.id ?? intakeDraft?.id,
      {
        mode: 'publisher',
        currentPage: context?.pageId,
        currentZone: context?.zone,
        selectedBlockId: context?.blockId,
      },
      prompt,
    );

    chatStore.setKey('draftPrefill', {
      message: prompt,
      replaceRequested: true,
      source: context?.blockId ? 'slot' : context?.zone ? 'page' : 'rebuild',
    });
  };

  const openFile = (filePath: string) => {
    workbenchStore.setSelectedFile(filePath);
    workbenchStore.currentView.set('code');
  };

  const syncGeneratedAssets = async (project: SiteProjectContract | undefined) => {
    if (!project) {
      return;
    }

    const projectAssets = [project.favicon, project.metaImage, project.logo].filter(Boolean) as AssetRef[];

    for (const asset of projectAssets) {
      const sourceFile = workbenchStore.files.get()[asset.path];
      const targetPath = getGeneratedAssetPath(asset);

      if (!targetPath || sourceFile?.type !== 'file') {
        continue;
      }

      if (sourceFile.isBinary) {
        await workbenchStore.writeSystemFile(targetPath, decodeBase64(sourceFile.content));
      } else {
        await workbenchStore.writeSystemFile(targetPath, sourceFile.content);
      }
    }
  };

  const rebuildPreview = async (pageId?: string) => {
    const latestState = loadPublisherState(workbenchStore.files.get());
    const build = assemblePublisherProject(
      latestState,
      publisherBlockRegistry,
      pageId ? { mode: 'publisher', currentPage: pageId } : { mode: 'publisher' },
    );

    for (const [filePath, content] of Object.entries(build.files)) {
      await workbenchStore.writeSystemFile(filePath, content);
    }

    await syncGeneratedAssets(latestState.project);
    previewStore.refreshAllPreviews();

    const previousHistory = persistedProjectState?.buildHistory ?? [];
    const nextHistory: PublisherBuildSummary[] = [build.build, ...previousHistory].slice(0, 10);
    savePublisherProjectState(latestState.project?.id, {
      lastBuildAt: build.build.createdAt,
      buildHistory: nextHistory,
      status: build.build.status,
    });
    toast.success('Publisher output rebuilt');
  };

  const persistIntakeDraft = async (nextSession: IntakeSession) => {
    const artifacts = serializeIntakeSessionFiles(nextSession);

    for (const [filePath, content] of Object.entries(artifacts)) {
      await workbenchStore.writeSystemFile(filePath, content);
    }
  };

  const updateIntakePage = async (pageId: string, nextPage: IntakePageDraft) => {
    if (!intakeDraft) {
      return;
    }

    const normalizedPage = {
      ...nextPage,
      checks: buildIntakePageChecks(nextPage),
    };

    const nextSession: IntakeSession = {
      ...intakeDraft,
      pages: intakeDraft.pages.map((page) => (page.id === pageId ? normalizedPage : page)),
      currentPageId: pageId,
      updatedAt: new Date().toISOString(),
    };
    nextSession.checks = buildIntakeSessionChecks(nextSession);

    setIntakeDraft(nextSession);
    setIntakeSelectedPageId(pageId);
    await persistIntakeDraft(nextSession);
  };

  const updateIntakeProject = async (nextProject: IntakeProjectDraft) => {
    if (!intakeDraft) {
      return;
    }

    const nextSession: IntakeSession = {
      ...intakeDraft,
      project: nextProject,
      updatedAt: new Date().toISOString(),
    };
    nextSession.checks = buildIntakeSessionChecks(nextSession);

    setIntakeDraft(nextSession);
    await persistIntakeDraft(nextSession);
  };

  const getSelectedProviderRuntime = () => {
    const providerName = Cookies.get('selectedProvider');
    const model = Cookies.get('selectedModel');

    if (!providerName || !model) {
      toast.error('Select an AI provider and model before using Normalize with AI.');
      return undefined;
    }

    return {
      providerName,
      model,
    };
  };

  const handleNormalizeIntakePage = async (page: IntakePageDraft) => {
    if (!intakeDraft) {
      return;
    }

    const runtime = getSelectedProviderRuntime();

    if (!runtime) {
      return;
    }

    const rawSource = sourceContentByPath[page.storedSourcePath ?? page.sourcePath];

    if (!rawSource) {
      toast.error('No raw source is available for this page.');
      return;
    }

    setNormalizingPageId(page.id);

    try {
      const result = await normalizeIntakePageWithProvider({
        page,
        rawSource,
        providerName: runtime.providerName,
        model: runtime.model,
      });

      const applySuggestion = window.confirm('Apply the extracted title, description, H1, and sections to this draft?');
      const nextPage: IntakePageDraft = applySuggestion
        ? {
            ...page,
            title: result.suggestion.title ?? page.title,
            description: result.suggestion.description ?? page.description,
            h1: result.suggestion.h1 ?? page.h1,
            sections:
              result.suggestion.sections.length > 0
                ? result.suggestion.sections.map((section, index) => ({
                    id: `${page.id}-ai-${index + 1}`,
                    kind: 'richtext',
                    heading: section.heading ?? undefined,
                    content: section.content,
                  }))
                : page.sections,
            warnings: result.suggestion.unresolved.length
              ? [
                  ...page.warnings,
                  {
                    code: 'ai-unresolved',
                    message: 'AI left part of the source unresolved.',
                    severity: 'warn',
                    pageId: page.id,
                    details: result.suggestion.unresolved,
                  },
                ]
              : page.warnings,
          }
        : page;
      nextPage.checks = buildIntakePageChecks(nextPage);

      const nextSession: IntakeSession = {
        ...intakeDraft,
        pages: intakeDraft.pages.map((candidate) => (candidate.id === page.id ? nextPage : candidate)),
        scriptRuns: [...intakeDraft.scriptRuns, { ...result.scriptRun, sessionId: intakeDraft.id }],
        updatedAt: new Date().toISOString(),
      };
      nextSession.checks = buildIntakeSessionChecks(nextSession);

      setIntakeDraft(nextSession);
      await persistIntakeDraft(nextSession);
      toast.success(
        applySuggestion ? 'AI suggestion applied to the draft.' : 'AI suggestion logged without overwriting the draft.',
      );
    } catch (error) {
      console.error(error);
      toast.error('AI normalize failed');
    } finally {
      setNormalizingPageId(undefined);
    }
  };

  const applyBatchMetadataResult = async (
    pagesToApply: IntakePageDraft[],
    batchResult: Awaited<ReturnType<typeof normalizeIntakePagesWithProvider>>,
  ) => {
    if (!intakeDraft) {
      return;
    }

    const bySlug = new Map(batchResult.result.pages.map((page) => [page.slug, page]));
    const nextPages = intakeDraft.pages.map((page) => {
      const match = bySlug.get(page.slug);

      if (!match) {
        return page;
      }

      const nextPage: IntakePageDraft = {
        ...page,
        title: !page.title.trim() && match.title ? match.title : page.title,
        description: !page.description?.trim() && match.description ? match.description : page.description,
        h1: !page.h1?.trim() && match.heading ? match.heading : page.h1,
        warnings:
          match.unresolved && match.unresolved.length > 0
            ? [
                ...page.warnings,
                {
                  code: 'ai-batch-unresolved',
                  message: 'AI left part of the source unresolved.',
                  severity: 'warn',
                  pageId: page.id,
                  details: match.unresolved,
                },
              ]
            : page.warnings,
      };

      nextPage.checks = buildIntakePageChecks(nextPage);

      return nextPage;
    });

    const nextSession: IntakeSession = {
      ...intakeDraft,
      pages: nextPages,
      scriptRuns: [...intakeDraft.scriptRuns, { ...batchResult.scriptRun, sessionId: intakeDraft.id }],
      updatedAt: new Date().toISOString(),
    };
    nextSession.checks = buildIntakeSessionChecks(nextSession);

    setIntakeDraft(nextSession);
    await persistIntakeDraft(nextSession);
    setSelectedBrokenPageIds((current) =>
      current.filter((pageId) => nextSession.pages.find((page) => page.id === pageId && isBrokenMetadataPage(page))),
    );
    toast.success(
      `Applied AI metadata suggestions to ${pagesToApply.length} page${pagesToApply.length > 1 ? 's' : ''}.`,
    );
  };

  const handleNormalizeBrokenPages = async (scope: 'selected' | 'all') => {
    if (!intakeDraft) {
      return;
    }

    const runtime = getSelectedProviderRuntime();

    if (!runtime) {
      return;
    }

    const brokenPages = intakeDraft.pages.filter((page) =>
      scope === 'all'
        ? isBrokenMetadataPage(page)
        : selectedBrokenPageIds.includes(page.id) && isBrokenMetadataPage(page),
    );

    if (brokenPages.length === 0) {
      toast.info(scope === 'all' ? 'No broken pages found.' : 'Select at least one broken page.');
      return;
    }

    const payload = brokenPages
      .map((page) => {
        const rawSource = sourceContentByPath[page.storedSourcePath ?? page.sourcePath];
        return rawSource ? buildIntakeAiBatchPageInput(page, rawSource) : undefined;
      })
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
    const payloadScopeSummary = payload.map((page) => page.slug).join(', ');

    if (payload.length === 0) {
      toast.error('No raw source is available for the selected broken pages.');
      return;
    }

    setNormalizingPageId(scope === 'all' ? 'all' : 'selected');

    try {
      const result = await normalizeIntakePagesWithProvider({
        pages: payload,
        providerName: runtime.providerName,
        model: runtime.model,
      });
      const auditedScriptRun = {
        ...result.scriptRun,
        inputSummary: `batch:${payload.length} pages · ${payloadScopeSummary}`,
        outputSummary: `pages:${result.result.pages.length} · missing metadata only`,
      };
      const applySuggestion = window.confirm(
        `Apply extracted title, description, and heading to ${payload.length} broken page${payload.length > 1 ? 's' : ''}? Only empty fields will be filled.`,
      );

      if (applySuggestion) {
        await applyBatchMetadataResult(brokenPages, { ...result, scriptRun: auditedScriptRun });
      } else if (intakeDraft) {
        const nextSession: IntakeSession = {
          ...intakeDraft,
          scriptRuns: [...intakeDraft.scriptRuns, { ...auditedScriptRun, sessionId: intakeDraft.id }],
          updatedAt: new Date().toISOString(),
        };

        setIntakeDraft(nextSession);
        await persistIntakeDraft(nextSession);
        toast.success('AI batch suggestion logged without overwriting the draft.');
      }
    } catch (error) {
      console.error(error);
      toast.error('AI batch normalize failed');
    } finally {
      setNormalizingPageId(undefined);
    }
  };

  const handleResolveDisambiguation = async (selection: {
    importKind: IntakeImportKind;
    templateCandidatePath?: string;
    homePageCandidatePath?: string;
  }) => {
    if (!intakeDraft) {
      return;
    }

    const result = buildImportedBundleAdapter({
      sessionId: intakeDraft.id,
      sourceLabel: intakeDraft.sourceLabel,
      sourceRoot: intakeDraft.sourceRoot,
      importKind: selection.importKind,
      sources: intakeDraft.sources,
      project: intakeDraft.project,
      templateCandidatePath: selection.templateCandidatePath,
      homePageCandidatePath: selection.homePageCandidatePath,
    });
    const scenario = result.session.scenarioResult ?? result.scan.scenarioResult;

    if (!scenario) {
      toast.error('Unable to resolve intake scenario for the selected import family.');
      return;
    }

    const templateCandidates = scenario.templateCandidatePaths ?? [];
    const homeCandidates = scenario.homeCandidatePaths ?? [];
    const selectedTemplateCandidatePath =
      selection.templateCandidatePath ??
      intakeDraft.disambiguation?.selectedTemplateCandidatePath ??
      scenario.templateCandidatePath ??
      templateCandidates[0];
    const selectedHomeCandidatePath =
      selection.homePageCandidatePath ??
      intakeDraft.disambiguation?.selectedHomePageCandidatePath ??
      scenario.homePageCandidatePath ??
      homeCandidates[0];

    if (
      scenario.needsUserChoice &&
      ((templateCandidates.length > 0 && !selectedTemplateCandidatePath) ||
        (homeCandidates.length > 0 && !selectedHomeCandidatePath))
    ) {
      toast.error('Intake still has ambiguous candidates. Please select one template and one home page.');
      return;
    }

    if (
      templateCandidates.length > 0 &&
      selectedTemplateCandidatePath &&
      !templateCandidates.includes(selectedTemplateCandidatePath)
    ) {
      toast.error('Selected template candidate is not part of the detected candidates.');
      return;
    }

    if (homeCandidates.length > 0 && selectedHomeCandidatePath && !homeCandidates.includes(selectedHomeCandidatePath)) {
      toast.error('Selected home candidate is not part of the detected candidates.');
      return;
    }

    const nextSession: IntakeSession = {
      ...result.session,
      createdAt: intakeDraft.createdAt,
      scriptRuns: intakeDraft.scriptRuns,
      updatedAt: new Date().toISOString(),
    };
    nextSession.checks = buildIntakeSessionChecks(nextSession);

    setIntakeDraft(nextSession);
    setIntakeSelectedPageId(nextSession.currentPageId);
    await persistIntakeDraft(nextSession);
    toast.success('Intake disambiguation resolved. Review is now unlocked.');
  };

  const handleApplyImport = async () => {
    if (!intakeDraft) {
      return;
    }

    if (intakeDraft.disambiguation?.status === 'pending' || intakeDraft.scenario === 'needsDisambiguation') {
      toast.error('Resolve intake disambiguation before applying import.');
      return;
    }

    try {
      const result = buildPublisherContractsFromIntakeSession(intakeDraft);

      for (const [filePath, content] of Object.entries(result.files)) {
        if (shouldWritePublisherFileToProject(filePath)) {
          await workbenchStore.writeFile(filePath, content);
        } else {
          await workbenchStore.writeSystemFile(filePath, content);
        }
      }

      savePublisherProjectState(result.project.id, {
        onboardingCompleted: true,
        siteSettings: createIntakeSiteSettings(intakeDraft.project),
        markdownSources: result.markdownSources,
        referenceState: result.referenceState,
        selectedPageId: result.pages[0]?.id,
        status: 'contract-ready',
      });
      saveWorkspaceSession({
        mode: 'publisher',
        stage: 'structure',
        onboardingCompleted: true,
        projectId: result.project.id,
        intakeSessionId: intakeDraft.id,
      });

      setSelectedPageId(result.pages[0]?.id);
      await rebuildPreview(result.pages[0]?.id);
      toast.success('Intake imported into Publisher contracts');
    } catch (error) {
      console.error(error);
      toast.error('Failed to apply intake session');
    }
  };

  const handleSaveSiteSettings = async (payload: PublisherSiteSettingsSubmitPayload) => {
    if (!publisherState.project) {
      toast.error('Create a publisher project first.');
      return;
    }

    setSavingSettings(true);

    try {
      const assetOverrides: Partial<Record<'favicon' | 'metaImage' | 'logo', AssetRef | undefined>> = {};
      const assetEntries = [
        ['favicon', payload.assets.favicon],
        ['metaImage', payload.assets.metaImage],
        ['logo', payload.assets.logo],
      ] as const;

      for (const [assetName, file] of assetEntries) {
        if (!file) {
          continue;
        }

        const fileBytes = await fileToUint8Array(file);
        const dimensions = await readImageDimensions(file);
        const assetRef = createPublisherAssetRef(assetName, file.name, file.type || undefined, {
          bytes: fileBytes,
          width: dimensions?.width,
          height: dimensions?.height,
        });
        assetOverrides[assetName] = assetRef;
        await workbenchStore.writeSystemFile(assetRef.path, fileBytes);
      }

      const nextProject = buildUpdatedProjectContract(publisherState.project, payload.settings, assetOverrides);
      await workbenchStore.writeFile(PUBLISHER_PROJECT_FILE, JSON.stringify(nextProject, null, 2));

      savePublisherProjectState(nextProject.id, {
        onboardingCompleted: true,
        siteSettings: {
          ...payload.settings,
          favicon: nextProject.favicon,
          metaImage: nextProject.metaImage,
          logo: nextProject.logo,
        },
        status: projectStatus,
      });

      await rebuildPreview();
      toast.success('Publisher site settings saved');
    } catch (error) {
      console.error(error);
      toast.error('Failed to save site settings');
    } finally {
      setSavingSettings(false);
    }
  };

  const goToPreviousPage = () => {
    if (!publisherState.pages.length) {
      return;
    }

    const activeIndex = Math.max(
      0,
      publisherState.pages.findIndex((page) => page.id === selectedPage?.id),
    );
    const nextIndex = activeIndex > 0 ? activeIndex - 1 : publisherState.pages.length - 1;
    setSelectedPageId(publisherState.pages[nextIndex]?.id);
  };

  const goToNextPage = () => {
    if (!publisherState.pages.length) {
      return;
    }

    const activeIndex = Math.max(
      0,
      publisherState.pages.findIndex((page) => page.id === selectedPage?.id),
    );
    const nextIndex = activeIndex < publisherState.pages.length - 1 ? activeIndex + 1 : 0;
    setSelectedPageId(publisherState.pages[nextIndex]?.id);
  };

  if (intakeDraft && !publisherState.project) {
    return (
      <PublisherIntakeReviewWorkspace
        session={intakeDraft}
        selectedPageId={intakeSelectedPageId}
        sourceContentByPath={sourceContentByPath}
        busyNormalize={Boolean(normalizingPageId)}
        selectedBrokenPageIds={selectedBrokenPageIds}
        onSelectPage={async (pageId) => {
          setIntakeSelectedPageId(pageId);

          const nextSession = {
            ...intakeDraft,
            currentPageId: pageId,
            updatedAt: new Date().toISOString(),
          };

          setIntakeDraft(nextSession);
          await persistIntakeDraft(nextSession);
        }}
        onUpdatePage={(pageId, nextPage) => {
          void updateIntakePage(pageId, nextPage);
        }}
        onUpdateProject={(nextProject) => {
          void updateIntakeProject(nextProject);
        }}
        onApplyImport={() => {
          void handleApplyImport();
        }}
        onNormalizeWithAi={(page) => {
          void handleNormalizeIntakePage(page);
        }}
        onToggleBrokenPage={(pageId, selected) => {
          setSelectedBrokenPageIds((current) =>
            selected ? Array.from(new Set([...current, pageId])) : current.filter((entry) => entry !== pageId),
          );
        }}
        onNormalizeBroken={() => {
          void handleNormalizeBrokenPages('selected');
        }}
        onNormalizeAllBroken={() => {
          void handleNormalizeBrokenPages('all');
        }}
        onResolveDisambiguation={(selection) => {
          void handleResolveDisambiguation(selection);
        }}
      />
    );
  }

  return (
    <PublisherIntakeWorkspace
      project={publisherState.project}
      siteSettings={siteSettings}
      pages={publisherState.pages}
      theme={publisherState.theme}
      checks={checks}
      markdownSources={persistedProjectState?.markdownSources}
      referenceState={publisherState.referenceState ?? persistedProjectState?.referenceState}
      status={projectStatus}
      workflow={publisherWorkflow}
      buildHistory={buildHistory}
      selectedPageId={selectedPage?.id}
      sourceContentByPath={sourceContentByPath}
      busySettings={savingSettings}
      onSelectPage={setSelectedPageId}
      onPreviousPage={goToPreviousPage}
      onNextPage={goToNextPage}
      onOpenProject={() => openFile(PUBLISHER_PROJECT_FILE)}
      onOpenTheme={() => openFile(PUBLISHER_THEME_FILE)}
      onOpenChecks={() => openFile(PUBLISHER_CHECKS_FILE)}
      onOpenReferences={() => openFile(PUBLISHER_REFERENCES_FILE)}
      onOpenSourceFile={(filePath: string) => openFile(filePath)}
      onOpenOutput={(page: PageContract) => openFile(getGeneratedPagePath(page))}
      onOpenProvenance={() => openFile(PUBLISHER_PROVENANCE_FILE)}
      onOpenState={() => openFile(PUBLISHER_STATE_FILE)}
      onOpenManifest={() => openFile(PUBLISHER_MANIFEST_FILE)}
      onOpenSitemap={() => openFile(PUBLISHER_SITEMAP_FILE)}
      onOpenRobots={() => openFile(PUBLISHER_ROBOTS_FILE)}
      onOpenContract={(page: PageContract) => openFile(getPublisherPageFilePath(page.slug))}
      onNormalizeWithAi={(page: PageContract) => {
        prefillPrompt(buildNormalizePrompt(page.id), { pageId: page.id });
      }}
      onRegeneratePage={(page: PageContract) => {
        prefillPrompt(buildPageRegeneratePrompt(page.id), { pageId: page.id });
      }}
      onRegenerateSection={(page: PageContract, sectionId: string, sectionZone?: string) => {
        const zone = (sectionZone as ZoneType | undefined) ?? 'content';
        const syntheticSlot: SlotContract = {
          id: sectionId,
          blockId: zone,
          props: {},
        };

        prefillPrompt(buildSlotRegeneratePrompt(page.id, zone, syntheticSlot), {
          pageId: page.id,
          zone,
          blockId: syntheticSlot.blockId,
        });
      }}
      onRebuildPreview={() => {
        void rebuildPreview();
      }}
      onSaveSettings={handleSaveSiteSettings}
    />
  );
}
