import "server-only";

import { randomUUID } from "node:crypto";

import { and, asc, count, eq, inArray, lt } from "drizzle-orm";

import { db, ensureDatabaseReady } from "@/db/client";
import {
  candidateEducationRecords,
  candidateProfiles,
  candidateResumeImports,
  candidateResumeSources,
  candidateRoleTargets,
  candidateSkillEvidence,
  candidateWorkExperiences,
  portfolioProjects,
  type CandidateProfile,
  type CandidateRoleTarget,
  type JsonObject,
} from "@/db/schema";
import { withDatabaseWriteRetry } from "@/db/write-retry";
import {
  CandidateResumeDraftSchema,
  candidateProfileFingerprint,
  normalizeRoleFamilyKey,
  type CandidateResumeImportConfirm,
  type CandidateResumeImportCreate,
  type CandidateResumeImportDiscard,
  type CandidateRoleTargetInput,
  type CandidateRoleTargetsReplace,
} from "@/features/candidate/input";
import {
  activeProfileForMutation,
  bumpProfileForEvidenceMutation,
} from "@/features/candidate/profile-foundation-service";
import { parseResumeImportDraft } from "@/features/candidate/resume-import-parser";
import {
  storedCandidateSearchPreferences,
  storedProfileInput,
} from "@/features/candidate/service";
import { RESUME_DRAFT_RETENTION_MS } from "@/features/data-lifecycle/service";
import { hashValue } from "@/lib/hashing";

const MAX_ROLE_TARGETS = 12;
const MAX_DRAFTS_PER_PROFILE = 5;
const CLEARED_RESUME_DRAFT = {
  parserVersion: "resume-deterministic-v1",
  workHistory: [],
  education: [],
  skills: [],
  projects: [],
  warnings: [],
} as const;

export class CandidateResumeImportNotFoundError extends Error {
  constructor() {
    super("That résumé review is no longer available. Start a new import.");
    this.name = "CandidateResumeImportNotFoundError";
  }
}

export class CandidateResumeImportSelectionError extends Error {
  constructor() {
    super("One of the selected résumé facts is no longer available. Review the draft again.");
    this.name = "CandidateResumeImportSelectionError";
  }
}

function normalizedRoleTargets(targets: readonly CandidateRoleTargetInput[]) {
  return targets
    .map((target, index) => ({ ...target, priorityRank: index + 1 }))
    .toSorted((left, right) => left.priorityRank - right.priorityRank);
}

export function roleTargetsFingerprint(
  targets: readonly CandidateRoleTargetInput[],
) {
  return hashValue(
    normalizedRoleTargets(targets).map((target) => ({
      ...target,
      aliases: target.aliases.toSorted((left, right) => left.localeCompare(right)),
      allowedSeniorityLevels: target.allowedSeniorityLevels.toSorted(),
      exclusions: target.exclusions.toSorted((left, right) => left.localeCompare(right)),
    })),
  );
}

export function defaultRoleTargetsForProfile(
  profile: Pick<
    CandidateProfile,
    "desiredSeniorityLevels" | "targetRoleFamilies" | "yearsExperience"
  >,
): CandidateRoleTargetInput[] {
  const seniority =
    profile.desiredSeniorityLevels.length > 0
      ? profile.desiredSeniorityLevels
      : (["entry", "mid"] as const);
  return profile.targetRoleFamilies.slice(0, MAX_ROLE_TARGETS).map((label, index) => ({
    aliases: [],
    allowedSeniorityLevels: [...seniority],
    canonicalFamily: normalizeRoleFamilyKey(label),
    exclusions: [],
    maximumRequiredExperienceYears: Math.min(50, profile.yearsExperience + 2),
    minimumRequiredExperienceYears: 0,
    label,
    priorityRank: index + 1,
    readiness: "ready_now" as const,
  }));
}

function storedTargetInput(target: CandidateRoleTarget): CandidateRoleTargetInput {
  return {
    aliases: target.aliases,
    allowedSeniorityLevels: target.allowedSeniorityLevels,
    canonicalFamily: target.canonicalFamily,
    exclusions: target.exclusions,
    label: target.label,
    maximumRequiredExperienceYears: target.maximumRequiredExperienceYears,
    minimumRequiredExperienceYears: target.minimumRequiredExperienceYears,
    priorityRank: target.priorityRank,
    readiness: target.readiness,
  };
}

