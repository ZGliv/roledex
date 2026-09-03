import {
  CandidateResumeDraftSchema,
  type CandidateResumeDraft,
} from "@/features/candidate/input";

export const RESUME_PARSER_VERSION = "resume-deterministic-v1" as const;

type SectionName = "education" | "experience" | "projects" | "skills" | "other";

const SECTION_HEADINGS: Record<Exclude<SectionName, "other">, RegExp> = {
  education: /^(?:education|academic background|training)$/i,
  experience:
    /^(?:experience|work experience|professional experience|employment|employment history)$/i,
  projects: /^(?:projects|selected projects|portfolio|personal projects)$/i,
  skills:
    /^(?:skills|technical skills|core skills|competencies|tools(?: & technologies)?)$/i,
};

const MONTHS: Record<string, string> = {
  jan: "01",
  january: "01",
  feb: "02",
  february: "02",
  mar: "03",
  march: "03",
  apr: "04",
  april: "04",
  may: "05",
  jun: "06",
  june: "06",
  jul: "07",
  july: "07",
  aug: "08",
  august: "08",
  sep: "09",
  sept: "09",
  september: "09",
  oct: "10",
  october: "10",
  nov: "11",
  november: "11",
  dec: "12",
  december: "12",
};

const DATE_TOKEN =
  "(?:(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\\s+)?(?:19|20)\\d{2}";
const DATE_RANGE = new RegExp(
  `(${DATE_TOKEN})\\s*(?:-|–|—|to)\\s*(Present|Current|${DATE_TOKEN})`,
  "i",
);
const SINGLE_YEAR = /\b(?:19|20)\d{2}\b/;
const BULLET = /^\s*(?:[-*•‣▪◦]|\d+[.)])\s*/;

const TECHNOLOGY_TERMS = [
  "Active Directory",
  "AWS",
  "Azure",
  "CSS",
  "Excel",
  "Figma",
  "Git",
  "GitHub",
  "HTML",
  "JavaScript",
  "Jira",
  "Microsoft 365",
  "Node.js",
  "PostgreSQL",
  "Power BI",
  "Python",
  "React",
  "Salesforce",
  "ServiceNow",
  "SQL",
  "Tableau",
  "TypeScript",
  "Zendesk",
] as const;

function cleanLine(value: string) {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanBullet(value: string) {
  return cleanLine(value.replace(BULLET, ""));
}

function compactExcerpt(lines: readonly string[]) {
  return lines.map(cleanBullet).filter(Boolean).join(" · ").slice(0, 500);
}

function monthValue(value: string) {
  const year = value.match(/(?:19|20)\d{2}/)?.[0];
  if (!year) return null;
  const monthName = value.match(/[A-Za-z]+/)?.[0]?.toLocaleLowerCase();
  return `${year}-${monthName ? MONTHS[monthName] ?? "01" : "01"}`;
}

function sectionForHeading(line: string): SectionName | null {
  const normalized = line.replace(/:$/, "").trim();
  for (const [section, expression] of Object.entries(SECTION_HEADINGS)) {
    if (expression.test(normalized)) return section as SectionName;
  }
  return null;
}

function partitionSections(lines: readonly string[]) {
  const sections: Record<SectionName, string[]> = {
    education: [],
    experience: [],
    projects: [],
    skills: [],
    other: [],
  };
  let current: SectionName = "other";
  for (const line of lines) {
    const nextSection = sectionForHeading(line);
    if (nextSection) {
      current = nextSection;
      continue;
    }
    sections[current].push(line);
  }
  return sections;
}

function parseExperience(lines: readonly string[]) {
  const entries: CandidateResumeDraft["workHistory"] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const dateMatch = line.match(DATE_RANGE);
    if (!dateMatch) continue;

    const dates = dateMatch[0];
    const beforeDates = cleanLine(line.replace(dates, "").replace(/[|,·]+$/, ""));
    const prior = cleanLine(lines[index - 1] ?? "");
    let title = "";
    let company = "";

    const atParts = beforeDates.split(/\s+at\s+/i);
    const separated = beforeDates
      .split(/\s*(?:\||·|—|–)\s*/)
      .map(cleanLine)
      .filter(Boolean);
    if (atParts.length === 2) {
      [title, company] = atParts;
    } else if (separated.length >= 2) {
      [title, company] = separated;
    } else if (beforeDates && prior && !DATE_RANGE.test(prior)) {
      title = beforeDates;
      company = prior;
    }
    if (!title || !company) continue;

    const bulletLines: string[] = [];
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const candidate = lines[cursor] ?? "";
      if (DATE_RANGE.test(candidate) || sectionForHeading(candidate)) break;
      if (BULLET.test(candidate)) bulletLines.push(cleanBullet(candidate));
      if (bulletLines.length >= 8) break;
    }
    const startDate = monthValue(dateMatch[1] ?? "");
    const endToken = dateMatch[2] ?? "";
    const isCurrent = /present|current/i.test(endToken);
    const endDate = isCurrent ? null : monthValue(endToken);
    if (!startDate || (!isCurrent && !endDate)) continue;

    entries.push({
      achievements: bulletLines,
      company: company.slice(0, 180),
      confidence: separated.length >= 2 || atParts.length === 2 ? "high" : "medium",
      endDate,
      isCurrent,
      skills: [],
      sourceExcerpt: compactExcerpt([prior, line, ...bulletLines.slice(0, 2)]),
      startDate,
      summary: bulletLines.slice(0, 3).join(" ").slice(0, 2_000),
      title: title.slice(0, 180),
    });
  }
  return entries.slice(0, 30);
}

