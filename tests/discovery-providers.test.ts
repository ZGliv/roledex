import { describe, expect, it, vi } from "vitest";

import {
  fetchAshbyJobs,
  fetchGreenhouseJobs,
  fetchLeverJobs,
} from "@/features/discovery/providers";
import type { DiscoveryFetch } from "@/features/discovery/types";

function jsonResponse(value: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json", ...init?.headers },
    ...init,
  });
}

describe("public job discovery providers", () => {
  it("normalizes and bounds Greenhouse jobs without treating updated_at as postedAt", async () => {
    const fetcher = vi.fn<DiscoveryFetch>(async () =>
      jsonResponse({
        jobs: [
          {
            id: 127817,
            title: "Implementation Specialist",
            updated_at: "2026-08-03T10:55:28-05:00",
            location: { name: "Remote — US" },
            absolute_url: "https://boards.greenhouse.io/acme/jobs/127817",
            content:
              "&amp;lt;p&amp;gt;Help customers &amp;amp; ship software.&amp;lt;/p&amp;gt;<script>ignore()</script>",
          },
          {
            id: 127818,
            title: "Second role",
            updated_at: "2026-08-03T10:55:28-05:00",
            location: { name: "New York, NY" },
            absolute_url: "https://boards.greenhouse.io/acme/jobs/127818",
            content: "<p>Second description</p>",
          },
        ],
        meta: { total: 2 },
      }),
    );

    const batch = await fetchGreenhouseJobs(
      { company: "Acme Health", boardToken: "acme" },
      { fetcher, maxItems: 1 },
    );

    expect(fetcher).toHaveBeenCalledOnce();
    expect(String(fetcher.mock.calls[0]?.[0])).toBe(
      "https://boards-api.greenhouse.io/v1/boards/acme/jobs?content=true",
    );
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({
      cache: "no-store",
      redirect: "error",
    });
    expect(batch).toMatchObject({
      source: { provider: "greenhouse", sourceId: "acme", company: "Acme Health" },
      truncated: true,
      totalReported: 2,
    });
    expect(batch.jobs).toHaveLength(1);
    expect(batch.jobs[0]).toMatchObject({
      provider: "greenhouse",
      externalId: "127817",
      descriptionText: "Help customers & ship software.",
      postedAt: null,
      updatedAt: "2026-08-03T15:55:28.000Z",
      workArrangement: "remote",
      employmentType: "unknown",
      salary: null,
    });
  });

  it("maps Lever descriptions, employment, workplace, application URL, and salary", async () => {
    const fetcher = vi.fn<DiscoveryFetch>(async () =>
      jsonResponse([
        {
          id: "lever-123",
          text: "Customer Success Engineer",
          categories: {
            location: "Pittsburgh, PA",
            commitment: "Full-time",
            allLocations: ["Pittsburgh, PA"],
          },
          descriptionPlain: "Guide enterprise customers through implementation.",
          lists: [
            { text: "Requirements", content: "<li>Technical troubleshooting</li>" },
          ],
          additionalPlain: "Equal opportunity employer.",
          hostedUrl: "https://jobs.lever.co/acme/lever-123",
          applyUrl: "https://jobs.lever.co/acme/lever-123/apply",
          workplaceType: "hybrid",
          salaryRange: {
            currency: "usd",
            interval: "per-year-salary",
            min: 90_000,
            max: 120_000,
          },
          salaryDescriptionPlain: "$90,000–$120,000 per year",
        },
      ]),
    );

    const batch = await fetchLeverJobs(
      { company: "Acme", site: "acme", instance: "global" },
      { fetcher, maxItems: 3 },
    );

    const requestedUrl = new URL(String(fetcher.mock.calls[0]?.[0]));
    expect(requestedUrl.hostname).toBe("api.lever.co");
    expect(requestedUrl.searchParams.get("mode")).toBe("json");
    expect(requestedUrl.searchParams.get("limit")).toBe("3");
    expect(batch.jobs[0]).toMatchObject({
      provider: "lever",
      externalId: "lever-123",
      postedAt: null,
      workArrangement: "hybrid",
      employmentType: "full_time",
      salary: {
        minimumMajorUnits: 90_000,
        maximumMajorUnits: 120_000,
        currency: "USD",
        period: "year",
        source: "employer_posted",
      },
    });
    expect(batch.jobs[0]?.descriptionText).toContain("Technical troubleshooting");
    expect(batch.jobs[0]?.applyUrl.endsWith("/apply")).toBe(true);
  });

  it("filters unlisted Ashby jobs and maps employer compensation", async () => {
    const fetcher = vi.fn<DiscoveryFetch>(async () =>
      jsonResponse({
        apiVersion: "1",
        jobs: [
          {
            title: "Product Operations Associate",
            location: "United States",
            isListed: true,
            isRemote: true,
            workplaceType: "Remote",
            descriptionHtml: "<p>Improve product systems.</p>",
            publishedAt: "2026-08-02T16:21:55.393+00:00",
            employmentType: "FullTime",
            jobUrl: "https://jobs.ashbyhq.com/acme/ashby-123",
            applyUrl: "https://jobs.ashbyhq.com/acme/ashby-123/application",
            compensation: {
              compensationTierSummary: "$81K – $87K • Offers Bonus",
              scrapeableCompensationSalarySummary: "$81K - $87K",
              summaryComponents: [
                {
                  compensationType: "EquityPercentage",
                  interval: "NONE",
                  currencyCode: null,
                  minValue: 0.5,
                  maxValue: 1.75,
                },
                {
                  compensationType: "Salary",
                  interval: "1 YEAR",
                  currencyCode: "USD",
                  minValue: 81_000,
                  maxValue: 87_000,
                },
              ],
            },
          },
          {
            title: "Unlisted role",
            location: "Remote",
            isListed: false,
            jobUrl: "https://jobs.ashbyhq.com/acme/hidden",
            applyUrl: "https://jobs.ashbyhq.com/acme/hidden/application",
            compensation: {
              compensationTierSummary: null,
              scrapeableCompensationSalarySummary: null,
            },
          },
        ],
      }),
    );

    const batch = await fetchAshbyJobs(
      { company: "Acme AI", jobBoardName: "acme" },
      { fetcher },
    );

    expect(String(fetcher.mock.calls[0]?.[0])).toBe(
      "https://api.ashbyhq.com/posting-api/job-board/acme?includeCompensation=true",
    );
    expect(batch.totalReported).toBe(1);
    expect(batch.jobs).toHaveLength(1);
    expect(batch.jobs[0]).toMatchObject({
      provider: "ashby",
      externalId: "ashby-123",
      descriptionText: "Improve product systems.",
      postedAt: "2026-08-02T16:21:55.393Z",
      workArrangement: "remote",
      employmentType: "full_time",
      salary: {
        minimumMajorUnits: 81_000,
        maximumMajorUnits: 87_000,
        currency: "USD",
        period: "year",
        description: "$81K - $87K",
      },
    });
  });

  it("reports provider-specific schema errors without returning malformed jobs", async () => {
    const fetcher = vi.fn<DiscoveryFetch>(async () =>
      jsonResponse({
        jobs: [{ id: 1, absolute_url: "https://example.com/job", content: "missing title" }],
      }),
    );

    await expect(
      fetchGreenhouseJobs({ company: "Acme", boardToken: "acme" }, { fetcher }),
    ).rejects.toMatchObject({
      name: "DiscoveryProviderError",
      provider: "greenhouse",
      sourceId: "acme",
      code: "invalid_payload",
    });
  });

  it("rejects responses that exceed the byte cap before parsing", async () => {
    const fetcher = vi.fn<DiscoveryFetch>(async () =>
      jsonResponse({ jobs: [] }, { headers: { "content-length": "500" } }),
    );

    await expect(
      fetchGreenhouseJobs(
        { company: "Acme", boardToken: "acme" },
        { fetcher, maxResponseBytes: 100 },
      ),
    ).rejects.toMatchObject({ code: "response_too_large", provider: "greenhouse" });
  });

  it("times out even when an injected fetch does not settle on its own", async () => {
    const fetcher: DiscoveryFetch = (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      });

    await expect(
      fetchLeverJobs(
        { company: "Acme", site: "acme" },
        { fetcher, timeoutMs: 2 },
      ),
    ).rejects.toMatchObject({ code: "timeout", provider: "lever" });
  });
});
