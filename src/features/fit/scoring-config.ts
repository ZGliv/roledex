import type { FitComponentKey } from "./types";

export const FIT_SCORING_VERSION = "deterministic-fit-v5" as const;
export const NEUTRAL_COMPONENT_SCORE = 50;
export const MINIMUM_SCORE_COVERAGE = 0.6;

/** The eight source-of-truth weights from the project brief. */
export const FIT_COMPONENT_WEIGHTS: Readonly<Record<FitComponentKey, number>> = {
  roleFamily: 20,
  skills: 15,
  experience: 15,
  compensation: 15,
  workArrangement: 10,
  portfolio: 10,
  careerValue: 10,
  industry: 5,
} as const;

export const FIT_COMPONENT_LABELS: Readonly<Record<FitComponentKey, string>> = {
  roleFamily: "Role-family match",
  skills: "Skills match",
  experience: "Experience match",
  compensation: "Compensation match",
  workArrangement: "Work-arrangement match",
  portfolio: "Portfolio relevance",
  careerValue: "Career-value heuristic",
  industry: "Industry interest",
} as const;

export const ROLE_FAMILY_TAXONOMY: Readonly<
  Record<string, readonly string[]>
> = {
  ai_implementation: [
    "ai implementation",
    "implementation specialist",
    "implementation consultant",
    "ai enablement",
    "digital transformation",
  ],
  solutions_engineering: [
    "solutions engineer",
    "solution engineer",
    "solutions consultant",
    "sales engineer",
  ],
  technical_customer_success: [
    "technical customer success",
    "customer success manager",
    "technical account manager",
    "onboarding specialist",
  ],
  ai_operations: [
    "ai operations",
    "automation specialist",
    "applied ai analyst",
    "ai business analyst",
    "emerging technology analyst",
    "ai trainer",
    "ai evaluator",
  ],
  product: [
    "product analyst",
    "associate product manager",
    "product operations",
    "technical product specialist",
    "product manager",
  ],
  technical_support: [
    "support engineer",
    "technical support",
    "application support",
    "service desk",
    "help desk",
  ],
  engineering: [
    "software engineer",
    "ai engineer",
    "machine learning engineer",
    "product engineer",
    "developer",
  ],
  analyst: [
    "business analyst",
    "systems analyst",
    "innovation analyst",
    "research assistant",
  ],
  healthcare_technology: [
    "healthcare technology analyst",
    "health tech implementation",
    "healthcare implementation",
  ],
} as const;

const weightTotal = Object.values(FIT_COMPONENT_WEIGHTS).reduce(
  (total, weight) => total + weight,
  0,
);

if (weightTotal !== 100) {
  throw new Error(`Fit component weights must total 100; received ${weightTotal}.`);
}
