import { afterEach, describe, expect, it } from "vitest";

import { POST as logout } from "@/app/api/auth/logout/route";
import { POST as unlock } from "@/app/api/auth/unlock/route";
import { OWNER_SESSION_COOKIE } from "@/features/auth/session-token";
import { clearAdminUnlockFailures } from "@/features/auth/unlock-rate-limit";
import {
  OWNER_VISITOR_ID,
  verifyVisitorSessionToken,
  VISITOR_SESSION_COOKIE,
} from "@/features/auth/visitor-session-token";

const originalEnvironment = {
  accessPassword: process.env.JOBSWIPE_ACCESS_PASSWORD,
  cookieSecure: process.env.JOBSWIPE_SESSION_COOKIE_SECURE,
  productionUi: process.env.JOBSWIPE_PRODUCTION_UI,
  sessionSecret: process.env.JOBSWIPE_SESSION_SECRET,
  visitorSecret: process.env.JOBSWIPE_VISITOR_SESSION_SECRET,
  vercelEnvironment: process.env.VERCEL_ENV,
};

function restoreEnvironment(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function enableProductionOwnerAuth() {
  process.env.VERCEL_ENV = "production";
  process.env.JOBSWIPE_PRODUCTION_UI = "enabled";
  process.env.JOBSWIPE_ACCESS_PASSWORD = "owner-access-password-with-enough-entropy";
  process.env.JOBSWIPE_SESSION_SECRET = "session-secret-with-at-least-thirty-two-bytes";
}

function unlockRequest(accessPassword: string, origin = "https://jobswipe.example") {
  return new Request("https://jobswipe.example/api/auth/unlock", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      origin,
    },
    body: new URLSearchParams({ accessPassword }),
  });
}

afterEach(() => {
  clearAdminUnlockFailures();
  restoreEnvironment("JOBSWIPE_ACCESS_PASSWORD", originalEnvironment.accessPassword);
  restoreEnvironment("JOBSWIPE_SESSION_COOKIE_SECURE", originalEnvironment.cookieSecure);
  restoreEnvironment("JOBSWIPE_PRODUCTION_UI", originalEnvironment.productionUi);
  restoreEnvironment("JOBSWIPE_SESSION_SECRET", originalEnvironment.sessionSecret);
  restoreEnvironment(
    "JOBSWIPE_VISITOR_SESSION_SECRET",
    originalEnvironment.visitorSecret,
  );
  restoreEnvironment("VERCEL_ENV", originalEnvironment.vercelEnvironment);
});

describe("owner auth routes", () => {
  it("sets a hardened persistent cookie after a correct access password", async () => {
    enableProductionOwnerAuth();

    const response = await unlock(
      unlockRequest("owner-access-password-with-enough-entropy"),
    );
    const cookie = response.headers.get("set-cookie") ?? "";

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://jobswipe.example/");
    expect(cookie).toContain(`${OWNER_SESSION_COOKIE}=`);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=lax");
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("Max-Age=15552000");
    expect(cookie).toContain(`${VISITOR_SESSION_COOKIE}=`);
  });

  it("signs the owner visitor identity with a separately configured visitor secret", async () => {
    enableProductionOwnerAuth();
    const visitorSecret = "separate-visitor-secret-with-at-least-thirty-two-bytes";
    process.env.JOBSWIPE_VISITOR_SESSION_SECRET = visitorSecret;

    const response = await unlock(
      unlockRequest("owner-access-password-with-enough-entropy"),
    );
    const visitorToken = response.cookies.get(VISITOR_SESSION_COOKIE)?.value;

    expect(visitorToken).toBeTruthy();
    await expect(
      verifyVisitorSessionToken(visitorToken, visitorSecret),
    ).resolves.toBe(OWNER_VISITOR_ID);
    await expect(
      verifyVisitorSessionToken(
        visitorToken,
        process.env.JOBSWIPE_SESSION_SECRET!,
      ),
    ).resolves.toBeNull();
  });

  it("sets no session cookie after a wrong password", async () => {
    enableProductionOwnerAuth();

    const response = await unlock(unlockRequest("the-wrong-password-entirely"));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toContain("error=invalid");
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("temporarily blocks repeated administrator-key failures", async () => {
    enableProductionOwnerAuth();
    for (let attempt = 0; attempt < 8; attempt += 1) {
      await unlock(unlockRequest(`wrong-key-${attempt}-with-enough-padding`));
    }

    const response = await unlock(
      unlockRequest("owner-access-password-with-enough-entropy"),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toContain("error=invalid");
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("supports signed administrator access in Preview", async () => {
    enableProductionOwnerAuth();
    process.env.VERCEL_ENV = "preview";

    const response = await unlock(
      unlockRequest("owner-access-password-with-enough-entropy"),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("set-cookie")).toContain(OWNER_SESSION_COOKIE);
  });

  it("rejects cross-origin unlock attempts", async () => {
    enableProductionOwnerAuth();

    const response = await unlock(
      unlockRequest("owner-access-password-with-enough-entropy", "https://attacker.example"),
    );

    expect(response.status).toBe(403);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("accepts a same-origin Referer when a browser omits Origin", async () => {
    enableProductionOwnerAuth();
    const request = new Request("https://jobswipe.example/api/auth/unlock", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        referer: "https://jobswipe.example/unlock",
      },
      body: new URLSearchParams({
        accessPassword: "owner-access-password-with-enough-entropy",
      }),
    });

    const response = await unlock(request);

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://jobswipe.example/");
    expect(response.headers.get("set-cookie")).toContain(OWNER_SESSION_COOKIE);
  });

  it("accepts the browser Host when Next canonicalizes the local request URL", async () => {
    enableProductionOwnerAuth();
    const request = new Request("http://localhost:3101/api/auth/unlock", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        host: "127.0.0.1:3101",
        origin: "http://127.0.0.1:3101",
      },
      body: new URLSearchParams({
        accessPassword: "owner-access-password-with-enough-entropy",
      }),
    });

    const response = await unlock(request);

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://127.0.0.1:3101/");
    expect(response.headers.get("set-cookie")).toContain(OWNER_SESSION_COOKIE);
  });

  it("clears admin auth and rotates the owner identity to a fresh guest", async () => {
    enableProductionOwnerAuth();
    const response = await logout(
      new Request("https://jobswipe.example/api/auth/logout", {
        method: "POST",
        headers: { origin: "https://jobswipe.example" },
      }),
    );
    const cookie = response.headers.get("set-cookie") ?? "";

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://jobswipe.example/");
    expect(cookie).toContain(`${OWNER_SESSION_COOKIE}=`);
    expect(cookie).toContain("Max-Age=0");
    const visitorToken = response.cookies.get(VISITOR_SESSION_COOKIE)?.value;
    const visitorId = await verifyVisitorSessionToken(
      visitorToken,
      process.env.JOBSWIPE_SESSION_SECRET!,
    );
    expect(visitorId).toMatch(/^[0-9a-f-]{36}$/);
    expect(visitorId).not.toBe(OWNER_VISITOR_ID);
  });
});
