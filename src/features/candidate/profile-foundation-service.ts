import "server-only";

import { randomUUID } from "node:crypto";

import { and, asc, count, desc, eq } from "drizzle-orm";

import { db, ensureDatabaseReady } from "@/db/client";
import { withDatabaseWriteRetry } from "@/db/write-retry";
import {
  candidateEducationRecords,
  candidateProfiles,
  candidateSkillEvidence,
  candidateWorkExperiences,
  portfolioProjects,
  type CandidateProfile,
} from "@/db/schema";
import {
  candidateProfileFingerprint,
  candidateSearchPreferencesFromSubmission,
  type CandidateEducationCreate,
  type CandidateEducationUpdate,
  type CandidateProfileRecordDelete,
  type CandidateSearchPreferencesSubmission,
  type CandidateSkillEvidenceCreate,
  type CandidateSkillEvidenceUpdate,
  type CandidateWorkExperienceCreate,
  type CandidateWorkExperienceUpdate,
  type PortfolioProjectCreate,
  type PortfolioProjectUpdate,
} from "@/features/candidate/input";
import {
  CandidateProfileConflictError,
  storedCandidateSearchPreferences,
  storedProfileInput,
} from "@/features/candidate/service";
import { hashValue } from "@/lib/hashing";

export type CandidateProfileTransaction = Parameters<
  Parameters<typeof db.transaction>[0]
>[0];
type Transaction = CandidateProfileTransaction;

export class CandidateProfileRecordNotFoundError extends Error {
  constructor() {
    super("That profile record no longer exists. Refresh and try again.");
    this.name = "CandidateProfileRecordNotFoundError";
  }
}

export class CandidateProfileRecordLimitError extends Error {
  constructor(label: string, limit: number) {
    super(`Keep ${label} to ${limit} records or fewer.`);
    this.name = "CandidateProfileRecordLimitError";
  }
}

export async function activeProfileForMutation(
  transaction: Transaction,
  visitorId: string,
  expectedRevision: number,
) {
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

  if (!profile) throw new CandidateProfileRecordNotFoundError();
  if (profile.revision !== expectedRevision) {
    throw new CandidateProfileConflictError();
  }
  return profile;
}

function withoutRecordMetadata<T extends Record<string, unknown>>(record: T) {
  const {
    candidateProfileId: _candidateProfileId,
    createdAt: _createdAt,
    updatedAt: _updatedAt,
    ...content
  } = record;
  void _candidateProfileId;
  void _createdAt;
  void _updatedAt;
  return content;
}

async function evidenceFingerprintForProfile(
  transaction: Transaction,
  candidateProfileId: string,
) {
  const [workHistory, education, projects, skillEvidence] = await Promise.all([
    transaction
      .select()
      .from(candidateWorkExperiences)
      .where(eq(candidateWorkExperiences.candidateProfileId, candidateProfileId))
      .orderBy(
        asc(candidateWorkExperiences.sortOrder),
        desc(candidateWorkExperiences.startDate),
        asc(candidateWorkExperiences.id),
      ),
    transaction
      .select()
      .from(candidateEducationRecords)
      .where(eq(candidateEducationRecords.candidateProfileId, candidateProfileId))
      .orderBy(
        asc(candidateEducationRecords.sortOrder),
        desc(candidateEducationRecords.endYear),
        asc(candidateEducationRecords.id),
      ),
    transaction
      .select()
      .from(portfolioProjects)
      .where(eq(portfolioProjects.candidateProfileId, candidateProfileId))
      .orderBy(asc(portfolioProjects.name), asc(portfolioProjects.id)),
    transaction
      .select()
      .from(candidateSkillEvidence)
      .where(eq(candidateSkillEvidence.candidateProfileId, candidateProfileId))
      .orderBy(asc(candidateSkillEvidence.name), asc(candidateSkillEvidence.id)),
  ]);

  return hashValue({
    education: education.map(withoutRecordMetadata),
    portfolioProjects: projects.map(withoutRecordMetadata),
    skillEvidence: skillEvidence.map(withoutRecordMetadata),
    workHistory: workHistory.map(withoutRecordMetadata),
  });
}

