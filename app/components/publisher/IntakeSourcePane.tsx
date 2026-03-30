import { useMemo, useState } from 'react';
import type { IntakeSourceReference } from '~/lib/publisher/intake-ui';

interface IntakeSourcePaneProps {
  title: string;
  sourcePath?: string;
  sourceKind?: 'document' | 'html';
  sourceLabel?: string;
  rawContent?: string;
  sourceReferences?: IntakeSourceReference[];
  notes?: string[];
}

export function IntakeSourcePane({
  title,
  sourcePath,
  sourceKind,
  sourceLabel,
  rawContent,
  sourceReferences = [],
  notes = [],
}: IntakeSourcePaneProps) {
  const [showRaw, setShowRaw] = useState(true);
  const displayedNotes = useMemo(() => notes.filter(Boolean), [notes]);

  return (
    <div className="rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-bolt-elements-textPrimary">{title}</h3>
          <div className="mt-1 text-xs text-bolt-elements-textSecondary">
            {sourceLabel ?? 'Selected source'} {sourcePath ? `· ${sourcePath}` : ''}
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowRaw((current) => !current)}
          className="rounded-lg bg-accent-500/15 px-3 py-2 text-xs uppercase tracking-[0.18em] text-accent-300 hover:bg-accent-500/20"
        >
          Source
        </button>
      </div>

      <div className="mt-4 space-y-3">
        <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-3">
          <div className="flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.16em] text-bolt-elements-textSecondary">
            <span className="rounded-full border border-bolt-elements-borderColor px-2 py-0.5">
              {sourceKind ?? 'unknown'}
            </span>
            {sourcePath ? (
              <span className="rounded-full border border-bolt-elements-borderColor px-2 py-0.5">{sourcePath}</span>
            ) : null}
          </div>
          <p className="mt-3 text-sm text-bolt-elements-textSecondary">
            The raw source stays reference-only here so the page review can stay focused on normalized fields.
          </p>
        </div>

        {displayedNotes.length ? (
          <div className="space-y-2">
            {displayedNotes.map((note) => (
              <div
                key={note}
                className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-200"
              >
                {note}
              </div>
            ))}
          </div>
        ) : null}

        {sourceReferences.length ? (
          <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-3">
            <div className="text-xs uppercase tracking-[0.16em] text-bolt-elements-textSecondary">
              Imported source references
            </div>
            <div className="mt-2 space-y-2">
              {sourceReferences.map((source) => (
                <div key={source.sourcePath} className="flex items-center justify-between gap-3 text-xs">
                  <span className="truncate text-bolt-elements-textPrimary">{source.label}</span>
                  <span className="truncate text-bolt-elements-textSecondary">
                    {source.pagePath ?? source.sourcePath}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {showRaw ? (
          <div className="rounded-lg border border-bolt-elements-borderColor bg-[#0b1020] p-3">
            <div className="mb-2 text-xs uppercase tracking-[0.16em] text-bolt-elements-textSecondary">Raw content</div>
            {rawContent ? (
              <pre className="max-h-[520px] overflow-auto whitespace-pre-wrap break-words text-xs leading-5 text-bolt-elements-textPrimary">
                {rawContent}
              </pre>
            ) : (
              <div className="text-sm text-bolt-elements-textSecondary">
                No raw source is available for this item yet.
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
