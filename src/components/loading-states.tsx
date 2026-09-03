export function FeedLoading() {
  return (
    <div
      className="app-viewport job-deck-bg relative isolate overflow-hidden"
      role="status"
      aria-label="Loading your job feed"
    >
      <div
        className="deck-loading-scene pointer-events-none absolute inset-0"
        aria-hidden="true"
      />
      <div className="safe-page-top relative mx-auto w-full max-w-[25rem] px-4 pb-2 sm:px-6 sm:pb-4">
        <div
          className="deck-loading-tabs mx-auto h-12 w-48 rounded-full"
          aria-hidden="true"
        />
        <div
          className="deck-loading-card relative mx-auto mt-3 max-w-[23rem] overflow-hidden rounded-[1.75rem]"
          aria-hidden="true"
        >
          <div className="deck-loading-lens mx-auto mt-[18%] size-20 rounded-[1.35rem]" />
          <div className="deck-loading-sheet absolute inset-x-2.5 bottom-2.5 rounded-[1.55rem] p-5">
            <span className="deck-loading-line block h-2.5 w-24 rounded-full" />
            <span className="deck-loading-line mt-4 block h-8 w-4/5 rounded-xl" />
            <span className="deck-loading-line mt-5 block h-3 w-28 rounded-full" />
            <span className="deck-loading-line mt-2 block h-7 w-3/4 rounded-lg" />
            <span className="deck-loading-line mt-5 block h-10 w-full rounded-xl" />
          </div>
        </div>
        <p className="mt-3 text-center text-[11px] font-medium tracking-[0.02em] text-[#8f9aaf]">
          Building your feed…
        </p>
      </div>
    </div>
  );
}

export function PageSpinner({
  reserveDock = true,
}: {
  reserveDock?: boolean;
} = {}) {
  return (
    <div
      className={
        reserveDock
          ? "job-deck-bg grid min-h-[calc(100dvh-var(--dock-reserve))] place-items-center"
          : "job-deck-bg grid min-h-dvh place-items-center"
      }
      role="status"
      aria-label="Loading page"
    >
      <span className="page-loading-spinner" aria-hidden="true" />
    </div>
  );
}

export function FullPageSpinner() {
  return <PageSpinner reserveDock={false} />;
}
