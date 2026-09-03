import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const databasePath = join(tmpdir(), `jobswipe-native-${randomUUID()}.db`);
process.env.DATABASE_URL = databasePath;
process.env.TURSO_DATABASE_URL = "";
process.env.TURSO_AUTH_TOKEN = "";
process.env.VERCEL = "";

let closeDatabase: typeof import("@/db/client")["closeDatabase"];

function jsonRequest(url: string, body: unknown, authorization?: string) {
  return new Request(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(authorization ? { authorization: `Bearer ${authorization}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

beforeAll(async () => {
  const clientModule = await import("@/db/client");
  const { migrateDatabase } = await import("@/db/migrate");
  const { seedDatabase } = await import("@/db/seed");
  closeDatabase = clientModule.closeDatabase;
  await migrateDatabase();
  await seedDatabase();
});

afterAll(() => {
  closeDatabase();
  rmSync(databasePath, { force: true });
  rmSync(`${databasePath}-shm`, { force: true });
  rmSync(`${databasePath}-wal`, { force: true });
});

describe.sequential("native API v1", () => {
  it("creates an authenticated single-use recovery code for another device", async () => {
    const { POST: createInstallation } = await import(
      "@/app/api/v2/installations/route"
    );
    const { POST: createPairingCode } = await import(
      "@/app/api/v2/workspace/pairing-code/route"
    );
    const createdResponse = await createInstallation(
      jsonRequest("http://localhost/api/v2/installations", {
        platform: "ios",
        appVersion: "1.0.0",
        buildNumber: "1",
      }),
    );
    const created = (await createdResponse.json()).data as {
      accessToken: string;
    };

    const response = await createPairingCode(
      new Request("http://localhost/api/v2/workspace/pairing-code", {
        method: "POST",
        headers: { authorization: `Bearer ${created.accessToken}` },
      }),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.code).toMatch(/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}-(?:[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}-?){2}$/);
    expect(Date.parse(body.data.expiresAt)).toBeGreaterThan(Date.now());
    expect(body.meta.singleUse).toBe(true);
  });

  it("issues, rotates, authenticates, and revokes installation sessions", async () => {
    const { POST: createInstallation } = await import(
      "@/app/api/v1/native/installations/route"
    );
    const { POST: refreshSession } = await import(
      "@/app/api/v1/native/sessions/refresh/route"
    );
    const { GET: getProfile } = await import("@/app/api/v1/profile/route");
    const { DELETE: revokeInstallation } = await import(
      "@/app/api/v1/native/installations/current/route"
    );

    const createdResponse = await createInstallation(
      jsonRequest("http://localhost/api/v1/native/installations", {
        platform: "ios",
        appVersion: "1.0.0",
        buildNumber: "1",
        deviceName: "Test iPhone",
      }),
    );
    expect(createdResponse.status).toBe(201);
    expect(createdResponse.headers.get("x-jobswipe-api-version")).toBe("1");
    const created = (await createdResponse.json()).data as {
      accessToken: string;
      installationCredential: string;
      workspaceId: string;
    };
    expect(created.installationCredential).toMatch(/^jsi_[A-Za-z0-9_-]{43}$/);

    const profileResponse = await getProfile(
      new Request("http://localhost/api/v1/profile", {
        headers: { authorization: `Bearer ${created.accessToken}` },
      }),
    );
    expect(profileResponse.status).toBe(200);
    expect((await profileResponse.json()).data.currentRole).toBe(
      "Exploring new opportunities",
    );

    const refreshResponse = await refreshSession(
      new Request("http://localhost/api/v1/native/sessions/refresh", {
        method: "POST",
        headers: {
          authorization: `Bearer ${created.installationCredential}`,
        },
      }),
    );
    expect(refreshResponse.status).toBe(200);
    const refreshed = (await refreshResponse.json()).data as {
      accessToken: string;
      installationCredential: string;
    };
    expect(refreshed.installationCredential).not.toBe(
      created.installationCredential,
    );
    const graceRefresh = await refreshSession(
      new Request("http://localhost/api/v1/native/sessions/refresh", {
        method: "POST",
        headers: {
          authorization: `Bearer ${created.installationCredential}`,
        },
      }),
    );
    expect(graceRefresh.status).toBe(200);
    const graceSession = (await graceRefresh.json()).data as {
      installationCredential: string;
    };
    expect(graceSession.installationCredential).not.toBe(
      created.installationCredential,
    );
    expect(
      (
        await refreshSession(
          new Request("http://localhost/api/v1/native/sessions/refresh", {
            method: "POST",
            headers: {
              authorization: `Bearer ${created.installationCredential}`,
            },
          }),
        )
      ).status,
    ).toBe(401);

    expect(
      (
        await revokeInstallation(
          new Request("http://localhost/api/v1/native/installations/current", {
            method: "DELETE",
            headers: { authorization: `Bearer ${refreshed.accessToken}` },
          }),
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await getProfile(
          new Request("http://localhost/api/v1/profile", {
            headers: { authorization: `Bearer ${refreshed.accessToken}` },
          }),
        )
      ).status,
    ).toBe(401);
  });

  it("pairs an installation into an existing workspace without exposing cookies", async () => {
    const { POST: createInstallation } = await import(
      "@/app/api/v1/native/installations/route"
    );
    const { POST: pairInstallation } = await import(
      "@/app/api/v1/native/pair/route"
    );
    const { GET: getProfile } = await import("@/app/api/v1/profile/route");
    const { createDevicePairingCode } = await import("@/features/product/service");
    const { getActiveCandidateProfileForVisitor } = await import(
      "@/features/candidate/queries"
    );
    const { updateCandidateProfileAndRescoreForVisitor } = await import(
      "@/features/candidate/service"
    );

    const targetVisitor = randomUUID();
    const targetProfile = await getActiveCandidateProfileForVisitor(targetVisitor);
    await updateCandidateProfileAndRescoreForVisitor(targetVisitor, {
      expectedRevision: targetProfile.revision,
      currentRole: "Implementation Specialist",
      currentSalaryCents: 50_000_00,
      preferredSalaryMinimumCents: 65_000_00,
      preferredSalaryTargetCents: 85_000_00,
      preferredWorkArrangements: ["remote"],
      preferredIndustries: ["Technology"],
      targetRoleFamilies: ["Implementation"],
      skills: ["Customer onboarding"],
      strengths: [],
      weaknesses: [],
      interests: [],
      careerGoals: [],
      dealBreakers: [],
      interviewConcerns: [],
      location: "Pittsburgh, PA",
      relocationPreference: "",
      yearsExperience: 2,
    });
    const pairing = await createDevicePairingCode(targetVisitor);

    const createdResponse = await createInstallation(
      jsonRequest("http://localhost/api/v1/native/installations", {
        platform: "ios",
        appVersion: "1.0.0",
        buildNumber: "1",
      }),
    );
    const created = (await createdResponse.json()).data as {
      accessToken: string;
    };
    const pairedResponse = await pairInstallation(
      jsonRequest(
        "http://localhost/api/v1/native/pair",
        { code: pairing.code },
        created.accessToken,
      ),
    );
    expect(pairedResponse.status).toBe(200);
    const paired = (await pairedResponse.json()).data as {
      accessToken: string;
      workspaceId: string;
    };
    expect(paired.workspaceId).toBe(targetVisitor);
    const profileResponse = await getProfile(
      new Request("http://localhost/api/v1/profile", {
        headers: { authorization: `Bearer ${paired.accessToken}` },
      }),
    );
    expect((await profileResponse.json()).data.currentRole).toBe(
      "Implementation Specialist",
    );
    expect(
      (
        await pairInstallation(
          jsonRequest(
            "http://localhost/api/v1/native/pair",
            { code: pairing.code },
            paired.accessToken,
          ),
        )
      ).status,
    ).toBe(409);
  });

  it("validates request bodies before creating installations", async () => {
    const { POST: createInstallation } = await import(
      "@/app/api/v1/native/installations/route"
    );
    const response = await createInstallation(
      jsonRequest("http://localhost/api/v1/native/installations", {
        platform: "android",
        appVersion: "",
        buildNumber: "1",
        unexpected: true,
      }),
    );
    expect(response.status).toBe(422);
    expect((await response.json()).error.code).toBe("validation_failed");
  });

  it("durably limits anonymous installation creation by network", async () => {
    const {
      enforceNativeInstallationCreationRateLimit,
      NativeInstallationRateLimitError,
    } = await import("@/features/native/rate-limit");
    const now = new Date("2026-08-19T16:15:00.000Z");
    for (let index = 0; index < 10; index += 1) {
      await expect(
        enforceNativeInstallationCreationRateLimit("203.0.113.42", now),
      ).resolves.toBeUndefined();
    }
    await expect(
      enforceNativeInstallationCreationRateLimit("203.0.113.42", now),
    ).rejects.toBeInstanceOf(NativeInstallationRateLimitError);
    await expect(
      enforceNativeInstallationCreationRateLimit("203.0.113.43", now),
    ).resolves.toBeUndefined();
  });

  it("requires explicit confirmation and installation reauthentication before deletion", async () => {
    const { POST: createInstallation } = await import(
      "@/app/api/v2/installations/route"
    );
    const { DELETE: deleteAccount } = await import("@/app/api/v2/account/route");
    const createdResponse = await createInstallation(
      jsonRequest("http://localhost/api/v2/installations", {
        platform: "ios",
        appVersion: "1.0.0",
        buildNumber: "1",
      }),
    );
    const created = (await createdResponse.json()).data as {
      accessToken: string;
      installationCredential: string;
    };
    const missingReauthentication = await deleteAccount(
      new Request("http://localhost/api/v2/account", {
        method: "DELETE",
        headers: {
          authorization: `Bearer ${created.accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ confirmation: "DELETE_MY_ACCOUNT" }),
      }),
    );
    expect(missingReauthentication.status).toBe(401);

    const deleted = await deleteAccount(
      new Request("http://localhost/api/v2/account", {
        method: "DELETE",
        headers: {
          authorization: `Bearer ${created.accessToken}`,
          "content-type": "application/json",
          "x-installation-credential": created.installationCredential,
        },
        body: JSON.stringify({ confirmation: "DELETE_MY_ACCOUNT" }),
      }),
    );
    expect(deleted.status).toBe(200);
    expect((await deleted.json()).data.deleted).toBe(true);
  });

  it("keeps native decisions and saved jobs isolated by installation workspace", async () => {
    const { db } = await import("@/db/client");
    const { jobListings } = await import("@/db/schema");
    const { POST: createInstallation } = await import(
      "@/app/api/v1/native/installations/route"
    );
    const { POST: decideJob } = await import(
      "@/app/api/v1/jobs/[jobId]/decisions/route"
    );
    const { GET: getSaved } = await import("@/app/api/v1/saved/route");
    const { createManualJob } = await import("@/features/jobs/service");
    await createManualJob({
      title: "Implementation Coordinator",
      company: "Native Test Systems",
      location: "Remote — United States",
      sourceName: "Employer careers",
      sourceUrl: "https://example.com/native-isolation",
      salarySource: "employer_posted",
      descriptionRaw:
        "Coordinate customer implementation projects and onboarding from discovery through launch. Document requirements, guide customers, work with technical teams, and keep each milestone on schedule. The annual salary is $70,000 to $90,000.",
    });
    const [listing] = await db.select({ id: jobListings.id }).from(jobListings).limit(1);
    expect(listing).toBeTruthy();

    async function install(deviceName: string) {
      const response = await createInstallation(
        jsonRequest("http://localhost/api/v1/native/installations", {
          platform: "ios",
          appVersion: "1.0.0",
          buildNumber: "1",
          deviceName,
        }),
      );
      return (await response.json()).data as { accessToken: string };
    }

    const [installationA, installationB] = await Promise.all([
      install("Phone A"),
      install("Phone B"),
    ]);
    const decisionResponse = await decideJob(
      jsonRequest(
        `http://localhost/api/v1/jobs/${listing!.id}/decisions`,
        {
          decision: "saved",
          expectedDecision: "unseen",
          expectedDecisionEventId: null,
          reasonCodes: [],
        },
        installationA.accessToken,
      ),
      { params: Promise.resolve({ jobId: listing!.id }) },
    );
    expect(decisionResponse.status).toBe(200);

    const [savedA, savedB] = await Promise.all(
      [installationA, installationB].map((installation) =>
        getSaved(
          new Request("http://localhost/api/v1/saved", {
            headers: {
              authorization: `Bearer ${installation.accessToken}`,
            },
          }),
        ),
      ),
    );
    expect((await savedA.json()).data.map((job: { id: string }) => job.id)).toContain(
      listing!.id,
    );
    expect((await savedB.json()).data).toEqual([]);
  });

  it("updates profile sections with optimistic revision checks", async () => {
    const { POST: createInstallation } = await import(
      "@/app/api/v1/native/installations/route"
    );
    const { GET: getProfile, PATCH: patchProfile } = await import(
      "@/app/api/v1/profile/route"
    );
    const createdResponse = await createInstallation(
      jsonRequest("http://localhost/api/v1/native/installations", {
        platform: "ios",
        appVersion: "1.0.0",
        buildNumber: "1",
      }),
    );
    const { accessToken } = (await createdResponse.json()).data as {
      accessToken: string;
    };
    const initialResponse = await getProfile(
      new Request("http://localhost/api/v1/profile", {
        headers: { authorization: `Bearer ${accessToken}` },
      }),
    );
    const initial = (await initialResponse.json()).data as { revision: number };
    const coreResponse = await patchProfile(
      jsonRequest(
        "http://localhost/api/v1/profile",
        {
          section: "core",
          values: {
            expectedRevision: initial.revision,
            currentRole: "Implementation Coordinator",
            currentSalaryCents: 50_000_00,
            preferredSalaryMinimumCents: 60_000_00,
            preferredSalaryTargetCents: 85_000_00,
            preferredWorkArrangements: ["remote", "hybrid"],
            preferredIndustries: ["Technology"],
            targetRoleFamilies: ["Implementation Specialist"],
            strengths: ["Customer support"],
            weaknesses: [],
            interests: [],
            skills: ["Customer onboarding"],
            yearsExperience: 2,
            location: "Pittsburgh, PA",
            relocationPreference: "",
            careerGoals: ["Move into technical delivery"],
            interviewConcerns: [],
            dealBreakers: [],
          },
        },
        accessToken,
      ),
    );
    expect(coreResponse.status).toBe(200);
    const coreRevision = (await coreResponse.json()).data.revision as number;
    expect(coreRevision).toBeGreaterThan(initial.revision);
    const updateResponse = await patchProfile(
      jsonRequest(
        "http://localhost/api/v1/profile",
        {
          section: "search",
          values: {
            expectedRevision: coreRevision,
            desiredSeniorityLevels: ["entry", "mid"],
            excludedTitles: ["Account Executive"],
            excludedCompanies: [],
            excludedIndustries: [],
            acceptedEmploymentTypes: ["full_time"],
            preferredWorkModes: ["remote", "hybrid"],
            strictWorkModes: true,
            commuteRadiusMiles: 30,
            maxOfficeDaysPerWeek: 3,
            relocationDestinations: [],
            maxTravelPercent: 20,
            workAuthorization: "work_authorized",
            requiresSponsorship: false,
            missingSalaryPolicy: "explore_only",
          },
        },
        accessToken,
      ),
    );
    expect(updateResponse.status).toBe(200);
    const updatedResponse = await getProfile(
      new Request("http://localhost/api/v1/profile", {
        headers: { authorization: `Bearer ${accessToken}` },
      }),
    );
    const updated = (await updatedResponse.json()).data;
    expect(updated).toMatchObject({
      currentRole: "Implementation Coordinator",
      preferredSalaryMinimumCents: 60_000_00,
      desiredSeniorityLevels: ["entry", "mid"],
      preferredWorkModes: ["remote", "hybrid"],
      strictWorkModes: true,
    });

    const staleResponse = await patchProfile(
      jsonRequest(
        "http://localhost/api/v1/profile",
        {
          section: "search",
          values: {
            expectedRevision: initial.revision,
            desiredSeniorityLevels: ["entry"],
            excludedTitles: [],
            excludedCompanies: [],
            excludedIndustries: [],
            acceptedEmploymentTypes: ["full_time"],
            preferredWorkModes: ["remote"],
            strictWorkModes: true,
            commuteRadiusMiles: null,
            maxOfficeDaysPerWeek: null,
            relocationDestinations: [],
            maxTravelPercent: null,
            workAuthorization: "work_authorized",
            requiresSponsorship: false,
            missingSalaryPolicy: "explore_only",
          },
        },
        accessToken,
      ),
    );
    expect(staleResponse.status).toBe(409);
    expect((await staleResponse.json()).error.code).toBe("profile_conflict");
  });

  it("marks first-run onboarding complete for only the authenticated workspace", async () => {
    const { POST: createInstallation } = await import(
      "@/app/api/v1/native/installations/route"
    );
    const { GET: getProfile } = await import("@/app/api/v1/profile/route");
    const { POST: completeOnboarding } = await import(
      "@/app/api/v1/onboarding/complete/route"
    );
    const createdResponse = await createInstallation(
      jsonRequest("http://localhost/api/v1/native/installations", {
        platform: "ios",
        appVersion: "1.0.0",
        buildNumber: "1",
      }),
    );
    const { accessToken } = (await createdResponse.json()).data as {
      accessToken: string;
    };
    const authorization = { authorization: `Bearer ${accessToken}` };

    const before = await getProfile(
      new Request("http://localhost/api/v1/profile", {
        headers: authorization,
      }),
    );
    expect((await before.json()).data.onboardingCompleted).toBe(false);

    const completed = await completeOnboarding(
      new Request("http://localhost/api/v1/onboarding/complete", {
        method: "POST",
        headers: authorization,
      }),
    );
    expect(completed.status).toBe(200);

    const after = await getProfile(
      new Request("http://localhost/api/v1/profile", {
        headers: authorization,
      }),
    );
    expect((await after.json()).data.onboardingCompleted).toBe(true);
  });

  it("exports and permanently deletes a guest workspace while invalidating native sessions", async () => {
    const { POST: createInstallation } = await import(
      "@/app/api/v1/native/installations/route"
    );
    const { POST: refreshSession } = await import(
      "@/app/api/v1/native/sessions/refresh/route"
    );
    const { GET: exportWorkspace } = await import("@/app/api/v1/export/route");
    const { DELETE: deleteWorkspace } = await import(
      "@/app/api/v1/workspace/route"
    );
    const { GET: getProfile } = await import("@/app/api/v1/profile/route");
    const createdResponse = await createInstallation(
      jsonRequest("http://localhost/api/v1/native/installations", {
        platform: "ios",
        appVersion: "1.0.0",
        buildNumber: "1",
      }),
    );
    const session = (await createdResponse.json()).data as {
      accessToken: string;
      installationCredential: string;
      workspaceId: string;
    };
    const authorization = {
      authorization: `Bearer ${session.accessToken}`,
    };

    const exported = await exportWorkspace(
      new Request("http://localhost/api/v1/export", {
        headers: authorization,
      }),
    );
    expect(exported.status).toBe(200);
    const exportData = (await exported.json()).data as {
      schemaVersion: number;
      profiles: Array<{ visitorId: string }>;
    };
    expect(exportData.schemaVersion).toBe(2);
    expect(exportData.profiles).not.toHaveLength(0);
    expect(exportData.profiles.every(({ visitorId }) => visitorId === session.workspaceId)).toBe(true);

    const deleted = await deleteWorkspace(
      new Request("http://localhost/api/v1/workspace", {
        method: "DELETE",
        headers: authorization,
      }),
    );
    expect(deleted.status).toBe(200);
    expect((await deleted.json()).data.deleted).toBe(true);

    const staleAccess = await getProfile(
      new Request("http://localhost/api/v1/profile", {
        headers: authorization,
      }),
    );
    expect(staleAccess.status).toBe(401);
    const staleCredential = await refreshSession(
      new Request("http://localhost/api/v1/native/sessions/refresh", {
        method: "POST",
        headers: {
          authorization: `Bearer ${session.installationCredential}`,
        },
      }),
    );
    expect(staleCredential.status).toBe(401);
  });
});
