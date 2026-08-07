import { randomUUID } from "node:crypto";

import { NextRequest } from "next/server";
import { afterEach, describe, expect, it } from "vitest";

import {
  issueOwnerSessionToken,
  OWNER_SESSION_COOKIE,
} from "@/features/auth/session-token";
import {
  getVisitorSessionSecret,
  issueVisitorSessionToken,
  OWNER_VISITOR_ID,
  verifyVisitorSessionToken,
  VISITOR_SESSION_COOKIE,
  VISITOR_SESSION_MAX_AGE_SECONDS,
} from "@/features/auth/visitor-session-token";
import { getCurrentVisitorId } from "@/features/auth/visitor";
import { proxy } from "@/proxy";

const originalEnvironment = {
  accessPassword: process.env.JOBSWIPE_ACCESS_PASSWORD,
  productionUi: process.env.JOBSWIPE_PRODUCTION_UI,
  sessionSecret: process.env.JOBSWIPE_SESSION_SECRET,
  visitorSecret: process.env.JOBSWIPE_VISITOR_SESSION_SECRET,
  vercel: process.env.VERCEL,
  vercelEnvironment: process.env.VERCEL_ENV,
  nodeEnvironment: process.env.NODE_ENV,
};
const sessionSecret = "session-secret-with-at-least-thirty-two-bytes";

