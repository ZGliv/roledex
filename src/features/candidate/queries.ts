import "server-only";

import { cache } from "react";

import { and, asc, eq } from "drizzle-orm";

import { db, ensureDatabaseReady } from "@/db/client";
import { candidateProfiles, portfolioProjects } from "@/db/schema";
import { ensureCurrentFitScoresForProfile } from "@/features/candidate/scoring";
import {
  STARTER_PROFILE,
  STARTER_PROFILE_FINGERPRINT,
} from "@/features/candidate/starter-profile";
import { admitVisitorWorkspace } from "@/features/candidate/visitor-admission";
import { ensureVisitor, requireVisitorId } from "@/features/auth/visitor";
import { touchGuestVisitorActivity } from "@/features/visitor/service";

const getActiveCandidateProfileForVisitorCached = cache(async (visitorId: string) => {
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
    await db
      .insert(candidateProfiles)
      .values({
        visitorId,
        ...STARTER_PROFILE,
        location: null,
        relocationPreference: null,
        fingerprint: STARTER_PROFILE_FINGERPRINT,
      })
      .onConflictDoNothing();
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
  await ensureCurrentFitScoresForProfile(profile);
  return profile;
});

export async function getActiveCandidateProfileForVisitor(visitorId: string) {
  return getActiveCandidateProfileForVisitorCached(visitorId);
}

export async function getActiveCandidateProfile() {
  await ensureDatabaseReady();
  return getActiveCandidateProfileForVisitor(await requireVisitorId());
}

export async function getActiveCandidateContextForVisitor(visitorId: string) {
  const profile = await getActiveCandidateProfileForVisitor(visitorId);
  const projects = await db
    .select()
    .from(portfolioProjects)
    .where(eq(portfolioProjects.candidateProfileId, profile.id))
    .orderBy(asc(portfolioProjects.name));
  return { profile, projects };
}

export async function getActiveCandidateContext() {
  return getActiveCandidateContextForVisitor(await requireVisitorId());
}

export async function getCandidateProfileView() {
  const { profile, projects } = await getActiveCandidateContext();

  return {
    ...profile,
    createdAt: profile.createdAt.toISOString(),
    updatedAt: profile.updatedAt.toISOString(),
    projects: projects.map((project) => ({
      ...project,
      createdAt: project.createdAt.toISOString(),
      updatedAt: project.updatedAt.toISOString(),
    })),
  };
}

export type CandidateProfileView = Awaited<ReturnType<typeof getCandidateProfileView>>;
