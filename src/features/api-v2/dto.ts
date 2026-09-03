import { createHash, randomUUID } from "node:crypto";

import type {
  EvidenceConfidence,
  EvidenceItem,
  FeedCard,
  FeedSession,
  FeedTier,
  RoleTargetPreference,
  SavedJob,
  SearchContract,
  WorkMode,
} from "@/features/api-v2/contracts";
import type { JobCardViewModel } from "@/features/jobs/components/job-card";

type UnifiedJobCard = JobCardViewModel & {
  feedTier?: FeedTier | "blocked";
  evidenceConfidence?: EvidenceConfidence;
  whyItFits?: string;
  biggestRisk?: string;
  feedExposureId?: string | null;
  feedQueuePosition?: number;
};

type ProfileView = Awaited<
  ReturnType<typeof import("@/features/candidate/queries")["getCandidateProfileViewForVisitor"]>
> & {
  roleTargets?: readonly {
    id: string;
    canonicalFamily: string;
    label: string;
    aliases: readonly string[];
    priorityRank: number;
    readiness: "ready_now" | "stretch";
    allowedSeniorityLevels: readonly string[];
    minimumRequiredExperienceYears: number | null;
    maximumRequiredExperienceYears: number | null;
    exclusions: readonly string[];
  }[];
};

function workMode(value: JobCardViewModel["workArrangement"]): WorkMode {
  if (value === "Remote") return "remote";
  if (value === "Hybrid") return "hybrid";
  if (value === "On-site") return "on_site";
  return "unclear";
}

function confidenceFromCoverage(coverage: number): EvidenceConfidence {
  if (coverage >= 75) return "high";
  if (coverage >= 45) return "medium";
  return "low";
}

function resolvedFeedTier(job: UnifiedJobCard): FeedTier {
  if (job.feedTier && job.feedTier !== "blocked") return job.feedTier;
  if (job.isExploration) return "discovery";
  if (/stretch/i.test(job.readiness) || job.verdict === "Apply as a Stretch") {
    return "credible_stretch";
  }
  return "ready_now";
}

function salaryAmount(value: number) {
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function apiV2FeedSession(input: {
  profileRevision: number;
  cursor: string | null;
  jobs: readonly JobCardViewModel[];
  modelVersion: string;
  now?: Date;
  persisted?: {
    id: string;
    queueVersion: string;
    source: FeedSession["source"];
  };
}): FeedSession {
  const now = input.now ?? new Date();
  const queueVersion =
    input.persisted?.queueVersion ??
    createHash("sha256")
      .update(
        JSON.stringify({
          cursor: input.cursor,
          jobs: input.jobs.map((job) => job.id),
          modelVersion: input.modelVersion,
          profileRevision: input.profileRevision,
        }),
      )
      .digest("base64url")
      .slice(0, 24);
  return {
    id: input.persisted?.id ?? randomUUID(),
    queueVersion,
    profileRevision: input.profileRevision,
    generatedAt: now.toISOString(),
    source: input.persisted?.source ?? "live_ranked",
  };
}

export function apiV2FeedCard(
  rawJob: JobCardViewModel,
  sessionId: string,
  position: number,
): FeedCard {
  const job = rawJob as UnifiedJobCard;
  const evidenceConfidence =
    job.evidenceConfidence ??
    confidenceFromCoverage(job.deterministicFitCoverage);
  const whyItFits =
    job.whyItFits ??
    job.personalizationReasons[0] ??
    job.strongestMatches[0] ??
    job.reasonsToApply[0] ??
    "Open the role to review the strongest evidence.";
  const biggestRisk =
    job.biggestRisk ??
    job.biggestGaps[0] ??
    job.reasonsNotToApply[0] ??
    "Some requirements could not be verified from the listing.";

  return {
    id: job.id,
    exposure: {
      id: job.feedExposureId ?? randomUUID(),
      sessionId,
      jobId: job.id,
      position: job.feedQueuePosition ?? position,
    },
    tier: resolvedFeedTier(job),
    title: job.title,
    company: job.company,
    location: job.location,
    workMode: workMode(job.workArrangement),
    employmentType: job.employmentType,
    compensation: {
      display: job.salaryDisplay,
      annualMinimumCents: salaryAmount(job.salaryAnnualMinimumCents),
      annualMaximumCents: salaryAmount(job.salaryAnnualMaximumCents),
      source: job.salarySource,
      confidence: job.salaryConfidence,
    },
    fit: {
      label: "Profile fit",
      score: job.deterministicFitScore,
      evidenceConfidence,
      whyItFits,
      biggestRisk,
    },
    source: {
      name: job.sourceName,
      url: job.sourceUrl,
      postedAt: job.datePosted,
    },
    state: {
      decision: job.currentDecision,
      decisionEventId: job.currentDecisionEventId,
    },
    features:
      job.featureSnapshot ??
      {
        version: 1,
        roleFamilies: [],
        responsibilities: job.responsibilities,
        requiredSkills: job.requiredQualifications,
        preferredSkills: job.preferredQualifications,
        experience: {
          minimumYears: null,
          maximumYears: null,
          seniority: job.seniority,
        },
        compensation: {
          annualMinimumCents: salaryAmount(job.salaryAnnualMinimumCents),
          annualMaximumCents: salaryAmount(job.salaryAnnualMaximumCents),
          currency: "USD",
          source: job.salarySource,
          confidence: job.salaryConfidence,
        },
        workplace: {
          location: job.location,
          mode: workMode(job.workArrangement),
          employmentType: job.employmentType,
          authorization: null,
          sponsorship: null,
          travelPercent: null,
        },
        company: {
          name: job.company,
          industry: null,
        },
        freshness: {
          postedAt: job.datePosted,
          retrievedAt: null,
          isDuplicate: false,
        },
        extractionConfidence: evidenceConfidence,
      },
  };
}

function evidenceConfidence(
  value: string | null | undefined,
): EvidenceConfidence {
  return value === "high" || value === "low" ? value : "medium";
}

function evidenceProvenance(value: string) {
  if (value === "work_experience") return "professional_experience" as const;
  if (value === "portfolio_project") return "shipped_project" as const;
  if (value === "education" || value === "certification") {
    return "coursework_or_certification" as const;
  }
  return "self_reported" as const;
}

function roleTargets(profile: ProfileView): readonly RoleTargetPreference[] {
  if (profile.roleTargets && profile.roleTargets.length > 0) {
    return profile.roleTargets.map((target) => ({
      id: target.id,
      canonicalFamily: target.canonicalFamily,
      label: target.label,
      aliases: target.aliases,
      priority: target.priorityRank,
      readiness: target.readiness,
      allowedSeniority: target.allowedSeniorityLevels,
      minimumYearsExperience: target.minimumRequiredExperienceYears,
      maximumYearsExperience: target.maximumRequiredExperienceYears,
      exclusions: target.exclusions,
    }));
  }
  return profile.targetRoleFamilies.map((label, index) => ({
    id: `legacy-role-${index + 1}`,
    canonicalFamily: label
      .toLocaleLowerCase("en-US")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, ""),
    label,
    aliases: [],
    priority: index + 1,
    readiness: "ready_now",
    allowedSeniority: profile.desiredSeniorityLevels,
    minimumYearsExperience: null,
    maximumYearsExperience: Math.max(3, profile.yearsExperience + 1),
    exclusions: [],
  }));
}