function restoreEnvironment(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function tamperSignature(token: string) {
  const [header, payload, signature] = token.split(".");
  const replacement = signature.startsWith("a") ? "b" : "a";
  return `${header}.${payload}.${replacement}${signature.slice(1)}`;
}

function enableProduction() {
  process.env.VERCEL_ENV = "production";
  process.env.JOBSWIPE_PRODUCTION_UI = "enabled";
  process.env.JOBSWIPE_ACCESS_PASSWORD =
    "owner-access-password-with-enough-entropy";
  process.env.JOBSWIPE_SESSION_SECRET = sessionSecret;
}

afterEach(() => {
  restoreEnvironment("JOBSWIPE_ACCESS_PASSWORD", originalEnvironment.accessPassword);
  restoreEnvironment("JOBSWIPE_PRODUCTION_UI", originalEnvironment.productionUi);
  restoreEnvironment("JOBSWIPE_SESSION_SECRET", originalEnvironment.sessionSecret);
  restoreEnvironment(
    "JOBSWIPE_VISITOR_SESSION_SECRET",
    originalEnvironment.visitorSecret,
  );
  restoreEnvironment("VERCEL_ENV", originalEnvironment.vercelEnvironment);
  restoreEnvironment("VERCEL", originalEnvironment.vercel);
  restoreEnvironment("NODE_ENV", originalEnvironment.nodeEnvironment);
});

describe("anonymous visitor sessions", () => {
  it("round-trips only an untampered visitor identity", async () => {
    const visitorId = randomUUID();
    const token = await issueVisitorSessionToken(visitorId, sessionSecret);

    await expect(verifyVisitorSessionToken(token, sessionSecret)).resolves.toBe(
      visitorId,
    );
    await expect(
      verifyVisitorSessionToken(tamperSignature(token), sessionSecret),
    ).resolves.toBeNull();
    await expect(
      verifyVisitorSessionToken(token, `${sessionSecret}-different`),
    ).resolves.toBeNull();
  });

  it("fails closed without a strong secret in production", () => {
    process.env.VERCEL_ENV = "production";
    delete process.env.JOBSWIPE_VISITOR_SESSION_SECRET;
    delete process.env.JOBSWIPE_SESSION_SECRET;

    expect(getVisitorSessionSecret()).toBeNull();
  });

  it("never falls back to the owner identity in a non-Vercel production process", async () => {
    delete process.env.VERCEL;
    delete process.env.VERCEL_ENV;
    delete process.env.JOBSWIPE_VISITOR_SESSION_SECRET;
    delete process.env.JOBSWIPE_SESSION_SECRET;
    Reflect.set(process.env, "NODE_ENV", "production");

    await expect(getCurrentVisitorId()).rejects.toThrow();
  });

  it("issues a one-year HttpOnly, Secure, SameSite=Lax cookie", async () => {
    enableProduction();
    const response = await proxy(new NextRequest("https://jobswipe.example/"));
    const setCookie = response.headers.get("set-cookie") ?? "";

    expect(response.status).toBe(200);
    expect(setCookie).toContain(`${VISITOR_SESSION_COOKIE}=`);
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Secure");
    expect(setCookie).toContain("SameSite=lax");
    expect(setCookie).toContain(`Max-Age=${VISITOR_SESSION_MAX_AGE_SECONDS}`);
  });

  it("overwrites a client-supplied visitor header with the signed identity", async () => {
    enableProduction();
    const spoofedVisitorId = randomUUID();
    const response = await proxy(
      new NextRequest("https://jobswipe.example/", {
        headers: { "x-jobswipe-visitor-id": spoofedVisitorId },
      }),
    );
    const visitorToken = response.cookies.get(VISITOR_SESSION_COOKIE)?.value;
    const issuedVisitorId = await verifyVisitorSessionToken(
      visitorToken,
      sessionSecret,
    );

    expect(issuedVisitorId).toMatch(/^[0-9a-f-]{36}$/);
    expect(issuedVisitorId).not.toBe(spoofedVisitorId);
    expect(
      response.headers.get("x-middleware-request-x-jobswipe-visitor-id"),
    ).toBe(issuedVisitorId);
  });

  it("replaces a guest identity with the durable owner identity", async () => {
    enableProduction();
    const guestToken = await issueVisitorSessionToken(randomUUID(), sessionSecret);
    const ownerToken = await issueOwnerSessionToken(sessionSecret);
    const response = await proxy(
      new NextRequest("https://jobswipe.example/", {
        headers: {
          cookie: `${VISITOR_SESSION_COOKIE}=${guestToken}; ${OWNER_SESSION_COOKIE}=${ownerToken}`,
        },
      }),
    );
    const visitorCookie = response.cookies.get(VISITOR_SESSION_COOKIE)?.value;

    expect(visitorCookie).toBeTruthy();
    await expect(
      verifyVisitorSessionToken(visitorCookie, sessionSecret),
    ).resolves.toBe(OWNER_VISITOR_ID);
  });

  it("never accepts the owner visitor identity without current owner auth", async () => {
    enableProduction();
    const staleOwnerVisitorToken = await issueVisitorSessionToken(
      OWNER_VISITOR_ID,
      sessionSecret,
    );
    const response = await proxy(
      new NextRequest("https://jobswipe.example/", {
        headers: {
          cookie: `${VISITOR_SESSION_COOKIE}=${staleOwnerVisitorToken}`,
        },
      }),
    );
    const replacement = response.cookies.get(VISITOR_SESSION_COOKIE)?.value;
    const replacementVisitorId = await verifyVisitorSessionToken(
      replacement,
      sessionSecret,
    );

    expect(replacementVisitorId).toMatch(/^[0-9a-f-]{36}$/);
    expect(replacementVisitorId).not.toBe(OWNER_VISITOR_ID);
  });

  it("rolls a visitor identity forward before its one-year cookie expires", async () => {
    enableProduction();
    const visitorId = randomUUID();
    const oldToken = await issueVisitorSessionToken(
      visitorId,
      sessionSecret,
      new Date(Date.now() - 280 * 24 * 60 * 60 * 1_000),
    );
    const response = await proxy(
      new NextRequest("https://jobswipe.example/", {
        headers: { cookie: `${VISITOR_SESSION_COOKIE}=${oldToken}` },
      }),
    );
    const renewedToken = response.cookies.get(VISITOR_SESSION_COOKIE)?.value;

    expect(renewedToken).toBeTruthy();
    expect(renewedToken).not.toBe(oldToken);
    await expect(
      verifyVisitorSessionToken(renewedToken, sessionSecret),
    ).resolves.toBe(visitorId);
  });
});
