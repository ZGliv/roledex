import type { JobCardViewModel } from "@/features/jobs/components/job-card";

export function nativeJobCard(job: JobCardViewModel) {
  return {
    id: job.id,
    title: job.title,
    company: job.company,
    location: job.location,
    workArrangement: job.workArrangement,
    employmentType: job.employmentType,
    salary: {
      display: job.salaryDisplay,
      source: job.salarySource,
      confidence: job.salaryConfidence,
      annualMinimumCents: job.salaryAnnualMinimumCents,
      annualMaximumCents: job.salaryAnnualMaximumCents,
    },
    fit: {
      score: job.deterministicFitScore,
      coverage: job.deterministicFitCoverage,
      verdict: job.verdict,
      readiness: job.readiness,
      explanation: job.verdictExplanation,
      strongestMatches: job.strongestMatches,
      biggestGaps: job.biggestGaps,
      personalizedReasons: job.personalizationReasons,
    },
    currentDecision: job.currentDecision,
    currentDecisionEventId: job.currentDecisionEventId,
    source: {
      name: job.sourceName,
      url: job.sourceUrl,
      postedAt: job.datePosted,
    },
  };
}

export function nativeJobDetail(job: JobCardViewModel) {
  return {
    ...nativeJobCard(job),
    summary: job.summary,
    responsibilities: job.responsibilities,
    requiredQualifications: job.requiredQualifications,
    preferredQualifications: job.preferredQualifications,
    technologies: job.technologies,
    travelRequirement: job.travelRequirement,
    seniority: job.seniority,
    applicationDeadline: job.applicationDeadline,
    decisionBrief: job.decisionBrief ?? null,
    reasonsToApply: job.reasonsToApply,
    reasonsNotToApply: job.reasonsNotToApply,
    warnings: job.warnings,
  };
}
