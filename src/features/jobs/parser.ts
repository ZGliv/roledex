import {
  JOB_PARSER_VERSION,
  type Confidence,
  type EligibilityRequirement,
  type EmploymentType,
  type ExperienceRequirement,
  type JobParseInput,
  type ParseEvidence,
  type ParsedJobListing,
  type ParsedQualification,
  type ParsedSalary,
  type ParsedValue,
  type QualificationKind,
  type RemoteRestriction,
  type SalaryPeriod,
  type SalarySource,
  type SeniorityLevel,
  type TechnologyMention,
  type TravelRequirement,
  type WorkArrangement,
} from "./types";

type SectionKind =
  | "required"
  | "preferred"
  | "responsibilities"
  | "other"
  | null;

interface LineRecord {
  text: string;
  start: number;
  section: SectionKind;
}

interface SalaryCandidate {
  minimumCents: number | null;
  maximumCents: number | null;
  period: SalaryPeriod;
  source: SalarySource;
  confidence: Confidence;
  evidence: ParseEvidence;
}

const TECHNOLOGY_ALIASES: ReadonlyArray<{
  name: string;
  aliases: readonly string[];
}> = [
  { name: "React Native", aliases: ["react native"] },
  { name: "Next.js", aliases: ["next.js", "nextjs"] },
  { name: "Node.js", aliases: ["node.js", "nodejs"] },
  { name: "REST APIs", aliases: ["rest apis", "rest api", "restful api", "restful apis"] },
  { name: "Google Cloud", aliases: ["google cloud", "gcp"] },
  { name: "PostgreSQL", aliases: ["postgresql", "postgres"] },
  { name: "TypeScript", aliases: ["typescript"] },
  { name: "JavaScript", aliases: ["javascript"] },
  { name: "ServiceNow", aliases: ["servicenow"] },
  { name: "Kubernetes", aliases: ["kubernetes", "k8s"] },
  { name: "Supabase", aliases: ["supabase"] },
  { name: "Firebase", aliases: ["firebase"] },
  { name: "Salesforce", aliases: ["salesforce"] },
  { name: "GraphQL", aliases: ["graphql"] },
  { name: "React", aliases: ["react"] },
  { name: "Python", aliases: ["python"] },
  { name: "SQLite", aliases: ["sqlite"] },
  { name: "MySQL", aliases: ["mysql"] },
  { name: "Docker", aliases: ["docker"] },
  { name: "Azure", aliases: ["microsoft azure", "azure"] },
  { name: "AWS", aliases: ["amazon web services", "aws"] },
  { name: "Figma", aliases: ["figma"] },
  { name: "Ollama", aliases: ["ollama"] },
  { name: "Jira", aliases: ["jira"] },
  { name: "LLMs", aliases: ["large language models", "llms", "llm"] },
  { name: "RAG", aliases: ["retrieval augmented generation", "rag"] },
  { name: "SQL", aliases: ["sql"] },
  { name: "Git", aliases: ["git"] },
  { name: "C++", aliases: ["c++"] },
  { name: "C#", aliases: ["c#"] },
  { name: "Java", aliases: ["java"] },
  { name: "Go", aliases: ["golang", "go"] },
  { name: "R", aliases: ["r"] },
] as const;

const INDUSTRIES: ReadonlyArray<{ name: string; pattern: RegExp }> = [
  { name: "Healthcare Technology", pattern: /\b(?:health[ -]?tech|healthcare technology|digital health|hospital software)\b/i },
  { name: "Healthcare", pattern: /\b(?:healthcare|hospital|clinical|medical)\b/i },
  { name: "Artificial Intelligence", pattern: /\b(?:artificial intelligence|machine learning|generative ai)\b/i },
  { name: "Cybersecurity", pattern: /\b(?:cybersecurity|information security|infosec)\b/i },
  { name: "Financial Services", pattern: /\b(?:fintech|financial services|banking|insurance)\b/i },
  { name: "Education Technology", pattern: /\b(?:edtech|education technology)\b/i },
  { name: "Retail / E-commerce", pattern: /\b(?:e-?commerce|retail technology|retail)\b/i },
  { name: "Government", pattern: /\b(?:government|public sector|federal agency)\b/i },
  { name: "Consulting", pattern: /\b(?:management consulting|technology consulting|consultancy)\b/i },
  { name: "SaaS", pattern: /\b(?:saas|software as a service)\b/i },
] as const;

const NUMBER_WORDS: Readonly<Record<string, number>> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};

const MONTHS: Readonly<Record<string, number>> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};

const EMPTY_VALUE = <T>(): ParsedValue<T> => ({
  value: null,
  confidence: null,
  evidence: [],
});