export async function bumpProfileForEvidenceMutation(
  transaction: Transaction,
  profile: CandidateProfile,
  now: Date,
) {
  const evidenceFingerprint = await evidenceFingerprintForProfile(
    transaction,
    profile.id,
  );
  const fingerprint = candidateProfileFingerprint(
    storedProfileInput(profile),
    storedCandidateSearchPreferences(profile),
    evidenceFingerprint,
    profile.searchContractFingerprint,
  );
  const revision = profile.revision + 1;
  const updated = await transaction
    .update(candidateProfiles)
    .set({
      evidenceFingerprint,
      fingerprint,
      revision,
      updatedAt: now,
    })
    .where(
      and(
        eq(candidateProfiles.id, profile.id),
        eq(candidateProfiles.visitorId, profile.visitorId),
        eq(candidateProfiles.revision, profile.revision),
      ),
    )
    .returning({ id: candidateProfiles.id });
  if (updated.length !== 1) throw new CandidateProfileConflictError();
  return revision;
}

export async function updateCandidateSearchPreferencesForVisitor(
  visitorId: string,
  submission: CandidateSearchPreferencesSubmission,
) {
  await ensureDatabaseReady();
  const now = new Date();

  return withDatabaseWriteRetry(() =>
    db.transaction(async (transaction) => {
      const profile = await activeProfileForMutation(
        transaction,
        visitorId,
        submission.expectedRevision,
      );
      const preferences = candidateSearchPreferencesFromSubmission(submission);
      const fingerprint = candidateProfileFingerprint(
        storedProfileInput(profile),
        preferences,
        profile.evidenceFingerprint,
        profile.searchContractFingerprint,
      );
      const currentFingerprint = candidateProfileFingerprint(
        storedProfileInput(profile),
        storedCandidateSearchPreferences(profile),
        profile.evidenceFingerprint,
        profile.searchContractFingerprint,
      );
      if (fingerprint === currentFingerprint) {
        return { revision: profile.revision, unchanged: true as const };
      }

      const revision = profile.revision + 1;
      const updated = await transaction
        .update(candidateProfiles)
        .set({
          ...preferences,
          // Keep the original scorer and older clients aligned while the ordered
          // preference field becomes the canonical v2 representation.
          preferredWorkArrangements: preferences.preferredWorkModes,
          fingerprint,
          revision,
          updatedAt: now,
        })
        .where(
          and(
            eq(candidateProfiles.id, profile.id),
            eq(candidateProfiles.visitorId, visitorId),
            eq(candidateProfiles.revision, submission.expectedRevision),
          ),
        )
        .returning({ id: candidateProfiles.id });
      if (updated.length !== 1) throw new CandidateProfileConflictError();
      return { revision };
    }),
  );
}

export async function createCandidateWorkExperienceForVisitor(
  visitorId: string,
  input: CandidateWorkExperienceCreate,
) {
  await ensureDatabaseReady();
  const now = new Date();
  const id = randomUUID();
  return withDatabaseWriteRetry(() =>
    db.transaction(async (transaction) => {
      const profile = await activeProfileForMutation(
        transaction,
        visitorId,
        input.expectedProfileRevision,
      );
      const [total] = await transaction
        .select({ value: count() })
        .from(candidateWorkExperiences)
        .where(eq(candidateWorkExperiences.candidateProfileId, profile.id));
      if ((total?.value ?? 0) >= 30) {
        throw new CandidateProfileRecordLimitError("work history", 30);
      }
      const { expectedProfileRevision: _expectedRevision, ...values } = input;
      void _expectedRevision;
      await transaction.insert(candidateWorkExperiences).values({
        id,
        candidateProfileId: profile.id,
        ...values,
        createdAt: now,
        updatedAt: now,
      });
      const revision = await bumpProfileForEvidenceMutation(
        transaction,
        profile,
        now,
      );
      return { id, revision };
    }),
  );
}

