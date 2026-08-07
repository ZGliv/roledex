import type { Metadata } from "next";

import { SavedJobList } from "@/features/jobs/components/saved-job-list";
import { getSavedJobCards } from "@/features/jobs/queries";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Saved jobs",
};

export default async function SavedJobsPage() {
  const jobs = await getSavedJobCards();

  return (
    <div className="ambient-page app-viewport">
      <div className="safe-page-top mx-auto w-full max-w-3xl px-3 pb-8 sm:px-6 sm:pb-12">
        <SavedJobList initialJobs={jobs} />
      </div>
    </div>
  );
}
