import { afterEach, describe, expect, it } from "vitest";

import {
  accessPasswordMatches,
  getOwnerAuthConfig,
  issueOwnerSessionToken,
  localOwnerAuthBypassEnabled,
  productionOwnerAuthEnabled,
  verifyOwnerSessionToken,
} from "@/features/auth/session-token";

const originalEnvironment = {
  accessPassword: process.env.JOBSWIPE_ACCESS_PASSWORD,
  productionUi: process.env.JOBSWIPE_PRODUCTION_UI,
  sessionSecret: process.env.JOBSWIPE_SESSION_SECRET,
  nodeEnvironment: process.env.NODE_ENV,
  vercel: process.env.VERCEL,
  vercelEnvironment: process.env.VERCEL_ENV,
};

function restoreEnvironment(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function tamperSignature(token: string) {
  const [header, payload, signature] = token.split(".");
  const replacement = signature.startsWith("a") ? "b" : "a";
  return `${header}.${payload}.${replacement}${signature.slice(1)}`;
}

afterEach(() => {
  restoreEnvironment("JOBSWIPE_ACCESS_PASSWORD", originalEnvironment.accessPassword);
  restoreEnvironment("JOBSWIPE_PRODUCTION_UI", originalEnvironment.productionUi);
  restoreEnvironment("JOBSWIPE_SESSION_SECRET", originalEnvironment.sessionSecret);
  restoreEnvironment("NODE_ENV", originalEnvironment.nodeEnvironment);
  restoreEnvironment("VERCEL", originalEnvironment.vercel);
  restoreEnvironment("VERCEL_ENV", originalEnvironment.vercelEnvironment);
});

describe("owner session tokens", () => {
  const sessionSecret = "session-secret-with-at-least-thirty-two-bytes";

  it("accepts a valid signed token", async () => {
    const token = await issueOwnerSessionToken(sessionSecret);
    await expect(verifyOwnerSessionToken(token, sessionSecret)).resolves.toBe(true);
  });

  it("rejects tampered, malformed, expired, and wrong-secret tokens", async () => {
    const token = await issueOwnerSessionToken(sessionSecret);
    const expiredToken = await issueOwnerSessionToken(
      sessionSecret,
      new Date("2020-01-01T00:00:00.000Z"),
    );

    await expect(
      verifyOwnerSessionToken(tamperSignature(token), sessionSecret),
    ).resolves.toBe(false);
    await expect(verifyOwnerSessionToken("not-a-token", sessionSecret)).resolves.toBe(false);
    await expect(verifyOwnerSessionToken(expiredToken, sessionSecret)).resolves.toBe(false);
    await expect(
      verifyOwnerSessionToken(token, "different-secret-with-at-least-thirty-two-bytes"),
    ).resolves.toBe(false);
  });

  it("compares access passwords without accepting oversized input", () => {
    const expected = "owner-access-password-with-enough-entropy";

    expect(accessPasswordMatches(expected, expected)).toBe(true);
    expect(accessPasswordMatches(`${expected}-wrong`, expected)).toBe(false);
    expect(accessPasswordMatches("x".repeat(257), expected)).toBe(false);
  });

  it("fails closed for missing or weak Production configuration", () => {
    process.env.VERCEL_ENV = "production";
    process.env.JOBSWIPE_PRODUCTION_UI = "enabled";
    process.env.JOBSWIPE_ACCESS_PASSWORD = "short";
    process.env.JOBSWIPE_SESSION_SECRET = "also-short";

    expect(productionOwnerAuthEnabled()).toBe(true);
    expect(getOwnerAuthConfig()).toBeNull();
  });

  it("bypasses owner auth only in a truly local non-production process", () => {
    delete process.env.VERCEL;
    delete process.env.VERCEL_ENV;
    Reflect.set(process.env, "NODE_ENV", "test");
    expect(localOwnerAuthBypassEnabled()).toBe(true);

    process.env.VERCEL_ENV = "preview";
    expect(localOwnerAuthBypassEnabled()).toBe(false);

    delete process.env.VERCEL_ENV;
    Reflect.set(process.env, "NODE_ENV", "production");
    expect(localOwnerAuthBypassEnabled()).toBe(false);
  });
});
