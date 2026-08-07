import { z } from "zod";

export const JOB_GAUNTLET_SCHEMA_VERSION = "job-gauntlet.v1" as const;

const boundedText = z.string().trim().min(1).max(4_000);
const shortText = z.string().trim().min(1).max(500);
const evidenceList = z.array(shortText).max(12);

export const verdictValues = [
  "Strong Apply",
  "Apply",
  "Apply as a Stretch",
  "Save for Later",
  "Learn First",
  "Skip",
] as const;

export const readinessValues = [
  "Ready Now",
  "Ready With Positioning",
  "Ready After Skill Sprint",
  "Not Yet Efficient",
] as const;

export const interviewFormatValues = [
  "behavioral",
  "portfolio_discussion",
  "case_study",
  "technical_conversation",
  "live_coding",
  "algorithms_and_data_structures",
  "system_design",
  "sales_presentation",
  "customer_simulation",
  "take_home_project",
] as const;

export const JobGauntletAnalysisSchema = z
  .object({
    dayToDaySummary: boundedText,
    basicFit: z
      .object({
        score: z.number().min(0).max(10),
        rationale: boundedText,
        evidence: evidenceList,
      })
      .strict(),
    stretchLevel: z
      .object({
        score: z.number().min(0).max(10),
        rationale: boundedText,
      })
      .strict(),
    interviewRisk: z.enum(["Low", "Moderate", "High", "Very high"]),
    likelyInterviewFormat: z.array(z.enum(interviewFormatValues)).min(1).max(10),
    interviewRiskExplanation: boundedText,
    resumeCredibility: z
      .object({
        rating: z.enum(["Credible", "Needs positioning", "Weak" ]),
        rationale: boundedText,
      })
      .strict(),
    callbackProbability: z.enum(["Very low", "Low", "Moderate", "Strong"]),
    callbackProbabilityExplanation: boundedText,
    careerValue: z
      .object({
        score: z.number().min(0).max(10),
        rationale: boundedText,
      })
      .strict(),
    compensationValue: z
      .object({
        rating: z.enum(["Strong", "Good", "Marginal", "Poor", "Unknown"]),
        rationale: boundedText,
      })
      .strict(),
    strongestMatches: evidenceList.min(1),
    qualificationGaps: evidenceList,
    redFlags: evidenceList,
    reasonsNotToApply: evidenceList.min(1),
    reasonsToApply: evidenceList.min(1),
    recommendedPortfolioProject: z.string().trim().min(1).max(200).nullable(),
    readinessCategory: z.enum(readinessValues),
    recommendedPreparation: evidenceList,
    skillSprint: z
      .object({
        title: shortText,
        duration: z.string().trim().min(1).max(100),
        actions: evidenceList.min(1),
      })
      .strict()
      .nullable(),
    verdict: z.enum(verdictValues),
    verdictExplanation: boundedText,
    uncertaintyNotes: evidenceList,
  })
  .strict()
  .superRefine((analysis, context) => {
    if (
      analysis.verdict === "Strong Apply" &&
      analysis.readinessCategory === "Not Yet Efficient"
    ) {
      context.addIssue({
        code: "custom",
        path: ["verdict"],
        message: "Strong Apply conflicts with Not Yet Efficient readiness.",
      });
    }

    if (
      analysis.readinessCategory === "Ready After Skill Sprint" &&
      analysis.skillSprint === null
    ) {
      context.addIssue({
        code: "custom",
        path: ["skillSprint"],
        message: "A focused skill sprint is required for this readiness category.",
      });
    }
  });

export const ManualAnalysisEnvelopeSchema = z
  .object({
    schemaVersion: z.literal(JOB_GAUNTLET_SCHEMA_VERSION),
    requestId: z.string().uuid(),
    inputHash: z.string().regex(/^[a-f0-9]{64}$/),
    analysis: JobGauntletAnalysisSchema,
  })
  .strict();

export type JobGauntletAnalysis = z.infer<typeof JobGauntletAnalysisSchema>;
export type ManualAnalysisEnvelope = z.infer<typeof ManualAnalysisEnvelopeSchema>;
export type JobVerdict = (typeof verdictValues)[number];
export type ReadinessCategory = (typeof readinessValues)[number];