function profileEvidence(profile: ProfileView): readonly EvidenceItem[] {
  return [
    ...profile.workHistory.map((item) => ({
      id: item.id,
      kind: "work" as const,
      label: `${item.title} at ${item.company}`,
      detail: item.summary || null,
      provenance: "professional_experience" as const,
      yearsExperience: null,
      lastUsedYear: Number(item.endDate?.slice(0, 4) ?? new Date().getFullYear()),
      confidence: "high" as const,
    })),
    ...profile.educationRecords.map((item) => ({
      id: item.id,
      kind: "education" as const,
      label: [item.degree, item.fieldOfStudy, item.institution].filter(Boolean).join(" · "),
      detail: item.description || null,
      provenance: "coursework_or_certification" as const,
      yearsExperience: null,
      lastUsedYear: item.endYear,
      confidence: "high" as const,
    })),
    ...profile.skillEvidence.map((item) => ({
      id: item.id,
      kind: "skill" as const,
      label: item.name,
      detail: item.evidenceNote,
      provenance: evidenceProvenance(item.evidenceType),
      yearsExperience: item.yearsExperience,
      lastUsedYear: item.lastUsedYear,
      confidence: evidenceConfidence(
        "confidence" in item ? String(item.confidence) : null,
      ),
    })),
    ...profile.projects.map((item) => ({
      id: item.id,
      kind: "project" as const,
      label: item.name,
      detail: item.description,
      provenance: "shipped_project" as const,
      yearsExperience: null,
      lastUsedYear: null,
      confidence: "high" as const,
    })),
  ];
}

export function apiV2SearchContract(profile: ProfileView): SearchContract {
  return {
    version: 2,
    revision: profile.revision,
    current: {
      role: profile.currentRole,
      yearsExperience: profile.yearsExperience,
      salaryCents: profile.currentSalaryCents,
      location: profile.location,
    },
    roleTargets: roleTargets(profile),
    constraints: {
      salaryFloorCents: profile.preferredSalaryMinimumCents,
      salaryTargetCents: profile.preferredSalaryTargetCents,
      seniority: profile.desiredSeniorityLevels,
      workModes: profile.preferredWorkModes,
      strictWorkModes: profile.strictWorkModes,
      employmentTypes: profile.acceptedEmploymentTypes,
      commuteRadiusMiles: profile.commuteRadiusMiles,
      maximumOfficeDaysPerWeek: profile.maxOfficeDaysPerWeek,
      relocationDestinations: profile.relocationDestinations,
      maximumTravelPercent: profile.maxTravelPercent,
      workAuthorization: profile.workAuthorization,
      requiresSponsorship: profile.requiresSponsorship,
      missingSalaryPolicy: profile.missingSalaryPolicy,
      excludedTitles: profile.excludedTitles,
      excludedCompanies: profile.excludedCompanies,
      excludedIndustries: profile.excludedIndustries,
    },
    preferences: {
      industries: profile.preferredIndustries,
      careerGoals: profile.careerGoals,
      interests: profile.interests,
    },
    evidence: profileEvidence(profile),
    updatedAt: profile.updatedAt,
  };
}

export function apiV2SavedJob(
  job: JobCardViewModel,
  input: {
    note: string | null;
    updatedAt: string | null;
  },
): SavedJob {
  const sessionId = `saved:${job.id}`;
  return {
    card: apiV2FeedCard(job, sessionId, 0),
    note: input.note,
    applied: ["applied", "interview", "offer"].includes(job.currentDecision),
    archived: job.currentDecision === "archived",
    updatedAt: input.updatedAt,
  };
}
