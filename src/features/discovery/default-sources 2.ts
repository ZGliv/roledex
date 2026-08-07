import type { JobSourceProvider } from "@/db/schema";

export type StarterJobSource = {
  companyDomain: string;
  companyName: string;
  provider: JobSourceProvider;
  providerKey: string;
};

/**
 * Small, intentionally curated set of official public ATS boards.
 * Endpoints were verified on 2026-08-04. A failed source is isolated during
 * refresh, so a company changing ATS providers cannot break the whole deck.
 */
export const DEFAULT_JOB_SOURCES = [
  {
    provider: "greenhouse",
    providerKey: "vercel",
    companyName: "Vercel",
    companyDomain: "vercel.com",
  },
  {
    provider: "greenhouse",
    providerKey: "samsara",
    companyName: "Samsara",
    companyDomain: "samsara.com",
  },
  {
    provider: "greenhouse",
    providerKey: "intercom",
    companyName: "Intercom",
    companyDomain: "intercom.com",
  },
  {
    provider: "greenhouse",
    providerKey: "airtable",
    companyName: "Airtable",
    companyDomain: "airtable.com",
  },
  {
    provider: "greenhouse",
    providerKey: "asana",
    companyName: "Asana",
    companyDomain: "asana.com",
  },
  {
    provider: "greenhouse",
    providerKey: "scaleai",
    companyName: "Scale AI",
    companyDomain: "scale.com",
  },
  {
    provider: "greenhouse",
    providerKey: "zocdoc",
    companyName: "Zocdoc",
    companyDomain: "zocdoc.com",
  },
  {
    provider: "greenhouse",
    providerKey: "flatironhealth",
    companyName: "Flatiron Health",
    companyDomain: "flatiron.com",
  },
  {
    provider: "greenhouse",
    providerKey: "mavenclinic",
    companyName: "Maven Clinic",
    companyDomain: "mavenclinic.com",
  },
  {
    provider: "greenhouse",
    providerKey: "oscar",
    companyName: "Oscar Health",
    companyDomain: "hioscar.com",
  },
  {
    provider: "greenhouse",
    providerKey: "omadahealth",
    companyName: "Omada Health",
    companyDomain: "omadahealth.com",
  },
  {
    provider: "greenhouse",
    providerKey: "pathai",
    companyName: "PathAI",
    companyDomain: "pathai.com",
  },
  {
    provider: "lever",
    providerKey: "whoop",
    companyName: "WHOOP",
    companyDomain: "whoop.com",
  },
  {
    provider: "lever",
    providerKey: "swordhealth",
    companyName: "Sword Health",
    companyDomain: "swordhealth.com",
  },
  {
    provider: "ashby",
    providerKey: "abridge",
    companyName: "Abridge",
    companyDomain: "abridge.com",
  },
  {
    provider: "ashby",
    providerKey: "notion",
    companyName: "Notion",
    companyDomain: "notion.so",
  },
  {
    provider: "ashby",
    providerKey: "cohere",
    companyName: "Cohere",
    companyDomain: "cohere.com",
  },
  {
    provider: "ashby",
    providerKey: "ramp",
    companyName: "Ramp",
    companyDomain: "ramp.com",
  },
  {
    provider: "ashby",
    providerKey: "linear",
    companyName: "Linear",
    companyDomain: "linear.app",
  },
  {
    provider: "ashby",
    providerKey: "decagon",
    companyName: "Decagon",
    companyDomain: "decagon.ai",
  },
] as const satisfies readonly StarterJobSource[];
