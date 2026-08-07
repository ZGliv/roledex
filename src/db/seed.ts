import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { closeDatabase, db, ensureDatabaseReady } from "./client";
import { migrateDatabase } from "./migrate";
import {
  candidateProfiles,
  jobSources,
  portfolioProjects,
  visitors,
} from "./schema";
import { DEFAULT_JOB_SOURCES } from "../features/discovery/default-sources";
import { OWNER_VISITOR_ID } from "../features/auth/identity";

const DEFAULT_CANDIDATE_PROFILE_ID = "candidate-default";

const candidateProfileSeed = {
  id: DEFAULT_CANDIDATE_PROFILE_ID,
  visitorId: OWNER_VISITOR_ID,
  currentRole: "Hospital Help Desk Analyst",
  currentSalaryCents: 4_900_000,
  preferredSalaryMinimumCents: 6_000_000,
  preferredSalaryTargetCents: 8_000_000,
  preferredWorkArrangements: ["remote", "hybrid", "on_site"] as const,
  preferredIndustries: [
    "Artificial intelligence",
    "Healthcare technology",
    "Software",
    "Emerging technology",
  ],
  targetRoleFamilies: [
    "AI implementation specialist",
    "AI solutions consultant",
    "Junior solutions engineer",
    "Technical customer success",
    "AI operations analyst",
    "Automation specialist",
    "AI business analyst",
    "Product analyst",
    "Associate product manager",
    "Product operations analyst",
    "Innovation analyst",
    "Digital transformation analyst",
    "Applied AI analyst",
    "AI enablement specialist",
    "Healthcare technology analyst",
    "Health-tech implementation specialist",
  ],
  strengths: [
    "Uses AI coding tools effectively",
    "Turns ideas into functioning applications",
    "Prototypes and ships products",
    "Reasons about users and business problems",
    "Communicates technical ideas clearly",
    "Learns unfamiliar tools quickly",
    "Combines product, psychology, business, and technology perspectives",
  ],
  weaknesses: [
    "Limited professional software engineering experience",
    "Limited production-codebase experience",
    "Limited evidence of deep computer-science fundamentals",
    "Gaps in cloud architecture, DevOps, testing, and backend systems",
    "Limited enterprise AI implementation experience",
  ],
  interests: [
    "Artificial intelligence",
    "AI agents",
    "Product development",
    "Human behavior",
    "Technology adoption",
    "Business strategy",
    "Automation",
    "Software tools",
    "Research",
    "User experience",
    "Influence and communication",
  ],
  education: [
    {
      areas: [
        "Business economics",
        "Psychology",
        "Information systems",
        "Emerging technology",
      ],
      level: "College graduate",
    },
  ],
  skills: [
    "AI-assisted development",
    "Product prototyping",
    "User research",
    "Business analysis",
    "Technical communication",
    "TypeScript",
    "JavaScript",
    "React",
    "React Native",
    "Expo",
    "Node.js",
    "SQL",
    "PostgreSQL",
    "Python",
    "Supabase",
    "Firebase",
    "Git/GitHub",
    "REST APIs",
    "Figma",
    "Active Directory",
    "Windows imaging",
    "Technical support",
  ],
  yearsExperience: 1,
  location: "Pittsburgh, PA",
  relocationPreference: "Prefer remote; consider realistic hybrid roles",
  careerGoals: [
    "Increase compensation meaningfully",
    "Gain practical AI exposure",
    "Build transferable technical and business experience",
    "Work on products or real business problems",
    "Improve long-term career growth and resume value",
  ],
  interviewConcerns: [
    "Algorithm-heavy live coding",
    "Advanced system design",
    "Deep production engineering questions",
  ],
  dealBreakers: [
    "Marginal compensation increase with worse flexibility or growth",
    "Commission-heavy compensation",
    "Excessive travel",
    "Senior engineering requirements disguised as entry level",
  ],
} satisfies typeof candidateProfiles.$inferInsert;

