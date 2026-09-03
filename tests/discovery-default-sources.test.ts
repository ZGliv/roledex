import { describe, expect, it } from "vitest";

import { DEFAULT_JOB_SOURCES } from "@/features/discovery/default-sources";

describe("default live source network", () => {
  it("contains a broad, unique provider-key network across all supported ATSs", () => {
    const identities = DEFAULT_JOB_SOURCES.map(
      (source) => `${source.provider}:${source.providerKey}`,
    );
    expect(DEFAULT_JOB_SOURCES.length).toBeGreaterThanOrEqual(60);
    expect(new Set(identities).size).toBe(identities.length);
    expect(new Set(DEFAULT_JOB_SOURCES.map((source) => source.provider))).toEqual(
      new Set(["greenhouse", "lever", "ashby"]),
    );
  });

  it("includes the targeted public implementation-role source set", () => {
    const identities = new Set(
      DEFAULT_JOB_SOURCES.map(
        (source) => `${source.provider}:${source.providerKey}`,
      ),
    );

    expect([...identities]).toEqual(
      expect.arrayContaining([
        "lever:workwave",
        "lever:aledade",
        "ashby:ashby",
        "ashby:govworx",
        "ashby:aurelian",
        "ashby:hellopatient",
        "ashby:raspberry",
      ]),
    );
  });
});
