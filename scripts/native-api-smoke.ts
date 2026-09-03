const baseUrl = new URL(
  process.env.JOBSWIPE_SMOKE_BASE_URL ?? "http://localhost:3100/",
);
const requireJobs = process.env.JOBSWIPE_SMOKE_REQUIRE_JOBS === "true";

type JsonObject = Record<string, unknown>;

class SmokeFailure extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "SmokeFailure";
  }
}

async function request(
  path: string,
  init: RequestInit = {},
  expectedStatus = 200,
) {
  const response = await fetch(new URL(path, baseUrl), {
    ...init,
    headers: {
      accept: "application/json",
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...init.headers,
    },
    signal: AbortSignal.timeout(60_000),
  });
  const raw = await response.text();
  let body: JsonObject = {};
  if (raw) {
    try {
      body = JSON.parse(raw) as JsonObject;
    } catch {
      throw new SmokeFailure(`${path} did not return JSON.`, response.status);
    }
  }
  if (response.status !== expectedStatus) {
    const error = body.error as JsonObject | undefined;
    const message =
      typeof error?.message === "string" ? error.message : raw.slice(0, 240);
    const fields =
      error?.fields && typeof error.fields === "object"
        ? ` ${JSON.stringify(error.fields)}`
        : "";
    throw new SmokeFailure(
      `${path} returned ${response.status}; expected ${expectedStatus}. ${message}${fields}`,
      response.status,
    );
  }
  if (response.headers.get("x-jobswipe-api-version") !== "1") {
    throw new SmokeFailure(`${path} is missing the native API version header.`);
  }
  return body;
}

function bearer(token: string) {
  return { authorization: `Bearer ${token}` };
}

function dataOf(body: JsonObject) {
  const data = body.data;
  if (!data || typeof data !== "object") {
    throw new SmokeFailure("The API response is missing its data envelope.");
  }
  return data as JsonObject;
}

function stringValue(object: JsonObject, key: string) {
  const value = object[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new SmokeFailure(`The API response is missing ${key}.`);
  }
  return value;
}

