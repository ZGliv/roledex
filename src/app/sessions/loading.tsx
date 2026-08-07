export default function ResearchSessionsLoading() {
  return (
    <div className="app-viewport bg-[#f5f6f8]">
      <div
        className="mx-auto w-full max-w-6xl animate-pulse px-4 pb-14 pt-8 motion-reduce:animate-none sm:px-6 sm:pt-10 lg:px-8"
        aria-label="Loading research sessions"
        role="status"
      >
        <div className="h-4 w-36 rounded-full bg-[#e2e4e8]" />
        <div className="mt-4 h-11 w-full max-w-xl rounded-2xl bg-[#dddfe3]" />
        <div className="mt-3 h-5 w-full max-w-2xl rounded-full bg-[#e5e6e9]" />
        <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="h-32 rounded-[1.2rem] bg-white ring-1 ring-black/[0.04]" />
          ))}
        </div>
        <div className="mt-9 grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 2 }, (_, index) => (
            <div key={index} className="h-[28rem] rounded-[1.5rem] bg-white ring-1 ring-black/[0.04]" />
          ))}
        </div>
        <span className="sr-only">Loading recent decision history…</span>
      </div>
    </div>
  );
}
