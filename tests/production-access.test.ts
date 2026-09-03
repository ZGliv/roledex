import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import {
  issueOwnerSessionToken,
  OWNER_SESSION_COOKIE,
} from "@/features/auth/session-token";
import { loadWhenProductionDatabaseReady } from "@/features/production/database-release";
import { proxy } from "@/proxy";

const originalVercelEnvironment = process.env.VERCEL_ENV;
const originalProductionUi = process.env.JOBSWIPE_PRODUCTION_UI;
const originalAccessPassword = process.env.JOBSWIPE_ACCESS_PASSWORD;
const originalSessionSecret = process.env.JOBSWIPE_SESSION_SECRET;
const originalProductionDatabaseReady =
  process.env.JOBSWIPE_PRODUCTION_DATABASE_READY;

function restoreEnvironment(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function enableProductionOwnerAuth() {
  process.env.VERCEL_ENV = "production";
  process.env.JOBSWIPE_PRODUCTION_UI = "enabled";
  process.env.JOBSWIPE_ACCESS_PASSWORD = "owner-access-password-with-enough-entropy";
  process.env.JOBSWIPE_SESSION_SECRET = "session-secret-with-at-least-thirty-two-bytes";
  process.env.JOBSWIPE_PRODUCTION_DATABASE_READY = "true";
}

afterEach(() => {
  restoreEnvironment("VERCEL_ENV", originalVercelEnvironment);
  restoreEnvironment("JOBSWIPE_PRODUCTION_UI", originalProductionUi);
  restoreEnvironment("JOBSWIPE_ACCESS_PASSWORD", originalAccessPassword);
  restoreEnvironment("JOBSWIPE_SESSION_SECRET", originalSessionSecret);
  restoreEnvironment(
    "JOBSWIPE_PRODUCTION_DATABASE_READY",
    originalProductionDatabaseReady,
  );
});

describe("production access boundary", () => {
  it("fails closed for the personal UI on the public production domain", async () => {
    process.env.VERCEL_ENV = "production";
    delete process.env.JOBSWIPE_PRODUCTION_UI;

    const response = await proxy(new NextRequest("https://jobswipe.example/profile"));

    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("keeps the authenticated cron endpoint reachable in production", async () => {
    process.env.VERCEL_ENV = "production";
    process.env.JOBSWIPE_PRODUCTION_DATABASE_READY = "true";
    delete process.env.JOBSWIPE_PRODUCTION_UI;

    const response = await proxy(
      new NextRequest("https://jobswipe.example/api/cron/refresh"),
    );

    expect(response.status).toBe(200);
  });

  it("fails the cron before its database path while the release gate is closed", async () => {
    process.env.VERCEL_ENV = "production";
    delete process.env.JOBSWIPE_PRODUCTION_DATABASE_READY;

    const response = await proxy(
      new NextRequest("https://jobswipe.example/api/cron/refresh"),
    );

    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe(
      "database_release_pending",
    );
  });

  it("keeps Apple's association document public without issuing a visitor cookie", async () => {
    process.env.VERCEL_ENV = "production";
    delete process.env.JOBSWIPE_PRODUCTION_UI;

    const response = await proxy(
      new NextRequest(
        "https://jobswipe.example/.well-known/apple-app-site-association",
      ),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("keeps Preview available for Vercel Authentication", async () => {
    process.env.VERCEL_ENV = "preview";

    const response = await proxy(new NextRequest("https://preview.example/saved"));

    expect(response.status).toBe(200);
  });

  it("fails closed when Production auth secrets are missing", async () => {
    enableProductionOwnerAuth();
    delete process.env.JOBSWIPE_SESSION_SECRET;

    const response = await proxy(new NextRequest("https://jobswipe.example/"));

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("keeps the unlock screen public without exposing app data", async () => {
    enableProductionOwnerAuth();

    const response = await proxy(new NextRequest("https://jobswipe.example/unlock"));

    expect(response.status).toBe(200);
  });

  it("opens signed-out product pages with an anonymous visitor session", async () => {
    enableProductionOwnerAuth();

    const response = await proxy(new NextRequest("https://jobswipe.example/profile"));

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("jobswipe_visitor_session=");
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("returns a clean versioned 503 before schema-dependent API v2 routes", async () => {
    enableProductionOwnerAuth();
    delete process.env.JOBSWIPE_PRODUCTION_DATABASE_READY;

    const response = await proxy(
      new NextRequest("https://jobswipe.example/api/v2/feed", {
        headers: { origin: "capacitor://localhost" },
      }),
    );

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("access-control-allow-origin")).toBe(
      "capacitor://localhost",
    );
    expect(response.headers.get("x-jobswipe-api-version")).toBe("2");
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "database_release_pending" },
    });
  });

  it("keeps non-database API v2 capabilities available while gated", async () => {
    enableProductionOwnerAuth();
    delete process.env.JOBSWIPE_PRODUCTION_DATABASE_READY;

    const response = await proxy(
      new NextRequest("https://jobswipe.example/api/v2/auth/capabilities"),
    );

    expect(response.status).toBe(200);
  });

  it("passes public product mutations through with a visitor identity", async () => {
    enableProductionOwnerAuth();

    const response = await proxy(
      new NextRequest("https://jobswipe.example/", { method: "POST" }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("jobswipe_visitor_session=");
  });

  it("keeps hidden admin documents and mutations owner-only", async () => {
    enableProductionOwnerAuth();

    const document = await proxy(
      new NextRequest("https://jobswipe.example/sources"),
    );
    const mutation = await proxy(
      new NextRequest("https://jobswipe.example/jobs/new", { method: "POST" }),
    );

    expect(document.status).toBe(307);
    expect(document.headers.get("location")).toBe(
      "https://jobswipe.example/unlock",
    );
    expect(mutation.status).toBe(401);
  });

  it("allows a valid signed owner session and disables shared caching", async () => {
    enableProductionOwnerAuth();
    const token = await issueOwnerSessionToken(process.env.JOBSWIPE_SESSION_SECRET!);

    const response = await proxy(
      new NextRequest("https://jobswipe.example/", {
        headers: { cookie: `${OWNER_SESSION_COOKIE}=${token}` },
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("private");
    expect(response.headers.get("vary")).toContain("Cookie");
  });
});

describe("production database release loader", () => {
  it("does not invoke a database loader when Vercel Production is gated", async () => {
    const loader = vi.fn(async () => "database result");

    const result = await loadWhenProductionDatabaseReady(loader, {
      JOBSWIPE_PRODUCTION_DATABASE_READY: undefined,
      VERCEL_ENV: "production",
    });

    expect(result).toEqual({ ready: false });
    expect(loader).not.toHaveBeenCalled();
  });

  it.each([
    ["production", "true"],
    ["preview", undefined],
    [undefined, undefined],
  ] as const)(
    "loads normally for Vercel %s with gate value %s",
    async (vercelEnvironment, databaseReady) => {
      const loader = vi.fn(async () => "database result");

      const result = await loadWhenProductionDatabaseReady(loader, {
        JOBSWIPE_PRODUCTION_DATABASE_READY: databaseReady,
        VERCEL_ENV: vercelEnvironment,
      });

      expect(result).toEqual({ ready: true, value: "database result" });
      expect(loader).toHaveBeenCalledOnce();
    },
  );
});
