import { describe, expect, it } from "vitest";

import {
  canonicalJobSourceUrl,
  normalizeCompanyDomain,
  parseJobSourceUrl,
} from "@/features/discovery/source-url";

describe("job source URL parsing", () => {
  it("detects supported first-party public boards and normalizes their keys", () => {
    expect(parseJobSourceUrl("https://job-boards.greenhouse.io/Acme/jobs/123")).toEqual({
      canonicalUrl: "https://job-boards.greenhouse.io/acme",
      provider: "greenhouse",
      providerKey: "acme",
    });
    expect(
      parseJobSourceUrl("https://boards.greenhouse.io/embed/job_app?for=Acme_AI"),
    ).toMatchObject({ provider: "greenhouse", providerKey: "acme_ai" });
    expect(parseJobSourceUrl("https://jobs.lever.co/Acme/role-id")).toEqual({
      canonicalUrl: "https://jobs.lever.co/acme",
      provider: "lever",
      providerKey: "acme",
    });
    expect(parseJobSourceUrl("https://jobs.ashbyhq.com/Acme/role-id")).toEqual({
      canonicalUrl: "https://jobs.ashbyhq.com/acme",
      provider: "ashby",
      providerKey: "acme",
    });
  });

  it("rejects arbitrary, lookalike, API, insecure, and EU Lever hosts", () => {
    const rejected = [
      "https://careers.example.com/jobs",
      "https://jobs.ashbyhq.com.evil.example/acme",
      "https://jobs.ashbyhq.com@evil.example/acme",
      "https://api.ashbyhq.com/posting-api/job-board/acme",
      "https://api.lever.co/v0/postings/acme",
      "https://jobs.eu.lever.co/acme",
      "http://jobs.lever.co/acme",
    ];
    for (const value of rejected) {
      expect(() => parseJobSourceUrl(value), value).toThrow();
    }
  });

  it("normalizes only a company-owned public domain", () => {
    expect(normalizeCompanyDomain("https://www.Example.com/about")).toBe("example.com");
    expect(normalizeCompanyDomain(" example.com ")).toBe("example.com");
    expect(normalizeCompanyDomain("")).toBeNull();
    expect(() => normalizeCompanyDomain("localhost")).toThrow();
    expect(() => normalizeCompanyDomain("127.0.0.1")).toThrow();
    expect(() => normalizeCompanyDomain("jobs.ashbyhq.com")).toThrow();
  });

  it("constructs canonical links without accepting a user-controlled host", () => {
    expect(canonicalJobSourceUrl("greenhouse", "acme")).toBe(
      "https://job-boards.greenhouse.io/acme",
    );
    expect(canonicalJobSourceUrl("lever", "acme")).toBe("https://jobs.lever.co/acme");
    expect(canonicalJobSourceUrl("ashby", "acme")).toBe(
      "https://jobs.ashbyhq.com/acme",
    );
  });
});