export async function ensureCandidateRoleTargetsForProfile(
  profile: CandidateProfile,
) {
  await ensureDatabaseReady();
  const existing = await db
    .select()
    .from(candidateRoleTargets)
    .where(eq(candidateRoleTargets.candidateProfileId, profile.id))
    .orderBy(asc(candidateRoleTargets.priorityRank));
  if (existing.length > 0) return existing;

  const defaults = defaultRoleTargetsForProfile(profile);
  if (defaults.length === 0) return [];
  const now = new Date();
  await withDatabaseWriteRetry(() =>
    db
      .insert(candidateRoleTargets)
      .values(
        defaults.map((target) => ({
          ...target,
          candidateProfileId: profile.id,
          createdAt: now,
          id: randomUUID(),
          updatedAt: now,
        })),
      )
      .onConflictDoNothing(),
  );
  return db
    .select()
    .from(candidateRoleTargets)
    .where(eq(candidateRoleTargets.candidateProfileId, profile.id))
    .orderBy(asc(candidateRoleTargets.priorityRank));
}

export async function replaceCandidateRoleTargetsForVisitor(
  visitorId: string,
  input: CandidateRoleTargetsReplace,
) {
  await ensureDatabaseReady();
  const targets = normalizedRoleTargets(input.targets);
  const now = new Date();

  return withDatabaseWriteRetry(() =>
    db.transaction(async (transaction) => {
      const profile = await activeProfileForMutation(
        transaction,
        visitorId,
        input.expectedRevision,
      );
      const existing = await transaction
        .select()
        .from(candidateRoleTargets)
        .where(eq(candidateRoleTargets.candidateProfileId, profile.id))
        .orderBy(asc(candidateRoleTargets.priorityRank));
      const nextContractFingerprint = roleTargetsFingerprint(targets);
      const currentContractFingerprint =
        profile.searchContractFingerprint ??
        (existing.length > 0
          ? roleTargetsFingerprint(existing.map(storedTargetInput))
          : null);
      if (currentContractFingerprint === nextContractFingerprint) {
        return { revision: profile.revision, unchanged: true as const };
      }

      await transaction
        .delete(candidateRoleTargets)
        .where(eq(candidateRoleTargets.candidateProfileId, profile.id));
      await transaction.insert(candidateRoleTargets).values(
        targets.map((target) => ({
          ...target,
          candidateProfileId: profile.id,
          createdAt: now,
          id: randomUUID(),
          updatedAt: now,
        })),
      );

      const profileInput = {
        ...storedProfileInput(profile),
        // Existing fit and retrieval paths consume this legacy field until the
        // V2 feed switches to role targets directly.
        targetRoleFamilies: targets.map((target) => target.label),
      };
      const fingerprint = candidateProfileFingerprint(
        profileInput,
        storedCandidateSearchPreferences(profile),
        profile.evidenceFingerprint,
        nextContractFingerprint,
      );
      const revision = profile.revision + 1;
      const updated = await transaction
        .update(candidateProfiles)
        .set({
          fingerprint,
          revision,
          searchContractFingerprint: nextContractFingerprint,
          targetRoleFamilies: profileInput.targetRoleFamilies,
          updatedAt: now,
        })
        .where(
          and(
            eq(candidateProfiles.id, profile.id),
            eq(candidateProfiles.revision, profile.revision),
          ),
        )
        .returning({ id: candidateProfiles.id });
      if (updated.length !== 1) {
        throw new Error("The search contract changed while it was being saved.");
      }
      return { revision };
    }),
  );
}

