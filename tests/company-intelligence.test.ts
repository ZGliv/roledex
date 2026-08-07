import { afterEach, describe, expect, it, vi } from "vitest";

import { getCompanyIntelligence } from "@/features/companies/intelligence";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status,
  });
}

function itemClaim(id: string, qualifiers?: Record<string, unknown[]>) {
  return {
    mainsnak: { datavalue: { value: { id } } },
    qualifiers,
    rank: "normal",
  };
}

describe("company intelligence", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses the trusted company domain to beat an exact-name place", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          search: [
            { id: "Q1", label: "Cresta", description: "place in California" },
            { id: "Q2", label: "Cresta", description: "software company" },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          entities: {
            Q1: {
              id: "Q1",
              labels: { en: { value: "Cresta" } },
              descriptions: { en: { value: "place in California" } },
              sitelinks: { enwiki: { title: "Cresta, California" } },
              claims: {},
            },
            Q2: {
              id: "Q2",
              labels: { en: { value: "Cresta" } },
              descriptions: { en: { value: "American software company" } },
              sitelinks: { enwiki: { title: "Cresta (company)" } },
              claims: {
                P856: [
                  {
                    mainsnak: { datavalue: { value: "https://cresta.com" } },
                    rank: "normal",
                  },
                ],
                P571: [
                  {
                    mainsnak: {
                      datavalue: { value: { time: "+2017-00-00T00:00:00Z" } },
                    },
                    rank: "normal",
                  },
                ],
                P159: [itemClaim("Q3")],
                P452: [itemClaim("Q4")],
                P112: [itemClaim("Q5")],
                P169: [
                  itemClaim("Q6", {
                    P582: [
                      {
                        datavalue: {
                          value: { time: "+2022-00-00T00:00:00Z" },
                        },
                      },
                    ],
                  }),
                  itemClaim("Q7"),
                ],
                P1128: [
                  {
                    mainsnak: { datavalue: { value: { amount: "+450" } } },
                    qualifiers: {
                      P585: [
                        {
                          datavalue: {
                            value: { time: "+2025-00-00T00:00:00Z" },
                          },
                        },
                      ],
                    },
                    rank: "normal",
                  },
                ],
              },
            },
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          query: {
            pages: [
              {
                pageid: 1,
                title: "Cresta (company)",
                canonicalurl: "https://en.wikipedia.org/wiki/Cresta_(company)",
                extract: "Cresta is a software company founded in 2017.",
              },
            ],
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          entities: {
            Q3: { id: "Q3", labels: { en: { value: "Palo Alto" } } },
            Q4: {
              id: "Q4",
              labels: { en: { value: "Artificial intelligence" } },
            },
            Q5: {
              id: "Q5",
              labels: { en: { value: "Founder One" } },
              sitelinks: { enwiki: { title: "Founder One" } },
            },
            Q6: { id: "Q6", labels: { en: { value: "Former CEO" } } },
            Q7: {
              id: "Q7",
              labels: { en: { value: "Current CEO" } },
              sitelinks: { enwiki: { title: "Current CEO" } },
            },
          },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await getCompanyIntelligence(
      "Cresta",
      "cresta.com",
      "About Cresta\nCresta builds software for customer-facing teams.",
    );

    expect(result.status).toBe("verified");
    expect(result.wikipediaUrl).toBe(
      "https://en.wikipedia.org/wiki/Cresta_(company)",
    );
    expect(result.founded).toBe("2017");
    expect(result.headquarters).toEqual(["Palo Alto"]);
    expect(result.employeeCount).toEqual({ asOf: "2025", value: 450 });
    expect(result.notableFigures.map((figure) => figure.name)).toEqual([
      "Current CEO",
      "Founder One",
    ]);
  });

  it("does not invent a company page when only a same-name place matches", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          search: [{ id: "Q1", label: "Cresta", description: "place" }],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          entities: {
            Q1: {
              id: "Q1",
              labels: { en: { value: "Cresta" } },
              descriptions: { en: { value: "place in California" } },
              sitelinks: { enwiki: { title: "Cresta, California" } },
              claims: {},
            },
          },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await getCompanyIntelligence(
      "Cresta",
      "cresta.com",
      "About Cresta\nCresta builds a platform for customer-facing teams and operates globally.",
    );

    expect(result.status).toBe("not_found");
    expect(result.wikipediaUrl).toBeNull();
    expect(result.wikipediaSearchUrl).toContain("search=Cresta");
    expect(result.overviewSource).toBe("employer_listing");
  });

  it("keeps employer-supplied context when Wikimedia is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    const result = await getCompanyIntelligence(
      "Example Labs",
      "example.com",
      "About Example Labs\nExample Labs has built workflow software since 2019 for teams around the world.\n\nAbout the role\nJoin the team.",
    );

    expect(result.status).toBe("unavailable");
    expect(result.officialWebsite).toBe("https://example.com");
    expect(result.overview).toContain("workflow software since 2019");
    expect(result.overviewSource).toBe("employer_listing");
  });
});