export async function updateCandidateWorkExperienceForVisitor(
  visitorId: string,
  input: CandidateWorkExperienceUpdate,
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
      const {
        expectedProfileRevision: _expectedRevision,
        id,
        ...values
      } = input;
      void _expectedRevision;
      const updated = await transaction
        .update(candidateWorkExperiences)
        .set({ ...values, updatedAt: now })
        .where(
          and(
            eq(candidateWorkExperiences.id, id),
            eq(candidateWorkExperiences.candidateProfileId, profile.id),
          ),
        )
        .returning({ id: candidateWorkExperiences.id });
      if (updated.length !== 1) throw new CandidateProfileRecordNotFoundError();
      const revision = await bumpProfileForEvidenceMutation(
        transaction,
        profile,
        now,
      );
      return { id, revision };
    }),
  );
}

export async function deleteCandidateWorkExperienceForVisitor(
  visitorId: string,
  input: CandidateProfileRecordDelete,
) {
  return deleteProfileRecordForVisitor(
    visitorId,
    input,
    candidateWorkExperiences,
  );
}

export async function createCandidateEducationForVisitor(
  visitorId: string,
  input: CandidateEducationCreate,
) {
  await ensureDatabaseReady();
  const now = new Date();
  const id = randomUUID();
  return withDatabaseWriteRetry(() =>
    db.transaction(async (transaction) => {
      const profile = await activeProfileForMutation(
        transaction,
        visitorId,
        input.expectedProfileRevision,
      );
      const [total] = await transaction
        .select({ value: count() })
        .from(candidateEducationRecords)
        .where(eq(candidateEducationRecords.candidateProfileId, profile.id));
      if ((total?.value ?? 0) >= 20) {
        throw new CandidateProfileRecordLimitError("education", 20);
      }
      const { expectedProfileRevision: _expectedRevision, ...values } = input;
      void _expectedRevision;
      await transaction.insert(candidateEducationRecords).values({
        id,
        candidateProfileId: profile.id,
        ...values,
        createdAt: now,
        updatedAt: now,
      });
      const revision = await bumpProfileForEvidenceMutation(
        transaction,
        profile,
        now,
      );
      return { id, revision };
    }),
  );
}

export async function updateCandidateEducationForVisitor(
  visitorId: string,
  input: CandidateEducationUpdate,
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
      const {
        expectedProfileRevision: _expectedRevision,
        id,
        ...values
      } = input;
      void _expectedRevision;
      const updated = await transaction
        .update(candidateEducationRecords)
        .set({ ...values, updatedAt: now })
        .where(
          and(
            eq(candidateEducationRecords.id, id),
            eq(candidateEducationRecords.candidateProfileId, profile.id),
          ),
        )
        .returning({ id: candidateEducationRecords.id });
      if (updated.length !== 1) throw new CandidateProfileRecordNotFoundError();
      const revision = await bumpProfileForEvidenceMutation(
        transaction,
        profile,
        now,
      );
      return { id, revision };
    }),
  );
}

export async function deleteCandidateEducationForVisitor(
  visitorId: string,
  input: CandidateProfileRecordDelete,
) {
  return deleteProfileRecordForVisitor(
    visitorId,
    input,
    candidateEducationRecords,
  );
}

export async function createPortfolioProjectForVisitor(
  visitorId: string,
  input: PortfolioProjectCreate,
) {
  await ensureDatabaseReady();
  const now = new Date();
  const id = randomUUID();
  return withDatabaseWriteRetry(() =>
    db.transaction(async (transaction) => {
      const profile = await activeProfileForMutation(
        transaction,
        visitorId,
        input.expectedProfileRevision,
      );
      const [total] = await transaction
        .select({ value: count() })
        .from(portfolioProjects)
        .where(eq(portfolioProjects.candidateProfileId, profile.id));
      if ((total?.value ?? 0) >= 30) {
        throw new CandidateProfileRecordLimitError("portfolio projects", 30);
      }
      const { expectedProfileRevision: _expectedRevision, ...values } = input;
      void _expectedRevision;
      await transaction.insert(portfolioProjects).values({
        id,
        candidateProfileId: profile.id,
        ...values,
        createdAt: now,
        updatedAt: now,
      });
      const revision = await bumpProfileForEvidenceMutation(
        transaction,
        profile,
        now,
      );
      return { id, revision };
    }),
  );
}