export async function createCandidateResumeImportForVisitor(
  visitorId: string,
  input: CandidateResumeImportCreate,
) {
  await ensureDatabaseReady();
  const draft = parseResumeImportDraft(input.rawText);
  const now = new Date();
  const contentHash = hashValue(input.rawText);

  return withDatabaseWriteRetry(() =>
    db.transaction(async (transaction) => {
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
      if (!profile) throw new CandidateResumeImportNotFoundError();
      // An abandoned review should not retain raw résumé text forever. Purge
      // stale drafts opportunistically before enforcing the active-draft cap.
      const staleBefore = new Date(now.getTime() - RESUME_DRAFT_RETENTION_MS);
      const staleDrafts = await transaction
        .select({
          id: candidateResumeImports.id,
          resumeSourceId: candidateResumeImports.resumeSourceId,
        })
        .from(candidateResumeImports)
        .where(
          and(
            eq(candidateResumeImports.candidateProfileId, profile.id),
            eq(candidateResumeImports.status, "draft"),
            lt(candidateResumeImports.updatedAt, staleBefore),
          ),
        );
      if (staleDrafts.length > 0) {
        await transaction.delete(candidateResumeImports).where(
          inArray(
            candidateResumeImports.id,
            staleDrafts.map(({ id }) => id),
          ),
        );
        const staleSourceIds = staleDrafts.flatMap(({ resumeSourceId }) =>
          resumeSourceId ? [resumeSourceId] : [],
        );
        if (staleSourceIds.length > 0) {
          await transaction
            .delete(candidateResumeSources)
            .where(inArray(candidateResumeSources.id, staleSourceIds));
        }
      }
      const [draftCount] = await transaction
        .select({ value: count() })
        .from(candidateResumeImports)
        .where(
          and(
            eq(candidateResumeImports.candidateProfileId, profile.id),
            eq(candidateResumeImports.status, "draft"),
          ),
        );
      if ((draftCount?.value ?? 0) >= MAX_DRAFTS_PER_PROFILE) {
        throw new Error("Finish or discard an existing résumé review first.");
      }

      let [source] = await transaction
        .select()
        .from(candidateResumeSources)
        .where(
          and(
            eq(candidateResumeSources.candidateProfileId, profile.id),
            eq(candidateResumeSources.contentHash, contentHash),
          ),
        )
        .limit(1);
      if (!source) {
        const sourceId = randomUUID();
        await transaction.insert(candidateResumeSources).values({
          candidateProfileId: profile.id,
          contentHash,
          createdAt: now,
          id: sourceId,
          label: input.label,
          rawText: input.rawText,
          sourceFileName: input.sourceFileName,
        });
        [source] = await transaction
          .select()
          .from(candidateResumeSources)
          .where(eq(candidateResumeSources.id, sourceId))
          .limit(1);
      }
      if (!source) throw new CandidateResumeImportNotFoundError();

      const [existingImport] = await transaction
        .select()
        .from(candidateResumeImports)
        .where(eq(candidateResumeImports.resumeSourceId, source.id))
        .limit(1);
      if (existingImport?.status === "draft") {
        return {
          draft: CandidateResumeDraftSchema.parse(existingImport.draftJson),
          importId: existingImport.id,
          revision: profile.revision,
        };
      }

      const importId = randomUUID();
      await transaction.insert(candidateResumeImports).values({
        candidateProfileId: profile.id,
        createdAt: now,
        draftJson: draft as unknown as JsonObject,
        id: importId,
        parserVersion: draft.parserVersion,
        resumeSourceId: source.id,
        status: "draft",
        updatedAt: now,
      });
      return { draft, importId, revision: profile.revision };
    }),
  );
}

function selectedItems<T>(items: readonly T[], indexes: readonly number[]) {
  return indexes.map((index) => {
    const item = items[index];
    if (!item) throw new CandidateResumeImportSelectionError();
    return item;
  });
}

