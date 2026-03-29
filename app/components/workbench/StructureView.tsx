import { useEffect, useMemo, useState } from 'react';
import { useStore } from '@nanostores/react';
import { toast } from 'react-toastify';
import { workbenchStore } from '~/lib/stores/workbench';
import { usePreviewStore } from '~/lib/stores/previews';
import { loadPublisherState } from '~/lib/publisher/contracts';
import { assemblePublisherProject } from '~/lib/publisher/assembler';
import { publisherBlockRegistry } from '~/lib/publisher/block-registry';
import { runPublisherChecks } from '~/lib/publisher/checker';
import { chatStore } from '~/lib/stores/chat';
import type { PageContract, SlotContract, ZoneType } from '~/types/publisher';
import { publisherZoneTypes } from '~/types/publisher';
import {
  buildPageRegeneratePrompt,
  buildSlotRegeneratePrompt,
  buildPreviewRebuildPrompt,
} from '~/lib/publisher/prompt-context';
import { useSettings } from '~/lib/hooks/useSettings';
import {
  PUBLISHER_CHECKS_FILE,
  PUBLISHER_PROJECT_FILE,
  PUBLISHER_THEME_FILE,
  getPublisherPageFilePath,
} from '~/lib/publisher/constants';
import {
  appendPublisherAgentContext,
  loadPublisherProjectState,
  savePublisherProjectState,
} from '~/lib/publisher/persistence';

function getStatusClasses(status: 'pass' | 'warn' | 'fail') {
  if (status === 'pass') {
    return 'border-green-500/30 bg-green-500/10 text-green-400';
  }

  if (status === 'warn') {
    return 'border-amber-500/30 bg-amber-500/10 text-amber-300';
  }

  return 'border-red-500/30 bg-red-500/10 text-red-400';
}

