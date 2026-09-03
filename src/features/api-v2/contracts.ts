/**
 * Public, JSON-serializable contracts shared by the web API and the bundled
 * mobile client. Keep this module free of server-only imports.
 */

import type { JobFeatureSnapshot } from "@/features/jobs/feature-snapshot";

export type { JobFeatureSnapshot } from "@/features/jobs/feature-snapshot";

export const JOBSWIPE_API_VERSION = 2 as const;

export type FeedTier = "ready_now" | "credible_stretch" | "discovery";
export type EvidenceConfidence = "low" | "medium" | "high";
export type WorkMode = "remote" | "hybrid" | "on_site" | "unclear";
export type EmploymentType =
  | "full_time"
  | "part_time"
  | "contract"
  | "temporary"
  | "internship";

export type PreferenceOverrideMode = "more" | "less" | "ignore";
export type PreferenceControlAction =
  | PreferenceOverrideMode
  | "reset"
  | "reset_all";

export interface LearnedPreferenceSignalContract {
  key: `preference:${string}`;
  featureKey: string;
  direction: "up" | "down" | "neutral";
  learnedDirection: "up" | "down";
  label: string;
  observationCount: number;
  confidence: "early" | "developing" | "confident";
  score: number;
  learnedScore: number;
  /** Null means ranking follows the swipe-derived baseline. */
  override: PreferenceOverrideMode | null;
}

export interface RoleTargetPreference {
  id: string;
  canonicalFamily: string;
  label: string;
  aliases: readonly string[];
  priority: number;
  readiness: "ready_now" | "stretch";
  allowedSeniority: readonly string[];
  minimumYearsExperience: number | null;
  maximumYearsExperience: number | null;
  exclusions: readonly string[];
}

export type EvidenceProvenance =
  | "professional_experience"
  | "shipped_project"
  | "coursework_or_certification"
  | "self_reported";

export interface EvidenceItem {
  id: string;
  kind: "work" | "education" | "skill" | "project";
  label: string;
  detail: string | null;
  provenance: EvidenceProvenance;
  yearsExperience: number | null;
  lastUsedYear: number | null;
  confidence: EvidenceConfidence;
}

export interface SearchContract {
  version: 2;
  revision: number;
  current: {
    role: string;
    yearsExperience: number;
    salaryCents: number;
    location: string | null;
  };
  roleTargets: readonly RoleTargetPreference[];
  constraints: {
    salaryFloorCents: number;
    salaryTargetCents: number;
    seniority: readonly string[];
    workModes: readonly WorkMode[];
    strictWorkModes: boolean;
    employmentTypes: readonly EmploymentType[];
    commuteRadiusMiles: number | null;
    maximumOfficeDaysPerWeek: number | null;
    relocationDestinations: readonly string[];
    maximumTravelPercent: number | null;
    workAuthorization: string;
    requiresSponsorship: boolean | null;
    missingSalaryPolicy: "show" | "explore_only" | "hide";
    excludedTitles: readonly string[];
    excludedCompanies: readonly string[];
    excludedIndustries: readonly string[];
  };
  preferences: {
    industries: readonly string[];
    careerGoals: readonly string[];
    interests: readonly string[];
  };
  evidence: readonly EvidenceItem[];
  updatedAt: string;
}

export interface FeedSession {
  id: string;
  queueVersion: string;
  profileRevision: number;
  generatedAt: string;
  source: "live_ranked" | "cached";
}

export interface FeedExposure {
  id: string;
  sessionId: string;
  jobId: string;
  position: number;
}

export interface FeedCard {
  id: string;
  exposure: FeedExposure;
  tier: FeedTier;
  title: string;
  company: string;
  location: string;
  workMode: WorkMode;
  employmentType: string;
  compensation: {
    display: string;
    annualMinimumCents: number | null;
    annualMaximumCents: number | null;
    source: "employer_posted" | "externally_estimated" | "unknown";
    confidence: EvidenceConfidence;
  };
  fit: {
    label: "Profile fit";
    score: number;
    evidenceConfidence: EvidenceConfidence;
    whyItFits: string;
    biggestRisk: string;
  };
  source: {
    name: string;
    url: string | null;
    postedAt: string | null;
  };
  state: {
    decision: JobDecision;
    decisionEventId: string | null;
  };
  features: JobFeatureSnapshot;
}

export type JobDecision =
  | "unseen"
  | "saved"
  | "skipped"
  | "stretch"
  | "learn_first"
  | "apply"
  | "applied"
  | "interview"
  | "rejected"
  | "offer"
  | "archived";

export type DecisionReason =
  | "wrong_role"
  | "too_senior"
  | "pay_too_low"
  | "wrong_location"
  | "wrong_work_mode"
  | "company_or_industry"
  | "stale_or_duplicate"
  | "liked_role"
  | "liked_pay"
  | "liked_location"
  | "liked_work_mode"
  | "liked_company_or_industry"
  | "growth_opportunity"
  | "other";

interface InteractionEventBase {
  /** Client-generated UUID and durable idempotency key. */
  id: string;
  jobId: string;
  occurredAt: string;
}

export type InteractionEvent =
  | (InteractionEventBase & {
      kind: "decision";
      exposureId: string;
      decision: JobDecision;
      expectedDecision: JobDecision;
      expectedDecisionEventId: string | null;
      reasonCodes: readonly DecisionReason[];
    })
  | (InteractionEventBase & {
      kind: "decision_feedback";
      exposureId: string;
      expectedDecision: JobDecision;
      expectedDecisionEventId: string;
      reasonCodes: readonly DecisionReason[];
    })
  | (InteractionEventBase & {
      kind: "note";
      exposureId?: string | null;
      note: string;
    });

export interface InteractionResult {
  id: string;
  status: "applied" | "replayed" | "rejected";
  retryable: boolean;
  decision?: JobDecision;
  decisionEventId?: string | null;
  error?: { code: string; message: string };
}

export interface SavedJob {
  card: FeedCard;
  note: string | null;
  applied: boolean;
  archived: boolean;
  updatedAt: string | null;
}

export interface ResumeImportDraft {
  id: string;
  sourceFileName: string | null;
  label: string;
  rawTextRetainedUntilConfirmation: boolean;
  proposed: {
    workHistory: readonly {
      company: string;
      title: string;
      summary: string;
    }[];
    education: readonly {
      institution: string;
      credential: string;
    }[];
    skills: readonly string[];
    projects: readonly {
      name: string;
      summary: string;
    }[];
  };
}

export interface ApiEnvelope<T, M = Record<string, never>> {
  data: T;
  meta: M;
}

export interface ApiErrorEnvelope {
  error: {
    code: string;
    message: string;
    fields?: Record<string, readonly string[] | undefined>;
  };
}
