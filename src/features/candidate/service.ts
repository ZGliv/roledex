import "server-only";

import {
  and,
  asc,
  countDistinct,
  desc,
  eq,
  gte,
  min,
  notInArray,
  or,
  sql,
} from "drizzle-orm";

import { db, ensureDatabaseReady } from "@/db/client";
import { withDatabaseWriteRetry } from "@/db/write-retry";
import {
  candidateProfiles,
  fitScoreRuns,
  jobListings,
  jobRevisions,
  portfolioProjects,
  type CandidateProfile,
  visitorJobStates,
} from "@/db/schema";
import { requireVisitorId } from "@/features/auth/visitor";
import {
  candidateProfileFingerprint,
  profileUpdateFromSubmission,
  type CandidateProfileSubmission,
  type CandidateProfileUpdate,
} from "@/features/candidate/input";
import {
  parsedJobForRescore,
  VISITOR_SCORE_WINDOW,
} from "@/features/candidate/scoring";
import { STARTER_PROFILE_FINGERPRINT } from "@/features/candidate/starter-profile";
import { OWNER_VISITOR_ID } from "@/features/auth/identity";
import { buildFitScoreRun } from "@/features/fit/run-builder";

const SCORE_INSERT_BATCH_SIZE = 20;
const RESCORE_EXCLUDED_DECISIONS = ["skipped", "archived"] as const;
export const GUEST_PROFILE_EDIT_MINIMUM_INTERVAL_MS = 15_000;
export const GUEST_PROFILE_EDIT_HOURLY_LIMIT = 5;
export const GUEST_PROFILE_EDIT_HOURLY_WINDOW_MS = 60 * 60 * 1_000;

export class CandidateProfileConflictError extends Error {
  constructor() {
    super("The profile changed while it was being saved. Reload and try again.");
    this.name = "CandidateProfileConflictError";
  }
}

