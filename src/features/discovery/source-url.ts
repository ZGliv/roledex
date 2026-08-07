import type { JobSourceProvider } from "@/db/schema";

export type ParsedJobSourceUrl = {
  canonicalUrl: string;
  provider: JobSourceProvider;
  providerKey: string;
};

const SOURCE_KEY_PATTERN = /^[a-z\d_-]{1,100}$/i;
const ATS_HOSTS = new Set([
  "api.ashbyhq.com",
  "api.lever.co",
  "boards-api.greenhouse.io",
  "boards.greenhouse.io",
  "job-boards.greenhouse.io",
  "jobs.ashbyhq.com",
  "jobs.lever.co",
]);

function sourceKey(value: string | null | undefined) {
  if (!value) return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(value).trim();
  } catch {
    return null;
  }
  return SOURCE_KEY_PATTERN.test(decoded) ? decoded.toLowerCase() : null;
}

function pathSegments(url: URL) {
  return url.pathname.split("/").filter(Boolean);
}

function parsedSource(
  provider: JobSourceProvider,
  key: string | null,
  canonicalUrl: (key: string) => string,
): ParsedJobSourceUrl | null {
  return key
    ? { provider, providerKey: key, canonicalUrl: canonicalUrl(key) }
    : null;
}

/**
 * Parses only first-party ATS URLs. Arbitrary career-page URLs are rejected,
 * so source validation can never be turned into an SSRF primitive.
 */
export function parseJobSourceUrl(value: string): ParsedJobSourceUrl {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("Paste a complete HTTPS Greenhouse, Lever, or Ashby job-board URL.");
  }

  if (url.protocol !== "https:") {
    throw new Error("Job-board URLs must use HTTPS.");
  }

  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  const segments = pathSegments(url);
  let result: ParsedJobSourceUrl | null = null;

  if (hostname === "boards.greenhouse.io" || hostname === "job-boards.greenhouse.io") {
    const key =
      segments[0] === "embed" ? sourceKey(url.searchParams.get("for")) : sourceKey(segments[0]);
    result = parsedSource(
      "greenhouse",
      key,
      (providerKey) => `https://job-boards.greenhouse.io/${providerKey}`,
    );
  } else if (hostname === "jobs.lever.co") {
    const key = sourceKey(segments[0]);
    result = parsedSource(
      "lever",
      key,
      (providerKey) => `https://jobs.lever.co/${providerKey}`,
    );
  } else if (hostname === "jobs.ashbyhq.com") {
    result = parsedSource(
      "ashby",
      sourceKey(segments[0]),
      (providerKey) => `https://jobs.ashbyhq.com/${providerKey}`,
    );
  }

  if (!result) {
    throw new Error(
      "That URL is not a recognized Greenhouse, Lever, or Ashby public job board.",
    );
  }
  return result;
}

export function normalizeCompanyDomain(value: string | null | undefined) {
  const raw = value?.trim();
  if (!raw) return null;

  let url: URL;
  try {
    url = new URL(raw.includes("://") ? raw : `https://${raw}`);
  } catch {
    throw new Error("Enter a valid company domain, such as example.com.");
  }

  const hostname = url.hostname.toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
  const isIpv4 = /^(?:\d{1,3}\.){3}\d{1,3}$/.test(hostname);
  if (
    (url.protocol !== "https:" && url.protocol !== "http:") ||
    !hostname.includes(".") ||
    hostname.length > 253 ||
    isIpv4 ||
    hostname.endsWith(".local") ||
    ATS_HOSTS.has(hostname)
  ) {
    throw new Error("Enter the company’s own public domain, such as example.com.");
  }
  return hostname;
}

export function sourceLabelFromKey(providerKey: string) {
  return providerKey
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function canonicalJobSourceUrl(
  provider: JobSourceProvider,
  providerKey: string,
) {
  if (provider === "greenhouse") {
    return `https://job-boards.greenhouse.io/${encodeURIComponent(providerKey)}`;
  }
  if (provider === "lever") {
    return `https://jobs.lever.co/${encodeURIComponent(providerKey)}`;
  }
  return `https://jobs.ashbyhq.com/${encodeURIComponent(providerKey)}`;
}
