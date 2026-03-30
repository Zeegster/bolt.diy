export interface IntakePageNavigatorItem {
  id: string;
  name: string;
  path: string;
  status?: 'ready' | 'warn' | 'needs-review';
}

interface IntakePageNavigatorProps {
  pages: IntakePageNavigatorItem[];
  selectedPageId?: string;
  onSelectPage: (pageId: string) => void;
  onPreviousPage: () => void;
  onNextPage: () => void;
}

export function IntakePageNavigator({
  pages,
  selectedPageId,
  onSelectPage,
  onPreviousPage,
  onNextPage,
}: IntakePageNavigatorProps) {
  const activeIndex = Math.max(
    0,
    pages.findIndex((page) => page.id === selectedPageId),
  );
  const activePage = pages[activeIndex];

  return (
    <div className="rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-4 py-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="text-sm font-medium text-bolt-elements-textPrimary">Page navigator</div>
          <div className="mt-1 text-xs text-bolt-elements-textSecondary">
            {pages.length ? `${activeIndex + 1} of ${pages.length}` : 'No reviewed pages yet'}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-3 py-2 text-sm hover:bg-bolt-elements-background-depth-3 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={onPreviousPage}
            disabled={pages.length < 2}
          >
            Prev
          </button>
          <button
            type="button"
            className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-3 py-2 text-sm hover:bg-bolt-elements-background-depth-3 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={onNextPage}
            disabled={pages.length < 2}
          >
            Next
          </button>
          <select
            value={selectedPageId ?? ''}
            onChange={(event) => onSelectPage(event.target.value)}
            className="min-w-[220px] rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-3 py-2 text-sm"
          >
            {pages.map((page) => (
              <option key={page.id} value={page.id}>
                {page.name} · {page.path}
              </option>
            ))}
          </select>
        </div>
      </div>

      {activePage ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {pages.slice(0, 6).map((page) => (
            <button
              key={page.id}
              type="button"
              onClick={() => onSelectPage(page.id)}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                page.id === activePage.id
                  ? 'border-accent-500/40 bg-accent-500/15 text-accent-300'
                  : 'border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary'
              }`}
            >
              {page.name}
            </button>
          ))}
          {pages.length > 6 ? (
            <span className="rounded-full border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-3 py-1 text-xs text-bolt-elements-textSecondary">
              +{pages.length - 6} more
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