export function cleanJobDescription(raw: string): string {
  return raw
    .replace(/\r\n?/g, "\n")
    .replace(/[\t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function parseJobListing(input: JobParseInput): ParsedJobListing {
  const title = input.title.trim();
  const company = input.company.trim();

  if (!title) {
    throw new Error("A manually confirmed job title is required.");
  }
  if (!company) {
    throw new Error("A manually confirmed company is required.");
  }

  const descriptionClean = cleanJobDescription(input.descriptionRaw);
  const warnings: string[] = [];
  const lineRecords = buildLineRecords(descriptionClean);
  const sectionData = extractSections(lineRecords);
  const salary = extractSalary(
    lineRecords,
    input.salarySourceHint ?? "unknown",
    warnings,
  );
  const workData = extractWorkArrangement(
    descriptionClean,
    input.location?.trim() || null,
    warnings,
  );
  const seniority = extractSeniority(title, descriptionClean, warnings);
  const technologies = extractTechnologies(lineRecords);
  const experienceRequirements = extractExperienceRequirements(lineRecords);

  const largestRequiredYears = Math.max(
    -1,
    ...experienceRequirements
      .filter((requirement) => requirement.kind === "required")
      .map((requirement) => requirement.minimumYears),
  );
  if (seniority.value === "entry" && largestRequiredYears >= 5) {
    warnings.push(
      "The entry-level seniority signal conflicts with a requirement for five or more years of experience.",
    );
  }

  const employmentType = extractEmploymentType(lineRecords);
  const industry = extractIndustry(descriptionClean);
  const travelRequirement = extractTravelRequirement(lineRecords);
  const applicationDeadline = extractApplicationDeadline(lineRecords, warnings);
  const eligibilityRequirements = extractEligibilityRequirements(lineRecords);
  const roleSummary = extractRoleSummary(
    descriptionClean,
    title,
    company,
    input.location?.trim() || null,
  );

  const evidence = [
    ...roleSummary.evidence,
    ...workData.value.evidence,
    ...workData.restrictions.map((restriction) => restriction.evidence),
    ...salary.evidence,
    ...employmentType.evidence,
    ...seniority.evidence,
    ...industry.evidence,
    ...sectionData.qualifications.map((item) => item.evidence),
    ...technologies.map((item) => item.evidence),
    ...experienceRequirements.map((item) => item.evidence),
    ...(travelRequirement ? [travelRequirement.evidence] : []),
    ...applicationDeadline.evidence,
    ...eligibilityRequirements.map((item) => item.evidence),
  ];

  if (salary.minimumCents === null && salary.maximumCents === null) {
    warnings.push("No reliable base salary was found; compensation remains unknown.");
  }
  if (workData.value.value === "unknown") {
    warnings.push("The work arrangement could not be determined from the listing.");
  }

  return {
    parserVersion: JOB_PARSER_VERSION,
    title,
    company,
    location: input.location?.trim() || null,
    descriptionRaw: input.descriptionRaw,
    descriptionClean,
    roleSummary,
    workArrangement: workData.value,
    remoteRestrictions: workData.restrictions,
    salary,
    employmentType,
    seniority,
    industry,
    requiredQualifications: sectionData.qualifications.filter(
      (item) => item.kind === "required",
    ),
    preferredQualifications: sectionData.qualifications.filter(
      (item) => item.kind === "preferred",
    ),
    otherQualifications: sectionData.qualifications.filter(
      (item) => item.kind === "unspecified",
    ),
    responsibilities: sectionData.responsibilities,
    technologies,
    experienceRequirements,
    travelRequirement,
    applicationDeadline,
    eligibilityRequirements,
    evidence,
    warnings: unique(warnings),
  };
}

function buildLineRecords(clean: string): LineRecord[] {
  const records: LineRecord[] = [];
  let offset = 0;
  let currentSection: SectionKind = null;

  for (const rawLine of clean.split("\n")) {
    const text = rawLine.trim();
    const heading = classifyHeading(text);
    if (heading) {
      currentSection = heading.section;
      if (heading.remainder) {
        records.push({
          text: heading.remainder,
          start: offset + rawLine.indexOf(heading.remainder),
          section: currentSection,
        });
      }
    } else if (text) {
      records.push({ text, start: offset + rawLine.indexOf(text), section: currentSection });
    }
    offset += rawLine.length + 1;
  }

  return records;
}

function classifyHeading(
  line: string,
): { section: SectionKind; remainder: string | null } | null {
  const stripped = line.replace(/^#{1,6}\s*/, "").trim();
  const colonIndex = stripped.indexOf(":");
  const candidate = (colonIndex >= 0 ? stripped.slice(0, colonIndex) : stripped)
    .replace(/[*_]/g, "")
    .trim()
    .toLowerCase();
  const remainder = colonIndex >= 0 ? stripped.slice(colonIndex + 1).trim() : null;

  const mappings: Array<{ pattern: RegExp; section: SectionKind }> = [
    {
      pattern: /^(?:required|required qualifications|minimum qualifications|minimum requirements|requirements|qualifications|what you(?:'|’)ll need|what you will need|what you need|must have|what we(?:'|’)re looking for|what we are looking for|who we(?:'|’)re looking for|who we are looking for|what you(?:'|’)ll bring|what you will bring|what you bring|who you are|about you|your background looks something like this|to be successful|ideal candidate|the ideal candidate)$/,
      section: "required",
    },
    {
      pattern: /^(?:preferred|preferred qualifications|preferred experience|preferred skills|desired qualifications|nice to have|nice-to-have|nice to haves|bonus qualifications|bonus points|bonus points if|even better if you have)$/,
      section: "preferred",
    },
    {
      pattern: /^(?:responsibilities|core responsibilities|role responsibilities|what you(?:'|’)ll do|what you will do|what you(?:'|’)ll own|what you will own|what you(?:'|’)ll be doing|what you will be doing|what you(?:'|’)ll work on|what you will work on|your impact|day to day|the role|in this role)$/,
      section: "responsibilities",
    },
    {
      pattern: /^(?:benefits(?:\s+.*)?|our benefits|perks|perks and benefits|about us|about the company|about the role|equal opportunity|equal opportunity employer|compensation|compensation and benefits|salary|how to apply|work environment)$/,
      section: "other",
    },
  ];

  const mapping = mappings.find(({ pattern }) => pattern.test(candidate));
  if (!mapping) return null;
  return { section: mapping.section, remainder: remainder || null };
}

function extractSections(records: LineRecord[]): {
  qualifications: ParsedQualification[];
  responsibilities: string[];
} {
  const qualifications: ParsedQualification[] = [];
  const responsibilities: string[] = [];

  for (const record of records) {
    const item = cleanListItem(record.text);
    if (!item) continue;

    if (record.section === "responsibilities") {
      responsibilities.push(item);
      continue;
    }

    const classifiedKind = qualificationKindFor(record);
    const kind = classifiedKind === "unspecified" ? null : classifiedKind;

    if (kind) {
      qualifications.push({
        text: item,
        kind,
        evidence: evidenceFor("qualifications", record, "description", "high"),
      });
    }
  }

  return {
    qualifications: dedupeBy(qualifications, (item) => `${item.kind}:${normalize(item.text)}`),
    responsibilities: unique(responsibilities),
  };
}

function extractRoleSummary(
  clean: string,
  title: string,
  company: string,
  location: string | null,
): ParsedValue<string> {
  if (!clean) return EMPTY_VALUE<string>();

  const introLines: string[] = [];
  for (const line of clean.split("\n")) {
    const trimmed = cleanListItem(line);
    if (!trimmed) continue;
    if (classifyHeading(trimmed)) break;
    if ([title, company, location].some((value) => value && normalize(value) === normalize(trimmed))) {
      continue;
    }
    if (/^(?:location|salary|pay|job type|employment type)\s*:/i.test(trimmed)) continue;
    if (/\b(?:equal opportunity employer|eeo|401\(k\))\b/i.test(trimmed)) continue;
    if (trimmed.length < 35) continue;
    introLines.push(trimmed);
    if (introLines.join(" ").length >= 360) break;
  }

  const intro = introLines.join(" ").trim();
  if (!intro) return EMPTY_VALUE<string>();
  const sentences = intro.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [intro];
  const selected: string[] = [];
  for (const sentence of sentences) {
    const next = sentence.trim();
    if (!next) continue;
    if (selected.length > 0 && `${selected.join(" ")} ${next}`.length > 360) break;
    selected.push(next);
    if (selected.length === 2) break;
  }
  const summary = selected.join(" ").trim();
  const start = clean.indexOf(selected[0] ?? summary);
  const evidence: ParseEvidence = {
    field: "roleSummary",
    excerpt: summary,
    source: "description",
    confidence: "medium",
    ...(start >= 0 ? { start, end: start + summary.length } : {}),
  };
  return { value: summary, confidence: "medium", evidence: [evidence] };
}

function extractSalary(
  records: LineRecord[],
  sourceHint: SalarySource,
  warnings: string[],
): ParsedSalary {
  const candidates: SalaryCandidate[] = [];
  let sawOteWithoutBase = false;

  for (const record of records) {
    const lower = record.text.toLowerCase();
    const hasSalaryContext = /\b(?:base salary|base pay|salary|pay range|compensation range|hourly rate|wage|per (?:hour|year)|annually)\b/.test(
      lower,
    );
    if (!hasSalaryContext || !/(?:\$|\busd\b)/i.test(record.text)) continue;

    const hasBaseContext = /\bbase\b/.test(lower);
    if (/\bote\b|on[- ]target earnings/i.test(lower) && !hasBaseContext) {
      sawOteWithoutBase = true;
      continue;
    }
    if (
      /\b(?:bonus|stipend|reimbursement|equity|sign[- ]on|wellness|401\s*\(k\))\b/i.test(lower) &&
      !hasBaseContext &&
      !/\b(?:salary|pay range|wage)\b/i.test(lower)
    ) {
      continue;
    }

    const amounts = parseSalaryAmounts(record.text);
    if (!amounts) continue;
    const period = salaryPeriodFor(record.text);
    const source = salarySourceFor(record.text, sourceHint);
    const confidence: Confidence =
      hasBaseContext || /\b(?:salary range|pay range|hourly rate)\b/i.test(lower)
        ? "high"
        : "medium";
    candidates.push({
      ...amounts,
      period,
      source,
      confidence,
      evidence: evidenceFor("salary", record, "description", confidence),
    });
  }

  if (sawOteWithoutBase) {
    warnings.push("OTE was mentioned without a reliable base salary and was not treated as guaranteed pay.");
  }

  if (candidates.length === 0) {
    return {
      minimumCents: null,
      maximumCents: null,
      currency: null,
      period: "unknown",
      source: "unknown",
      confidence: null,
      evidence: [],
      derived: false,
    };
  }

  const first = candidates[0];
  const distinct = unique(
    candidates.map(
      (candidate) =>
        `${candidate.minimumCents ?? ""}:${candidate.maximumCents ?? ""}:${candidate.period}`,
    ),
  );
  if (distinct.length > 1) {
    warnings.push(
      "Multiple conflicting base-pay figures were found; the first explicit figure was retained for review.",
    );
  }

  return {
    minimumCents: first.minimumCents,
    maximumCents: first.maximumCents,
    currency: "USD",
    period: first.period,
    source: first.source,
    confidence: first.confidence,
    evidence: [first.evidence],
    derived: false,
  };
}

const MONEY = "(?:\\$\\s*|USD\\s*)?((?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d+)?)\\s*([kK])?";

function parseSalaryAmounts(
  line: string,
): Pick<SalaryCandidate, "minimumCents" | "maximumCents"> | null {
  const upTo = new RegExp(`\\bup to\\s*${MONEY}`, "i").exec(line);
  if (upTo) {
    return { minimumCents: null, maximumCents: moneyToCents(upTo[1], upTo[2]) };
  }

  const starting = new RegExp(`\\b(?:starting at|from)\\s*${MONEY}`, "i").exec(line);
  if (starting) {
    return { minimumCents: moneyToCents(starting[1], starting[2]), maximumCents: null };
  }

  const range = new RegExp(
    `${MONEY}\\s*(?:-|–|—|to|and)\\s*${MONEY}`,
    "i",
  ).exec(line);
  if (range) {
    const first = moneyToCents(range[1], range[2]);
    const second = moneyToCents(range[3], range[4]);
    return {
      minimumCents: Math.min(first, second),
      maximumCents: Math.max(first, second),
    };
  }

  const baseBefore = new RegExp(`${MONEY}\\s*(?:annual\\s+)?base`, "i").exec(line);
  if (baseBefore) {
    const amount = moneyToCents(baseBefore[1], baseBefore[2]);
    return { minimumCents: amount, maximumCents: amount };
  }

  const single = new RegExp(MONEY, "i").exec(line);
  if (!single) return null;
  const amount = moneyToCents(single[1], single[2]);
  return { minimumCents: amount, maximumCents: amount };
}

function moneyToCents(rawAmount: string | undefined, suffix: string | undefined): number {
  const numeric = Number((rawAmount ?? "0").replace(/,/g, ""));
  return Math.round(numeric * (suffix ? 1_000 : 1) * 100);
}

function salaryPeriodFor(text: string): SalaryPeriod {
  if (/\b(?:per hour|an hour|hourly)\b|\/\s*(?:hr|hour)\b/i.test(text)) return "hour";
  if (/\b(?:per day|daily)\b|\/\s*day\b/i.test(text)) return "day";
  if (/\b(?:per week|weekly)\b|\/\s*week\b/i.test(text)) return "week";
  if (/\b(?:per month|monthly)\b|\/\s*month\b/i.test(text)) return "month";
  if (/\b(?:per year|annually|annual|yearly)\b|\/\s*(?:yr|year)\b/i.test(text)) return "year";
  return "unknown";
}

function salarySourceFor(text: string, hint: SalarySource): SalarySource {
  if (/\b(?:estimated|estimate provided by|glassdoor estimate|indeed estimate)\b/i.test(text)) {
    return "externally_estimated";
  }
  if (hint !== "unknown") return hint;
  if (/\b(?:employer[- ]posted|salary range for this position|pay range for this position)\b/i.test(text)) {
    return "employer_posted";
  }
  return "unknown";
}

function extractWorkArrangement(
  clean: string,
  location: string | null,
  warnings: string[],
): { value: ParsedValue<WorkArrangement>; restrictions: RemoteRestriction[] } {
  const bodyLower = clean.toLowerCase();
  const locationLower = location?.toLowerCase() ?? "";
  const remoteBody = /\b(?:fully remote|100% remote|remote position|work from home|remote[- ]first)\b/i.exec(clean);
  const remoteHeader = /\bremote\b/i.exec(location ?? "");
  const hybrid = /\bhybrid\b|\b\d+\s+days?\s+(?:per\s+week\s+)?(?:in|at)\s+(?:the\s+)?office\b|\bin[- ]office\s+\d+\s+days?\b/i.exec(
    clean,
  );
  const remoteNegated = /\b(?:not remote|no remote(?: work)?|on[- ]site only|must work on[- ]site)\b/i.exec(clean);
  const onSite = /\b(?:on[- ]site|onsite|in[- ]person (?:role|position|work)|in[- ]office (?:company|role|position)|office[- ]based|work(?:ing)? (?:from|in|at) (?:our|the) office)\b/i.exec(
    clean,
  );

  let arrangement: WorkArrangement = "unknown";
  let confidence: Confidence | null = null;
  let matched: RegExpExecArray | null = null;
  let source: "header" | "description" = "description";

  if (remoteNegated) {
    arrangement = "on_site";
    confidence = "high";
    matched = remoteNegated;
  } else if (hybrid) {
    arrangement = "hybrid";
    confidence = "high";
    matched = hybrid;
  } else if (onSite) {
    arrangement = "on_site";
    confidence = "medium";
    matched = onSite;
  } else if (remoteBody || remoteHeader) {
    arrangement = "remote";
    confidence = remoteBody ? "high" : "medium";
    matched = remoteBody ?? remoteHeader;
    source = remoteBody ? "description" : "header";
  }

  const hasExplicitRemote = Boolean(remoteBody || remoteHeader);
  if (hasExplicitRemote && (hybrid || remoteNegated || onSite)) {
    warnings.push(
      "Remote and office-attendance signals conflict; the more restrictive arrangement was used.",
    );
  }
  if (/\bremote[- ]friendly\b/i.test(bodyLower) && arrangement === "unknown") {
    warnings.push("The listing says remote-friendly but does not promise a remote arrangement.");
  }

  const restrictions = extractRemoteRestrictions(clean);
  const evidence: ParseEvidence[] = [];
  if (matched) {
    const excerpt = matched[0];
    const start = source === "header" ? undefined : matched.index;
    evidence.push({
      field: "workArrangement",
      excerpt,
      source,
      confidence: confidence ?? "low",
      ...(start === undefined ? {} : { start, end: start + excerpt.length }),
    });
  }

  // "Remote, PA" is ambiguous: preserve the restriction as unresolved rather than
  // inventing whether PA is the office location or the permitted region.
  if (/\bremote\b/.test(locationLower) && /\bremote\s*[,/-]\s*[^,/-]+/i.test(location ?? "")) {
    warnings.push("The location header may contain a remote-region restriction; confirm it manually.");
  }

  return {
    value: { value: arrangement, confidence, evidence },
    restrictions,
  };
}

function extractRemoteRestrictions(clean: string): RemoteRestriction[] {
  const restrictions: RemoteRestriction[] = [];
  const lines = clean.split("\n");
  let offset = 0;

  for (const line of lines) {
    const radius = /\bwithin\s+(\d+)\s+miles?\s+of\s+([^.;]+)/i.exec(line);
    if (radius) {
      restrictions.push({
        kind: "radius",
        values: [radius[1], radius[2].trim()],
        description: radius[0].trim(),
        evidence: evidenceFromMatch("remoteRestrictions", line, offset, radius, "high"),
      });
    }

    const residence = /\b(?:must|need to)\s+(?:reside|live|be located|be based)\s+in\s+([^.;]+)/i.exec(
      line,
    );
    if (residence) {
      restrictions.push({
        kind: classifyRestrictionValue(residence[1]),
        values: splitLocations(residence[1]),
        description: residence[0].trim(),
        evidence: evidenceFromMatch("remoteRestrictions", line, offset, residence, "high"),
      });
    }

    const remoteRegion = /\bremote\s+(?:within|in|from|for candidates in)\s+([^.;]+)/i.exec(line);
    if (remoteRegion) {
      restrictions.push({
        kind: classifyRestrictionValue(remoteRegion[1]),
        values: splitLocations(remoteRegion[1]),
        description: remoteRegion[0].trim(),
        evidence: evidenceFromMatch("remoteRestrictions", line, offset, remoteRegion, "medium"),
      });
    }

    const countryOnly = /\b(?:u\.?s\.?|united states)\s+(?:residents?\s+)?only\b/i.exec(line);
    if (countryOnly) {
      restrictions.push({
        kind: "country",
        values: ["United States"],
        description: countryOnly[0],
        evidence: evidenceFromMatch("remoteRestrictions", line, offset, countryOnly, "high"),
      });
    }

    const timezone = /\b((?:eastern|central|mountain|pacific)\s+time(?:\s+zone)?)\b/i.exec(line);
    if (timezone && /\b(?:must|required|core hours|work hours)\b/i.test(line)) {
      restrictions.push({
        kind: "timezone",
        values: [timezone[1]],
        description: line.trim(),
        evidence: evidenceFromMatch("remoteRestrictions", line, offset, timezone, "medium"),
      });
    }
    offset += line.length + 1;
  }

  return dedupeBy(restrictions, (item) => `${item.kind}:${item.values.map(normalize).join("|")}`);
}

function classifyRestrictionValue(value: string): RemoteRestriction["kind"] {
  if (/\b(?:united states|u\.?s\.?)\b/i.test(value)) return "country";
  if (/\b(?:time|timezone)\b/i.test(value)) return "timezone";
  return "region";
}

function splitLocations(value: string): string[] {
  return value
    .replace(/\s+(?:or|and)\s+/gi, ",")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function extractTechnologies(records: LineRecord[]): TechnologyMention[] {
  const mentions: TechnologyMention[] = [];

  for (const record of records) {
    const kind = qualificationKindFor(record);
    for (const technology of TECHNOLOGY_ALIASES) {
      const alias = technology.aliases.find((candidate) => tokenPattern(candidate).test(record.text));
      if (!alias || technologyIsNegated(record.text, alias)) continue;

      mentions.push({
        name: technology.name,
        kind,
        evidence: evidenceFor("technologies", record, "description", "high"),
      });
    }
  }

  return dedupeBy(mentions, (mention) => `${normalize(mention.name)}:${mention.kind}`);
}

function tokenPattern(value: string): RegExp {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?=$|[^a-z0-9])`, "i");
}

function technologyIsNegated(line: string, alias: string): boolean {
  const lowerAlias = alias.toLowerCase();
  const clause = line
    .split(/[.;]/)
    .find((part) => part.toLowerCase().includes(lowerAlias));
  if (!clause) return false;
  return /\b(?:not required|not necessary|no experience required|do not need|need not have|without prior)\b/i.test(
    clause,
  );
}

function qualificationKindFor(record: LineRecord): QualificationKind {
  // Explicit wording on an individual bullet is stronger than a broad section
  // heading (for example, "SQL preferred" inside "Qualifications").
  if (/\b(?:preferred|nice to have|bonus|ideally)\b/i.test(record.text)) return "preferred";
  if (/\b(?:required|must|minimum)\b/i.test(record.text)) return "required";
  if (record.section === "required") return "required";
  if (record.section === "preferred") return "preferred";
  return "unspecified";
}

function extractExperienceRequirements(records: LineRecord[]): ExperienceRequirement[] {
  const requirements: ExperienceRequirement[] = [];
  const numberToken = "(?:\\d+(?:\\.\\d+)?|zero|one|two|three|four|five|six|seven|eight|nine|ten)";
  const rangePattern = new RegExp(
    `\\b(${numberToken})\\s*(?:-|–|—|to)\\s*(${numberToken})\\s*\\+?\\s*years?\\b`,
    "gi",
  );
  const singlePattern = new RegExp(`\\b(${numberToken})\\s*\\+?\\s*years?\\b`, "gi");

  for (const record of records) {
    if (/\b(?:founded|established|years? ago|over the (?:last|past)|in business for)\b/i.test(record.text)) {
      continue;
    }

    const occupied: Array<[number, number]> = [];
    for (const match of record.text.matchAll(rangePattern)) {
      if (match.index === undefined) continue;
      occupied.push([match.index, match.index + match[0].length]);
      requirements.push(
        experienceFromMatch(record, match, toNumber(match[1]), toNumber(match[2])),
      );
    }
    for (const match of record.text.matchAll(singlePattern)) {
      if (match.index === undefined) continue;
      const end = match.index + match[0].length;
      if (occupied.some(([start, occupiedEnd]) => match.index! >= start && end <= occupiedEnd)) {
        continue;
      }
      const years = toNumber(match[1]);
      requirements.push(experienceFromMatch(record, match, years, null));
    }
  }

  return dedupeBy(
    requirements,
    (item) => `${item.minimumYears}:${item.maximumYears ?? ""}:${item.kind}:${normalize(item.domain ?? "")}`,
  );
}

function experienceFromMatch(
  record: LineRecord,
  match: RegExpMatchArray,
  minimumYears: number,
  maximumYears: number | null,
): ExperienceRequirement {
  const index = match.index ?? 0;
  const after = record.text.slice(index + match[0].length);
  const before = record.text.slice(Math.max(0, index - 50), index);
  const domainMatch = /^\s+(?:of\s+)?([^.;]{2,90}?)(?:\s+(?:required|preferred)|[.;]|$)/i.exec(after);
  let domain = domainMatch?.[1]?.trim() || null;
  if (domain && /^(?:experience|professional experience)$/i.test(domain)) domain = null;
  const context = `${before} ${match[0]} ${after}`;

  return {
    minimumYears,
    maximumYears,
    kind: qualificationKindFor(record),
    domain,
    professionalOnly: /\b(?:professional|production|commercial|industry)\b/i.test(context),
    evidence: evidenceFor("experienceRequirements", record, "description", "high"),
  };
}

function toNumber(value: string | undefined): number {
  if (!value) return 0;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : (NUMBER_WORDS[value.toLowerCase()] ?? 0);
}

function extractSeniority(
  title: string,
  clean: string,
  warnings: string[],
): ParsedValue<SeniorityLevel> {
  const titleRules: Array<{ value: SeniorityLevel; pattern: RegExp }> = [
    { value: "leadership", pattern: /\b(?:director|head|vice president|vp|chief)\b/i },
    { value: "staff", pattern: /\b(?:staff|principal)\b/i },
    { value: "senior", pattern: /\b(?:senior|sr\.?|lead)\b/i },
    { value: "mid", pattern: /\b(?:mid[- ]level|intermediate)\b/i },
    { value: "entry", pattern: /\b(?:entry[- ]level|junior|jr\.?|associate)\b/i },
    { value: "intern", pattern: /\b(?:intern|internship)\b/i },
  ];

  for (const rule of titleRules) {
    const match = rule.pattern.exec(title);
    if (!match) continue;
    return {
      value: rule.value,
      confidence: "high",
      evidence: [
        {
          field: "seniority",
          excerpt: match[0],
          source: "manual",
          confidence: "high",
        },
      ],
    };
  }

  // "Manager" is intentionally absent: Product Manager, Customer Success
  // Manager, and Account Manager are commonly individual-contributor titles.
  const bodyEntry = /\bentry[- ]level\b/i.exec(clean);
  if (bodyEntry) {
    warnings.push("Seniority came from the description rather than the confirmed title.");
    return {
      value: "entry",
      confidence: "medium",
      evidence: [
        {
          field: "seniority",
          excerpt: bodyEntry[0],
          source: "description",
          confidence: "medium",
          start: bodyEntry.index,
          end: bodyEntry.index + bodyEntry[0].length,
        },
      ],
    };
  }

  return EMPTY_VALUE<SeniorityLevel>();
}

function extractEmploymentType(records: LineRecord[]): ParsedValue<EmploymentType> {
  const rules: Array<{ value: EmploymentType; pattern: RegExp }> = [
    { value: "internship", pattern: /\b(?:internship|intern position)\b/i },
    { value: "contract", pattern: /\b(?:contractor|contract role|contract position|\d+[- ]month contract)\b/i },
    { value: "temporary", pattern: /\b(?:temporary|temp role|temp position)\b/i },
    { value: "seasonal", pattern: /\bseasonal\b/i },
    { value: "part_time", pattern: /\bpart[- ]time\b/i },
    { value: "full_time", pattern: /\bfull[- ]time\b/i },
  ];

  for (const record of records) {
    for (const rule of rules) {
      const match = rule.pattern.exec(record.text);
      if (!match) continue;
      return {
        value: rule.value,
        confidence: "high",
        evidence: [evidenceFor("employmentType", record, "description", "high")],
      };
    }
  }
  return EMPTY_VALUE<EmploymentType>();
}

function extractIndustry(clean: string): ParsedValue<string> {
  for (const industry of INDUSTRIES) {
    const match = industry.pattern.exec(clean);
    if (!match) continue;
    return {
      value: industry.name,
      confidence: "medium",
      evidence: [
        {
          field: "industry",
          excerpt: match[0],
          source: "description",
          confidence: "medium",
          start: match.index,
          end: match.index + match[0].length,
        },
      ],
    };
  }
  return EMPTY_VALUE<string>();
}

function extractTravelRequirement(records: LineRecord[]): TravelRequirement | null {
  for (const record of records) {
    if (/\b(?:no travel|travel is not required)\b/i.test(record.text)) {
      return {
        required: false,
        percent: 0,
        description: record.text,
        evidence: evidenceFor("travelRequirement", record, "description", "high"),
      };
    }
    const percent = /(?:travel[^.\d]{0,30})?(\d{1,3})\s*%\s*(?:travel)?/i.exec(record.text);
    if (percent && /\btravel\b/i.test(record.text)) {
      return {
        required: true,
        percent: Math.min(100, Number(percent[1])),
        description: record.text,
        evidence: evidenceFor("travelRequirement", record, "description", "high"),
      };
    }
    if (/\b(?:occasional|frequent|regular)\s+travel\b|\btravel required\b/i.test(record.text)) {
      return {
        required: true,
        percent: null,
        description: record.text,
        evidence: evidenceFor("travelRequirement", record, "description", "medium"),
      };
    }
  }
  return null;
}

function extractApplicationDeadline(
  records: LineRecord[],
  warnings: string[],
): ParsedValue<string> {
  for (const record of records) {
    const match = /\b(?:application deadline|apply by|closing date)\s*:?\s*([^.;\n]+)/i.exec(
      record.text,
    );
    if (!match) continue;
    const parsed = parseDate(match[1].trim());
    if (!parsed) {
      warnings.push(`An application deadline was mentioned but could not be safely parsed: ${match[1].trim()}`);
      return EMPTY_VALUE<string>();
    }
    return {
      value: parsed,
      confidence: "high",
      evidence: [evidenceFor("applicationDeadline", record, "description", "high")],
    };
  }
  return EMPTY_VALUE<string>();
}

function parseDate(raw: string): string | null {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const named = new RegExp(
    `^(${Object.keys(MONTHS).join("|")})\\s+(\\d{1,2})(?:st|nd|rd|th)?[,]?\\s+(\\d{4})$`,
    "i",
  ).exec(raw);
  if (!named) return null;
  const month = MONTHS[named[1].toLowerCase()];
  const day = Number(named[2]);
  if (!month || day < 1 || day > 31) return null;
  return `${named[3]}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function extractEligibilityRequirements(records: LineRecord[]): EligibilityRequirement[] {
  const results: EligibilityRequirement[] = [];
  const rules: Array<{
    kind: EligibilityRequirement["kind"];
    pattern: RegExp;
  }> = [
    { kind: "citizenship", pattern: /\b(?:must be (?:a )?u\.?s\.? citizens?|u\.?s\.? citizenship required)\b/i },
    { kind: "work_authorization", pattern: /\b(?:authorized to work in the united states|work authorization required|no visa sponsorship)\b/i },
    { kind: "security_clearance", pattern: /\b(?:active\s+)?(?:secret|top secret|ts\/sci)\s+(?:security )?clearance\b/i },
    { kind: "license", pattern: /\b(?:active|valid|current)\s+[a-z][a-z -]{1,40}\s+license\b/i },
  ];

  for (const record of records) {
    for (const rule of rules) {
      const match = rule.pattern.exec(record.text);
      if (!match) continue;
      results.push({
        kind: rule.kind,
        value: match[0],
        evidence: evidenceFor("eligibilityRequirements", record, "description", "high"),
      });
    }
  }
  return dedupeBy(results, (item) => `${item.kind}:${normalize(item.value)}`);
}

function evidenceFor(
  field: string,
  record: LineRecord,
  source: "description" | "header",
  confidence: Confidence,
): ParseEvidence {
  return {
    field,
    excerpt: record.text,
    source,
    confidence,
    start: record.start,
    end: record.start + record.text.length,
  };
}

function evidenceFromMatch(
  field: string,
  line: string,
  lineOffset: number,
  match: RegExpExecArray,
  confidence: Confidence,
): ParseEvidence {
  return {
    field,
    excerpt: match[0],
    source: "description",
    confidence,
    start: lineOffset + match.index,
    end: lineOffset + match.index + match[0].length,
  };
}

function cleanListItem(value: string): string {
  return value
    .replace(/^\s*(?:[-*•‣▪◦]|\d+[.)])\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9+#]+/g, " ").trim();
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function dedupeBy<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const value = key(item);
    if (seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}
