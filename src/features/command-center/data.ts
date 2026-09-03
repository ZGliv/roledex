export type OpportunityStatus = "live" | "closed";

export type Opportunity = {
  company: string;
  fit: string;
  gap: string;
  id: string;
  liveStatus: OpportunityStatus;
  location: string;
  nextAction: string;
  packetIds: readonly string[];
  priority: number;
  resumeId: string | null;
  role: string;
  salary: string;
  sourceUrl: string;
  verifiedLabel: string;
};

export type ResumeArtifact = {
  description: string;
  id: string;
  kind: "base" | "tailored";
  label: string;
  status: "ready" | "review";
};

export type WorkspaceArtifact = {
  fileName: string;
  id: string;
  label: string;
  path: string;
};

export const workspaceArtifacts: readonly WorkspaceArtifact[] = [
  {
    id: "resume-solutions",
    label: "Solutions Engineer base résumé",
    fileName: "Zack_Glivic_Resume_SolutionsEngineer.pdf",
    path: "/Users/Test/Desktop/Job Search/Zack_Glivic_Resume_SolutionsEngineer.pdf",
  },
  {
    id: "resume-support",
    label: "Support Engineer base résumé",
    fileName: "Zack_Glivic_Resume_SupportEngineer.pdf",
    path: "/Users/Test/Desktop/Job Search/Zack_Glivic_Resume_SupportEngineer.pdf",
  },
  {
    id: "resume-healthtech",
    label: "Health-Tech IT base résumé",
    fileName: "Zack_Glivic_Resume_HealthTechIT.pdf",
    path: "/Users/Test/Desktop/Job Search/Zack_Glivic_Resume_HealthTechIT.pdf",
  },
  {
    id: "resume-foundant",
    label: "Foundant tailored résumé",
    fileName: "Zack_Glivic_Foundant_Associate_Implementation_Consultant_Resume.pdf",
    path: "/Users/Test/Desktop/Job Search 2026/output/resumes/foundant-aic/Zack_Glivic_Foundant_Associate_Implementation_Consultant_Resume.pdf",
  },
  {
    id: "resume-hightouch",
    label: "Hightouch tailored résumé",
    fileName: "Zack_Glivic_Hightouch_Customer_Success_Engineer_Resume.pdf",
    path: "/Users/Test/Desktop/Job Search 2026/output/resumes/hightouch-cse/Zack_Glivic_Hightouch_Customer_Success_Engineer_Resume.pdf",
  },
  {
    id: "resume-perfectserve",
    label: "PerfectServe tailored résumé",
    fileName: "Zack_Glivic_PerfectServe_Implementation_Consultant_Resume.pdf",
    path: "/Users/Test/Desktop/Job Search 2026/output/resumes/perfectserve-ic1/Zack_Glivic_PerfectServe_Implementation_Consultant_Resume.pdf",
  },
  {
    id: "resume-samsara",
    label: "Samsara tailored résumé",
    fileName: "Zack_Glivic_Samsara_Associate_Sales_Engineer_Resume.pdf",
    path: "/Users/Test/Desktop/Job Search 2026/output/resumes/samsara-ase/Zack_Glivic_Samsara_Associate_Sales_Engineer_Resume.pdf",
  },
  {
    id: "resume-foundant-ic",
    label: "Foundant technical IC tailored résumé",
    fileName: "Zack_Glivic_Foundant_Implementation_Consultant_Resume.pdf",
    path: "/Users/Test/Desktop/Job Search 2026/output/resumes/foundant-ic/Zack_Glivic_Foundant_Implementation_Consultant_Resume.pdf",
  },
  {
    id: "resume-pattern",
    label: "Pattern Data tailored résumé",
    fileName: "Zack_Glivic_Pattern_Data_Solutions_Analyst_Resume.pdf",
    path: "/Users/Test/Desktop/Job Search 2026/output/resumes/pattern-dsa/Zack_Glivic_Pattern_Data_Solutions_Analyst_Resume.pdf",
  },
  {
    id: "resume-eleos",
    label: "Eleos tailored résumé",
    fileName: "Zack_Glivic_Eleos_Implementation_Specialist_Resume.pdf",
    path: "/Users/Test/Desktop/Job Search 2026/output/resumes/eleos-implementation/Zack_Glivic_Eleos_Implementation_Specialist_Resume.pdf",
  },
  {
    id: "resume-ltk",
    label: "LTK tailored résumé",
    fileName: "Zack_Glivic_LTK_Integrations_Specialist_Resume.pdf",
    path: "/Users/Test/Desktop/Job Search 2026/output/resumes/ltk-integrations/Zack_Glivic_LTK_Integrations_Specialist_Resume.pdf",
  },
  ...[
    ["resume-foundant-docx", "Foundant tailored résumé (Word)", "foundant-aic", "Zack_Glivic_Foundant_Associate_Implementation_Consultant_Resume.docx"],
    ["resume-hightouch-docx", "Hightouch tailored résumé (Word)", "hightouch-cse", "Zack_Glivic_Hightouch_Customer_Success_Engineer_Resume.docx"],
    ["resume-perfectserve-docx", "PerfectServe tailored résumé (Word)", "perfectserve-ic1", "Zack_Glivic_PerfectServe_Implementation_Consultant_Resume.docx"],
    ["resume-samsara-docx", "Samsara tailored résumé (Word)", "samsara-ase", "Zack_Glivic_Samsara_Associate_Sales_Engineer_Resume.docx"],
    ["resume-foundant-ic-docx", "Foundant technical IC tailored résumé (Word)", "foundant-ic", "Zack_Glivic_Foundant_Implementation_Consultant_Resume.docx"],
    ["resume-pattern-docx", "Pattern Data tailored résumé (Word)", "pattern-dsa", "Zack_Glivic_Pattern_Data_Solutions_Analyst_Resume.docx"],
    ["resume-eleos-docx", "Eleos tailored résumé (Word)", "eleos-implementation", "Zack_Glivic_Eleos_Implementation_Specialist_Resume.docx"],
    ["resume-ltk-docx", "LTK tailored résumé (Word)", "ltk-integrations", "Zack_Glivic_LTK_Integrations_Specialist_Resume.docx"],
  ].map(([id, label, folder, fileName]) => ({
    id,
    label,
    fileName,
    path: `/Users/Test/Desktop/Job Search 2026/output/resumes/${folder}/${fileName}`,
  })),
  {
    id: "review-foundant",
    label: "Foundant five-minute review",
    fileName: "FOUNDANT_5_MINUTE_REVIEW.md",
    path: "/Users/Test/Desktop/Job Search 2026/output/applications/foundant/FOUNDANT_5_MINUTE_REVIEW.md",
  },
  {
    id: "evidence-inventory",
    label: "Master evidence inventory",
    fileName: "MASTER_EVIDENCE_INVENTORY.md",
    path: "/Users/Test/Desktop/Job Search 2026/MASTER_EVIDENCE_INVENTORY.md",
  },
  {
    id: "career-handoff",
    label: "Career strategy handoff",
    fileName: "CLAUDE_JOB_SEARCH_HANDOFF.md",
    path: "/Users/Test/Desktop/Job Search 2026/CLAUDE_JOB_SEARCH_HANDOFF.md",
  },
  {
    id: "application-tracker",
    label: "Grok application tracker",
    fileName: "11_APPLICATION_TRACKER.csv",
    path: "/Users/Test/Desktop/grokbot/02_JOBS/11_APPLICATION_TRACKER.csv",
  },
];

