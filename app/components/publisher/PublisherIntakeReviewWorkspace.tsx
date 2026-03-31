import { useMemo, useState } from 'react';
import { CodeMirrorEditor, type EditorDocument } from '~/components/editor/codemirror/CodeMirrorEditor';
import { useSettings } from '~/lib/hooks/useSettings';
import type {
  IntakeImportKind,
  IntakeCheck,
  IntakePageDraft,
  IntakeProjectDraft,
  IntakeSession,
  IntakeWarning,
} from '~/types/publisher';
import {
  applyIntakeReviewDraft,
  categorizeIntakeCheck,
  createIntakeReviewDraft,
  deriveBatchNormalizeReviewState,
  getIntakeDiagnosticOriginLine,
  getIntakeDiagnosticRemediation,
  getIntakeDiagnosticLabel,
} from '~/lib/publisher/intake-ui';
import { IntakeAssetField } from './IntakeAssetField';
import { IntakePageEditor } from './IntakePageEditor';

interface PublisherIntakeReviewWorkspaceProps {
  session: IntakeSession;
  selectedPageId?: string;
  sourceContentByPath: Record<string, string>;
  busyNormalize?: boolean;
  selectedBrokenPageIds: string[];
  onSelectPage: (pageId: string) => void;
  onUpdatePage: (pageId: string, nextPage: IntakePageDraft) => void;
  onUpdateProject: (nextProject: IntakeProjectDraft) => void;
  onApplyImport: () => void;
  onNormalizeWithAi: (page: IntakePageDraft) => void;
  onToggleBrokenPage: (pageId: string, selected: boolean) => void;
  onNormalizeBroken: () => void;
  onNormalizeAllBroken: () => void;
  onResolveIntakeItem: (itemId: string) => void;
  onApplySelectedFixes: (pageId: string) => void;
  onMarkIntakeReviewReady: () => void;
  onResolveDisambiguation?: (selection: {
    importKind: IntakeImportKind;
    templateCandidatePath?: string;
    homePageCandidatePath?: string;
  }) => void;
}

function getWarningClasses(warning: IntakeWarning['severity']) {
  if (warning === 'fail') {
    return 'border-red-500/20 bg-red-500/10 text-red-200';
  }

  if (warning === 'warn') {
    return 'border-amber-500/20 bg-amber-500/10 text-amber-200';
  }

  return 'border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 text-bolt-elements-textSecondary';
}

function isBrokenMetadataPage(page: IntakePageDraft) {
  return !page.title.trim() || !page.description?.trim() || !page.h1?.trim();
}

function formatCheckTone(check: IntakeCheck) {
  if (check.severity === 'fail') {
    return 'border-red-500/20 bg-red-500/10 text-red-200';
  }

  if (check.severity === 'warn') {
    return 'border-amber-500/20 bg-amber-500/10 text-amber-200';
  }

  return 'border-green-500/20 bg-green-500/10 text-green-200';
}

function getCheckCategoryBadge(check: IntakeCheck) {
  return getIntakeDiagnosticLabel(categorizeIntakeCheck(check));
}