function parseEducation(lines: readonly string[]) {
  const entries: CandidateResumeDraft["education"] = [];
  const schoolPattern = /\b(?:college|university|institute|school|academy)\b/i;
  for (let index = 0; index < lines.length; index += 1) {
    const line = cleanBullet(lines[index] ?? "");
    if (!schoolPattern.test(line)) continue;
    const next = cleanBullet(lines[index + 1] ?? "");
    const combined = `${line} ${next}`;
    const years = [...combined.matchAll(/\b(?:19|20)\d{2}\b/g)].map((match) =>
      Number(match[0]),
    );
    const degreeLine = /\b(?:associate|bachelor|master|doctor|certificate|diploma|b\.?[as]\.?|m\.?[as]\.?|ph\.?d\.?)\b/i.test(
      next,
    )
      ? next.replace(DATE_RANGE, "").replace(SINGLE_YEAR, "").trim()
      : "";
    const degreeParts = degreeLine.split(/\s+(?:in|of)\s+/i);
    entries.push({
      confidence: degreeLine ? "high" : "medium",
      degree: (degreeParts[0] ?? "").slice(0, 180),
      description: "",
      endYear: years.at(-1) ?? null,
      fieldOfStudy: (degreeParts.slice(1).join(" ") || "").slice(0, 180),
      institution: line.replace(DATE_RANGE, "").replace(SINGLE_YEAR, "").trim().slice(0, 220),
      sourceExcerpt: compactExcerpt([line, next]),
      startYear: years.length > 1 ? years[0] ?? null : null,
    });
  }
  return entries.slice(0, 20);
}

function uniqueStrings(values: readonly string[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = value.toLocaleLowerCase();
    if (!value || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function parseSkills(skillLines: readonly string[], allText: string) {
  const explicit = skillLines.flatMap((line) =>
    cleanBullet(line)
      .replace(/^[^:]{1,35}:\s*/, "")
      .split(/[,|;]/)
      .map(cleanLine)
      .filter((value) => value.length >= 2 && value.length <= 80),
  );
  const detected = TECHNOLOGY_TERMS.filter((term) =>
    new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(allText),
  );
  return uniqueStrings([...explicit, ...detected])
    .slice(0, 100)
    .map((name) => ({
      confidence: explicit.some(
        (value) => value.toLocaleLowerCase() === name.toLocaleLowerCase(),
      )
        ? ("high" as const)
        : ("medium" as const),
      evidenceNote: "Proposed from the résumé; confirm the level and source before relying on it.",
      evidenceType: "self_reported" as const,
      lastUsedYear: null,
      name,
      proficiency: "working" as const,
      sourceExcerpt: explicit.length > 0 ? compactExcerpt(skillLines.slice(0, 3)) : name,
      yearsExperience: null,
    }));
}

function parseProjects(lines: readonly string[]) {
  const projects: CandidateResumeDraft["projects"] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (!line || BULLET.test(line) || DATE_RANGE.test(line)) continue;
    const details: string[] = [];
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const candidate = lines[cursor] ?? "";
      if (candidate && !BULLET.test(candidate)) break;
      if (BULLET.test(candidate)) details.push(cleanBullet(candidate));
      if (details.length >= 6) break;
    }
    if (details.length === 0) continue;
    projects.push({
      confidence: "medium",
      description: details.join(" ").slice(0, 2_000),
      name: cleanLine(line).slice(0, 180),
      responsibilities: details.slice(0, 4),
      sourceExcerpt: compactExcerpt([line, ...details.slice(0, 2)]),
      strongestEvidence: details.slice(0, 2),
      technologies: TECHNOLOGY_TERMS.filter((term) =>
        new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(
          `${line} ${details.join(" ")}`,
        ),
      ),
    });
  }
  return projects.slice(0, 20);
}

/**
 * Conservative, deterministic résumé extraction. It intentionally proposes
 * only recognizable facts and never writes them to a profile by itself.
 */
export function parseResumeImportDraft(rawText: string): CandidateResumeDraft {
  const lines = rawText
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map(cleanLine)
    .filter(Boolean);
  const sections = partitionSections(lines);
  const workHistory = parseExperience(sections.experience);
  const education = parseEducation(sections.education);
  const skills = parseSkills(sections.skills, lines.join("\n"));
  const projects = parseProjects(sections.projects);
  const warnings: string[] = [];
  if (workHistory.length === 0) {
    warnings.push("No work entries had a recognizable title, employer, and date range.");
  }
  if (skills.length === 0) {
    warnings.push("No explicit skills were recognized; add skill evidence manually.");
  }
  warnings.push(
    "Review every proposed fact. Nothing is added to your profile until you confirm it.",
  );

  return CandidateResumeDraftSchema.parse({
    education,
    parserVersion: RESUME_PARSER_VERSION,
    projects,
    skills,
    warnings,
    workHistory,
  });
}
