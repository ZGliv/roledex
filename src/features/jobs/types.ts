export const JOB_PARSER_VERSION = "job-parser-v5" as const;

export type Confidence = "low" | "medium" | "high";

export type EvidenceSource =
  | "manual"
  | "header"
  | "description"
  | "derived";

export interface ParseEvidence {
  field: string;
  excerpt: string;
  source: EvidenceSource;
  confidence: Confidence;
  start?: number;
  end?: number;
}

export interface ParsedValue<T> {
  value: T | null;
  confidence: Confidence | null;
  evidence: ParseEvidence[];
}

export type WorkArrangement = "remote" | "hybrid" | "on_site" | "unknown";

export type RemoteRestrictionKind =
  | "country"
  | "region"
  | "radius"
  | "timezone"
  | "other";

export interface RemoteRestriction {
  kind: RemoteRestrictionKind;
  values: string[];
  description: string;
  evidence: ParseEvidence;
}

export type SalaryPeriod =
  | "hour"
  | "day"
  | "week"
  | "month"
  | "year"
  | "unknown";

export type SalarySource =
  | "employer_posted"
  | "externally_estimated"
  | "unknown";

export interface ParsedSalary {
  minimumCents: number | null;
  maximumCents: number | null;
  currency: string | null;
  period: SalaryPeriod;
  source: SalarySource;
  confidence: Confidence | null;
  evidence: ParseEvidence[];
  /** True only when the amount itself was mathematically transformed. V1 never does this. */
  derived: boolean;
}

export type QualificationKind = "required" | "preferred" | "unspecified";

export interface ParsedQualification {
  text: string;
  kind: QualificationKind;
  evidence: ParseEvidence;
}

export interface TechnologyMention {
  name: string;
  kind: QualificationKind;
  evidence: ParseEvidence;
}

export interface ExperienceRequirement {
  minimumYears: number;
  maximumYears: number | null;
  kind: QualificationKind;
  domain: string | null;
  professionalOnly: boolean;
  evidence: ParseEvidence;
}

export type SeniorityLevel =
  | "intern"
  | "entry"
  | "mid"
  | "senior"
  | "staff"
  | "leadership"
  | "unknown";

export type EmploymentType =
  | "full_time"
  | "part_time"
  | "contract"
  | "temporary"
  | "internship"
  | "seasonal"
  | "unknown";

export interface TravelRequirement {
  required: boolean;
  percent: number | null;
  description: string;
  evidence: ParseEvidence;
}

export type EligibilityRequirementKind =
  | "work_authorization"
  | "citizenship"
  | "security_clearance"
  | "license";

export interface EligibilityRequirement {
  kind: EligibilityRequirementKind;
  value: string;
  evidence: ParseEvidence;
}

export interface JobParseInput {
  /** Authoritative user-supplied fact. The parser does not guess titles. */
  title: string;
  /** Authoritative user-supplied fact. The parser does not guess companies. */
  company: string;
  descriptionRaw: string;
  location?: string | null;
  salarySourceHint?: SalarySource;
  retrievedAt?: string;
}

export interface ParsedJobListing {
  parserVersion: typeof JOB_PARSER_VERSION;
  title: string;
  company: string;
  location: string | null;
  /** Exact source input, retained for auditability. */
  descriptionRaw: string;
  /** Whitespace-normalized text used for deterministic parsing. */
  descriptionClean: string;
  /** A short extract from the listing, never a generated interpretation. */
  roleSummary: ParsedValue<string>;
  workArrangement: ParsedValue<WorkArrangement>;
  remoteRestrictions: RemoteRestriction[];
  salary: ParsedSalary;
  employmentType: ParsedValue<EmploymentType>;
  seniority: ParsedValue<SeniorityLevel>;
  industry: ParsedValue<string>;
  requiredQualifications: ParsedQualification[];
  preferredQualifications: ParsedQualification[];
  otherQualifications: ParsedQualification[];
  responsibilities: string[];
  technologies: TechnologyMention[];
  experienceRequirements: ExperienceRequirement[];
  travelRequirement: TravelRequirement | null;
  applicationDeadline: ParsedValue<string>;
  eligibilityRequirements: EligibilityRequirement[];
  evidence: ParseEvidence[];
  warnings: string[];
}
