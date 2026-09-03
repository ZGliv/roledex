import "server-only";

import { cache } from "react";

import { and, asc, desc, eq } from "drizzle-orm";

import { db, ensureDatabaseReady } from "@/db/client";
import { withDatabaseWriteRetry } from "@/db/write-retry";
import {
  candidateEducationRecords,
  candidateProfiles,
  candidateResumeImports,
  candidateSkillEvidence,
  candidateWorkExperiences,
  portfolioProjects,
} from "@/db/schema";
import { repairCurrentFitScoresForInteractiveRequest } from "@/features/candidate/scoring";
import { CandidateResumeDraftSchema } from "@/features/candidate/input";
import { ensureCandidateRoleTargetsForProfile } from "@/features/candidate/search-contract-service";
import {
  STARTER_PROFILE,
  STARTER_PROFILE_FINGERPRINT,
} from "@/features/candidate/starter-profile";
import { admitVisitorWorkspace } from "@/features/candidate/visitor-admission";
import { ensureVisitor, requireVisitorId } from "@/features/auth/visitor";
import { touchGuestVisitorActivity } from "@/features/visitor/service";

const getActiveCandidateProfileRecordForVisitorCached = cache(async (visitorId: string) => {
  await ensureVisitor(visitorId);
  await touchGuestVisitorActivity(visitorId);
  let [profile] = await db
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
    await admitVisitorWorkspace(visitorId);
    await withDatabaseWriteRetry(() =>
      db
        .insert(candidateProfiles)
        .values({
          visitorId,
          ...STARTER_PROFILE,
          location: null,
          relocationPreference: null,
          fingerprint: STARTER_PROFILE_FINGERPRINT,
        })
        .onConflictDoNothing(),
    );
    [profile] = await db
      .select()
      .from(candidateProfiles)
      .where(
        and(
          eq(candidateProfiles.visitorId, visitorId),
          eq(candidateProfiles.isActive, true),
        ),
      )
      .limit(1);
  }

  if (!profile) throw new Error("The visitor profile could not be initialized.");
  return profile;
});

/** Lightweight profile read for cache-key checks that must not trigger scoring. */
export async function getActiveCandidateProfileRecordForVisitor(
  visitorId: string,
) {
  return getActiveCandidateProfileRecordForVisitorCached(visitorId);
}

export async function getActiveCandidateProfileForVisitor(visitorId: string) {
  const profile = await getActiveCandidateProfileRecordForVisitorCached(visitorId);
  await repairCurrentFitScoresForInteractiveRequest(profile);
  return profile;
}

export async function getActiveCandidateProfile() {
  await ensureDatabaseReady();
  return getActiveCandidateProfileForVisitor(await requireVisitorId());
}

export async function getActiveCandidateContextForVisitor(
  visitorId: string,
  repairFitScores = true,
) {
  const profile = repairFitScores
    ? await getActiveCandidateProfileForVisitor(visitorId)
    : await getActiveCandidateProfileRecordForVisitorCached(visitorId);
  const projects = await db
    .select()
    .from(portfolioProjects)
    .where(eq(portfolioProjects.candidateProfileId, profile.id))
    .orderBy(asc(portfolioProjects.name));
  return { profile, projects };
}

export async function getActiveCandidateContext(repairFitScores = true) {
  return getActiveCandidateContextForVisitor(
    await requireVisitorId(),
    repairFitScores,
  );
}

export async function getCandidateProfileViewForVisitor(
  visitorId: string,
  repairFitScores = true,
) {
  const { profile, projects } = await getActiveCandidateContextForVisitor(
    visitorId,
    repairFitScores,
  );
  const [workHistory, educationRecords, skillEvidence, roleTargets, resumeImportDrafts] = await Promise.all([
    db
      .select()
      .from(candidateWorkExperiences)
      .where(eq(candidateWorkExperiences.candidateProfileId, profile.id))
      .orderBy(
        asc(candidateWorkExperiences.sortOrder),
        desc(candidateWorkExperiences.startDate),
        asc(candidateWorkExperiences.id),
      ),
    db
      .select()
      .from(candidateEducationRecords)
      .where(eq(candidateEducationRecords.candidateProfileId, profile.id))
      .orderBy(
        asc(candidateEducationRecords.sortOrder),
        desc(candidateEducationRecords.endYear),
        asc(candidateEducationRecords.id),
      ),
    db
      .select()
      .from(candidateSkillEvidence)
      .where(eq(candidateSkillEvidence.candidateProfileId, profile.id))
      .orderBy(asc(candidateSkillEvidence.name), asc(candidateSkillEvidence.id)),
    ensureCandidateRoleTargetsForProfile(profile),
    db
      .select({
        createdAt: candidateResumeImports.createdAt,
        draftJson: candidateResumeImports.draftJson,
        id: candidateResumeImports.id,
        parserVersion: candidateResumeImports.parserVersion,
      })
      .from(candidateResumeImports)
      .where(
        and(
          eq(candidateResumeImports.candidateProfileId, profile.id),
          eq(candidateResumeImports.status, "draft"),
        ),
      )
      .orderBy(desc(candidateResumeImports.createdAt)),
  ]);

  const serializeDates = <T extends { createdAt: Date; updatedAt: Date }>(
    record: T,
  ) => ({
    ...record,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  });

  return {
    ...profile,
    createdAt: profile.createdAt.toISOString(),
    updatedAt: profile.updatedAt.toISOString(),
    projects: projects.map(serializeDates),
    workHistory: workHistory.map(serializeDates),
    educationRecords: educationRecords.map(serializeDates),
    skillEvidence: skillEvidence.map(serializeDates),
    roleTargets: roleTargets.map(serializeDates),
    resumeImportDrafts: resumeImportDrafts.map(({ draftJson, ...resumeImport }) => ({
      ...resumeImport,
      createdAt: resumeImport.createdAt.toISOString(),
      draft: CandidateResumeDraftSchema.parse(draftJson),
    })),
  };
}

export async function getCandidateProfileView(repairFitScores = true) {
  return getCandidateProfileViewForVisitor(
    await requireVisitorId(),
    repairFitScores,
  );
}

export type CandidateProfileView = Awaited<ReturnType<typeof getCandidateProfileView>>;