async function main() {
  console.log(`Native API smoke target: ${baseUrl.origin}`);
  let accessToken: string | undefined;
  let workspaceDeleted = false;

  try {
    const installation = dataOf(
      await request(
        "/api/v1/native/installations",
        {
          method: "POST",
          body: JSON.stringify({
            platform: "ios",
            appVersion: "1.0.0-smoke",
            buildNumber: "1",
            deviceName: "Release smoke test",
          }),
        },
        201,
      ),
    );
    accessToken = stringValue(installation, "accessToken");
    const installationCredential = stringValue(
      installation,
      "installationCredential",
    );
    console.log("✓ Installation session issued");

    const rotated = dataOf(
      await request("/api/v1/native/sessions/refresh", {
        method: "POST",
        headers: bearer(installationCredential),
      }),
    );
    accessToken = stringValue(rotated, "accessToken");
    console.log("✓ Long-lived credential rotated");

    const profile = dataOf(
      await request("/api/v1/profile", { headers: bearer(accessToken) }),
    );
    const initialRevision = Number(profile.revision);
    if (!Number.isInteger(initialRevision)) {
      throw new SmokeFailure("The profile response has no valid revision.");
    }
    console.log("✓ Starter profile loaded");

    const core = dataOf(
      await request("/api/v1/profile", {
        method: "PATCH",
        headers: bearer(accessToken),
        body: JSON.stringify({
          section: "core",
          values: {
            expectedRevision: initialRevision,
            currentRole: "Implementation Coordinator",
            currentSalaryCents: 50_000_00,
            preferredSalaryMinimumCents: 60_000_00,
            preferredSalaryTargetCents: 85_000_00,
            preferredWorkArrangements: ["remote", "hybrid"],
            preferredIndustries: ["Technology"],
            targetRoleFamilies: [
              "Implementation Specialist",
              "Customer Success",
              "Product Operations",
            ],
            strengths: ["Customer support", "Technical troubleshooting"],
            weaknesses: [],
            interests: [],
            skills: ["Customer onboarding", "Windows", "Active Directory"],
            yearsExperience: 2,
            location: "Pittsburgh, PA",
            relocationPreference: "",
            careerGoals: ["Move into customer-facing technical delivery"],
            interviewConcerns: [],
            dealBreakers: [],
          },
        }),
      }),
    );
    const coreRevision = Number(core.revision);
    if (!Number.isInteger(coreRevision) || coreRevision <= initialRevision) {
      throw new SmokeFailure("Core profile update did not advance the revision.");
    }

    await request("/api/v1/profile", {
      method: "PATCH",
      headers: bearer(accessToken),
      body: JSON.stringify({
        section: "search",
        values: {
          expectedRevision: coreRevision,
          desiredSeniorityLevels: ["entry", "mid"],
          excludedTitles: [],
          excludedCompanies: [],
          excludedIndustries: [],
          acceptedEmploymentTypes: ["full_time"],
          preferredWorkModes: ["remote", "hybrid"],
          strictWorkModes: false,
          commuteRadiusMiles: 30,
          maxOfficeDaysPerWeek: 3,
          relocationDestinations: [],
          maxTravelPercent: 25,
          workAuthorization: "work_authorized",
          requiresSponsorship: false,
          missingSalaryPolicy: "show",
        },
      }),
    });
    await request("/api/v1/onboarding/complete", {
      method: "POST",
      headers: bearer(accessToken),
    });
    console.log("✓ Profile and onboarding persisted");

    let feedBody = await request(
      "/api/v1/feed?lane=matches&limit=25",
      { headers: bearer(accessToken) },
    );
    let jobs = feedBody.data;
    let meta = feedBody.meta as JsonObject | undefined;
    if (!Array.isArray(jobs) || !meta || typeof meta.lane !== "string") {
      throw new SmokeFailure("The feed envelope is malformed.");
    }
    if (jobs.length === 0) {
      feedBody = await request("/api/v1/feed?lane=stretch&limit=25", {
        headers: bearer(accessToken),
      });
      jobs = feedBody.data;
      meta = feedBody.meta as JsonObject | undefined;
      if (!Array.isArray(jobs) || !meta || typeof meta.lane !== "string") {
        throw new SmokeFailure("The Stretch feed envelope is malformed.");
      }
    }
    console.log(
      `✓ Personalized ${String(meta.lane)} feed loaded (${jobs.length} returned)`,
    );

    if (requireJobs && jobs.length === 0) {
      throw new SmokeFailure(
        "No reviewable jobs are available. Seed or refresh qualified inventory before release.",
      );
    }

    if (jobs.length > 0) {
      const first = jobs[0] as JsonObject;
      const jobId = stringValue(first, "id");
      await request(`/api/v1/jobs/${jobId}`, {
        headers: bearer(accessToken),
      });
      await request(`/api/v1/jobs/${jobId}/decisions`, {
        method: "POST",
        headers: bearer(accessToken),
        body: JSON.stringify({
          decision: "saved",
          expectedDecision: stringValue(first, "currentDecision"),
          expectedDecisionEventId: first.currentDecisionEventId ?? null,
          reasonCodes: [],
        }),
      });
      const saved = dataOf(
        await request("/api/v1/saved", { headers: bearer(accessToken) }),
      );
      if (!Array.isArray(saved)) {
        throw new SmokeFailure("The Saved response is malformed.");
      }
      console.log("✓ Job detail, decision, and Saved round-trip passed");
    } else {
      console.log("• No qualified local job was available; decision round-trip skipped");
    }

    const exported = await request("/api/v1/export", {
      headers: bearer(accessToken),
    });
    if (!exported || typeof exported !== "object") {
      throw new SmokeFailure("The workspace export is malformed.");
    }
    console.log("✓ Workspace export returned");

    await request("/api/v1/workspace", {
      method: "DELETE",
      headers: bearer(accessToken),
    });
    workspaceDeleted = true;
    await request(
      "/api/v1/profile",
      { headers: bearer(accessToken) },
      401,
    );
    console.log("✓ Workspace deletion revoked the session");
    console.log("\nNative API smoke test passed.");
  } finally {
    if (accessToken && !workspaceDeleted) {
      try {
        await request("/api/v1/workspace", {
          method: "DELETE",
          headers: bearer(accessToken),
        });
        console.log("• Cleaned up the smoke-test workspace after failure");
      } catch {
        console.error("• Smoke-test workspace cleanup failed; inspect the target database");
      }
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
