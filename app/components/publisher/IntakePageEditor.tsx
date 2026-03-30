import type { IntakePageDraft, IntakePageSectionDraft } from '~/lib/publisher/intake-ui';

interface IntakePageEditorProps {
  draft: IntakePageDraft;
  onChange: (next: IntakePageDraft) => void;
  onNormalizeWithAi: () => void;
  onRegeneratePage?: () => void;
  onRegenerateSection?: (section: IntakePageSectionDraft) => void;
  onOpenContract: () => void;
  onOpenSource: () => void;
}

function updateSection(sections: IntakePageSectionDraft[], sectionId: string, patch: Partial<IntakePageSectionDraft>) {
  return sections.map((section) => (section.id === sectionId ? { ...section, ...patch } : section));
}

export function IntakePageEditor({
  draft,
  onChange,
  onNormalizeWithAi,
  onRegeneratePage,
  onRegenerateSection,
  onOpenContract,
  onOpenSource,
}: IntakePageEditorProps) {
  const handleAddSection = () => {
    onChange({
      ...draft,
      sections: [
        ...draft.sections,
        {
          id: `${draft.pageId}-section-${draft.sections.length + 1}`,
          heading: '',
          content: '',
        },
      ],
    });
  };

  const handleRemoveSection = (sectionId: string) => {
    onChange({
      ...draft,
      sections: draft.sections.filter((section) => section.id !== sectionId),
    });
  };

  return (
    <div className="rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-4">
      <div className="flex flex-col gap-3 border-b border-bolt-elements-borderColor pb-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-bolt-elements-textPrimary">{draft.name}</h3>
            <span className="rounded-full border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-bolt-elements-textSecondary">
              {draft.status}
            </span>
          </div>
          <div className="text-xs text-bolt-elements-textSecondary">
            {draft.path} · {draft.slug}
          </div>
          {draft.warnings.length ? (
            <div className="flex flex-wrap gap-2">
              {draft.warnings.slice(0, 3).map((warning) => (
                <span
                  key={warning}
                  className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-300"
                >
                  {warning}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onNormalizeWithAi}
            className="rounded-lg bg-accent-500/15 px-3 py-2 text-sm text-accent-300 hover:bg-accent-500/20"
          >
            Normalize with AI
          </button>
          <button
            type="button"
            onClick={onOpenSource}
            className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-3 py-2 text-sm hover:bg-bolt-elements-background-depth-3"
          >
            Source
          </button>
          <button
            type="button"
            onClick={onOpenContract}
            className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-3 py-2 text-sm hover:bg-bolt-elements-background-depth-3"
          >
            Open contract
          </button>
          {onRegeneratePage ? (
            <button
              type="button"
              onClick={onRegeneratePage}
              className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-3 py-2 text-sm hover:bg-bolt-elements-background-depth-3"
            >
              Regenerate page contract
            </button>
          ) : null}
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="text-xs font-medium uppercase tracking-[0.16em] text-bolt-elements-textSecondary">
              Source-of-truth repair
            </div>
            <p className="text-sm text-bolt-elements-textPrimary">{draft.repairSummary}</p>
            <p className="text-xs text-bolt-elements-textSecondary">{draft.repairGuidance}</p>
          </div>
          <div className="flex flex-wrap gap-2 text-[11px]">
            <span className="rounded-full border border-bolt-elements-borderColor px-2 py-1 text-bolt-elements-textSecondary">
              Metadata {draft.metadataIssueCount}
            </span>
            <span className="rounded-full border border-bolt-elements-borderColor px-2 py-1 text-bolt-elements-textSecondary">
              Extraction {draft.extractionIssueCount}
            </span>
            <span className="rounded-full border border-bolt-elements-borderColor px-2 py-1 text-bolt-elements-textSecondary">
              Contract {draft.contractIssueCount}
            </span>
          </div>
        </div>
        {draft.missingFields.length ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {draft.missingFields.map((field) => (
              <span
                key={field}
                className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-300"
              >
                Missing {field}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <label className="flex flex-col gap-2 text-sm">
          <span className="text-bolt-elements-textSecondary">Title</span>
          <input
            value={draft.title}
            onChange={(event) => onChange({ ...draft, title: event.target.value })}
            className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-3 py-2"
            placeholder="Page title"
          />
        </label>

        <label className="flex flex-col gap-2 text-sm">
          <span className="text-bolt-elements-textSecondary">Description</span>
          <input
            value={draft.description}
            onChange={(event) => onChange({ ...draft, description: event.target.value })}
            className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-3 py-2"
            placeholder="Short summary"
          />
          <span className="text-[11px] text-bolt-elements-textTertiary">
            Keep this tied to the source summary. Canonical, robots, and schema metadata stay outside block props.
          </span>
        </label>

        <label className="flex flex-col gap-2 text-sm xl:col-span-2">
          <span className="text-bolt-elements-textSecondary">H1</span>
          <input
            value={draft.h1}
            onChange={(event) => onChange({ ...draft, h1: event.target.value })}
            className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-3 py-2"
            placeholder="Primary heading"
          />
        </label>
      </div>

      <div className="mt-5 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h4 className="text-sm font-medium text-bolt-elements-textPrimary">Ordered sections</h4>
            <p className="mt-1 text-xs text-bolt-elements-textSecondary">
              The review editor keeps the extracted content in a predictable order.
            </p>
          </div>
          <button
            type="button"
            onClick={handleAddSection}
            className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-3 py-2 text-sm hover:bg-bolt-elements-background-depth-3"
          >
            Add section
          </button>
        </div>

        {draft.sections.length ? (
          draft.sections.map((section, index) => (
            <div
              key={section.id}
              className="rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-bolt-elements-textSecondary">
                      Section {index + 1}
                    </span>
                    {section.sourceZone ? (
                      <span className="rounded-full border border-accent-500/20 bg-accent-500/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-accent-300">
                        {section.sourceZone}
                      </span>
                    ) : null}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveSection(section.id)}
                  className="rounded-md border border-bolt-elements-borderColor px-2 py-1 text-xs text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary"
                >
                  Remove
                </button>
              </div>

              {onRegenerateSection ? (
                <div className="mt-3 flex justify-end">
                  <button
                    type="button"
                    onClick={() => onRegenerateSection(section)}
                    className="rounded-md border border-accent-500/20 bg-accent-500/10 px-2 py-1 text-xs text-accent-300 hover:bg-accent-500/20"
                  >
                    Regenerate section
                  </button>
                </div>
              ) : null}

              <div className="mt-3 grid grid-cols-1 gap-3">
                <label className="flex flex-col gap-2 text-sm">
                  <span className="text-bolt-elements-textSecondary">Heading</span>
                  <input
                    value={section.heading}
                    onChange={(event) =>
                      onChange({
                        ...draft,
                        sections: updateSection(draft.sections, section.id, { heading: event.target.value }),
                      })
                    }
                    className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2"
                    placeholder="Section heading"
                  />
                </label>

                <label className="flex flex-col gap-2 text-sm">
                  <span className="text-bolt-elements-textSecondary">Content</span>
                  <textarea
                    value={section.content}
                    onChange={(event) =>
                      onChange({
                        ...draft,
                        sections: updateSection(draft.sections, section.id, { content: event.target.value }),
                      })
                    }
                    className="min-h-[180px] rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 font-mono text-xs leading-5"
                    placeholder="Extracted section content"
                  />
                </label>
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-lg border border-dashed border-bolt-elements-borderColor p-4 text-sm text-bolt-elements-textSecondary">
            No sections extracted yet.
          </div>
        )}
      </div>
    </div>
  );
}
