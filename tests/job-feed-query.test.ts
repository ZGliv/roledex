import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { and, desc, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const databasePath = join(tmpdir(), `jobswipe-feed-${randomUUID()}.db`);
process.env.DATABASE_URL = databasePath;
process.env.TURSO_DATABASE_URL = "";
process.env.TURSO_AUTH_TOKEN = "";
process.env.VERCEL = "";

let closeDatabase: typeof import("@/db/client")["closeDatabase"];
let db: typeof import("@/db/client")["db"];
let candidateProfiles: typeof import("@/db/schema")["candidateProfiles"];
let jobListings: typeof import("@/db/schema")["jobListings"];
let getDeckJobCards: typeof import("@/features/jobs/queries")["getDeckJobCards"];
let getDeckJobCardsPage: typeof import("@/features/jobs/queries")["getDeckJobCardsPage"];
let getJobCard: typeof import("@/features/jobs/queries")["getJobCard"];
let getProfileFeedImpact: typeof import("@/features/jobs/queries")["getProfileFeedImpact"];
let getSavedJobCards: typeof import("@/features/jobs/queries")["getSavedJobCards"];
let updateCandidateProfileAndRescore: typeof import("@/features/candidate/service")["updateCandidateProfileAndRescore"];
let profileSubmission: Parameters<
  typeof import("@/features/candidate/service")["updateCandidateProfileAndRescore"]
>[0];
let savedJobId: string;
let blockedJobId: string;
let validMatchJobId: string;

async function exposeJobForPreferenceTest(jobId: string) {
  const { feedExposures, feedSessions, visitorFeedQueues } = await import(
    "@/db/schema"
  );
  const { OWNER_VISITOR_ID } = await import("@/features/auth/identity");
  await getDeckJobCardsPage({ limit: 1 });
  const [queue] = await db
    .select()
    .from(visitorFeedQueues)
    .where(eq(visitorFeedQueues.visitorId, OWNER_VISITOR_ID))
    .limit(1);
  if (!queue) throw new Error("Expected a materialized owner feed queue.");
  const now = new Date();
  const sessionId = randomUUID();
  const exposureId = randomUUID();
  await db.insert(feedSessions).values({
    id: sessionId,
    visitorId: OWNER_VISITOR_ID,
    queueId: queue.id,
    queueVersion: queue.queueVersion,
    profileRevision: queue.profileRevision,
    source: "cached",
    pageStartPosition: 0,
    pageSize: 1,
    startedAt: now,
    lastSeenAt: now,
    expiresAt: new Date(now.getTime() + 60_000),
  });
  await db.insert(feedExposures).values({
    id: exposureId,
    visitorId: OWNER_VISITOR_ID,
    sessionId,
    queueId: queue.id,
    queueVersion: queue.queueVersion,
    jobListingId: jobId,
    position: 0,
    tier: "discovery",
    exposedAt: now,
  });
  return exposureId;
}

beforeAll(async () => {
  const clientModule = await import("@/db/client");
  const schemaModule = await import("@/db/schema");
  const { migrateDatabase } = await import("@/db/migrate");
  const { seedDatabase } = await import("@/db/seed");
  const { CandidateProfileUpdateSchema } = await import("@/features/candidate/input");
  const candidateService = await import("@/features/candidate/service");
  const { createManualJob } = await import("@/features/jobs/service");
  const { recordJobDecision } = await import("@/features/decisions/service");
  const queries = await import("@/features/jobs/queries");

  closeDatabase = clientModule.closeDatabase;
  db = clientModule.db;
  candidateProfiles = schemaModule.candidateProfiles;
  jobListings = schemaModule.jobListings;
  getDeckJobCards = queries.getDeckJobCards;
  getDeckJobCardsPage = queries.getDeckJobCardsPage;
  getJobCard = queries.getJobCard;
  getProfileFeedImpact = queries.getProfileFeedImpact;
  getSavedJobCards = queries.getSavedJobCards;
  updateCandidateProfileAndRescore =
    candidateService.updateCandidateProfileAndRescore;

  await migrateDatabase();
  await seedDatabase();

  const create = (title: string, company: string, description: string) =>
    createManualJob({
      title,
      company,
      location: title.includes("Remote") ? "Remote — United States" : "Pittsburgh, PA",
      sourceName: "Employer careers",
      sourceUrl: `https://example.com/jobs/${company.toLowerCase()}-${title.toLowerCase().replace(/[^a-z]+/g, "-")}`,
      salarySource: "unknown",
      descriptionRaw: `${description} This full-time position works with customers and cross-functional teams to deliver measurable outcomes. Candidates communicate clearly, solve operational problems, and own projects from discovery through launch.`,
    });

  const preference = await create(
    "Remote AI Implementation Specialist",
    "Preference Co",
    "Help customers configure AI workflows, manage onboarding, and launch integrations.",
  );
  await recordJobDecision({
    jobId: preference.jobId,
    decision: "saved",
    expectedDecision: "unseen",
    expectedDecisionEventId: null,
  });
  savedJobId = preference.jobId;

  await create(
    "Remote AI Implementation Consultant",
    "Northstar",
    "Implement AI products and guide enterprise customers through technical onboarding. The employer-posted base salary is $75,000 to $90,000 per year.",
  );
  await create(
    "Product Operations Analyst",
    "Orbit",
    "Analyze product operations, improve processes, and coordinate launches across teams. The employer-posted base salary is $72,000 to $88,000 per year.",
  );
  await create(
    "Technical Support Analyst",
    "Beacon",
    "Troubleshoot software issues and help customers use complex technical products.",
  );
  const validMatch = await createManualJob({
    title: "Junior Solutions Engineer",
    company: "Clearpay",
    location: "Remote — United States",
    sourceName: "Employer careers",
    sourceUrl: "https://example.com/jobs/clearpay-solutions-engineer",
    salarySource: "employer_posted",
    descriptionRaw:
      "Clearpay is hiring a Junior Solutions Engineer. Employer-posted base salary is $82,000 to $96,000 per year. This remote role supports customers with technical discovery, demos, implementation planning, APIs, and successful product launches across the United States.",
  });
  validMatchJobId = validMatch.jobId;
  const blocked = await createManualJob({
    title: "Senior AI Implementation Consultant",
    company: "Too Senior Labs",
    location: "Remote — United States",
    sourceName: "Employer careers",
    sourceUrl: "https://example.com/jobs/too-senior-ai-implementation",
    salarySource: "employer_posted",
    descriptionRaw:
      "Too Senior Labs is hiring a Senior AI Implementation Consultant. The employer-posted base salary is $145,000 to $175,000 per year. This remote role requires 7+ years of professional implementation experience leading enterprise AI deployments across the United States.",
  });
  blockedJobId = blocked.jobId;

  const [profile] = await db
    .select()
    .from(candidateProfiles)
    .where(eq(candidateProfiles.isActive, true))
    .limit(1);
  if (!profile) throw new Error("Expected the seeded active profile.");

  profileSubmission = CandidateProfileUpdateSchema.parse({
    expectedRevision: String(profile.revision),
    currentRole: `${profile.currentRole} II`,
    location: profile.location ?? "",
    relocationPreference: profile.relocationPreference ?? "",
    currentSalaryCents: String(profile.currentSalaryCents / 100),
    preferredSalaryMinimumCents: String(
      profile.preferredSalaryMinimumCents / 100,
    ),
    preferredSalaryTargetCents: String(
      profile.preferredSalaryTargetCents / 100,
    ),
    yearsExperience: String(profile.yearsExperience),
    preferredWorkArrangements: profile.preferredWorkArrangements,
    preferredIndustries: profile.preferredIndustries.join("\n"),
    targetRoleFamilies: profile.targetRoleFamilies.join("\n"),
    skills: profile.skills.join("\n"),
    strengths: profile.strengths.join("\n"),
    weaknesses: profile.weaknesses.join("\n"),
    interests: profile.interests.join("\n"),
    careerGoals: profile.careerGoals.join("\n"),
    dealBreakers: profile.dealBreakers.join("\n"),
    interviewConcerns: profile.interviewConcerns.join("\n"),
  });
});

afterAll(() => {
  closeDatabase();
  rmSync(databasePath, { force: true });
  rmSync(`${databasePath}-shm`, { force: true });
  rmSync(`${databasePath}-wal`, { force: true });
});

describe("personalized job feed query", () => {
  it("never returns a missing salary and preserves employer-posted pay provenance", async () => {
    const jobs = await getDeckJobCards();
    const posted = jobs.find((job) => job.company === "Clearpay");
    const postedFromDescription = jobs.find(
      (job) => job.company === "Northstar",
    );

    expect(jobs.length).toBeGreaterThanOrEqual(1);
    expect(jobs.every((job) => job.feedTier !== "blocked")).toBe(true);
    expect(jobs.every((job) => !job.salaryDisplay.includes("not posted"))).toBe(true);
    expect(posted).toMatchObject({
      admissionReasonCodes: expect.arrayContaining(["role_direct_match"]),
      biggestRisk: expect.any(String),
      evidenceConfidence: expect.stringMatching(/^(high|medium|low)$/),
      feedTier: expect.stringMatching(/^(ready_now|credible_stretch)$/),
      salaryDisplay: "$82,000–$96,000/yr",
      salarySource: "employer_posted",
      salaryIsEstimate: false,
      salaryDisclosure: "Employer-posted base salary",
      annualSalaryEstimateCents: 8_900_000,
      whyItFits: expect.any(String),
    });
    expect(posted?.decisionBrief).toMatchObject({
      confidence: expect.stringMatching(/^(high|medium|low)$/),
      edge: expect.any(String),
      opportunity: expect.stringContaining("$33,000+ above your current pay"),
      positioningMove: expect.any(String),
      risk: expect.any(String),
    });
    expect(posted?.decisionBrief?.opportunity).toContain(
      "remote matches your preferred setup",
    );
    expect(postedFromDescription).toMatchObject({
      salaryDisplay: "$75,000–$90,000/yr",
      salarySource: "employer_posted",
      salaryIsEstimate: false,
      personalizationSignalCount: 1,
      personalizationModelVersion: "personal-radar-v2",
    });
    expect(postedFromDescription?.salaryDisclosure).toBe(
      "Employer-posted base salary",
    );
  });

  it("returns the same continuous queue regardless of a legacy lane hint", async () => {
    const { visitorJobStates } = await import("@/db/schema");
    const { OWNER_VISITOR_ID } = await import("@/features/auth/identity");
    const now = new Date();

    await db.insert(visitorJobStates).values({
      visitorId: OWNER_VISITOR_ID,
      jobListingId: validMatchJobId,
      currentDecision: "saved",
      currentDecisionEventId: null,
      createdAt: now,
      updatedAt: now,
    });

    try {
      const [automatic, legacyLaneRequest] = await Promise.all([
        getDeckJobCardsPage({ limit: 10 }),
        getDeckJobCardsPage({ lane: "explore", limit: 10 }),
      ]);

      expect(automatic).toMatchObject({
        lane: "matches",
        mode: "for_you",
      });
      expect(legacyLaneRequest).toMatchObject({
        lane: "matches",
        mode: "for_you",
      });
      expect(legacyLaneRequest.jobs.map((job) => job.id)).toEqual(
        automatic.jobs.map((job) => job.id),
      );
    } finally {
      await db
        .delete(visitorJobStates)
        .where(
          and(
            eq(visitorJobStates.visitorId, OWNER_VISITOR_ID),
            eq(visitorJobStates.jobListingId, validMatchJobId),
          ),
        );
    }
  });

  it("admits a valid Match even when more than 400 higher-scoring blocked rows precede it", async () => {
    const clientModule = await import("@/db/client");
    const { fitScoreRuns, jobRevisions } = await import("@/db/schema");
    const [base] = await db
      .select({
        listing: jobListings,
        revision: jobRevisions,
        fit: fitScoreRuns,
      })
      .from(jobListings)
      .innerJoin(
        jobRevisions,
        eq(jobListings.currentRevisionId, jobRevisions.id),
      )
      .innerJoin(fitScoreRuns, eq(fitScoreRuns.jobRevisionId, jobRevisions.id))
      .where(eq(jobListings.id, validMatchJobId))
      .orderBy(desc(fitScoreRuns.createdAt), desc(fitScoreRuns.id))
      .limit(1);
    if (!base) throw new Error("Expected a scored Match fixture.");

    const fixtureKey = `admission-cap-${randomUUID()}`;
    const fixtureCount = 401;
    const fixtureRows = Array.from({ length: fixtureCount }, (_, index) => {
      const isValidMatch = index === fixtureCount - 1;
      const listingId = randomUUID();
      const revisionId = randomUUID();
      const title = isValidMatch
        ? "Junior Solutions Engineer Admission Boundary"
        : `Senior Solutions Engineer Admission Blocker ${index}`;
      return {
        isValidMatch,
        listing: {
          ...base.listing,
          id: listingId,
          normalizedTitle: title.toLocaleLowerCase("en-US"),
          normalizedCompany: fixtureKey,
          normalizedLocation: "remote united states",
          deduplicationKey: `${fixtureKey}:${index}`,
          currentRevisionId: null,
          currentDecision: "unseen" as const,
          lifecycleStatus: "active" as const,
        },
        revision: {
          ...base.revision,
          id: revisionId,
          jobListingId: listingId,
          revisionNumber: 1,
          sourceUrl: `https://example.com/jobs/${fixtureKey}-${index}`,
          contentHash: `${fixtureKey}:${index}`,
          title,
          company: "Admission Boundary Fixtures",
          seniority: isValidMatch ? "entry" : "senior",
          yearsExperienceMinimum: isValidMatch ? 1 : 7,
          yearsExperienceMaximum: isValidMatch ? 2 : 10,
          experienceRequirements: isValidMatch
            ? ["One year of relevant experience."]
            : ["Seven years of relevant experience required."],
        },
        fit: {
          ...base.fit,
          id: randomUUID(),
          jobRevisionId: revisionId,
          inputHash: `${fixtureKey}:${index}`,
          deterministicScore: isValidMatch ? 0 : 100,
        },
      };
    });
    const fixtureIds = fixtureRows.map((row) => row.listing.id);
    const validFixtureId = fixtureRows.at(-1)!.listing.id;

    try {
      for (let index = 0; index < fixtureRows.length; index += 50) {
        await db
          .insert(jobListings)
          .values(
            fixtureRows.slice(index, index + 50).map((row) => row.listing),
          );
      }
      for (let index = 0; index < fixtureRows.length; index += 15) {
        await db
          .insert(jobRevisions)
          .values(
            fixtureRows.slice(index, index + 15).map((row) => row.revision),
          );
      }
      await clientModule.client.execute({
        sql: `UPDATE job_listings
              SET current_revision_id = (
                SELECT id FROM job_revisions
                WHERE job_revisions.job_listing_id = job_listings.id
                LIMIT 1
              )
              WHERE normalized_company = ?`,
        args: [fixtureKey],
      });
      for (let index = 0; index < fixtureRows.length; index += 40) {
        await db
          .insert(fitScoreRuns)
          .values(fixtureRows.slice(index, index + 40).map((row) => row.fit));
      }

      const page = await getDeckJobCardsPage({ limit: 50 });

      expect(page.admissionCounts.blocked).toBeGreaterThanOrEqual(402);
      expect(page.jobs.map((job) => job.id)).toContain(validFixtureId);
      expect(page.jobs.find((job) => job.id === validFixtureId)).toMatchObject({
        feedLane: expect.stringMatching(/^(matches|explore)$/),
        feedTier: expect.stringMatching(/^(ready_now|credible_stretch)$/),
      });
    } finally {
      await db
        .delete(jobListings)
        .where(inArray(jobListings.id, fixtureIds));
    }
  });

  it("provides deterministic cursor pages without duplicate cards", async () => {
    const first = await getDeckJobCardsPage({ limit: 2 });
    const second = await getDeckJobCardsPage({
      limit: 2,
      cursor: first.nextCursor,
    });

    expect(first.jobs).toHaveLength(2);
    expect(first.hasMore).toBe(true);
    expect(first.nextCursor).toEqual(expect.any(String));
    expect(first.lane).toBe("matches");
    expect(first.mode).toBe("for_you");
    expect(
      first.admissionCounts.matches +
        first.admissionCounts.explore +
        first.admissionCounts.blocked,
    ).toBeGreaterThanOrEqual(5);
    expect(second.jobs).toHaveLength(1);
    expect(second.hasMore).toBe(false);
    expect(second.nextCursor).toBeNull();
    expect(second.jobs.map((job) => job.id)).not.toEqual(
      expect.arrayContaining(first.jobs.map((job) => job.id)),
    );
    expect([...first.jobs, ...second.jobs].map((job) => job.id)).toHaveLength(3);
  });

  it("explains the complete unseen feed and learned preferences for the profile", async () => {
    const impact = await getProfileFeedImpact();

    expect(impact).toMatchObject({
      profileRevision: 1,
      learnedPreferences: {
        confidence: "early",
        signalCount: 1,
        positiveSignalCount: 1,
        negativeSignalCount: 0,
      },
    });
    expect(
      impact.counts.matches + impact.counts.explore + impact.counts.blocked,
    ).toBe(impact.counts.totalUnseen);
    expect(impact.topExclusions.length).toBeGreaterThan(0);
    expect(impact.learnedPreferences.signals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          direction: "up",
          confidence: "early",
        }),
      ]),
    );
  });

  it("safely resets an invalid cursor instead of skipping unseen jobs", async () => {
    const page = await getDeckJobCardsPage({ cursor: "invalid", limit: 2 });

    expect(page.cursorReset).toBe(true);
    expect(page.lane).toBe("matches");
    expect(page.mode).toBe("for_you");
    expect(page.jobs).toHaveLength(2);
  });

  it("resets a stale deck signature even when its anchor job still exists", async () => {
    const first = await getDeckJobCardsPage({ limit: 1 });
    expect(first.nextCursor).toEqual(expect.any(String));
    const decoded = JSON.parse(
      Buffer.from(first.nextCursor!, "base64url").toString("utf8"),
    ) as { version: string };
    decoded.version = "A".repeat(24);

    const restarted = await getDeckJobCardsPage({
      cursor: Buffer.from(JSON.stringify(decoded), "utf8").toString(
        "base64url",
      ),
      limit: 1,
    });

    expect(restarted.cursorReset).toBe(true);
    expect(restarted.jobs.map((job) => job.id)).toEqual(
      first.jobs.map((job) => job.id),
    );
  });

  it("continues a cursor even when a legacy lane hint changes", async () => {
    const first = await getDeckJobCardsPage({ lane: "explore", limit: 1 });
    const second = await getDeckJobCardsPage({
      cursor: first.nextCursor,
      limit: 1,
      lane: "matches",
    });

    expect(first.nextCursor).toEqual(expect.any(String));
    expect(second.cursorReset).toBe(false);
    expect(second.lane).toBe("matches");
    expect(second.jobs).toHaveLength(1);
    expect(second.jobs[0]?.id).not.toBe(first.jobs[0]?.id);
  });

  it("removes blocked roles before the For You queue is ranked", async () => {
    const jobs = await getDeckJobCards();

    expect(jobs.every((job) => job.id !== blockedJobId)).toBe(
      true,
    );
    const detail = await getJobCard(blockedJobId);
    expect(detail).toMatchObject({
      id: blockedJobId,
      feedLane: "blocked",
      admissionReasonCodes: expect.arrayContaining(["title_excluded"]),
    });
  });

  it("keeps saved roles available after expiry and a profile revision while the live deck stays current", async () => {
    await db
      .update(jobListings)
      .set({ lifecycleStatus: "expired" })
      .where(eq(jobListings.id, savedJobId));

    expect(await getSavedJobCards()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: savedJobId, currentDecision: "saved" }),
      ]),
    );

    const update = await updateCandidateProfileAndRescore(profileSubmission);
    expect(update).toMatchObject({
      revision: profileSubmission.expectedRevision + 1,
      rescoredJobs: 5,
    });

    const [saved, detail, jobs] = await Promise.all([
      getSavedJobCards(),
      getJobCard(savedJobId),
      getDeckJobCards(),
    ]);

    expect(saved).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: savedJobId, currentDecision: "saved" }),
      ]),
    );
    expect(detail).toMatchObject({
      id: savedJobId,
      currentDecision: "saved",
    });
    expect(jobs.length).toBeGreaterThanOrEqual(1);
    expect(
      jobs.every(
        (job) => job.id !== savedJobId && job.id !== blockedJobId,
      ),
    ).toBe(true);
  });

  it("keeps structured pass feedback when a later note has no reason codes", async () => {
    const { OWNER_VISITOR_ID } = await import("@/features/auth/identity");
    const {
      recordJobDecision,
      recordJobDecisionReasons,
      recordJobNote,
    } = await import("@/features/decisions/service");
    const { createManualJob } = await import("@/features/jobs/service");
    const { loadPreferenceObservationsForVisitor } = await import(
      "@/features/jobs/queries"
    );
    const created = await createManualJob({
      title: "Remote Customer Enablement Specialist",
      company: "Epoch Notes",
      location: "Remote — United States",
      sourceName: "Employer careers",
      sourceUrl: "https://example.com/jobs/epoch-note-feedback",
      salarySource: "employer_posted",
      descriptionRaw:
        "Epoch Notes is hiring a Remote Customer Enablement Specialist. The employer-posted base salary is $68,000 to $82,000 per year. This full-time role is remote across the United States and helps customers launch software workflows.",
    });

    const exposureId = await exposeJobForPreferenceTest(created.jobId);
    const skipped = await recordJobDecision({
      jobId: created.jobId,
      exposureId,
      decision: "skipped",
      expectedDecision: "unseen",
      expectedDecisionEventId: null,
    });
    expect(skipped.decisionEventId).toEqual(expect.any(String));
    await recordJobDecisionReasons({
      jobId: created.jobId,
      expectedDecision: "skipped",
      expectedDecisionEventId: skipped.decisionEventId!,
      reasonCodes: ["wrong_work_mode"],
    });
    const observationBeforeNote = (
      await loadPreferenceObservationsForVisitor(OWNER_VISITOR_ID)
    ).find((item) => item.jobId === created.jobId);
    expect(observationBeforeNote).toBeDefined();
    await recordJobNote({
      jobId: created.jobId,
      note: "The responsibilities were otherwise relevant.",
    });

    const observations = await loadPreferenceObservationsForVisitor(
      OWNER_VISITOR_ID,
    );
    expect(observations.find((item) => item.jobId === created.jobId)).toMatchObject(
      {
        decision: "skipped",
        observedAt: observationBeforeNote?.observedAt,
        reasonCodes: ["wrong_work_mode"],
      },
    );
  });

  it("learns from the revision that was swiped instead of a later posting rewrite", async () => {
    const { OWNER_VISITOR_ID } = await import("@/features/auth/identity");
    const { recordJobDecision } = await import(
      "@/features/decisions/service"
    );
    const { createManualJob } = await import("@/features/jobs/service");
    const { loadPreferenceObservationsForVisitor } = await import(
      "@/features/jobs/queries"
    );
    const sourceUrl = "https://example.com/jobs/epoch-revision-feedback";
    const original = await createManualJob({
      title: "Junior Customer Success Specialist",
      company: "Epoch Original",
      location: "Pittsburgh, PA",
      sourceName: "Employer careers",
      sourceUrl,
      salarySource: "employer_posted",
      descriptionRaw:
        "Epoch Original is hiring a Junior Customer Success Specialist. The employer-posted base salary is $58,000 to $68,000 per year. This hybrid Pittsburgh role supports software customers and requires one year of experience.",
    });
    const exposureId = await exposeJobForPreferenceTest(original.jobId);
    await recordJobDecision({
      jobId: original.jobId,
      exposureId,
      decision: "skipped",
      expectedDecision: "unseen",
      expectedDecisionEventId: null,
      reasonCodes: ["wrong_role"],
    });

    const rewritten = await createManualJob({
      title: "Senior Corporate Counsel",
      company: "Epoch Retargeted",
      location: "Remote — United States",
      sourceName: "Employer careers",
      sourceUrl,
      salarySource: "employer_posted",
      descriptionRaw:
        "Epoch Retargeted is hiring a Senior Corporate Counsel. The employer-posted base salary is $210,000 to $260,000 per year. This remote legal leadership role requires ten years of corporate law experience.",
    });
    expect(rewritten).toMatchObject({
      changed: true,
      jobId: original.jobId,
    });

    const observations = await loadPreferenceObservationsForVisitor(
      OWNER_VISITOR_ID,
    );
    expect(observations.find((item) => item.jobId === original.jobId)).toMatchObject(
      {
        company: "Epoch Original",
        decision: "skipped",
        reasonCodes: ["wrong_role"],
        salaryAnnualMaximumCents: 6_800_000,
        salaryAnnualMinimumCents: 5_800_000,
        title: "Junior Customer Success Specialist",
        workArrangement: "hybrid",
      },
    );
  });

  it("keeps estimate-driven hard admission metadata out of the deck and visible in detail", async () => {
    const { createManualJob } = await import("@/features/jobs/service");
    const { recordJobDecision } = await import(
      "@/features/decisions/service"
    );
    const created = await createManualJob({
      title: "AI Trainer Intern",
      company: "Estimate Lane",
      location: "Pittsburgh, PA",
      sourceName: "Employer careers",
      sourceUrl: "https://example.com/jobs/estimate-lane-consistency",
      salarySource: "unknown",
      descriptionRaw:
        "Estimate Lane is hiring an AI Trainer Intern in Pittsburgh. The role reviews AI outputs, documents findings, communicates quality issues, and helps improve customer-facing AI workflows. No salary is posted.",
    });

    const [jobs, detail] = await Promise.all([
      getDeckJobCards(),
      getJobCard(created.jobId),
    ]);
    const deckJob = jobs.find((job) => job.id === created.jobId);

    expect(deckJob).toBeUndefined();
    expect(detail).toMatchObject({
      feedLane: "blocked",
      admissionReasonCodes: expect.arrayContaining([
        "salary_estimate_below_floor",
      ]),
    });

    await recordJobDecision({
      jobId: created.jobId,
      decision: "skipped",
      expectedDecision: "unseen",
      expectedDecisionEventId: null,
    });
  });

  it("uses structured skill evidence for owner ingestion and lazy guest scoring", async () => {
    const { OWNER_VISITOR_ID } = await import("@/features/auth/identity");
    const {
      candidateSkillEvidence,
      fitScoreRuns,
    } = await import("@/db/schema");
    const { getActiveCandidateProfileForVisitor } = await import(
      "@/features/candidate/queries"
    );
    const { ensureCurrentFitScoresForProfile } = await import(
      "@/features/candidate/scoring"
    );
    const { createManualJob } = await import("@/features/jobs/service");
    const guestVisitorId = randomUUID();
    const initialGuest = await getActiveCandidateProfileForVisitor(
      guestVisitorId,
    );
    const [owner] = await db
      .select()
      .from(candidateProfiles)
      .where(eq(candidateProfiles.visitorId, OWNER_VISITOR_ID))
      .limit(1);
    if (!owner) throw new Error("Expected the seeded owner profile.");

    const now = new Date();
    await db.insert(candidateSkillEvidence).values([
      {
        candidateProfileId: owner.id,
        name: "Kubernetes",
        proficiency: "working",
        evidenceType: "work_experience",
        evidenceNote: "Used in production operations.",
        createdAt: now,
        updatedAt: now,
      },
      {
        candidateProfileId: initialGuest.id,
        name: "Kubernetes",
        proficiency: "working",
        evidenceType: "work_experience",
        evidenceNote: "Used in a paid role.",
        createdAt: now,
        updatedAt: now,
      },
    ]);
    const [guest] = await db
      .update(candidateProfiles)
      .set({
        evidenceFingerprint: "skill-evidence-test",
        fingerprint: "skill-evidence-test",
        revision: initialGuest.revision + 1,
        updatedAt: now,
      })
      .where(eq(candidateProfiles.id, initialGuest.id))
      .returning();
    if (!guest) throw new Error("Expected the guest profile update.");

    const created = await createManualJob({
      title: "Remote Implementation Specialist",
      company: "Evidence Scoring",
      location: "Remote — United States",
      sourceName: "Employer careers",
      sourceUrl: "https://example.com/jobs/evidence-scoring-kubernetes",
      salarySource: "employer_posted",
      descriptionRaw:
        "Evidence Scoring is hiring a full-time Remote Implementation Specialist. Employer-posted base salary is $75,000 to $90,000 per year. Required Qualifications\n- Kubernetes\nThe role helps customers launch technical workflows across the United States.",
    });
    const ownerSkills = created.fitResult.components.find(
      (component) => component.key === "skills",
    );
    expect(ownerSkills?.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: "Kubernetes is supported by professional evidence.",
        }),
      ]),
    );

    await ensureCurrentFitScoresForProfile(guest);
    const guestRuns = await db
      .select()
      .from(fitScoreRuns)
      .where(
        and(
          eq(fitScoreRuns.jobRevisionId, created.revisionId),
          eq(fitScoreRuns.candidateProfileId, guest.id),
        ),
      )
      .orderBy(desc(fitScoreRuns.createdAt), desc(fitScoreRuns.id));
    const guestRun = guestRuns.find(
      (run) => run.candidateSnapshot.revision === guest.revision,
    );
    const guestResult = guestRun?.result as
      | import("@/features/fit/types").DeterministicFitResult
      | undefined;
    expect(
      guestResult?.components.find((component) => component.key === "skills")
        ?.evidence,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: "Kubernetes is supported by professional evidence.",
        }),
      ]),
    );
  });
});
