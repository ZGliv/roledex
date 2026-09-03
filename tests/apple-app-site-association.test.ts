import { afterEach, describe, expect, it } from "vitest";

import { GET } from "@/app/.well-known/apple-app-site-association/route";
import { buildAppleAppSiteAssociation } from "@/features/product/apple-app-site-association";

const originalTeamId = process.env.APPLE_TEAM_ID;
const originalBundleId = process.env.JOBSWIPE_BUNDLE_ID;

afterEach(() => {
  if (originalTeamId === undefined) delete process.env.APPLE_TEAM_ID;
  else process.env.APPLE_TEAM_ID = originalTeamId;
  if (originalBundleId === undefined) delete process.env.JOBSWIPE_BUNDLE_ID;
  else process.env.JOBSWIPE_BUNDLE_ID = originalBundleId;
});

describe("Apple app-site association", () => {
  it("builds only for a valid Apple team and reverse-DNS bundle identifier", () => {
    expect(
      buildAppleAppSiteAssociation({
        teamId: "A1B2C3D4E5",
        bundleId: "com.example.jobswipe",
      }),
    ).toMatchObject({
      applinks: {
        details: [
          {
            appID: "A1B2C3D4E5.com.example.jobswipe",
            components: [
              { "/": "/jobs/*" },
              { "/": "/saved" },
              { "/": "/profile" },
            ],
          },
        ],
      },
    });
    expect(
      buildAppleAppSiteAssociation({ teamId: "guess", bundleId: "jobswipe" }),
    ).toBeNull();
  });

  it("fails closed until release identifiers are configured", async () => {
    delete process.env.APPLE_TEAM_ID;
    delete process.env.JOBSWIPE_BUNDLE_ID;
    expect(GET().status).toBe(404);

    process.env.APPLE_TEAM_ID = "A1B2C3D4E5";
    process.env.JOBSWIPE_BUNDLE_ID = "com.example.jobswipe";
    const response = GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.json()).toMatchObject({
      applinks: { details: [{ appID: "A1B2C3D4E5.com.example.jobswipe" }] },
    });
  });
});