export function PublisherIntakeReviewWorkspace({
  session,
  selectedPageId,
  sourceContentByPath,
  busyNormalize = false,
  selectedBrokenPageIds,
  onSelectPage,
  onUpdatePage,
  onUpdateProject,
  onApplyImport,
  onNormalizeWithAi,
  onToggleBrokenPage,
  onNormalizeBroken,
  onNormalizeAllBroken,
  onResolveIntakeItem,
  onApplySelectedFixes,
  onMarkIntakeReviewReady,
  onResolveDisambiguation,
}: PublisherIntakeReviewWorkspaceProps) {
  const { settings } = useSettings();
  const selectedPage = session.pages.find((page) => page.id === selectedPageId) ?? session.pages[0];
  const selectedIndex = Math.max(
    0,
    session.pages.findIndex((page) => page.id === selectedPage?.id),
  );
  const rawSource = selectedPage?.storedSourcePath
    ? sourceContentByPath[selectedPage.storedSourcePath]
    : sourceContentByPath[selectedPage?.sourcePath ?? ''];
  const batchNormalizeReview = useMemo(
    () => deriveBatchNormalizeReviewState(session, selectedBrokenPageIds),
    [selectedBrokenPageIds, session],
  );
  const brokenPages = session.pages.filter(isBrokenMetadataPage);
  const selectedPageChecks = selectedPage ? session.checks.filter((check) => check.pageId === selectedPage.id) : [];
  const selectedSourcePath = selectedPage?.storedSourcePath ?? selectedPage?.sourcePath;
  const sourceDoc: EditorDocument | undefined = rawSource
    ? {
        filePath: selectedSourcePath ?? 'intake-source.md',
        value: rawSource,
        isBinary: false,
      }
    : undefined;
  const selectedDraft = useMemo(() => {
    if (!selectedPage) {
      return undefined;
    }

    return createIntakeReviewDraft(selectedPage, {
      sourcePath: selectedSourcePath ?? selectedPage.sourcePath,
      label: selectedSourcePath?.split('/').pop() ?? selectedPage.name,
      kind: selectedPage.sourceFamily,
      rawContent: rawSource,
      pageId: selectedPage.id,
      pagePath: selectedPage.path,
      warnings: selectedPage.warnings.map((warning) => warning.message),
    });
  }, [rawSource, selectedPage, selectedSourcePath]);
  const pendingDisambiguation =
    session.disambiguation?.status === 'pending' || session.scenario === 'needsDisambiguation';
  const completionBlockers = session.completionBlockers ?? [];
  const reviewTasks = session.reviewTasks ?? [];
  const intakeStateLabel = completionBlockers.length > 0 ? 'Blocked' : reviewTasks.length > 0 ? 'Reviewable' : 'Ready';
  const unresolvedItemIds = [...completionBlockers, ...reviewTasks].map((item) => item.id);
  const templateCandidates =
    session.disambiguation?.templateCandidatePaths ?? session.scenarioResult?.templateCandidatePaths ?? [];
  const homeCandidates = session.disambiguation?.homeCandidatePaths ?? session.scenarioResult?.homeCandidatePaths ?? [];
  const candidateImportKinds = session.disambiguation?.candidateImportKinds ?? ['html', 'document'];
  const [selectedImportKind, setSelectedImportKind] = useState<IntakeImportKind>(
    (session.disambiguation?.selectedImportKind ??
      session.importKind ??
      candidateImportKinds[0] ??
      'html') as IntakeImportKind,
  );
  const [selectedTemplateCandidatePath, setSelectedTemplateCandidatePath] = useState<string>(
    session.disambiguation?.selectedTemplateCandidatePath ??
      session.templateCandidatePath ??
      templateCandidates[0] ??
      '',
  );
  const [selectedHomeCandidatePath, setSelectedHomeCandidatePath] = useState<string>(
    session.disambiguation?.selectedHomePageCandidatePath ?? session.homePageCandidatePath ?? homeCandidates[0] ?? '',
  );

  if (pendingDisambiguation) {
    return (
      <div className="absolute inset-0 overflow-auto bg-bolt-elements-background-depth-2 text-bolt-elements-textPrimary">
        <div className="mx-auto mt-10 max-w-3xl rounded-xl border border-red-500/20 bg-red-500/5 p-6">
          <h3 className="text-base font-semibold">Resolve intake disambiguation</h3>
          <p className="mt-2 text-sm text-bolt-elements-textSecondary">
            The intake has conflicting family/template/home candidates. Review is locked until a deterministic choice is
            saved.
          </p>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="flex flex-col gap-2 text-sm">
              <span className="text-bolt-elements-textSecondary">Active family</span>
              <select
                value={selectedImportKind}
                onChange={(event) => setSelectedImportKind(event.target.value as IntakeImportKind)}
                className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-3 py-2"
              >
                {candidateImportKinds.map((kind) => (
                  <option key={kind} value={kind}>
                    {kind}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-2 text-sm">
              <span className="text-bolt-elements-textSecondary">Template candidate</span>
              <select
                value={selectedTemplateCandidatePath}
                onChange={(event) => setSelectedTemplateCandidatePath(event.target.value)}
                className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-3 py-2"
              >
                {templateCandidates.map((path) => (
                  <option key={path} value={path}>
                    {path}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-2 text-sm md:col-span-2">
              <span className="text-bolt-elements-textSecondary">Home page candidate</span>
              <select
                value={selectedHomeCandidatePath}
                onChange={(event) => setSelectedHomeCandidatePath(event.target.value)}
                className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-3 py-2"
              >
                {homeCandidates.map((path) => (
                  <option key={path} value={path}>
                    {path}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button
            type="button"
            onClick={() =>
              onResolveDisambiguation?.({
                importKind: selectedImportKind,
                templateCandidatePath: selectedTemplateCandidatePath || undefined,
                homePageCandidatePath: selectedHomeCandidatePath || undefined,
              })
            }
            className="mt-6 rounded-lg bg-accent-500 px-4 py-2 text-sm font-medium text-white"
          >
            Continue to review
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 overflow-auto bg-bolt-elements-background-depth-2 text-bolt-elements-textPrimary">
      <div className="p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-4 py-3">
          <div>
            <div className="inline-flex items-center rounded-full border border-accent-500/30 bg-accent-500/10 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-accent-300">
              Intake review
            </div>
            <div className="mt-2 text-sm text-bolt-elements-textSecondary">
              {session.sourceLabel} · {session.scenario} · active: {session.activeContentFamily}
            </div>
            <div className="mt-1 text-xs text-bolt-elements-textSecondary">
              Intake state: {intakeStateLabel}
              {completionBlockers.length > 0
                ? ` · ${completionBlockers.length} blocker(s)`
                : reviewTasks.length > 0
                  ? ` · ${reviewTasks.length} review task(s)`
                  : ' · handoff-ready for contract review'}
            </div>
          </div>

          <button
            type="button"
            onClick={onApplyImport}
            className="rounded-lg bg-accent-500 px-4 py-2 text-sm font-medium text-white"
          >
            Apply import
          </button>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-4 py-3">
          <button
            type="button"
            disabled={unresolvedItemIds.length === 0}
            onClick={() => {
              const nextUnresolvedId = unresolvedItemIds[0];

              if (nextUnresolvedId) {
                onResolveIntakeItem(nextUnresolvedId);
              }
            }}
            className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-3 py-2 text-xs hover:bg-bolt-elements-background-depth-3 disabled:opacity-60"
          >
            Resolve next intake item
          </button>
          <button
            type="button"
            disabled={!selectedPage}
            onClick={() => {
              if (selectedPage) {
                onApplySelectedFixes(selectedPage.id);
              }
            }}
            className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-3 py-2 text-xs hover:bg-bolt-elements-background-depth-3 disabled:opacity-60"
          >
            Apply approved fixes
          </button>
          <button
            type="button"
            disabled={completionBlockers.length > 0}
            onClick={onMarkIntakeReviewReady}
            className="rounded-lg bg-accent-500/15 px-3 py-2 text-xs text-accent-300 hover:bg-accent-500/20 disabled:opacity-60"
          >
            Mark intake handoff-ready
          </button>
        </div>

        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-4 py-3">
          <div>
            <div className="text-sm font-medium text-bolt-elements-textPrimary">Metadata recovery batch</div>
            <div className="mt-1 text-xs text-bolt-elements-textSecondary">
              {batchNormalizeReview.selectionSummary}. AI only extracts missing title, description, and heading from the
              first 10 lines of unresolved content.
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busyNormalize || selectedBrokenPageIds.length === 0}
              onClick={onNormalizeBroken}
              className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-3 py-2 text-sm hover:bg-bolt-elements-background-depth-3 disabled:opacity-60"
            >
              Send broken
            </button>
            <button
              type="button"
              disabled={busyNormalize || brokenPages.length === 0}
              onClick={onNormalizeAllBroken}
              className="rounded-lg bg-accent-500/15 px-3 py-2 text-sm text-accent-300 hover:bg-accent-500/20 disabled:opacity-60"
            >
              Send all broken
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[320px_minmax(0,1fr)_420px]">
          <div className="space-y-4">
            <div className="rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-4">
              <h3 className="text-sm font-semibold">Project intake</h3>
              <p className="mt-1 text-xs text-bolt-elements-textSecondary">
                Review project metadata and assets before contracts are generated.
              </p>

              <div className="mt-4 grid grid-cols-1 gap-3">
                <label className="flex flex-col gap-2 text-sm">
                  <span className="text-bolt-elements-textSecondary">Site name</span>
                  <input
                    value={session.project.name}
                    onChange={(event) => onUpdateProject({ ...session.project, name: event.target.value })}
                    className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-3 py-2"
                  />
                </label>

                <label className="flex flex-col gap-2 text-sm">
                  <span className="text-bolt-elements-textSecondary">Domain</span>
                  <input
                    value={session.project.domain ?? ''}
                    onChange={(event) => onUpdateProject({ ...session.project, domain: event.target.value })}
                    className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-3 py-2"
                  />
                </label>

                <label className="flex flex-col gap-2 text-sm">
                  <span className="text-bolt-elements-textSecondary">Default language</span>
                  <input
                    value={session.project.defaultLanguage}
                    onChange={(event) => onUpdateProject({ ...session.project, defaultLanguage: event.target.value })}
                    className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-3 py-2"
                  />
                </label>

                <label className="flex flex-col gap-2 text-sm">
                  <span className="text-bolt-elements-textSecondary">Languages</span>
                  <input
                    value={session.project.languages.join(', ')}
                    onChange={(event) =>
                      onUpdateProject({
                        ...session.project,
                        languages: event.target.value
                          .split(',')
                          .map((entry) => entry.trim().toLowerCase())
                          .filter(Boolean),
                      })
                    }
                    className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-3 py-2"
                  />
                </label>
              </div>

              <div className="mt-4 space-y-3">
                <IntakeAssetField
                  label="Favicon"
                  shape="square"
                  accept="image/*,.ico,.png,.svg"
                  previewUrl={session.project.favicon?.previewPath}
                  currentAsset={session.project.favicon}
                  onLabelChange={(label) =>
                    onUpdateProject({
                      ...session.project,
                      favicon: session.project.favicon
                        ? { ...session.project.favicon, label }
                        : session.project.favicon,
                    })
                  }
                  onFileChange={() => undefined}
                />
                <IntakeAssetField
                  label="Logo"
                  shape="square"
                  accept="image/*,.svg"
                  previewUrl={session.project.logo?.previewPath}
                  currentAsset={session.project.logo}
                  onLabelChange={(label) =>
                    onUpdateProject({
                      ...session.project,
                      logo: session.project.logo ? { ...session.project.logo, label } : session.project.logo,
                    })
                  }
                  onFileChange={() => undefined}
                />
                <IntakeAssetField
                  label="Meta image"
                  shape="landscape"
                  accept="image/*"
                  previewUrl={session.project.metaImage?.previewPath}
                  currentAsset={session.project.metaImage}
                  onLabelChange={(label) =>
                    onUpdateProject({
                      ...session.project,
                      metaImage: session.project.metaImage
                        ? { ...session.project.metaImage, label }
                        : session.project.metaImage,
                    })
                  }
                  onFileChange={() => undefined}
                />
              </div>
            </div>

            <div className="rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-4">
              <h4 className="text-sm font-semibold">Checks and warnings</h4>
              <div className="mt-3 space-y-2">
                {[...session.warnings, ...session.pages.flatMap((page) => page.warnings)].slice(0, 8).map((warning) => (
                  <div
                    key={`${warning.code}-${warning.pageId ?? warning.sourcePath ?? warning.message}`}
                    className={`rounded-lg border px-3 py-2 text-xs ${getWarningClasses(warning.severity)}`}
                  >
                    <div className="font-medium">{warning.message}</div>
                    {warning.details?.length ? <div className="mt-1">{warning.details.join(' · ')}</div> : null}
                  </div>
                ))}
                {session.warnings.length === 0 && session.pages.every((page) => page.warnings.length === 0) ? (
                  <div className="rounded-lg border border-green-500/20 bg-green-500/10 px-3 py-2 text-xs text-green-300">
                    Intake scan completed without blocking warnings.
                  </div>
                ) : null}
              </div>
            </div>

            <div className="rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-4">
              <h4 className="text-sm font-semibold">Batch normalize audit</h4>
              <div className="mt-3 space-y-2 text-xs text-bolt-elements-textSecondary">
                <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-3 py-2">
                  Scope is limited to pages with missing title, description, or H1. Complete pages are never included in
                  the batch payload.
                </div>
                <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-3 py-2">
                  Affected pages:{' '}
                  {batchNormalizeReview.affectedPages.length > 0
                    ? batchNormalizeReview.affectedPages
                        .map((page) => `${page.name} (${page.missingFields.join(', ')})`)
                        .join(' · ')
                    : 'none'}
                </div>
                <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-3 py-2">
                  Last provider run:{' '}
                  {batchNormalizeReview.latestBatchRun
                    ? `${batchNormalizeReview.latestBatchRun.provider ?? 'unknown'} / ${
                        batchNormalizeReview.latestBatchRun.model ?? 'unknown-model'
                      } · ${batchNormalizeReview.latestBatchRun.outputSummary}`
                    : 'none recorded yet'}
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-4">
              <h4 className="text-sm font-semibold">Broken pages</h4>
              <div className="mt-3 space-y-2">
                {brokenPages.length > 0 ? (
                  brokenPages.map((page) => (
                    <label
                      key={page.id}
                      className="flex items-start gap-3 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-3 py-2 text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={selectedBrokenPageIds.includes(page.id)}
                        onChange={(event) => onToggleBrokenPage(page.id, event.target.checked)}
                        className="mt-1"
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-bolt-elements-textPrimary">{page.name}</span>
                        <span className="block text-xs text-bolt-elements-textSecondary">{page.path}</span>
                      </span>
                    </label>
                  ))
                ) : (
                  <div className="rounded-lg border border-green-500/20 bg-green-500/10 px-3 py-2 text-xs text-green-300">
                    No metadata recovery is needed right now.
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-4">
              <h4 className="text-sm font-semibold">Editing boundary</h4>
              <div className="mt-3 space-y-2 text-xs text-bolt-elements-textSecondary">
                <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-3 py-2">
                  Intake review only repairs source-derived metadata and extracted content. Safe block prop edits happen
                  later in contract review.
                </div>
                <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-3 py-2">
                  Canonical URLs, robots, schema, favicon, meta images, and raw head payloads stay blocked because they
                  are app-owned metadata.
                </div>
                <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-3 py-2">
                  Zone violations or unsupported block fields are treated as composition problems, so review explains
                  them before release checks fail.
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-4">
              <h4 className="text-sm font-semibold">Current page diagnostics</h4>
              <div className="mt-3 space-y-2">
                {selectedPageChecks.length > 0 ? (
                  selectedPageChecks.map((check) => (
                    <div
                      key={`${check.id}-${check.message}`}
                      className={`rounded-lg border px-3 py-2 text-xs ${formatCheckTone(check)}`}
                    >
                      <div className="mb-1 inline-flex rounded-full border border-current/20 px-2 py-0.5 text-[10px] uppercase tracking-[0.16em]">
                        {getCheckCategoryBadge(check)}
                      </div>
                      <div className="font-medium">{check.message}</div>
                      <div className="mt-1 text-[11px] opacity-90">{getIntakeDiagnosticOriginLine(check)}</div>
                      {check.details?.length ? <div className="mt-1">{check.details.join(' · ')}</div> : null}
                      {getIntakeDiagnosticRemediation(check) ? (
                        <div className="mt-1 text-[11px] opacity-90">Fix: {getIntakeDiagnosticRemediation(check)}</div>
                      ) : null}
                    </div>
                  ))
                ) : (
                  <div className="rounded-lg border border-green-500/20 bg-green-500/10 px-3 py-2 text-xs text-green-300">
                    This page has no outstanding intake diagnostics.
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            {selectedPage && selectedDraft ? (
              <IntakePageEditor
                draft={selectedDraft}
                onChange={(next) => onUpdatePage(selectedPage.id, applyIntakeReviewDraft(selectedPage, next))}
                onNormalizeWithAi={() => onNormalizeWithAi(selectedPage)}
                onOpenContract={() => onSelectPage(selectedPage.id)}
                onOpenSource={() => onSelectPage(selectedPage.id)}
              />
            ) : (
              <div className="rounded-xl border border-dashed border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-4 text-sm text-bolt-elements-textSecondary">
                No page selected for intake review.
              </div>
            )}

            <div className="rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-4 py-3">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="text-sm font-medium text-bolt-elements-textPrimary">Page navigator</div>
                  <div className="mt-1 text-xs text-bolt-elements-textSecondary">
                    {session.pages.length ? `${selectedIndex + 1} of ${session.pages.length}` : 'No pages'}
                  </div>
                </div>
                <select
                  value={selectedPage?.id ?? ''}
                  onChange={(event) => onSelectPage(event.target.value)}
                  className="min-w-[220px] rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-3 py-2 text-sm"
                >
                  {session.pages.map((page) => (
                    <option key={page.id} value={page.id}>
                      {page.name} · {page.path}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-4">
            <h3 className="text-sm font-semibold">Source preview</h3>
            <div className="mt-1 text-xs text-bolt-elements-textSecondary">
              {selectedPage?.sourcePath ?? 'No source selected'}
            </div>
            <div className="mt-4 rounded-lg border border-bolt-elements-borderColor bg-[#0b1020] p-3">
              {sourceDoc ? (
                <div className="h-[720px] overflow-hidden rounded-md">
                  <CodeMirrorEditor
                    theme={settings.theme === 'system' ? 'dark' : settings.theme}
                    doc={sourceDoc}
                    editable={false}
                    className="h-full"
                  />
                </div>
              ) : (
                <div className="text-sm text-bolt-elements-textSecondary">
                  No raw source is available for this page yet.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