export function StructureView() {
  const files = useStore(workbenchStore.files);
  const { promptId, setPromptId } = useSettings();
  const previewStore = usePreviewStore();
  const publisherState = useMemo(() => loadPublisherState(files), [files]);
  const persistedProjectState = useMemo(
    () => loadPublisherProjectState(publisherState.project?.id),
    [publisherState.project?.id],
  );
  const [selectedPageId, setSelectedPageId] = useState<string | undefined>(
    persistedProjectState?.selectedPageId ?? publisherState.pages[0]?.id,
  );
  const checks = useMemo(() => runPublisherChecks(publisherState, publisherBlockRegistry), [publisherState]);
  const selectedPage = publisherState.pages.find((page) => page.id === selectedPageId) ?? publisherState.pages[0];

  useEffect(() => {
    if (!selectedPage && publisherState.pages[0]) {
      setSelectedPageId(publisherState.pages[0].id);
    }
  }, [publisherState.pages, selectedPage]);

  useEffect(() => {
    savePublisherProjectState(publisherState.project?.id, {
      selectedPageId: selectedPage?.id,
    });
  }, [publisherState.project?.id, selectedPage?.id]);

  const prefillPrompt = (prompt: string, context?: { pageId?: string; zone?: ZoneType; blockId?: string }) => {
    if (promptId !== 'publisher') {
      setPromptId('publisher');
      toast.info('Prompt switched to Publisher Mode');
    }

    appendPublisherAgentContext(
      publisherState.project?.id,
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

  const rebuildPreview = async () => {
    const build = assemblePublisherProject(
      publisherState,
      publisherBlockRegistry,
      selectedPage ? { mode: 'publisher', currentPage: selectedPage.id } : { mode: 'publisher' },
    );

    for (const [filePath, content] of Object.entries(build.files)) {
      await workbenchStore.writeSystemFile(filePath, content);
    }

    previewStore.refreshAllPreviews();
    savePublisherProjectState(publisherState.project?.id, {
      lastBuildAt: new Date().toISOString(),
    });
    toast.success('Publisher output rebuilt');
  };

  const renderSlotActions = (page: PageContract, zone: ZoneType, slot: SlotContract) => (
    <div className="flex gap-2 flex-wrap">
      <button
        className="px-2 py-1 text-xs rounded-md bg-bolt-elements-background-depth-1 hover:bg-bolt-elements-background-depth-3"
        onClick={() =>
          prefillPrompt(buildSlotRegeneratePrompt(page.id, zone, slot), {
            pageId: page.id,
            zone,
            blockId: slot.blockId,
          })
        }
      >
        Regenerate slot
      </button>
      <button
        className="px-2 py-1 text-xs rounded-md bg-bolt-elements-background-depth-1 hover:bg-bolt-elements-background-depth-3"
        onClick={() => openFile(getPublisherPageFilePath(page.slug))}
      >
        Open contract
      </button>
    </div>
  );

  return (
    <div className="absolute inset-0 overflow-auto bg-bolt-elements-background-depth-2 text-bolt-elements-textPrimary">
      <div className="grid grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)_340px] gap-4 p-4">
        <section className="rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold">Pages</h3>
              <p className="text-xs text-bolt-elements-textSecondary mt-1">
                Publisher contracts under `.bolt/publisher/pages/*.json`
              </p>
            </div>
            <button
              className="px-2 py-1 text-xs rounded-md bg-bolt-elements-item-backgroundAccent text-bolt-elements-item-contentAccent"
              onClick={() =>
                prefillPrompt(buildPreviewRebuildPrompt(publisherState.project?.id), {
                  pageId: selectedPage?.id,
                })
              }
            >
              Rebuild prompt
            </button>
          </div>

          <div className="mt-4 space-y-2">
            {publisherState.pages.length > 0 ? (
              publisherState.pages.map((page) => (
                <button
                  key={page.id}
                  onClick={() => setSelectedPageId(page.id)}
                  className={`w-full text-left rounded-lg border p-3 transition-colors ${
                    selectedPage?.id === page.id
                      ? 'border-accent-500/40 bg-accent-500/10'
                      : 'border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 hover:bg-bolt-elements-background-depth-3'
                  }`}
                >
                  <div className="text-sm font-medium">{page.name}</div>
                  <div className="text-xs text-bolt-elements-textSecondary mt-1">{page.path}</div>
                </button>
              ))
            ) : (
              <div className="rounded-lg border border-dashed border-bolt-elements-borderColor p-4 text-sm text-bolt-elements-textSecondary">
                No page contracts yet. Ask the agent to write [project.json], [theme.json], and page files under
                `.bolt/publisher/pages/`.
              </div>
            )}
          </div>

          <div className="mt-4 space-y-2">
            <button
              className="w-full px-3 py-2 text-sm rounded-lg bg-bolt-elements-background-depth-2 hover:bg-bolt-elements-background-depth-3"
              onClick={() => openFile(PUBLISHER_PROJECT_FILE)}
            >
              Open project.json
            </button>
            <button
              className="w-full px-3 py-2 text-sm rounded-lg bg-bolt-elements-background-depth-2 hover:bg-bolt-elements-background-depth-3"
              onClick={() => openFile(PUBLISHER_THEME_FILE)}
            >
              Open theme.json
            </button>
            <button
              className="w-full px-3 py-2 text-sm rounded-lg bg-bolt-elements-background-depth-2 hover:bg-bolt-elements-background-depth-3"
              onClick={() => openFile(PUBLISHER_CHECKS_FILE)}
            >
              Open checks.json
            </button>
          </div>
        </section>

        <section className="rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold">Zones and Blocks</h3>
              <p className="text-xs text-bolt-elements-textSecondary mt-1">
                Shell, zones, and slot props for the selected page
              </p>
            </div>
            <div className="flex gap-2">
              {selectedPage && (
                <button
                  className="px-3 py-2 text-sm rounded-lg bg-bolt-elements-background-depth-2 hover:bg-bolt-elements-background-depth-3"
                  onClick={() => prefillPrompt(buildPageRegeneratePrompt(selectedPage.id), { pageId: selectedPage.id })}
                >
                  Regenerate page contract
                </button>
              )}
              <button
                className="px-3 py-2 text-sm rounded-lg bg-accent-500/15 text-accent-400 hover:bg-accent-500/20"
                onClick={() => {
                  void rebuildPreview();
                }}
              >
                Rebuild preview
              </button>
            </div>
          </div>

          {selectedPage ? (
            <div className="mt-4 space-y-4">
              {publisherZoneTypes.map((zone) => {
                const zoneContract =
                  selectedPage.zones[zone] ??
                  (selectedPage.usesProjectShell !== false ? publisherState.project?.sharedShell?.[zone] : undefined);

                return (
                  <div key={zone} className="rounded-xl border border-bolt-elements-borderColor p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <h4 className="text-sm font-medium">{zone}</h4>
                        <p className="text-xs text-bolt-elements-textSecondary mt-1">
                          {zoneContract?.slots?.length
                            ? `${zoneContract.slots.length} block${zoneContract.slots.length > 1 ? 's' : ''}`
                            : 'No blocks configured'}
                        </p>
                      </div>
                      <button
                        className="px-2 py-1 text-xs rounded-md bg-bolt-elements-background-depth-2 hover:bg-bolt-elements-background-depth-3"
                        onClick={() =>
                          prefillPrompt(buildPageRegeneratePrompt(selectedPage.id), { pageId: selectedPage.id, zone })
                        }
                      >
                        Refresh zone prompt
                      </button>
                    </div>

                    <div className="mt-3 space-y-3">
                      {zoneContract?.slots?.length ? (
                        zoneContract.slots.map((slot) => {
                          const block = publisherBlockRegistry.getById(slot.blockId);

                          return (
                            <div
                              key={slot.id}
                              className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-3"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <div className="text-sm font-medium">{block?.name ?? slot.blockId}</div>
                                  <div className="text-xs text-bolt-elements-textSecondary mt-1">
                                    `{slot.id}` · `{slot.blockId}`
                                  </div>
                                </div>
                                {renderSlotActions(selectedPage, zone, slot)}
                              </div>
                              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
                                {Object.entries(slot.props).map(([key, value]) => (
                                  <div
                                    key={key}
                                    className="rounded-md border border-bolt-elements-borderColor px-2 py-1.5 text-xs"
                                  >
                                    <div className="text-bolt-elements-textSecondary">{key}</div>
                                    <div className="mt-1 break-words">{String(value)}</div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <div className="rounded-lg border border-dashed border-bolt-elements-borderColor p-3 text-sm text-bolt-elements-textSecondary">
                          No slots yet for this zone.
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="mt-4 rounded-lg border border-dashed border-bolt-elements-borderColor p-4 text-sm text-bolt-elements-textSecondary">
              Select a page to inspect zones and block slots.
            </div>
          )}
        </section>

        <section className="rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-4">
          <div>
            <h3 className="text-sm font-semibold">Theme and Checks</h3>
            <p className="text-xs text-bolt-elements-textSecondary mt-1">
              Design tokens plus normalized pass/warn/fail reports
            </p>
          </div>

          <div className="mt-4 rounded-xl border border-bolt-elements-borderColor p-4">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-medium">Theme Tokens</h4>
              <button
                className="px-2 py-1 text-xs rounded-md bg-bolt-elements-background-depth-2 hover:bg-bolt-elements-background-depth-3"
                onClick={() => openFile(PUBLISHER_THEME_FILE)}
              >
                Edit tokens
              </button>
            </div>
            <div className="mt-3 space-y-2">
              {publisherState.theme ? (
                Object.entries(publisherState.theme.tokens).map(([key, value]) => (
                  <div key={key} className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-bolt-elements-textSecondary">{key}</span>
                    <span className="font-medium">{value}</span>
                  </div>
                ))
              ) : (
                <div className="text-sm text-bolt-elements-textSecondary">No theme.json yet.</div>
              )}
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-bolt-elements-borderColor p-4">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-medium">Build Checks</h4>
              <button
                className="px-2 py-1 text-xs rounded-md bg-bolt-elements-background-depth-2 hover:bg-bolt-elements-background-depth-3"
                onClick={() => openFile(PUBLISHER_CHECKS_FILE)}
              >
                Open report
              </button>
            </div>
            <div className="mt-3 space-y-2">
              {checks.map((check, index) => (
                <div
                  key={`${check.name}-${index}`}
                  className={`rounded-lg border p-3 ${getStatusClasses(check.status)}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-medium">{check.name}</div>
                    <div className="text-xs uppercase tracking-wide">{check.status}</div>
                  </div>
                  <p className="text-xs mt-1">{check.message}</p>
                  {check.details?.length ? (
                    <div className="mt-2 space-y-1">
                      {check.details.map((detail) => (
                        <div key={detail} className="text-xs opacity-90">
                          {detail}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
