import type { Metadata } from "next";

import { DrivingMode } from "@/features/driving/components/driving-mode";
import type { DrivingJob } from "@/features/driving/contracts";
import { buildSpokenJobSummary } from "@/features/driving/summary";
import {
  getDeckJobCards,
  getJobWorkspaceStats,
} from "@/features/jobs/queries";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Driving mode",
  description: "Free browser narration for a safely configured JobSwipe session.",
};

const DRIVING_BATCH_SIZE = 20;

export default async function DrivePage() {
  const [deckJobs, stats] = await Promise.all([
    getDeckJobCards(),
    getJobWorkspaceStats(),
  ]);
  const drivingJobs: DrivingJob[] = deckJobs
    .slice(0, DRIVING_BATCH_SIZE)
    .map((job) => ({
      company: job.company,
      currentDecision: job.currentDecision,
      deterministicFitCoverage: job.deterministicFitCoverage,
      deterministicFitScore: job.deterministicFitScore,
      id: job.id,
      location: job.location,
      readiness: job.readiness,
      salaryDisplay: job.salaryDisplay,
      sourceUrl: job.sourceUrl,
      spokenSummary: buildSpokenJobSummary(job),
      title: job.title,
      verdict: job.verdict,
      workArrangement: job.workArrangement,
    }));
  const batchKey = drivingJobs.map((job) => job.id).join(":") || "empty";

  return (
    <DrivingMode
      key={batchKey}
      hasMore={stats.counts.unseen > drivingJobs.length}
      initialJobs={drivingJobs}
      totalUnseen={stats.counts.unseen}
    />
  );
}
