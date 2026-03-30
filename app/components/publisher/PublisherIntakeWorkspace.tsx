import { useEffect, useMemo, useState } from 'react';
import type {
  PublisherMarkdownSource,
  PublisherReferenceState,
  PublisherSiteSettings,
  SiteProjectContract,
  ThemeContract,
  CheckReport,
  PageContract,
  PublisherBuildSummary,
  PublisherProjectStatus,
  PublisherWorkflowState,
  ZoneType,
} from '~/types/publisher';
import { publisherBlockRegistry } from '~/lib/publisher/block-registry';
import { describePublisherSlotEditing } from '~/lib/publisher/contracts';
import { IntakePageEditor } from './IntakePageEditor';
import { IntakePageNavigator } from './IntakePageNavigator';
import { PublisherReleaseWorkspace } from './PublisherReleaseWorkspace';
import { IntakeSourcePane } from './IntakeSourcePane';
import { PublisherSiteSettingsEditor, type PublisherSiteSettingsSubmitPayload } from './PublisherSiteSettingsEditor';
import {
  createIntakePageDraft,
  createIntakeSourceReferences,
  getPublisherEditingConstraintDescription,
  getPublisherEditingConstraintLabel,
  type IntakePageDraft,
} from '~/lib/publisher/intake-ui';

interface PublisherIntakeWorkspaceProps {
  project?: SiteProjectContract;
  siteSettings?: PublisherSiteSettings;
  pages: PageContract[];
  theme?: ThemeContract;
  checks: CheckReport[];
  markdownSources?: PublisherMarkdownSource[];
  referenceState?: PublisherReferenceState;
  status: PublisherProjectStatus;
  workflow: PublisherWorkflowState;
  buildHistory: PublisherBuildSummary[];
  selectedPageId?: string;
  sourceContentByPath?: Record<string, string>;
  onSelectPage: (pageId: string) => void;
  onPreviousPage: () => void;
  onNextPage: () => void;
  onOpenContract: (page: PageContract) => void;
  onNormalizeWithAi: (page: PageContract) => void;
  onRegeneratePage: (page: PageContract) => void;
  onRegenerateSection: (page: PageContract, sectionId: string, sectionZone?: string) => void;
  onRebuildPreview: () => void;
  onSaveSettings: (payload: PublisherSiteSettingsSubmitPayload) => Promise<void> | void;
  onOpenProject?: () => void;
  onOpenTheme?: () => void;
  onOpenChecks?: () => void;
  onOpenReferences?: () => void;
  onOpenSourceFile?: (path: string) => void;
  onOpenOutput?: (page: PageContract) => void;
  onOpenState?: () => void;
  onOpenManifest?: () => void;
  onOpenSitemap?: () => void;
  onOpenRobots?: () => void;
  busySettings?: boolean;
}

function createDraftMap(pages: PageContract[], sourceContentByPath?: Record<string, string>) {
  return pages.reduce<Record<string, IntakePageDraft>>((accumulator, page) => {
    const matchedSource = sourceContentByPath
      ? Object.entries(sourceContentByPath).find(
          ([path]) => path.endsWith(`${page.slug}.md`) || path.endsWith(`${page.slug}.markdown`),
        )
      : undefined;

    accumulator[page.id] = createIntakePageDraft(
      page,
      matchedSource
        ? {
            sourcePath: matchedSource[0],
            label: matchedSource[0].split('/').pop() ?? page.name,
            kind: 'document',
            rawContent: matchedSource[1],
            pageId: page.id,
            pagePath: page.path,
          }
        : undefined,
    );

    return accumulator;
  }, {});
}

function getCheckCounts(checks: CheckReport[]) {
  return {
    pass: checks.filter((check) => check.status === 'pass').length,
    warn: checks.filter((check) => check.status === 'warn').length,
    fail: checks.filter((check) => check.status === 'fail').length,
  };
}

