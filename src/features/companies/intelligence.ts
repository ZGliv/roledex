import "server-only";

import { z } from "zod";

import type {
  CompanyEmployeeCount,
  CompanyFigure,
  CompanyIntelligence,
  CompanyResearchStatus,
} from "@/features/jobs/dossier";

const WIKIMEDIA_CACHE_SECONDS = 60 * 60 * 24 * 21;
const WIKIMEDIA_MAX_RESPONSE_BYTES = 2_000_000;
const WIKIMEDIA_REQUEST_TIMEOUT_MS = 5_500;
const WIKIMEDIA_USER_AGENT =
  "RoleDex/1.0 (https://getroledex.vercel.app; company research for job seekers)";

const wikidataSearchSchema = z
  .object({
    search: z.array(
      z
        .object({
          description: z.string().optional(),
          id: z.string().regex(/^Q\d+$/),
          label: z.string().optional(),
        })
        .passthrough(),
    ),
  })
  .passthrough();

const wikidataSnakSchema = z
  .object({
    datavalue: z
      .object({ value: z.unknown() })
      .passthrough()
      .optional(),
  })
  .passthrough();

const wikidataClaimSchema = z
  .object({
    mainsnak: wikidataSnakSchema,
    qualifiers: z
      .record(z.string(), z.array(wikidataSnakSchema))
      .optional(),
    rank: z.enum(["deprecated", "normal", "preferred"]).optional(),
  })
  .passthrough();

const wikidataEntitySchema = z
  .object({
    claims: z
      .record(z.string(), z.array(wikidataClaimSchema))
      .optional(),
    descriptions: z
      .record(
        z.string(),
        z.object({ value: z.string() }).passthrough(),
      )
      .optional(),
    id: z.string(),
    labels: z
      .record(
        z.string(),
        z.object({ value: z.string() }).passthrough(),
      )
      .optional(),
    sitelinks: z
      .record(
        z.string(),
        z.object({ title: z.string() }).passthrough(),
      )
      .optional(),
  })
  .passthrough();

const wikidataEntitiesSchema = z
  .object({
    entities: z.record(z.string(), wikidataEntitySchema),
  })
  .passthrough();

const wikipediaPageSchema = z
  .object({
    canonicalurl: z.string().url().optional(),
    extract: z.string().optional(),
    fullurl: z.string().url().optional(),
    missing: z.boolean().optional(),
    pageid: z.number().optional(),
    title: z.string(),
  })
  .passthrough();

const wikipediaQuerySchema = z
  .object({
    query: z
      .object({ pages: z.array(wikipediaPageSchema).optional() })
      .passthrough()
      .optional(),
  })
  .passthrough();

type WikidataClaim = z.infer<typeof wikidataClaimSchema>;
type WikidataEntity = z.infer<typeof wikidataEntitySchema>;

function wikimediaUrl(host: string, parameters: Record<string, string>) {
  const url = new URL(`https://${host}/w/api.php`);
  for (const [key, value] of Object.entries(parameters)) {
    url.searchParams.set(key, value);
  }
  return url;
}