const portfolioProjectSeeds = [
  {
    id: "project-parlai",
    candidateProfileId: DEFAULT_CANDIDATE_PROFILE_ID,
    name: "Parl.ai",
    description:
      "A published App Store application built through AI-assisted product development and iterative release work.",
    technologies: ["Mobile application development", "AI-assisted development"],
    status: "published",
    responsibilities: [
      "Took the product from concept through implementation",
      "Iterated on the user experience",
      "Managed the path to a public App Store release",
    ],
    businessProblem:
      "Turned an original product concept into a usable consumer application.",
    userImpact:
      "Demonstrates the ability to finish and publicly ship a real product.",
    strongestEvidence: [
      "Published a real product",
      "Mobile application development",
      "AI-assisted product development",
      "Product thinking and iteration",
    ],
    relevantRoleFamilies: [
      "Associate product manager",
      "Product analyst",
      "Junior product engineer",
      "AI implementation specialist",
    ],
  },
  {
    id: "project-hospital-3d-map",
    candidateProfileId: DEFAULT_CANDIDATE_PROFILE_ID,
    name: "Hospital 3D Map",
    description:
      "A three-dimensional hospital navigation and visualization prototype based on a real workplace problem.",
    technologies: ["3D visualization", "Spatial interfaces", "Prototyping"],
    status: "prototype",
    responsibilities: [
      "Identified an operational navigation problem",
      "Translated user pain points into a software concept",
      "Experimented with spatial and visual interface techniques",
    ],
    businessProblem:
      "Hospital navigation can be confusing for patients, visitors, and staff.",
    userImpact:
      "Explores a clearer way to understand and navigate a complex healthcare environment.",
    strongestEvidence: [
      "Solved a real-world operational problem",
      "Healthcare-domain exposure",
      "Spatial and visual interface work",
      "Technical experimentation",
    ],
    relevantRoleFamilies: [
      "Healthcare technology analyst",
      "Health-tech implementation specialist",
      "Product analyst",
      "Innovation analyst",
    ],
  },
  {
    id: "project-ushop",
    candidateProfileId: DEFAULT_CANDIDATE_PROFILE_ID,
    name: "U-Shop",
    description:
      "A consumer-facing mobile application advanced close to App Store release through iterative design and implementation.",
    technologies: ["Mobile application development", "Consumer UI", "Prototyping"],
    status: "pre-release",
    responsibilities: [
      "Built a multi-step consumer application",
      "Iterated on interface design and implementation",
      "Advanced the project toward release readiness",
    ],
    businessProblem:
      "Provides a consumer software experience built around a shopping use case.",
    userImpact:
      "Demonstrates sustained execution on a substantial consumer-facing application.",
    strongestEvidence: [
      "Product prototyping",
      "Consumer-facing interface development",
      "Completing a multi-step application project",
      "Iterative design and implementation",
    ],
    relevantRoleFamilies: [
      "Associate product manager",
      "Product operations analyst",
      "Product analyst",
      "Junior product engineer",
    ],
  },
] satisfies (typeof portfolioProjects.$inferInsert)[];

export async function seedDatabase(): Promise<void> {
  await ensureDatabaseReady();
  await db.transaction(async (transaction) => {
    await transaction
      .insert(visitors)
      .values({ id: OWNER_VISITOR_ID, kind: "owner" })
      .onConflictDoNothing();

    await transaction
      .insert(candidateProfiles)
      .values(candidateProfileSeed)
      .onConflictDoNothing();

    await transaction
      .insert(portfolioProjects)
      .values(portfolioProjectSeeds)
      .onConflictDoNothing();

    await transaction
      .insert(jobSources)
      .values(
        DEFAULT_JOB_SOURCES.map((source) => ({
          provider: source.provider,
          providerKey: source.providerKey,
          companyName: source.companyName,
          companyDomain: source.companyDomain,
        })),
      )
      .onConflictDoNothing();
  });
}

const isMainModule =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  migrateDatabase()
    .then(seedDatabase)
    .then(() => {
      console.log("Seeded the editable candidate profile and portfolio projects.");
    })
    .catch((error: unknown) => {
      console.error("Database seed failed.", error);
      process.exitCode = 1;
    })
    .finally(closeDatabase);
}