export function PublisherIntakeWorkspace({
  project,
  siteSettings,
  pages,
  theme,
  checks,
  markdownSources = [],
  referenceState,
  status,
  workflow,
  buildHistory,
  selectedPageId,
  sourceContentByPath = {},
  onSelectPage,
  onPreviousPage,
  onNextPage,
  onOpenContract,
  onNormalizeWithAi,
  onRegeneratePage,
  onRegenerateSection,
  onRebuildPreview,
  onSaveSettings,
  onOpenProject,
  onOpenTheme,
  onOpenChecks,
  onOpenReferences,
  onOpenSourceFile,
  onOpenOutput,
  onOpenState,
  onOpenManifest,
  onOpenSitemap,
  onOpenRobots,
  busySettings,
}: PublisherIntakeWorkspaceProps) {
  const [drafts, setDrafts] = useState<Record<string, IntakePageDraft>>(() =>
    createDraftMap(pages, sourceContentByPath),
  );

  useEffect(() => {
    setDrafts((current) => {
      const next = { ...current };

      for (const page of pages) {
        if (!next[page.id]) {
          next[page.id] = createIntakePageDraft(page);
        }
      }

      return next;
    });
  }, [pages]);

  const selectedPage = pages.find((page) => page.id === selectedPageId) ?? pages[0];
  const selectedDraft = selectedPage ? (drafts[selectedPage.id] ?? createIntakePageDraft(selectedPage)) : undefined;
  const selectedSourceContent = selectedDraft?.rawSource ?? '';
  const sourceReferences = useMemo(() => {
    const markdownReferences = createIntakeSourceReferences(markdownSources, sourceContentByPath);
    const canonicalReferences =
      referenceState?.sourceFiles
        .filter((source) => source.family === 'html' || source.family === 'document')
        .map((source) => ({
          sourcePath: source.path,
          label: source.label ?? source.path.split('/').pop() ?? source.path,
          kind: source.family === 'html' ? ('html' as const) : ('document' as const),
          rawContent: sourceContentByPath[source.storedPath ?? source.path] ?? sourceContentByPath[source.path],
        })) ?? [];

    return [...markdownReferences, ...canonicalReferences].filter(
      (reference, index, list) =>
        list.findIndex((candidate) => candidate.sourcePath === reference.sourcePath) === index,
    );
  }, [markdownSources, referenceState?.sourceFiles, sourceContentByPath]);
  const checkCounts = useMemo(() => getCheckCounts(checks), [checks]);
  const selectedBlockEditStates = useMemo(() => {
    if (!selectedPage) {
      return [];
    }

    return Object.entries(selectedPage.zones).flatMap(([zone, zoneContract]) =>
      (zoneContract?.slots ?? [])
        .map((slot) => ({
          slot,
          zone: zone as ZoneType,
          state: describePublisherSlotEditing(selectedPage, zone as ZoneType, slot, publisherBlockRegistry),
        }))
        .filter((entry) => entry.state),
    );
  }, [selectedPage]);

  return (
    <div className="absolute inset-0 overflow-auto bg-bolt-elements-background-depth-2 text-bolt-elements-textPrimary">
      <div className="p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-4 py-3">
          <div>
            <div className="inline-flex items-center rounded-full border border-accent-500/30 bg-accent-500/10 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-accent-300">
              {workflow.label}
            </div>
            <div className="mt-2 text-sm text-bolt-elements-textSecondary">
              {project?.name ?? 'Untitled project'} · {pages.length} pages ·{' '}
              {theme ? Object.keys(theme.tokens).length : 0} tokens
            </div>
            <div className="mt-2 max-w-2xl text-sm text-bolt-elements-textPrimary">{workflow.summary}</div>
            <div className="mt-1 text-xs text-bolt-elements-textSecondary">
              Next action: {workflow.nextAction}
              {workflow.blockingReason ? ` · Blocker: ${workflow.blockingReason}` : ''}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full border border-green-500/20 bg-green-500/10 px-3 py-1 text-green-300">
              {checkCounts.pass} pass
            </span>
            <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-amber-300">
              {checkCounts.warn} warn
            </span>
            <span className="rounded-full border border-red-500/20 bg-red-500/10 px-3 py-1 text-red-300">
              {checkCounts.fail} fail
            </span>
            <button
              type="button"
              onClick={onRebuildPreview}
              className="rounded-lg bg-accent-500/15 px-3 py-2 text-sm text-accent-300 hover:bg-accent-500/20"
            >
              Rebuild preview
            </button>
          </div>
        </div>

        <div className="mb-4 rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            {[
              ['intake', 'Intake review'],
              ['review', 'Contract review'],
              ['release', 'Release readiness'],
              ['published', 'Published'],
            ].map(([step, label]) => {
              const orderedSteps = ['intake', 'review', 'release', 'published'];
              const isActive = workflow.step === step;
              const isReached = orderedSteps.indexOf(workflow.step) >= orderedSteps.indexOf(step);

              return (
                <div
                  key={step}
                  className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.16em] ${
                    isActive
                      ? 'border-accent-500/40 bg-accent-500/15 text-accent-300'
                      : isReached
                        ? 'border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 text-bolt-elements-textPrimary'
                        : 'border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 text-bolt-elements-textSecondary'
                  }`}
                >
                  {label}
                </div>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[340px_minmax(0,1fr)_420px]">
          <div className="space-y-4">
            <div className="rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-bolt-elements-textPrimary">Project rail</h3>
                  <p className="mt-1 text-xs text-bolt-elements-textSecondary">
                    Site settings, assets, and review context stay visible before import is applied.
                  </p>
                </div>
                <div className="rounded-full border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-bolt-elements-textSecondary">
                  {project?.mode ?? 'publisher'}
                </div>
              </div>

              <div className="mt-4 space-y-2 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-3 text-xs">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-bolt-elements-textSecondary">Project ID</span>
                  <span className="truncate text-bolt-elements-textPrimary">{project?.id ?? 'Not created yet'}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-bolt-elements-textSecondary">Pages</span>
                  <span className="text-bolt-elements-textPrimary">{pages.length}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-bolt-elements-textSecondary">Markdown sources</span>
                  <span className="text-bolt-elements-textPrimary">{markdownSources.length}</span>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={onOpenProject}
                  className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-3 py-2 text-xs hover:bg-bolt-elements-background-depth-3 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={!onOpenProject}
                >
                  Open project.json
                </button>
                <button
                  type="button"
                  onClick={onOpenTheme}
                  className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-3 py-2 text-xs hover:bg-bolt-elements-background-depth-3 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={!onOpenTheme}
                >
                  Open theme.json
                </button>
                <button
                  type="button"
                  onClick={onOpenChecks}
                  className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-3 py-2 text-xs hover:bg-bolt-elements-background-depth-3 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={!onOpenChecks}
                >
                  Open checks.json
                </button>
                <button
                  type="button"
                  onClick={onOpenReferences}
                  className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-3 py-2 text-xs hover:bg-bolt-elements-background-depth-3 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={!onOpenReferences}
                >
                  Open references.json
                </button>
                <button
                  type="button"
                  onClick={onRebuildPreview}
                  className="rounded-lg border border-accent-500/20 bg-accent-500/10 px-3 py-2 text-xs text-accent-300 hover:bg-accent-500/20"
                >
                  Rebuild
                </button>
              </div>
            </div>

            {siteSettings ? (
              <PublisherSiteSettingsEditor
                title="Site settings"
                description="Branding, domain, and language defaults used by the import review flow."
                submitLabel={busySettings ? 'Saving…' : 'Save settings'}
                mode="settings"
                initialSettings={siteSettings}
                markdownSources={markdownSources}
                busy={busySettings}
                onSubmit={onSaveSettings}
              />
            ) : (
              <div className="rounded-xl border border-dashed border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-4 text-sm text-bolt-elements-textSecondary">
                Site settings will appear here once the publisher project is initialized.
              </div>
            )}

            <div className="rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h4 className="text-sm font-semibold text-bolt-elements-textPrimary">Review checks</h4>
                  <p className="mt-1 text-xs text-bolt-elements-textSecondary">
                    The intake review keeps parser misses and contract issues visible early.
                  </p>
                </div>
              </div>

              <div className="mt-4 space-y-2">
                {checks.slice(0, 5).map((check) => (
                  <div
                    key={`${check.name}-${check.pageId ?? 'project'}-${check.message}`}
                    className={`rounded-lg border p-3 text-xs ${
                      check.status === 'pass'
                        ? 'border-green-500/20 bg-green-500/10 text-green-300'
                        : check.status === 'warn'
                          ? 'border-amber-500/20 bg-amber-500/10 text-amber-200'
                          : 'border-red-500/20 bg-red-500/10 text-red-200'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{check.name}</span>
                      <span className="uppercase tracking-[0.16em]">{check.status}</span>
                    </div>
                    <div className="mt-1 opacity-90">{check.message}</div>
                  </div>
                ))}
              </div>
            </div>

            <PublisherReleaseWorkspace
              status={status}
              workflow={workflow}
              checks={checks}
              buildHistory={buildHistory}
              onOpenChecks={onOpenChecks}
              onOpenState={onOpenState}
              onOpenManifest={onOpenManifest}
              onOpenSitemap={onOpenSitemap}
              onOpenRobots={onOpenRobots}
            />
          </div>

          <div className="flex min-h-0 flex-col gap-4">
            {selectedPage && selectedDraft ? (
              <div className="rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-xs font-medium uppercase tracking-[0.16em] text-bolt-elements-textSecondary">
                      Compare surfaces
                    </div>
                    <div className="mt-1 text-sm text-bolt-elements-textPrimary">
                      Trace issues from source to contract to generated output without leaving Publisher Mode.
                    </div>
                    <div className="mt-1 text-xs text-bolt-elements-textSecondary">
                      Source stays authoritative, contract holds structured edits, output confirms render behavior.
                    </div>
                  </div>
                  <div className="rounded-full border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-bolt-elements-textSecondary">
                    {selectedPage.path}
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-3">
                  <button
                    type="button"
                    onClick={() => selectedDraft.sourcePath && onOpenSourceFile?.(selectedDraft.sourcePath)}
                    className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-3 py-2 text-left text-xs hover:bg-bolt-elements-background-depth-3 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={!selectedDraft.sourcePath || !onOpenSourceFile}
                  >
                    <div className="font-medium text-bolt-elements-textPrimary">Source</div>
                    <div className="mt-1 text-bolt-elements-textSecondary">
                      {selectedDraft.sourceLabel ?? 'Open raw source'}
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenContract(selectedPage)}
                    className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-3 py-2 text-left text-xs hover:bg-bolt-elements-background-depth-3"
                  >
                    <div className="font-medium text-bolt-elements-textPrimary">Contract</div>
                    <div className="mt-1 text-bolt-elements-textSecondary">
                      Open `{selectedPage.slug}.json` for structured edits
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenOutput?.(selectedPage)}
                    className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-3 py-2 text-left text-xs hover:bg-bolt-elements-background-depth-3 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={!onOpenOutput}
                  >
                    <div className="font-medium text-bolt-elements-textPrimary">Output</div>
                    <div className="mt-1 text-bolt-elements-textSecondary">
                      Inspect generated HTML for `{selectedPage.path}`
                    </div>
                  </button>
                </div>
              </div>
            ) : null}

            {selectedDraft ? (
              <IntakePageEditor
                draft={selectedDraft}
                onChange={(next) =>
                  setDrafts((current) => ({
                    ...current,
                    [next.pageId]: next,
                  }))
                }
                onNormalizeWithAi={() => {
                  if (selectedPage) {
                    onNormalizeWithAi(selectedPage);
                  }
                }}
                onRegeneratePage={() => {
                  if (selectedPage) {
                    onRegeneratePage(selectedPage);
                  }
                }}
                onRegenerateSection={(section) => {
                  if (selectedPage) {
                    onRegenerateSection(selectedPage, section.id, section.sourceZone);
                  }
                }}
                onOpenContract={() => {
                  if (selectedPage) {
                    onOpenContract(selectedPage);
                  }
                }}
                onOpenSource={() => {
                  if (selectedDraft?.sourcePath) {
                    onOpenSourceFile?.(selectedDraft.sourcePath);
                  }
                }}
              />
            ) : (
              <div className="rounded-xl border border-dashed border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-4 text-sm text-bolt-elements-textSecondary">
                No page selected for review.
              </div>
            )}

            <IntakePageNavigator
              pages={pages.map((page) => ({
                id: page.id,
                name: page.name,
                path: page.path,
                status: drafts[page.id]?.status,
              }))}
              selectedPageId={selectedPage?.id}
              onSelectPage={onSelectPage}
              onPreviousPage={onPreviousPage}
              onNextPage={onNextPage}
            />

            {selectedBlockEditStates.length > 0 ? (
              <div className="rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-semibold text-bolt-elements-textPrimary">Constrained block editing</h4>
                    <p className="mt-1 text-xs text-bolt-elements-textSecondary">
                      Safe block props can be edited in the page contract. Reserved metadata and invalid composition
                      stay blocked here on purpose.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => selectedPage && onOpenContract(selectedPage)}
                    className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-3 py-2 text-xs hover:bg-bolt-elements-background-depth-3"
                  >
                    Open page contract
                  </button>
                </div>

                <div className="mt-4 space-y-3">
                  {selectedBlockEditStates.map(({ slot, zone, state }) =>
                    state ? (
                      <div
                        key={`${zone}-${slot.id}`}
                        className="rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-3"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <div className="text-sm font-medium text-bolt-elements-textPrimary">{state.blockName}</div>
                            <div className="mt-1 text-xs text-bolt-elements-textSecondary">
                              {slot.id} · {zone}
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.16em]">
                            <span className="rounded-full border border-green-500/20 bg-green-500/10 px-2 py-1 text-green-300">
                              {state.editableFields.length} editable
                            </span>
                            <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-1 text-amber-300">
                              {state.blockedFields.length} blocked
                            </span>
                          </div>
                        </div>

                        {state.warnings.length ? (
                          <div className="mt-3 space-y-2">
                            {state.warnings.map((warning) => (
                              <div
                                key={warning}
                                className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-200"
                              >
                                {warning}
                              </div>
                            ))}
                          </div>
                        ) : null}

                        {state.editableFields.length ? (
                          <div className="mt-3">
                            <div className="text-[11px] uppercase tracking-[0.16em] text-bolt-elements-textSecondary">
                              Safe fields
                            </div>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {state.editableFields.map((field) => (
                                <span
                                  key={field.key}
                                  className="rounded-full border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-2 py-1 text-[11px] text-bolt-elements-textSecondary"
                                >
                                  {field.label}
                                  {field.required ? ' *' : ''}
                                </span>
                              ))}
                            </div>
                          </div>
                        ) : null}

                        {state.blockedFields.length ? (
                          <div className="mt-3 space-y-2">
                            <div className="text-[11px] uppercase tracking-[0.16em] text-bolt-elements-textSecondary">
                              Blocked fields
                            </div>
                            {state.blockedFields.map((field) => (
                              <div
                                key={field.key}
                                className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-xs"
                              >
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <span className="font-medium text-bolt-elements-textPrimary">{field.label}</span>
                                  {field.reason ? (
                                    <span className="rounded-full border border-bolt-elements-borderColor px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-bolt-elements-textSecondary">
                                      {getPublisherEditingConstraintLabel(field.reason)}
                                    </span>
                                  ) : null}
                                </div>
                                {field.reason ? (
                                  <div className="mt-1 text-bolt-elements-textSecondary">
                                    {getPublisherEditingConstraintDescription(field.reason)}
                                  </div>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ) : null,
                  )}
                </div>
              </div>
            ) : null}
          </div>

          <IntakeSourcePane
            title="Source pane"
            sourcePath={selectedDraft?.sourcePath}
            sourceKind={selectedDraft?.sourceKind}
            sourceLabel={selectedDraft?.sourceLabel ?? selectedDraft?.name}
            rawContent={selectedSourceContent}
            sourceReferences={sourceReferences}
            notes={selectedDraft?.warnings}
          />
        </div>
      </div>
    </div>
  );
}
