export type CompanyResearchStatus = "verified" | "not_found" | "unavailable";

export interface CompanyFigure {
  name: string;
  roles: readonly string[];
  wikipediaUrl: string | null;
}

export interface CompanyEmployeeCount {
  asOf: string | null;
  value: number;
}

export interface CompanyIntelligence {
  description: string | null;
  employeeCount: CompanyEmployeeCount | null;
  founded: string | null;
  headquarters: readonly string[];
  industries: readonly string[];
  notableFigures: readonly CompanyFigure[];
  officialWebsite: string | null;
  overview: string | null;
  overviewSource: "wikipedia" | "employer_listing" | null;
  parentOrganization: string | null;
  researchedAt: string;
  status: CompanyResearchStatus;
  wikidataUrl: string | null;
  wikipediaSearchUrl: string;
  wikipediaTitle: string | null;
  wikipediaUrl: string | null;
}

export interface JobDossierListing {
  benefits: readonly string[];
  canonicalListingUrl: string | null;
  companyDomain: string | null;
  descriptionRaw: string;
  experienceRequirements: readonly string[];
  firstSeenAt: string | null;
  industry: string | null;
  lastSeenAt: string | null;
  parserVersion: string;
  remoteRestriction: string | null;
  retrievedAt: string;
  revisionNumber: number;
  sourceUpdatedAt: string | null;
  yearsExperienceMaximum: number | null;
  yearsExperienceMinimum: number | null;
}

export interface JobDossierPayload {
  listing: JobDossierListing;
}

export interface JobCompanyPayload {
  company: CompanyIntelligence;
}