export class CandidateProfileRateLimitError extends Error {
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super(`Wait ${retryAfterSeconds} seconds before changing the profile again.`);
    this.name = "CandidateProfileRateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export { parsedJobForRescore } from "@/features/candidate/scoring";

function updatedProfile(
  profile: CandidateProfile,
  input: CandidateProfileUpdate,
  fingerprint: string,
  now: Date,
): CandidateProfile {
  return {
    ...profile,
    ...input,
    location: input.location || null,
    relocationPreference: input.relocationPreference || null,
    revision: profile.revision + 1,
    fingerprint,
    updatedAt: now,
  };
}

function storedProfileInput(profile: CandidateProfile): CandidateProfileUpdate {
  return {
    currentRole: profile.currentRole,
    currentSalaryCents: profile.currentSalaryCents,
    preferredSalaryMinimumCents: profile.preferredSalaryMinimumCents,
    preferredSalaryTargetCents: profile.preferredSalaryTargetCents,
    preferredWorkArrangements: profile.preferredWorkArrangements.filter(
      (value): value is "remote" | "hybrid" | "on_site" => value !== "unclear",
    ),
    preferredIndustries: profile.preferredIndustries,
    targetRoleFamilies: profile.targetRoleFamilies,
    strengths: profile.strengths,
    weaknesses: profile.weaknesses,
    interests: profile.interests,
    skills: profile.skills,
    yearsExperience: profile.yearsExperience,
    location: profile.location ?? "",
    relocationPreference: profile.relocationPreference ?? "",
    careerGoals: profile.careerGoals,
    interviewConcerns: profile.interviewConcerns,
    dealBreakers: profile.dealBreakers,
  };
}

export async function updateCandidateProfileAndRescore(
  submission: CandidateProfileSubmission,
) {
  return updateCandidateProfileAndRescoreForVisitor(
    await requireVisitorId(),
    submission,
  );
}

export async function updateCandidateProfileAndRescoreForVisitor(
  visitorId: string,
  submission: CandidateProfileSubmission,
) {
  await ensureDatabaseReady();
  const now = new Date();

  return withDatabaseWriteRetry(() => db.transaction(async (transaction) => {
    const [profile] = await transaction
      .select()
      .from(candidateProfiles)
      .where(
        and(
          eq(candidateProfiles.visitorId, visitorId),
          eq(candidateProfiles.isActive, true),
        ),
      )
      .limit(1);

    if (!profile) {
      throw new Error(
        "No active candidate profile exists. Run `npm run db:seed` to create the local profile.",
      );
    }
    if (submission.expectedRevision !== profile.revision) {
      throw new CandidateProfileConflictError();
    }

    const input = profileUpdateFromSubmission(submission);
    const nextFingerprint = candidateProfileFingerprint(input);
    const currentFingerprint =
      profile.fingerprint ?? candidateProfileFingerprint(storedProfileInput(profile));
    if (nextFingerprint === currentFingerprint) {
      return {
        revision: profile.revision,
        rescoredJobs: 0,
        unchanged: true as const,
      };
    }

    const rateLimitEnabled =
      Boolean(process.env.VERCEL) || process.env.NODE_ENV === "production";
    const isFirstCustomization =
      currentFingerprint === STARTER_PROFILE_FINGERPRINT;
    const elapsedMs = now.getTime() - profile.updatedAt.getTime();
    if (
      rateLimitEnabled &&
      visitorId !== OWNER_VISITOR_ID &&
      !isFirstCustomization &&
      elapsedMs < GUEST_PROFILE_EDIT_MINIMUM_INTERVAL_MS
    ) {
      throw new CandidateProfileRateLimitError(
        Math.max(
          1,
          Math.ceil(
            (GUEST_PROFILE_EDIT_MINIMUM_INTERVAL_MS - elapsedMs) / 1_000,
          ),
        ),
      );
    }
    if (rateLimitEnabled && visitorId !== OWNER_VISITOR_ID) {
      const editWindowStart = new Date(
        now.getTime() - GUEST_PROFILE_EDIT_HOURLY_WINDOW_MS,
      );
      const profileRevision = sql<number>`cast(json_extract(${fitScoreRuns.candidateSnapshot}, '$.revision') as integer)`;
      const [recentEdits] = await transaction
        .select({
          oldestAt: min(fitScoreRuns.createdAt),
          value: countDistinct(profileRevision),
        })
        .from(fitScoreRuns)
        .where(
          and(
            eq(fitScoreRuns.candidateProfileId, profile.id),
            gte(fitScoreRuns.createdAt, editWindowStart),
            sql`${profileRevision} > 1`,
          ),
        );
      if ((recentEdits?.value ?? 0) >= GUEST_PROFILE_EDIT_HOURLY_LIMIT) {
        const oldestAt = recentEdits?.oldestAt;
        const retryAfterSeconds = oldestAt
          ? Math.max(
              1,
              Math.ceil(
                (oldestAt.getTime() +
                  GUEST_PROFILE_EDIT_HOURLY_WINDOW_MS -
                  now.getTime()) /
                  1_000,
              ),
            )
          : Math.ceil(GUEST_PROFILE_EDIT_HOURLY_WINDOW_MS / 1_000);
        throw new CandidateProfileRateLimitError(retryAfterSeconds);
      }
    }

    const projects = await transaction
      .select()
      .from(portfolioProjects)
      .where(eq(portfolioProjects.candidateProfileId, profile.id))
      .orderBy(asc(portfolioProjects.name));
    const currentRevisionRows = await transaction
      .select({ revision: jobRevisions })
      .from(jobListings)
      .innerJoin(jobRevisions, eq(jobListings.currentRevisionId, jobRevisions.id))
      .leftJoin(
        visitorJobStates,
        and(
          eq(visitorJobStates.jobListingId, jobListings.id),
          eq(visitorJobStates.visitorId, visitorId),
        ),
      )
      .where(
        and(
          eq(jobListings.lifecycleStatus, "active"),
          or(
            sql`${visitorJobStates.currentDecision} is null`,
            notInArray(visitorJobStates.currentDecision, [
              ...RESCORE_EXCLUDED_DECISIONS,
            ]),
          ),
        ),
      )
      .orderBy(desc(jobListings.createdAt), desc(jobListings.id))
      .limit(VISITOR_SCORE_WINDOW);
    const nextProfile = updatedProfile(
      profile,
      input,
      nextFingerprint,
      now,
    );
    const scoreRows = currentRevisionRows.map(({ revision }) => {
      const scoring = buildFitScoreRun({
        contentHash: revision.contentHash,
        job: parsedJobForRescore(revision),
        jobRevisionId: revision.id,
        profile: nextProfile,
        projects,
      });
      return { jobRevisionId: revision.id, ...scoring.values };
    });

    const updated = await transaction
      .update(candidateProfiles)
      .set({
        currentRole: nextProfile.currentRole,
        currentSalaryCents: nextProfile.currentSalaryCents,
        preferredSalaryMinimumCents: nextProfile.preferredSalaryMinimumCents,
        preferredSalaryTargetCents: nextProfile.preferredSalaryTargetCents,
        preferredWorkArrangements: nextProfile.preferredWorkArrangements,
        preferredIndustries: nextProfile.preferredIndustries,
        targetRoleFamilies: nextProfile.targetRoleFamilies,
        strengths: nextProfile.strengths,
        weaknesses: nextProfile.weaknesses,
        interests: nextProfile.interests,
        skills: nextProfile.skills,
        yearsExperience: nextProfile.yearsExperience,
        location: nextProfile.location,
        relocationPreference: nextProfile.relocationPreference,
        careerGoals: nextProfile.careerGoals,
        interviewConcerns: nextProfile.interviewConcerns,
        dealBreakers: nextProfile.dealBreakers,
        revision: nextProfile.revision,
        fingerprint: nextProfile.fingerprint,
        updatedAt: now,
      })
      .where(
        and(
          eq(candidateProfiles.id, profile.id),
          eq(candidateProfiles.revision, submission.expectedRevision),
        ),
      )
      .returning({ id: candidateProfiles.id });

    if (updated.length !== 1) throw new CandidateProfileConflictError();

    for (let index = 0; index < scoreRows.length; index += SCORE_INSERT_BATCH_SIZE) {
      await transaction
        .insert(fitScoreRuns)
        .values(scoreRows.slice(index, index + SCORE_INSERT_BATCH_SIZE));
    }

    return {
      revision: nextProfile.revision,
      rescoredJobs: scoreRows.length,
    };
  }));
}