const packetRoot = "/Users/Test/Desktop/grokbot/02_JOBS/packets";

const packetArtifacts: readonly WorkspaceArtifact[] = [
  ["foundant-aic-3710bf9a", "Foundant AIC"],
  ["hightouch-cse-5699984004", "Hightouch CSE"],
  ["perfectserve-ic1-6016375004", "PerfectServe IC I"],
  ["samsara-ase-ne-7311741", "Samsara ASE"],
  ["eleos-impl-4578788101", "Eleos Implementation"],
  ["foundant-ic-cd946aa3", "Foundant technical IC"],
  ["pattern-dsa-5187872007", "Pattern Data"],
  ["ltk-integrations-7792650003", "LTK Integrations"],
].flatMap(([folder, label]) =>
  [
    ["human-review", "Human review", "human-review.md"],
    ["requirements", "Requirements matrix", "requirements-matrix.md"],
    ["screening", "Screening answers", "screening-answer-kit.md"],
    ["cover", "Cover note", "concise-cover-note.md"],
    ["draft", "Résumé draft", "resume-draft.md"],
  ].map(([suffix, documentLabel, fileName]) => ({
    id: `packet-${folder}-${suffix}`,
    label: `${label} — ${documentLabel}`,
    fileName,
    path: `${packetRoot}/${folder}/${fileName}`,
  })),
);

export const allWorkspaceArtifacts = [
  ...workspaceArtifacts,
  ...packetArtifacts,
] as const;

