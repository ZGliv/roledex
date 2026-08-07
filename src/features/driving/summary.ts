import type { JobCardViewModel } from "@/features/jobs/components/job-card";

export type SpokenJobSummarySource = Pick<
  JobCardViewModel,
  | "biggestGaps"
  | "company"
  | "location"
  | "reasonsNotToApply"
  | "responsibilities"
  | "salaryDisplay"
  | "salarySource"
  | "strongestMatches"
  | "summary"
  | "title"
  | "verdict"
  | "verdictExplanation"
  | "workArrangement"
>;

export type SpokenJobSummary = {
  dayToDay: string;
  gap: string;
  match: string;
  passReason: string;
  reflection: string;
  spokenText: string;
};

const SPOKEN_FRAGMENT_LIMIT = 170;

function cleanFragment(value: string, limit = SPOKEN_FRAGMENT_LIMIT) {
  const cleaned = value
    .replace(/^[\s•*–—-]+/, "")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length <= limit) return cleaned;

  const candidate = cleaned.slice(0, limit + 1);
  const breakAt = candidate.lastIndexOf(" ");
  const clipped = candidate.slice(0, breakAt > limit * 0.65 ? breakAt : limit).trim();
  return `${clipped.replace(/[,:;.!?]+$/, "")}.`;
}

function asSentence(value: string) {
  const cleaned = cleanFragment(value);
  if (!cleaned) return "";
  return /[.!?]$/.test(cleaned) ? cleaned : `${cleaned}.`;
}

function firstPopulated(values: readonly string[]) {
  return values.find((value) => value.trim().length > 0);
}

function salarySentence(job: SpokenJobSummarySource) {
  if (job.salarySource === "employer_posted") {
    return `Employer-posted compensation: ${asSentence(job.salaryDisplay)}`;
  }
  if (job.salarySource === "externally_estimated") {
    return `Externally estimated compensation: ${asSentence(job.salaryDisplay)}`;
  }
  if (job.salaryDisplay.toLocaleLowerCase("en-US").includes("not posted")) {
    return "Salary is not posted.";
  }
  return `Compensation shown with an unknown source: ${asSentence(job.salaryDisplay)}`;
}

export function buildSpokenJobSummary(
  job: SpokenJobSummarySource,
): SpokenJobSummary {
  const summaryFallback =
    job.summary.trim() || "The listing does not include a clear day-to-day summary";
  const dayToDay = cleanFragment(
    firstPopulated(job.responsibilities) ?? summaryFallback,
  );
  const match = cleanFragment(
    firstPopulated(job.strongestMatches) ??
      "The stored analysis did not identify a strong candidate match",
  );
  const gap = cleanFragment(
    firstPopulated(job.biggestGaps) ??
      "The stored analysis did not identify a specific qualification gap",
  );
  const passReason = cleanFragment(
    firstPopulated(job.reasonsNotToApply) ??
      "The stored analysis did not supply a specific reason to pass",
  );
  const reflection = "Would pursuing this role be a meaningful improvement over your current job?";

  const spokenText = [
    `This is ${cleanFragment(job.title, 120)} at ${cleanFragment(job.company, 80)}.`,
    salarySentence(job),
    `Work setup: ${cleanFragment(job.workArrangement, 40)}, ${asSentence(job.location)}`,
    `Day to day: ${asSentence(dayToDay)}`,
    `Why it may fit: ${asSentence(match)}`,
    `Biggest qualification gap: ${asSentence(gap)}`,
    `Strongest reason to pass: ${asSentence(passReason)}`,
    `JobSwipe verdict: ${job.verdict}. ${asSentence(job.verdictExplanation)}`,
    `Question for reflection: ${reflection}`,
  ].join(" ");

  return {
    dayToDay,
    gap,
    match,
    passReason,
    reflection,
    spokenText,
  };
}
