import type { JobCardViewModel } from "@/features/jobs/components/job-card";
import type { SpokenJobSummary } from "@/features/driving/summary";

export type DrivingJob = Pick<
  JobCardViewModel,
  | "company"
  | "currentDecision"
  | "deterministicFitCoverage"
  | "deterministicFitScore"
  | "id"
  | "location"
  | "readiness"
  | "salaryDisplay"
  | "sourceUrl"
  | "title"
  | "verdict"
  | "workArrangement"
> & {
  spokenSummary: SpokenJobSummary;
};
