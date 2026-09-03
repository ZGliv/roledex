import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const databasePath = join(tmpdir(), `jobswipe-product-${randomUUID()}.db`);
process.env.DATABASE_URL = databasePath;
process.env.TURSO_DATABASE_URL = "";
process.env.TURSO_AUTH_TOKEN = "";
process.env.VERCEL = "";

const visitorA = randomUUID();
const visitorB = randomUUID();
let closeDatabase: typeof import("@/db/client")["closeDatabase"];
let jobId: string;

beforeAll(async () => {
  const clientModule = await import("@/db/client");
  const { migrateDatabase } = await import("@/db/migrate");
  const { seedDatabase } = await import("@/db/seed");
  const { getActiveCandidateProfileForVisitor } = await import("@/features/candidate/queries");
  const { createManualJob } = await import("@/features/jobs/service");
  const { recordJobDecisionForVisitor } = await import("@/features/decisions/service");

  closeDatabase = clientModule.closeDatabase;
  await migrateDatabase();
  await seedDatabase();
  await Promise.all([
    getActiveCandidateProfileForVisitor(visitorA),
    getActiveCandidateProfileForVisitor(visitorB),
  ]);
  jobId = (
    await createManualJob({
      title: "Implementation Coordinator",
      company: "Beta Systems",
      location: "Remote — United States",
      sourceName: "Employer careers",
      sourceUrl: "https://example.com/jobs/product-foundation",
      salarySource: "employer_posted",
      descriptionRaw:
        "Beta Systems is hiring an Implementation Coordinator to guide customer launches, document requirements, coordinate technical teams, and support onboarding. The role pays $70,000 to $90,000 per year.",
    })
  ).jobId;
  await recordJobDecisionForVisitor(visitorA, {
    jobId,
    decision: "saved",
    expectedDecision: "unseen",
    expectedDecisionEventId: null,
  });
});

afterAll(() => {
  closeDatabase();
  rmSync(databasePath, { force: true });
  rmSync(`${databasePath}-shm`, { force: true });
  rmSync(`${databasePath}-wal`, { force: true });
});

describe.sequential("friends beta product foundation", () => {
  it("creates a short-lived one-use device pairing code", async () => {
    const { createDevicePairingCode, consumeDevicePairingCode } = await import(
      "@/features/product/service"
    );
    const now = new Date("2026-08-12T18:00:00.000Z");
    const pairing = await createDevicePairingCode(visitorA, now);
    const normalized = pairing.code.replaceAll("-", "");
    expect(pairing.code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    await expect(
      consumeDevicePairingCode(normalized, new Date(now.getTime() + 60_000)),
    ).resolves.toBe(visitorA);
    await expect(
      consumeDevicePairingCode(normalized, new Date(now.getTime() + 61_000)),
    ).resolves.toBeNull();
  });

  it("stores application plans only for saved visitor jobs", async () => {
    const { getApplicationDetailsForVisitor, saveApplicationDetails } = await import(
      "@/features/product/service"
    );
    await saveApplicationDetails(visitorA, {
      jobListingId: jobId,
      applicationDeadline: "2026-08-30",
      followUpAt: "2026-08-20T14:00:00.000Z",
      contactName: "Jordan Lee",
      contactEmail: "jordan@example.com",
      resumeLabel: "Implementation résumé",
      nextStep: "Ask for a referral",
    });
    const details = await getApplicationDetailsForVisitor(visitorA);
    expect(details).toHaveLength(1);
    expect(details[0]).toMatchObject({
      jobListingId: jobId,
      contactName: "Jordan Lee",
      nextStep: "Ask for a referral",
    });
    await expect(
      saveApplicationDetails(visitorB, {
        jobListingId: jobId,
        applicationDeadline: null,
        followUpAt: null,
        contactName: null,
        contactEmail: null,
        resumeLabel: null,
        nextStep: null,
      }),
    ).rejects.toThrow("Save this job");
  });

  it("keeps settings, resume evidence, feedback, and exports visitor scoped", async () => {
    const {
      addResumeSource,
      deleteResumeSource,
      exportVisitorWorkspace,
      getProductSettings,
      getResumeSourcesForVisitor,
      submitBetaFeedback,
      updateProductSettings,
    } = await import("@/features/product/service");
    await updateProductSettings(visitorA, {
      dailyDigestEnabled: false,
      reminderNotificationsEnabled: true,
    });
    expect(await getProductSettings(visitorA)).toMatchObject({
      dailyDigestEnabled: false,
      reminderNotificationsEnabled: true,
    });
    const resumeId = await addResumeSource(visitorA, {
      label: "Primary résumé",
      sourceFileName: "resume.txt",
      rawText: "Implementation and customer support experience. ".repeat(5),
    });
    expect(resumeId).toBeTruthy();
    expect(await getResumeSourcesForVisitor(visitorA)).toHaveLength(1);
    expect(await getResumeSourcesForVisitor(visitorB)).toHaveLength(0);
    await submitBetaFeedback(visitorA, {
      kind: "idea",
      message: "Add a referral tracker.",
      pagePath: "/saved",
    });
    const exported = await exportVisitorWorkspace(visitorA);
    expect(exported.applications).toHaveLength(1);
    expect(exported.resumes).toHaveLength(1);
    expect(exported.settings.reminderNotificationsEnabled).toBe(true);
    expect(await deleteResumeSource(visitorB, resumeId!)).toBe(false);
    expect(await deleteResumeSource(visitorA, resumeId!)).toBe(true);
  });

  it("rate limits support feedback per visitor workspace", async () => {
    const { ProductFeedbackRateLimitError, submitBetaFeedback } = await import(
      "@/features/product/service"
    );
    for (let index = 0; index < 5; index += 1) {
      await submitBetaFeedback(visitorB, {
        kind: "general",
        message: `Support question number ${index + 1}.`,
        pagePath: "/support",
      });
    }
    await expect(
      submitBetaFeedback(visitorB, {
        kind: "general",
        message: "One message too many.",
        pagePath: "/support",
      }),
    ).rejects.toBeInstanceOf(ProductFeedbackRateLimitError);
  });
});