export const resumes: readonly ResumeArtifact[] = [
  {
    id: "resume-solutions",
    label: "Solutions Engineer",
    description: "Best base for implementation, pre-sales, and solutions roles.",
    kind: "base",
    status: "ready",
  },
  {
    id: "resume-support",
    label: "Technical Support / AI",
    description: "Best base for technical support and customer-success roles.",
    kind: "base",
    status: "ready",
  },
  {
    id: "resume-healthtech",
    label: "Health-Tech IT",
    description: "Best base for healthcare implementation and health-tech roles.",
    kind: "base",
    status: "ready",
  },
  {
    id: "resume-foundant",
    label: "Foundant AIC",
    description: "Finalized with current contact, education, experience, projects, and leadership.",
    kind: "tailored",
    status: "ready",
  },
  {
    id: "resume-hightouch",
    label: "Hightouch CSE",
    description: "Finalized for technical customer success without overstating SQL experience.",
    kind: "tailored",
    status: "ready",
  },
  {
    id: "resume-perfectserve",
    label: "PerfectServe IC I",
    description: "Finalized for healthcare implementation; unsupported Office claims removed.",
    kind: "tailored",
    status: "ready",
  },
  {
    id: "resume-samsara",
    label: "Samsara ASE",
    description: "Finalized for associate solutions engineering and technical discovery.",
    kind: "tailored",
    status: "ready",
  },
  {
    id: "resume-foundant-ic",
    label: "Foundant technical IC",
    description: "Finalized for configuration, QA, and client implementation support.",
    kind: "tailored",
    status: "ready",
  },
  {
    id: "resume-pattern",
    label: "Pattern Data",
    description: "Finalized with SQL and Python described honestly as exposure.",
    kind: "tailored",
    status: "ready",
  },
  {
    id: "resume-eleos",
    label: "Eleos Implementation",
    description: "Finalized healthcare implementation-support template; listing is closed.",
    kind: "tailored",
    status: "ready",
  },
  {
    id: "resume-ltk",
    label: "LTK Integrations",
    description: "Finalized integrations-support template; listing is closed.",
    kind: "tailored",
    status: "ready",
  },
];

const packet = (folder: string) => [
  `packet-${folder}-human-review`,
  `packet-${folder}-requirements`,
  `packet-${folder}-screening`,
  `packet-${folder}-cover`,
  `packet-${folder}-draft`,
] as const;

