import type { Metadata } from "next";

import { ResilientFeedFallback } from "@/features/jobs/components/resilient-feed-fallback";
import { loadWhenProductionDatabaseReady } from "@/features/production/database-release";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Saved jobs",
};

export default async function SavedJobsPage() {
  const release = await loadWhenProductionDatabaseReady(async () => {
    const [jobs, shortlist] = await Promise.all([
      import("@/features/jobs/queries"),
      import("@/features/jobs/components/saved-shortlist"),
    ]);
    return {
      SavedShortlist: shortlist.SavedShortlist,
      jobs: await jobs.getSavedJobCards(),
    };
  });
  if (!release.ready) return <ResilientFeedFallback />;
  const { SavedShortlist, jobs } = release.value;

  return (
    <div className="ambient-page app-viewport">
      <div className="safe-page-top mx-auto w-full max-w-3xl px-3 pb-8 sm:px-6 sm:pb-12">
        <SavedShortlist initialJobs={jobs} />
      </div>
    </div>
  );
}