async function fetchWikimediaJson<T>(
  url: URL,
  schema: z.ZodType<T>,
): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": WIKIMEDIA_USER_AGENT,
    },
    next: { revalidate: WIKIMEDIA_CACHE_SECONDS },
    signal: AbortSignal.timeout(WIKIMEDIA_REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Wikimedia request failed with ${response.status}.`);
  }

  const declaredLength = Number(response.headers.get("content-length"));
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > WIKIMEDIA_MAX_RESPONSE_BYTES
  ) {
    throw new Error("Wikimedia response exceeded the safe size limit.");
  }

  const body = await response.text();
  if (body.length > WIKIMEDIA_MAX_RESPONSE_BYTES) {
    throw new Error("Wikimedia response exceeded the safe size limit.");
  }

  return schema.parse(JSON.parse(body) as unknown);
}

function normalizedCompanyName(value: string) {
  return value
    .toLocaleLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/\b(?:incorporated|corporation|corp|company|co|limited|ltd)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizedDomain(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = value.includes("://") ? new URL(value) : new URL(`https://${value}`);
    return url.hostname.toLocaleLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

function domainsMatch(left: string | null, right: string | null) {
  if (!left || !right) return false;
  return left === right || left.endsWith(`.${right}`) || right.endsWith(`.${left}`);
}

function rankedClaims(entity: WikidataEntity, property: string) {
  const claims = (entity.claims?.[property] ?? []).filter(
    (claim) => claim.rank !== "deprecated" && claim.mainsnak.datavalue,
  );
  const preferred = claims.filter((claim) => claim.rank === "preferred");
  return preferred.length > 0 ? preferred : claims;
}

function activeClaims(entity: WikidataEntity, property: string) {
  const claims = rankedClaims(entity, property);
  const current = claims.filter((claim) => !claim.qualifiers?.P582?.length);
  return current.length > 0 ? current : claims.slice(0, 1);
}

function claimValue(claim: WikidataClaim | undefined): unknown {
  return claim?.mainsnak.datavalue?.value;
}

function itemIdFromValue(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const id = "id" in value ? value.id : null;
  return typeof id === "string" && /^Q\d+$/.test(id) ? id : null;
}

function itemIds(entity: WikidataEntity, property: string, activeOnly = false) {
  const claims = activeOnly
    ? activeClaims(entity, property)
    : rankedClaims(entity, property);
  return claims
    .map((claim) => itemIdFromValue(claimValue(claim)))
    .filter((id): id is string => Boolean(id));
}

function stringClaim(entity: WikidataEntity, property: string) {
  const value = claimValue(rankedClaims(entity, property)[0]);
  return typeof value === "string" ? value : null;
}

function yearFromValue(value: unknown) {
  if (!value || typeof value !== "object" || !("time" in value)) return null;
  const time = value.time;
  if (typeof time !== "string") return null;
  const match = /^[+]?(\d{1,6})-/.exec(time);
  return match?.[1]?.replace(/^0+(?=\d)/, "") ?? null;
}

function wikipediaUrlForTitle(title: string | null | undefined) {
  return title
    ? `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`
    : null;
}

function entityLabel(entity: WikidataEntity | undefined, fallback: string) {
  return entity?.labels?.en?.value?.trim() || fallback;
}

function entityWikipediaUrl(entity: WikidataEntity | undefined) {
  return wikipediaUrlForTitle(entity?.sitelinks?.enwiki?.title);
}

function officialWebsite(entity: WikidataEntity) {
  return stringClaim(entity, "P856");
}

function looksLikeOrganization(description: string) {
  return /\b(?:business|company|corporation|developer|enterprise|firm|manufacturer|organization|platform|software|startup|technology|website)\b/i.test(
    description,
  );
}

function selectCompanyEntity(
  company: string,
  companyDomain: string | null,
  candidateIds: readonly string[],
  entities: Record<string, WikidataEntity>,
) {
  const companyKey = normalizedCompanyName(company);
  const expectedDomain = normalizedDomain(companyDomain);
  const ranked = candidateIds.flatMap((id, index) => {
    const entity = entities[id];
    if (!entity) return [];

    const label = entityLabel(entity, "");
    const labelKey = normalizedCompanyName(label);
    const description = entity.descriptions?.en?.value ?? "";
    const websiteDomain = normalizedDomain(officialWebsite(entity));
    const domainMatch = domainsMatch(expectedDomain, websiteDomain);
    const exactLabel = Boolean(companyKey && labelKey === companyKey);
    const relatedLabel = Boolean(
      companyKey &&
        labelKey &&
        (labelKey.startsWith(`${companyKey} `) || companyKey.startsWith(`${labelKey} `)),
    );
    const organizationDescription = looksLikeOrganization(description);
    const hasEnglishWikipedia = Boolean(entity.sitelinks?.enwiki?.title);
    const verified =
      domainMatch ||
      ((exactLabel || relatedLabel) &&
        organizationDescription &&
        hasEnglishWikipedia);

    if (!verified) return [];

    const score =
      (domainMatch ? 1_000 : 0) +
      (exactLabel ? 260 : relatedLabel ? 180 : 0) +
      (organizationDescription ? 70 : 0) +
      (hasEnglishWikipedia ? 25 : 0) -
      index;
    return [{ entity, score }];
  });

  return ranked.sort((left, right) => right.score - left.score)[0]?.entity ?? null;
}

function quantityFromClaim(claim: WikidataClaim) {
  const value = claimValue(claim);
  if (!value || typeof value !== "object" || !("amount" in value)) return null;
  const amount = value.amount;
  if (typeof amount !== "string") return null;
  const parsed = Number(amount);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : null;
}

function employeeCount(entity: WikidataEntity): CompanyEmployeeCount | null {
  const counts = rankedClaims(entity, "P1128").flatMap((claim) => {
    const value = quantityFromClaim(claim);
    if (value === null) return [];
    const asOf = yearFromValue(claim.qualifiers?.P585?.[0]?.datavalue?.value);
    return [{ asOf, value }];
  });

  return (
    counts.sort((left, right) => Number(right.asOf ?? 0) - Number(left.asOf ?? 0))[0] ??
    null
  );
}

function employerOverview(descriptionRaw: string, company: string) {
  const normalized = descriptionRaw.replace(/\r\n?/g, "\n");
  const escapedCompany = company.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const headingPattern = new RegExp(
    `(?:^|\\n)\\s*(?:about\\s+(?:us|${escapedCompany})|who\\s+we\\s+are|our\\s+company)\\s*[:\\n]`,
    "i",
  );
  const heading = headingPattern.exec(normalized);
  if (!heading || heading.index === undefined) return null;

  const remainder = normalized.slice(heading.index + heading[0].length).trim();
  const nextHeading = /\n\s*(?:about the role|the role|what you(?:'|’)ll do|responsibilities|requirements|qualifications|benefits|compensation|equal opportunity)\s*[:\n]/i.exec(
    remainder,
  );
  const excerpt = remainder
    .slice(0, nextHeading?.index ?? 1_100)
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return excerpt.length >= 45
    ? `${excerpt.slice(0, 1_100).trim()}${excerpt.length > 1_100 ? "…" : ""}`
    : null;
}

function fallbackCompanyIntelligence(
  company: string,
  companyDomain: string | null,
  descriptionRaw: string,
  status: CompanyResearchStatus,
): CompanyIntelligence {
  const fallbackOverview = employerOverview(descriptionRaw, company);
  const domain = normalizedDomain(companyDomain);
  return {
    description: null,
    employeeCount: null,
    founded: null,
    headquarters: [],
    industries: [],
    notableFigures: [],
    officialWebsite: domain ? `https://${domain}` : null,
    overview: fallbackOverview,
    overviewSource: fallbackOverview ? "employer_listing" : null,
    parentOrganization: null,
    researchedAt: new Date().toISOString(),
    status,
    wikidataUrl: null,
    wikipediaSearchUrl: `https://en.wikipedia.org/w/index.php?search=${encodeURIComponent(company)}`,
    wikipediaTitle: null,
    wikipediaUrl: null,
  };
}

async function loadRelatedEntities(ids: readonly string[]) {
  const uniqueIds = Array.from(new Set(ids)).slice(0, 40);
  if (uniqueIds.length === 0) return {};
  const response = await fetchWikimediaJson(
    wikimediaUrl("www.wikidata.org", {
      action: "wbgetentities",
      format: "json",
      ids: uniqueIds.join("|"),
      languages: "en",
      props: "labels|sitelinks",
      sitefilter: "enwiki",
    }),
    wikidataEntitiesSchema,
  );
  return response.entities;
}

function labelList(
  ids: readonly string[],
  related: Record<string, WikidataEntity>,
) {
  return Array.from(new Set(ids.map((id) => entityLabel(related[id], id)))).slice(
    0,
    8,
  );
}

function notableFigures(
  entity: WikidataEntity,
  related: Record<string, WikidataEntity>,
) {
  const figures = new Map<string, { name: string; roles: Set<string> }>();
  const roles = [
    { ids: itemIds(entity, "P169", true), label: "Chief executive officer" },
    { ids: itemIds(entity, "P112"), label: "Founder" },
    { ids: itemIds(entity, "P488", true), label: "Chairperson" },
  ];

  for (const role of roles) {
    for (const id of role.ids) {
      const existing = figures.get(id) ?? {
        name: entityLabel(related[id], id),
        roles: new Set<string>(),
      };
      existing.roles.add(role.label);
      figures.set(id, existing);
    }
  }

  return Array.from(figures.entries())
    .slice(0, 8)
    .map(([id, figure]): CompanyFigure => ({
      name: figure.name,
      roles: Array.from(figure.roles),
      wikipediaUrl: entityWikipediaUrl(related[id]),
    }));
}

export async function getCompanyIntelligence(
  company: string,
  companyDomain: string | null,
  descriptionRaw: string,
): Promise<CompanyIntelligence> {
  const fallback = (status: CompanyResearchStatus) =>
    fallbackCompanyIntelligence(
      company,
      companyDomain,
      descriptionRaw,
      status,
    );

  try {
    const search = await fetchWikimediaJson(
      wikimediaUrl("www.wikidata.org", {
        action: "wbsearchentities",
        format: "json",
        language: "en",
        limit: "8",
        search: company,
        type: "item",
      }),
      wikidataSearchSchema,
    );
    const candidateIds = search.search.map((candidate) => candidate.id);
    if (candidateIds.length === 0) return fallback("not_found");

    const entityResponse = await fetchWikimediaJson(
      wikimediaUrl("www.wikidata.org", {
        action: "wbgetentities",
        format: "json",
        ids: candidateIds.join("|"),
        languages: "en",
        props: "labels|descriptions|claims|sitelinks",
        sitefilter: "enwiki",
      }),
      wikidataEntitiesSchema,
    );
    const entity = selectCompanyEntity(
      company,
      companyDomain,
      candidateIds,
      entityResponse.entities,
    );
    if (!entity) return fallback("not_found");

    const wikipediaTitle = entity.sitelinks?.enwiki?.title ?? null;
    const wikipediaResponse = wikipediaTitle
      ? await fetchWikimediaJson(
          wikimediaUrl("en.wikipedia.org", {
            action: "query",
            exintro: "1",
            explaintext: "1",
            exsentences: "5",
            format: "json",
            formatversion: "2",
            inprop: "url",
            prop: "extracts|info",
            redirects: "1",
            titles: wikipediaTitle,
          }),
          wikipediaQuerySchema,
        )
      : null;
    const wikipediaPage = wikipediaResponse?.query?.pages?.find(
      (page) => !page.missing,
    );

    const headquartersIds = itemIds(entity, "P159");
    const industryIds = itemIds(entity, "P452");
    const parentIds = itemIds(entity, "P749");
    const figureIds = [
      ...itemIds(entity, "P169", true),
      ...itemIds(entity, "P112"),
      ...itemIds(entity, "P488", true),
    ];
    const related = await loadRelatedEntities([
      ...headquartersIds,
      ...industryIds,
      ...parentIds,
      ...figureIds,
    ]);
    const domain = normalizedDomain(companyDomain);
    const website = officialWebsite(entity) ?? (domain ? `https://${domain}` : null);
    const wikipediaUrl =
      wikipediaPage?.canonicalurl ??
      wikipediaPage?.fullurl ??
      wikipediaUrlForTitle(wikipediaTitle);
    const wikipediaOverview = wikipediaPage?.extract?.trim() || null;
    const listingOverview = employerOverview(descriptionRaw, company);

    return {
      description: entity.descriptions?.en?.value ?? null,
      employeeCount: employeeCount(entity),
      founded: yearFromValue(claimValue(rankedClaims(entity, "P571")[0])),
      headquarters: labelList(headquartersIds, related),
      industries: labelList(industryIds, related),
      notableFigures: notableFigures(entity, related),
      officialWebsite: website,
      overview: wikipediaOverview ?? listingOverview,
      overviewSource: wikipediaOverview
        ? "wikipedia"
        : listingOverview
          ? "employer_listing"
          : null,
      parentOrganization: parentIds[0]
        ? entityLabel(related[parentIds[0]], parentIds[0])
        : null,
      researchedAt: new Date().toISOString(),
      status: "verified",
      wikidataUrl: `https://www.wikidata.org/wiki/${entity.id}`,
      wikipediaSearchUrl: `https://en.wikipedia.org/w/index.php?search=${encodeURIComponent(company)}`,
      wikipediaTitle,
      wikipediaUrl,
    };
  } catch {
    return fallback("unavailable");
  }
}