export async function confirmCandidateResumeImportForVisitor(
  visitorId: string,
  input: CandidateResumeImportConfirm,
) {
  await ensureDatabaseReady();
  const now = new Date();

  return withDatabaseWriteRetry(() =>
    db.transaction(async (transaction) => {
      const profile = await activeProfileForMutation(
        transaction,
        visitorId,
        input.expectedProfileRevision,
      );
      const [resumeImport] = await transaction
        .select()
        .from(candidateResumeImports)
        .where(
          and(
            eq(candidateResumeImports.id, input.importId),
            eq(candidateResumeImports.candidateProfileId, profile.id),
            eq(candidateResumeImports.status, "draft"),
          ),
        )
        .limit(1);
      if (!resumeImport) throw new CandidateResumeImportNotFoundError();
      const draft = CandidateResumeDraftSchema.parse(resumeImport.draftJson);
      const selectedWork = selectedItems(draft.workHistory, input.selectedWorkIndexes);
      const selectedEducation = selectedItems(
        draft.education,
        input.selectedEducationIndexes,
      );
      const selectedSkills = selectedItems(draft.skills, input.selectedSkillIndexes);
      const selectedProjects = selectedItems(
        draft.projects,
        input.selectedProjectIndexes,
      );

      const [workCount, educationCount, skillCount, projectCount] =
        await Promise.all([
          transaction
            .select({ value: count() })
            .from(candidateWorkExperiences)
            .where(eq(candidateWorkExperiences.candidateProfileId, profile.id)),
          transaction
            .select({ value: count() })
            .from(candidateEducationRecords)
            .where(eq(candidateEducationRecords.candidateProfileId, profile.id)),
          transaction
            .select({ value: count() })
            .from(candidateSkillEvidence)
            .where(eq(candidateSkillEvidence.candidateProfileId, profile.id)),
          transaction
            .select({ value: count() })
            .from(portfolioProjects)
            .where(eq(portfolioProjects.candidateProfileId, profile.id)),
        ]);
      if ((workCount[0]?.value ?? 0) + selectedWork.length > 30) {
        throw new Error("The selected work entries would exceed the 30-entry limit.");
      }
      if ((educationCount[0]?.value ?? 0) + selectedEducation.length > 20) {
        throw new Error("The selected education entries would exceed the 20-entry limit.");
      }
      if ((skillCount[0]?.value ?? 0) + selectedSkills.length > 200) {
        throw new Error("The selected skills would exceed the 200-skill limit.");
      }
      if ((projectCount[0]?.value ?? 0) + selectedProjects.length > 30) {
        throw new Error("The selected projects would exceed the 30-project limit.");
      }

      if (selectedWork.length > 0) {
        await transaction.insert(candidateWorkExperiences).values(
          selectedWork.map((item, index) => ({
            achievements: item.achievements,
            candidateProfileId: profile.id,
            company: item.company,
            createdAt: now,
            employmentType: null,
            endDate: item.endDate,
            id: randomUUID(),
            isCurrent: item.isCurrent,
            location: null,
            skills: item.skills,
            sortOrder: (workCount[0]?.value ?? 0) + index,
            startDate: item.startDate,
            summary: item.summary,
            title: item.title,
            updatedAt: now,
            workArrangement: null,
          })),
        );
      }
      if (selectedEducation.length > 0) {
        await transaction.insert(candidateEducationRecords).values(
          selectedEducation.map((item, index) => ({
            candidateProfileId: profile.id,
            createdAt: now,
            degree: item.degree,
            description: item.description,
            endYear: item.endYear,
            fieldOfStudy: item.fieldOfStudy,
            id: randomUUID(),
            institution: item.institution,
            sortOrder: (educationCount[0]?.value ?? 0) + index,
            startYear: item.startYear,
            updatedAt: now,
          })),
        );
      }
      if (selectedSkills.length > 0) {
        await transaction
          .insert(candidateSkillEvidence)
          .values(
            selectedSkills.map((item) => ({
              candidateProfileId: profile.id,
              confidence: item.confidence,
              createdAt: now,
              evidenceNote: item.evidenceNote,
              evidenceType: item.evidenceType,
              id: randomUUID(),
              lastUsedYear: item.lastUsedYear,
              name: item.name,
              proficiency: item.proficiency,
              sourceRecordId: resumeImport.id,
              updatedAt: now,
              yearsExperience: item.yearsExperience,
            })),
          )
          .onConflictDoNothing();
      }
      if (selectedProjects.length > 0) {
        await transaction
          .insert(portfolioProjects)
          .values(
            selectedProjects.map((item) => ({
              appStoreUrl: null,
              businessProblem: "",
              candidateProfileId: profile.id,
              createdAt: now,
              description: item.description,
              id: randomUUID(),
              liveUrl: null,
              name: item.name,
              relevantRoleFamilies: [],
              repositoryUrl: null,
              responsibilities: item.responsibilities,
              screenshots: [],
              status: "resume_evidence",
              strongestEvidence: item.strongestEvidence,
              technologies: item.technologies,
              updatedAt: now,
              userImpact: "",
            })),
          )
          .onConflictDoNothing();
      }

      await transaction
        .update(candidateResumeImports)
        .set({
          confirmedAt: now,
          draftJson: (input.retainRawSource
            ? resumeImport.draftJson
            : CLEARED_RESUME_DRAFT) as unknown as JsonObject,
          rawSourceRetained: input.retainRawSource,
          status: "confirmed",
          updatedAt: now,
        })
        .where(eq(candidateResumeImports.id, resumeImport.id));
      if (!input.retainRawSource && resumeImport.resumeSourceId) {
        await transaction
          .delete(candidateResumeSources)
          .where(eq(candidateResumeSources.id, resumeImport.resumeSourceId));
      }

      const revision = await bumpProfileForEvidenceMutation(
        transaction,
        profile,
        now,
      );
      return {
        imported: {
          education: selectedEducation.length,
          projects: selectedProjects.length,
          skills: selectedSkills.length,
          work: selectedWork.length,
        },
        revision,
      };
    }),
  );
}

export async function discardCandidateResumeImportForVisitor(
  visitorId: string,
  input: CandidateResumeImportDiscard,
) {
  await ensureDatabaseReady();
  return withDatabaseWriteRetry(() =>
    db.transaction(async (transaction) => {
      const [resumeImport] = await transaction
        .select({
          id: candidateResumeImports.id,
          resumeSourceId: candidateResumeImports.resumeSourceId,
        })
        .from(candidateResumeImports)
        .innerJoin(
          candidateProfiles,
          eq(candidateResumeImports.candidateProfileId, candidateProfiles.id),
        )
        .where(
          and(
            eq(candidateResumeImports.id, input.importId),
            eq(candidateResumeImports.status, "draft"),
            eq(candidateProfiles.visitorId, visitorId),
            eq(candidateProfiles.isActive, true),
          ),
        )
        .limit(1);
      if (!resumeImport) throw new CandidateResumeImportNotFoundError();
      await transaction
        .delete(candidateResumeImports)
        .where(eq(candidateResumeImports.id, resumeImport.id));
      if (resumeImport.resumeSourceId) {
        await transaction
          .delete(candidateResumeSources)
          .where(eq(candidateResumeSources.id, resumeImport.resumeSourceId));
      }
      return { discarded: true as const };
    }),
  );
}

export type CandidateRoleTargetView = CandidateRoleTarget;