export async function updatePortfolioProjectForVisitor(
  visitorId: string,
  input: PortfolioProjectUpdate,
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
      const {
        expectedProfileRevision: _expectedRevision,
        id,
        ...values
      } = input;
      void _expectedRevision;
      const updated = await transaction
        .update(portfolioProjects)
        .set({ ...values, updatedAt: now })
        .where(
          and(
            eq(portfolioProjects.id, id),
            eq(portfolioProjects.candidateProfileId, profile.id),
          ),
        )
        .returning({ id: portfolioProjects.id });
      if (updated.length !== 1) throw new CandidateProfileRecordNotFoundError();
      const revision = await bumpProfileForEvidenceMutation(
        transaction,
        profile,
        now,
      );
      return { id, revision };
    }),
  );
}

export async function deletePortfolioProjectForVisitor(
  visitorId: string,
  input: CandidateProfileRecordDelete,
) {
  return deleteProfileRecordForVisitor(visitorId, input, portfolioProjects);
}

export async function createCandidateSkillEvidenceForVisitor(
  visitorId: string,
  input: CandidateSkillEvidenceCreate,
) {
  await ensureDatabaseReady();
  const now = new Date();
  const id = randomUUID();
  return withDatabaseWriteRetry(() =>
    db.transaction(async (transaction) => {
      const profile = await activeProfileForMutation(
        transaction,
        visitorId,
        input.expectedProfileRevision,
      );
      const [total] = await transaction
        .select({ value: count() })
        .from(candidateSkillEvidence)
        .where(eq(candidateSkillEvidence.candidateProfileId, profile.id));
      if ((total?.value ?? 0) >= 200) {
        throw new CandidateProfileRecordLimitError("skill evidence", 200);
      }
      const { expectedProfileRevision: _expectedRevision, ...values } = input;
      void _expectedRevision;
      await transaction.insert(candidateSkillEvidence).values({
        id,
        candidateProfileId: profile.id,
        ...values,
        createdAt: now,
        updatedAt: now,
      });
      const revision = await bumpProfileForEvidenceMutation(
        transaction,
        profile,
        now,
      );
      return { id, revision };
    }),
  );
}

export async function updateCandidateSkillEvidenceForVisitor(
  visitorId: string,
  input: CandidateSkillEvidenceUpdate,
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
      const {
        expectedProfileRevision: _expectedRevision,
        id,
        ...values
      } = input;
      void _expectedRevision;
      const updated = await transaction
        .update(candidateSkillEvidence)
        .set({ ...values, updatedAt: now })
        .where(
          and(
            eq(candidateSkillEvidence.id, id),
            eq(candidateSkillEvidence.candidateProfileId, profile.id),
          ),
        )
        .returning({ id: candidateSkillEvidence.id });
      if (updated.length !== 1) throw new CandidateProfileRecordNotFoundError();
      const revision = await bumpProfileForEvidenceMutation(
        transaction,
        profile,
        now,
      );
      return { id, revision };
    }),
  );
}

export async function deleteCandidateSkillEvidenceForVisitor(
  visitorId: string,
  input: CandidateProfileRecordDelete,
) {
  return deleteProfileRecordForVisitor(visitorId, input, candidateSkillEvidence);
}

type DeletableProfileTable =
  | typeof candidateWorkExperiences
  | typeof candidateEducationRecords
  | typeof portfolioProjects
  | typeof candidateSkillEvidence;

async function deleteProfileRecordForVisitor(
  visitorId: string,
  input: CandidateProfileRecordDelete,
  table: DeletableProfileTable,
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
      const deleted = await transaction
        .delete(table)
        .where(
          and(
            eq(table.id, input.id),
            eq(table.candidateProfileId, profile.id),
          ),
        )
        .returning({ id: table.id });
      if (deleted.length !== 1) throw new CandidateProfileRecordNotFoundError();
      const revision = await bumpProfileForEvidenceMutation(
        transaction,
        profile,
        now,
      );
      return { id: input.id, revision };
    }),
  );
}