export const opportunities: readonly Opportunity[] = [
  {
    id: "foundant-aic",
    priority: 1,
    company: "Foundant",
    role: "Associate Implementation Consultant",
    salary: "Not listed",
    location: "Remote · US",
    liveStatus: "live",
    verifiedLabel: "Live Aug 24",
    fit: "Best immediate implementation bridge; client training, configuration, and mission-driven software.",
    gap: "Under one year in-role; no philanthropy background. Confirm 10% travel and Excel comfort.",
    nextAction: "Review the five-minute sheet, upload the finished résumé, and submit.",
    sourceUrl: "https://ats.rippling.com/foundant-careers/jobs/3710bf9a-6c20-42f3-bb9b-cc6d7892ccf1",
    resumeId: "resume-foundant",
    packetIds: packet("foundant-aic-3710bf9a"),
  },
  {
    id: "hightouch-cse",
    priority: 2,
    company: "Hightouch",
    role: "Customer Success Engineer",
    salary: "$85k–$110k",
    location: "Remote · North America",
    liveStatus: "live",
    verifiedLabel: "Live Aug 24",
    fit: "High-upside CSE bridge with technical customer work and broad product exposure.",
    gap: "Two-year customer-facing preference; SQL must remain willing-to-learn, not proficient.",
    nextAction: "Use the finalized résumé and write the short Why Hightouch response.",
    sourceUrl: "https://job-boards.greenhouse.io/hightouch/jobs/5699984004",
    resumeId: "resume-hightouch",
    packetIds: packet("hightouch-cse-5699984004"),
  },
  {
    id: "perfectserve-ic1",
    priority: 3,
    company: "PerfectServe",
    role: "Implementation Consultant I",
    salary: "$60k–$75k",
    location: "Remote · US",
    liveStatus: "live",
    verifiedLabel: "Live Aug 24",
    fit: "Strongest healthcare-domain match and a direct implementation career path.",
    gap: "Requires 30–50% travel. Confirm Lucidchart/Visio and Office experience honestly.",
    nextAction: "Make the travel decision; if yes, finish the packet and submit.",
    sourceUrl: "https://job-boards.greenhouse.io/perfectserve/jobs/6016375004",
    resumeId: "resume-perfectserve",
    packetIds: packet("perfectserve-ic1-6016375004"),
  },
  {
    id: "samsara-ase",
    priority: 4,
    company: "Samsara",
    role: "Associate Sales Engineer, SE Desk",
    salary: "$77k–$104k OTE",
    location: "Remote · Northeast US",
    liveStatus: "live",
    verifiedLabel: "Live Aug 24",
    fit: "High-upside associate solutions role using support, networking, demos, and APIs.",
    gap: "Electronics, hardware installation, and API scripting are explicit stretch areas.",
    nextAction: "Confirm Pittsburgh eligibility, review the finalized résumé, and apply.",
    sourceUrl: "https://www.samsara.com/company/careers/roles/7311741?gh_jid=7311741",
    resumeId: "resume-samsara",
    packetIds: packet("samsara-ase-ne-7311741"),
  },
  {
    id: "pattern-data",
    priority: 5,
    company: "Pattern Data",
    role: "Data Solutions Analyst",
    salary: "$80k–$110k + commission",
    location: "Pittsburgh · arrangement unclear",
    liveStatus: "live",
    verifiedLabel: "Live Aug 24",
    fit: "Local AI company with client-facing data, API, troubleshooting, and automation work.",
    gap: "One year of SQL and practical Python are the largest honest gaps.",
    nextAction: "Apply only with explicit gap framing; do not imply SQL/Python proficiency.",
    sourceUrl: "https://job-boards.greenhouse.io/patterndata/jobs/5187872007",
    resumeId: "resume-pattern",
    packetIds: packet("pattern-dsa-5187872007"),
  },
  {
    id: "foundant-technical",
    priority: 6,
    company: "Foundant",
    role: "Implementation Consultant",
    salary: "Not listed",
    location: "Remote · US",
    liveStatus: "live",
    verifiedLabel: "Live Aug 24",
    fit: "Configuration, QA, troubleshooting, and support under a project lead.",
    gap: "More technical than the AIC role; SQL and international travel are stretch areas.",
    nextAction: "Keep behind the Foundant AIC; do not submit both in the same first wave.",
    sourceUrl: "https://ats.rippling.com/foundant-careers/jobs/cd946aa3-28fa-4ed5-aa00-f21dbad6cab5",
    resumeId: "resume-foundant-ic",
    packetIds: packet("foundant-ic-cd946aa3"),
  },
  {
    id: "pointclickcare",
    priority: 7,
    company: "PointClickCare",
    role: "Software Implementation Consultant — Financial",
    salary: "$75k–$90k",
    location: "Remote · US",
    liveStatus: "live",
    verifiedLabel: "Live Aug 24",
    fit: "Health-tech implementation, workflow analysis, configuration, and strong salary.",
    gap: "Up to 30% travel and no verified billing or revenue-cycle background.",
    nextAction: "Promote from the alternative list only if 30% travel is acceptable.",
    sourceUrl: "https://jobs.lever.co/pointclickcare/bb844dc3-ea25-454d-8df4-7c607963a566",
    resumeId: "resume-healthtech",
    packetIds: [],
  },
  {
    id: "eleos",
    priority: 8,
    company: "Eleos Health",
    role: "Implementation Specialist",
    salary: "$55k–$70k",
    location: "Remote · US",
    liveStatus: "closed",
    verifiedLabel: "Closed Aug 24",
    fit: "Low-friction healthcare implementation-support match.",
    gap: "Below salary target at the low end and the listing has closed.",
    nextAction: "Retain the packet as a reusable health-tech template.",
    sourceUrl: "https://job-boards.eu.greenhouse.io/eleoshealth/jobs/4578788101",
    resumeId: "resume-eleos",
    packetIds: packet("eleos-impl-4578788101"),
  },
  {
    id: "ltk",
    priority: 9,
    company: "LTK",
    role: "Integrations Specialist",
    salary: "Not listed",
    location: "Remote · US",
    liveStatus: "closed",
    verifiedLabel: "Closed Aug 24",
    fit: "Semi-technical customer onboarding and support.",
    gap: "Weaker career capital and the listing has closed.",
    nextAction: "Keep the language bank; do not spend time applying.",
    sourceUrl: "https://job-boards.greenhouse.io/shopltk/jobs/7792650003",
    resumeId: "resume-ltk",
    packetIds: packet("ltk-integrations-7792650003"),
  },
  {
    id: "canvas",
    priority: 10,
    company: "Canvas Medical",
    role: "Solutions Consultant",
    salary: "$70k–$95k",
    location: "Remote · US",
    liveStatus: "closed",
    verifiedLabel: "Closed Aug 24",
    fit: "Healthcare EHR solutions role with good career alignment.",
    gap: "SDK and scripting depth; the direct listing now returns 404.",
    nextAction: "Archive and watch for a reopened or adjacent Canvas role.",
    sourceUrl: "https://jobs.lever.co/canvasmedical/8a1d5f8f-936c-4909-ae83-64899ea8b44a",
    resumeId: "resume-healthtech",
    packetIds: [],
  },
];

export function artifactById(id: string) {
  return allWorkspaceArtifacts.find((artifact) => artifact.id === id) ?? null;
}
