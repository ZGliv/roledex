export type CompanyVisual = {
  accent: string;
  background: string;
  foreground: string;
};

const COMPANY_VISUALS: Record<string, CompanyVisual> = {
  vercel: { background: "#111111", foreground: "#ffffff", accent: "#3b3b3b" },
  samsara: { background: "#dbe8e2", foreground: "#12372b", accent: "#b7d3c5" },
  intercom: { background: "#dce7ff", foreground: "#15336f", accent: "#b8ccf8" },
  airtable: { background: "#fff0d8", foreground: "#30251a", accent: "#f5cc8d" },
  asana: { background: "#f3e0dd", foreground: "#432822", accent: "#e8b8af" },
  "scale ai": { background: "#e1e4f4", foreground: "#1d244b", accent: "#c3c9e8" },
  zocdoc: { background: "#eee9d7", foreground: "#29291d", accent: "#d9d09f" },
  "flatiron health": { background: "#dce9ed", foreground: "#14313a", accent: "#b6d1d8" },
  "maven clinic": { background: "#eee3ed", foreground: "#41293f", accent: "#d9c0d6" },
  "oscar health": { background: "#e1f0e8", foreground: "#17392b", accent: "#b9dcca" },
  "omada health": { background: "#e0ecea", foreground: "#173d38", accent: "#b9d5d0" },
  pathai: { background: "#dde8f2", foreground: "#19334c", accent: "#b9cee1" },
  whoop: { background: "#1c1d1f", foreground: "#ffffff", accent: "#37393d" },
  "sword health": { background: "#f4edcf", foreground: "#322c17", accent: "#e4d788" },
  abridge: { background: "#dce8e5", foreground: "#173934", accent: "#b4d0ca" },
  notion: { background: "#ecebe7", foreground: "#171717", accent: "#d2d0c9" },
  cohere: { background: "#eee7d8", foreground: "#30291f", accent: "#d9c9aa" },
  ramp: { background: "#e3f2d8", foreground: "#18301e", accent: "#bedeaa" },
  linear: { background: "#e5e4ee", foreground: "#25233a", accent: "#c7c4da" },
  decagon: { background: "#e3e4f2", foreground: "#242845", accent: "#c4c7e2" },
};

const FALLBACK_VISUALS: readonly CompanyVisual[] = [
  { background: "#dfe8f4", foreground: "#1b304b", accent: "#bed0e5" },
  { background: "#e2ece6", foreground: "#20372b", accent: "#bfd5c7" },
  { background: "#f0e7da", foreground: "#3b3024", accent: "#dcc9ad" },
  { background: "#e9e3f1", foreground: "#332945", accent: "#d0c3df" },
] as const;

function stableCompanyHash(company: string) {
  let hash = 0;
  for (const character of company.toLowerCase()) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }
  return hash;
}

export function companyInitials(company: string) {
  const words = company.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";

  return words
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join("");
}

export function companyVisual(company: string) {
  return (
    COMPANY_VISUALS[company.trim().toLowerCase()] ??
    FALLBACK_VISUALS[stableCompanyHash(company) % FALLBACK_VISUALS.length]
  );
}
