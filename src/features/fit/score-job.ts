import type {
  EligibilityRequirement,
  ExperienceRequirement,
  RemoteRestriction,
  SeniorityLevel,
  TechnologyMention,
} from "@/features/jobs/types";
import {
  FIT_COMPONENT_LABELS,
  FIT_COMPONENT_WEIGHTS,
  FIT_SCORING_VERSION,
  MINIMUM_SCORE_COVERAGE,
  NEUTRAL_COMPONENT_SCORE,
  ROLE_FAMILY_TAXONOMY,
} from "./scoring-config";
import type {
  CandidateFitProfile,
  CandidateLocation,
  CandidateSkill,
  DeterministicFitResult,
  EligibilityResult,
  FitComponentBreakdown,
  FitComponentKey,
  FitEvidence,
  FitVerdict,
  PortfolioEvidence,
  Readiness,
  ScoreJobInput,
} from "./types";

interface ComponentDraft {
  rawScore: number | null;
  coverage: number;
  rationale: string;
  evidence: FitEvidence[];
}

interface ExperienceEvaluation extends ComponentDraft {
  requiredGap: number | null;
  seniorityGap: number | null;
}

type RestrictionCompatibility = "compatible" | "incompatible" | "unresolved";

const COMPONENT_ORDER: readonly FitComponentKey[] = [
  "roleFamily",
  "skills",
  "experience",
  "compensation",
  "workArrangement",
  "portfolio",
  "careerValue",
  "industry",
];

const ROLE_STOP_WORDS = new Set([
  "ai",
  "artificial",
  "intelligence",
  "junior",
  "jr",
  "associate",
  "senior",
  "sr",
  "staff",
  "principal",
  "lead",
  "the",
  "and",
  "of",
]);

export function scoreJob(input: ScoreJobInput): DeterministicFitResult {
  const { job, candidate, portfolioProjects } = input;
  const experience = evaluateExperience(job.experienceRequirements, job.seniority.value, candidate);
  const drafts: Record<FitComponentKey, ComponentDraft> = {
    roleFamily: evaluateRoleFamily(job.title, candidate.targetRoleFamilies),
    skills: evaluateSkills(job.technologies, candidate.skills),
    experience,
    compensation: evaluateCompensation(job, candidate),
    workArrangement: evaluateWorkArrangement(job, candidate),
    portfolio: evaluatePortfolio(job, portfolioProjects),
    careerValue: evaluateCareerValue(job),
    industry: evaluateIndustry(job.industry.value, candidate),
  };

  const components = COMPONENT_ORDER.map((key) => buildComponent(key, drafts[key]));
  const deterministicFitScore = round(
    components.reduce((sum, component) => sum + component.weightedContribution, 0),
    1,
  );
  const scoreCoverage = round(
    components.reduce(
      (sum, component) => sum + component.weight * component.coverage,
      0,
    ) / 100,
    2,
  );
  const eligibility = evaluateEligibility(input);
  const assessmentState =
    scoreCoverage >= MINIMUM_SCORE_COVERAGE ? "scored" : "insufficient_data";
  const strongestMatches = selectEvidence(components, "positive");
  const qualificationGaps = selectEvidence(components, "negative");
  const reasonsNotToApply = buildReasonsNotToApply(
    components,
    eligibility,
    qualificationGaps,
  );
  const reasonsToApply = buildReasonsToApply(strongestMatches, eligibility);
  const stretchScore = calculateStretch(
    deterministicFitScore,
    scoreCoverage,
    eligibility,
    experience,
  );
  const { readiness, verdict, explanation } = deriveDisposition({
    score: deterministicFitScore,
    coverage: scoreCoverage,
    eligibility,
    experience,
    skills: drafts.skills,
    compensation: drafts.compensation,
    stretchScore,
  });

  return {
    scoringVersion: FIT_SCORING_VERSION,
    deterministicFitScore,
    fitScoreOutOfTen: round(deterministicFitScore / 10, 1),
    scoreCoverage,
    assessmentState,
    eligibility,
    components,
    strongestMatches,
    qualificationGaps,
    reasonsNotToApply,
    reasonsToApply,
    stretchScore,
    readiness,
    verdict,
    verdictExplanation: explanation,
  };
}

function buildComponent(
  key: FitComponentKey,
  draft: ComponentDraft,
): FitComponentBreakdown {
  const coverage = clamp(draft.coverage, 0, 1);
  const rawScore = draft.rawScore === null ? null : clamp(draft.rawScore, 0, 100);
  const effectiveScore = round(
    coverage * (rawScore ?? NEUTRAL_COMPONENT_SCORE) +
      (1 - coverage) * NEUTRAL_COMPONENT_SCORE,
    1,
  );
  const weight = FIT_COMPONENT_WEIGHTS[key];

  return {
    key,
    label: FIT_COMPONENT_LABELS[key],
    weight,
    rawScore,
    coverage,
    effectiveScore,
    weightedContribution: round((weight * effectiveScore) / 100, 2),
    rationale: draft.rationale,
    evidence: draft.evidence,
  };
}

function evaluateRoleFamily(
  title: string,
  targetRoleFamilies: string[] | null,
): ComponentDraft {
  if (targetRoleFamilies === null) {
    return unknownDraft("Target role families have not been recorded.", "role-family preferences");
  }
  if (targetRoleFamilies.length === 0) {
    return {
      rawScore: 50,
      coverage: 1,
      rationale: "No role-family preference is configured, so this component is neutral.",
      evidence: [],
    };
  }

  const jobFamilies = classifyRoleFamilies(title);
  const targetFamilies = new Set(
    targetRoleFamilies.flatMap((family) => [...classifyRoleFamilies(family)]),
  );
  const directFamily = [...jobFamilies].find((family) => targetFamilies.has(family));
  if (directFamily) {
    return {
      rawScore: 100,
      coverage: 1,
      rationale: "The confirmed title maps directly to a target role family.",
      evidence: [
        {
          kind: "match",
          message: `${title} matches the ${humanize(directFamily)} target family.`,
          source: "listing",
          excerpt: title,
        },
      ],
    };
  }

  const lexicalSimilarity = Math.max(
    ...targetRoleFamilies.map((target) => tokenSimilarity(title, target)),
  );
  if (lexicalSimilarity >= 0.45) {
    return {
      rawScore: 70,
      coverage: 0.8,
      rationale: "The title is adjacent to a target role, but not a direct taxonomy match.",
      evidence: [
        {
          kind: "match",
          message: `${title} has meaningful title overlap with a target role family.`,
          source: "listing",
          excerpt: title,
        },
      ],
    };
  }
  if (lexicalSimilarity >= 0.2) {
    return {
      rawScore: 40,
      coverage: 0.7,
      rationale: "The title has only tangential overlap with configured target roles.",
      evidence: [
        {
          kind: "risk",
          message: `${title} is only tangentially related to the configured role families.`,
          source: "listing",
          excerpt: title,
        },
      ],
    };
  }
  if (jobFamilies.size === 0) {
    return unknownDraft(
      "The title could not be mapped safely to the versioned role taxonomy.",
      "role-family classification",
    );
  }

  return {
    rawScore: 0,
    coverage: 0.9,
    rationale: "The recognized job family is outside the configured target families.",
    evidence: [
      {
        kind: "gap",
        message: `${title} maps to a recognized family outside the current targets.`,
        source: "listing",
        excerpt: title,
      },
    ],
  };
}

function classifyRoleFamilies(value: string): Set<string> {
  const normalized = normalize(value);
  const families = new Set<string>();
  for (const [family, aliases] of Object.entries(ROLE_FAMILY_TAXONOMY)) {
    if (aliases.some((alias) => phrasePresent(normalized, normalize(alias)))) {
      families.add(family);
    }
  }
  return families;
}

function evaluateSkills(
  technologies: TechnologyMention[],
  candidateSkills: CandidateSkill[] | null,
): ComponentDraft {
  const jobSkills = strongestTechnologyMentions(technologies);
  if (jobSkills.length === 0) {
    return unknownDraft("The listing has no safely extracted skill requirements.", "job skills");
  }
  if (candidateSkills === null) {
    return unknownDraft(
      "The candidate skill inventory is incomplete, so absent skills are not treated as gaps.",
      "candidate skills",
    );
  }

  const candidateBySkill = new Map<string, CandidateSkill>();
  for (const skill of candidateSkills) {
    const canonical = canonicalSkill(skill.name);
    const existing = candidateBySkill.get(canonical);
    if (!existing || skillEvidenceQuality(skill) > skillEvidenceQuality(existing)) {
      candidateBySkill.set(canonical, skill);
    }
  }

  let achieved = 0;
  let possible = 0;
  const evidence: FitEvidence[] = [];
  for (const technology of jobSkills) {
    const weight =
      technology.kind === "required" ? 2 : technology.kind === "preferred" ? 1 : 0.75;
    possible += weight;
    const candidateSkill = candidateBySkill.get(canonicalSkill(technology.name));
    if (!candidateSkill) {
      evidence.push({
        kind: technology.kind === "required" ? "gap" : "risk",
        message: `${technology.name} is ${technology.kind} but is not in the recorded skill inventory.`,
        source: "listing",
        excerpt: technology.evidence.excerpt,
      });
      continue;
    }

    const quality = skillEvidenceQuality(candidateSkill);
    achieved += weight * quality;
    evidence.push({
      kind: "match",
      message: `${technology.name} is supported by ${humanize(candidateSkill.evidence)} evidence.`,
      source: "candidate",
      excerpt: technology.evidence.excerpt,
    });
  }

  return {
    rawScore: possible === 0 ? null : (100 * achieved) / possible,
    coverage: 1,
    rationale:
      "Required technologies count twice as much as preferred technologies; evidence strength affects match credit.",
    evidence,
  };
}

function strongestTechnologyMentions(
  technologies: TechnologyMention[],
): TechnologyMention[] {
  const priority = { required: 3, preferred: 2, unspecified: 1 } as const;
  const mentions = new Map<string, TechnologyMention>();
  for (const technology of technologies) {
    const key = canonicalSkill(technology.name);
    const current = mentions.get(key);
    if (!current || priority[technology.kind] > priority[current.kind]) {
      mentions.set(key, technology);
    }
  }
  return [...mentions.values()];
}

function skillEvidenceQuality(skill: CandidateSkill): number {
  switch (skill.evidence) {
    case "professional":
      return 1;
    case "portfolio":
      return 0.75;
    case "coursework":
      return 0.6;
    case "self_assessed":
      return 0.5;
  }
}

function evaluateExperience(
  requirements: ExperienceRequirement[],
  jobSeniority: SeniorityLevel | null,
  candidate: CandidateFitProfile,
): ExperienceEvaluation {
  const candidateYears = candidate.relevantProfessionalExperienceYears;
  const required = requirements.filter((item) => item.kind === "required");
  const preferred = requirements.filter((item) => item.kind === "preferred");
  const applicable = required.length > 0 ? required : preferred;
  const strongestRequirement = applicable.reduce<ExperienceRequirement | null>(
    (current, item) =>
      current === null || item.minimumYears > current.minimumYears ? item : current,
    null,
  );
  const candidateStage = candidate.careerStage ?? stageFromYears(candidateYears);
  const stageGap = seniorityGap(candidateStage, jobSeniority);

  if (!strongestRequirement) {
    if (stageGap === null) {
      return {
        ...unknownDraft(
          "Neither a numeric experience requirement nor comparable seniority data is available.",
          "experience requirements",
        ),
        requiredGap: null,
        seniorityGap: null,
      };
    }
    const stageScore = stageGap <= 0 ? 95 : stageGap === 1 ? 65 : stageGap === 2 ? 25 : 0;
    return {
      rawScore: stageScore,
      coverage: 0.65,
      rationale: "No years were posted, so experience is estimated from explicit seniority only.",
      evidence: [
        {
          kind: stageGap <= 0 ? "match" : "gap",
          message: `Candidate stage ${humanize(candidateStage ?? "unknown")} versus ${humanize(jobSeniority ?? "unknown")} listing seniority.`,
          source: "derived",
        },
      ],
      requiredGap: null,
      seniorityGap: stageGap,
    };
  }

  if (candidateYears === null) {
    return {
      ...unknownDraft(
        "The listing states an experience requirement, but relevant professional tenure is not recorded.",
        "candidate professional experience",
      ),
      requiredGap: null,
      seniorityGap: stageGap,
    };
  }

  const gap = Math.max(0, strongestRequirement.minimumYears - candidateYears);
  let score = experienceGapScore(gap);
  if (strongestRequirement.kind === "preferred") {
    score = 60 + score * 0.4;
  }
  if (stageGap !== null && stageGap > 0) {
    const cap = stageGap === 1 ? 75 : stageGap === 2 ? 45 : 20;
    score = Math.min(score, cap);
  }

  const roundedGap = round(gap, 1);
  return {
    rawScore: score,
    coverage: 1,
    rationale:
      "The largest independent minimum is compared with relevant professional tenure; project time is never added as professional experience.",
    evidence: [
      {
        kind: gap <= 0 ? "match" : strongestRequirement.kind === "required" ? "gap" : "risk",
        message:
          gap <= 0
            ? `Recorded relevant professional experience meets the ${strongestRequirement.minimumYears}-year minimum.`
            : `The ${strongestRequirement.kind} experience minimum exceeds recorded relevant professional tenure by ${roundedGap} year${roundedGap === 1 ? "" : "s"}.`,
        source: "derived",
        excerpt: strongestRequirement.evidence.excerpt,
      },
    ],
    requiredGap: strongestRequirement.kind === "required" ? gap : null,
    seniorityGap: stageGap,
  };
}

function experienceGapScore(gap: number): number {
  if (gap <= 0) return 100;
  if (gap <= 1) return 75;
  if (gap <= 2) return 45;
  if (gap <= 3) return 20;
  return 0;
}

function stageFromYears(years: number | null): SeniorityLevel | null {
  if (years === null) return null;
  if (years < 2) return "entry";
  if (years < 5) return "mid";
  if (years < 8) return "senior";
  return "staff";
}

function seniorityGap(
  candidateStage: SeniorityLevel | null,
  jobStage: SeniorityLevel | null,
): number | null {
  if (!candidateStage || !jobStage || candidateStage === "unknown" || jobStage === "unknown") {
    return null;
  }
  const ranks: Record<Exclude<SeniorityLevel, "unknown">, number> = {
    intern: 0,
    entry: 1,
    mid: 2,
    senior: 3,
    staff: 4,
    leadership: 5,
  };
  return Math.max(0, ranks[jobStage] - ranks[candidateStage]);
}

function evaluateCompensation(
  job: ScoreJobInput["job"],
  candidate: CandidateFitProfile,
): ComponentDraft {
  const { salary } = job;
  if (salary.minimumCents === null && salary.maximumCents === null) {
    return unknownDraft(
      "No base salary was posted; compensation is neutral and visibly unknown.",
      "base salary",
    );
  }
  if (salary.period !== "year") {
    return unknownDraft(
      `The salary period is ${humanize(salary.period)}; it is not silently annualized.`,
      "comparable annual salary",
    );
  }
  const { currentSalaryAnnualCents, preferredSalaryMinimumAnnualCents, preferredSalaryTargetAnnualCents } =
    candidate;
  if (
    currentSalaryAnnualCents === null ||
    preferredSalaryMinimumAnnualCents === null ||
    preferredSalaryTargetAnnualCents === null
  ) {
    return unknownDraft(
      "Candidate salary thresholds are incomplete, so compensation cannot be compared safely.",
      "candidate salary thresholds",
    );
  }

  const lower = salary.minimumCents;
  const upper = salary.maximumCents;
  let rawScore: number;
  let rangeRationale: string;
  if (lower !== null && lower >= preferredSalaryTargetAnnualCents) {
    rawScore = 100;
    rangeRationale = "The lower bound meets or exceeds the target salary.";
  } else if (lower !== null && lower >= preferredSalaryMinimumAnnualCents) {
    rawScore = 85;
    rangeRationale = "The lower bound meets the minimum move salary.";
  } else if (
    lower !== null &&
    upper !== null &&
    lower < preferredSalaryMinimumAnnualCents &&
    upper >= preferredSalaryMinimumAnnualCents
  ) {
    rawScore = 60;
    rangeRationale = "The range straddles the minimum move salary.";
  } else if ((upper ?? lower ?? 0) > currentSalaryAnnualCents) {
    rawScore = 30;
    rangeRationale = "The known pay is above current salary but below the preferred minimum.";
  } else {
    rawScore = 0;
    rangeRationale = "The known pay does not improve on current salary.";
  }

  let coverage = salary.source === "employer_posted" ? 1 : salary.source === "externally_estimated" ? 0.5 : 0.65;
  if (lower === null) coverage = Math.min(coverage, 0.25);
  if (upper === null) coverage = Math.min(coverage, 0.75);

  return {
    rawScore,
    coverage,
    rationale: `${rangeRationale} ${salary.source === "externally_estimated" ? "The amount is externally estimated." : "Only base pay is used."}`,
    evidence: [
      {
        kind: rawScore >= 60 ? "match" : rawScore === 0 ? "gap" : "risk",
        message: rangeRationale,
        source: "listing",
        excerpt: salary.evidence[0]?.excerpt,
      },
    ],
  };
}

function evaluateWorkArrangement(
  job: ScoreJobInput["job"],
  candidate: CandidateFitProfile,
): ComponentDraft {
  const arrangement = job.workArrangement.value;
  if (!arrangement || arrangement === "unknown") {
    return unknownDraft("The work arrangement is unclear.", "work arrangement");
  }
  if (candidate.preferredWorkArrangements === null) {
    return unknownDraft(
      "Candidate work-arrangement preferences have not been recorded.",
      "work preferences",
    );
  }

  const preferenceIndex = candidate.preferredWorkArrangements.indexOf(arrangement);
  let rawScore =
    preferenceIndex === 0
      ? 100
      : preferenceIndex === 1
        ? 75
        : preferenceIndex >= 2
          ? 40
          : 15;
  let coverage = 1;
  const evidence: FitEvidence[] = [
    {
      kind: preferenceIndex >= 0 ? "match" : "gap",
      message:
        preferenceIndex >= 0
          ? `${humanize(arrangement)} is preference number ${preferenceIndex + 1}.`
          : `${humanize(arrangement)} is not a configured preferred arrangement.`,
      source: "candidate",
      excerpt: job.workArrangement.evidence[0]?.excerpt,
    },
  ];

  const restriction = overallRestrictionCompatibility(job.remoteRestrictions, candidate.location);
  if (arrangement === "remote" && restriction === "incompatible") {
    rawScore = 0;
    evidence.push({
      kind: "blocker",
      message: "The remote role's geographic restriction conflicts with the candidate location.",
      source: "listing",
    });
  } else if (arrangement === "remote" && restriction === "unresolved") {
    rawScore = Math.min(rawScore, 60);
    coverage = 0.5;
    evidence.push({
      kind: "unknown",
      message: "Remote eligibility cannot be resolved from the recorded location data.",
      source: "derived",
    });
  }

  return {
    rawScore,
    coverage,
    rationale:
      restriction === "unresolved"
        ? "The arrangement is attractive, but geographic eligibility remains unresolved."
        : "The explicit arrangement is compared with the candidate's ranked preferences.",
    evidence,
  };
}

function evaluatePortfolio(
  job: ScoreJobInput["job"],
  projects: PortfolioEvidence[] | null,
): ComponentDraft {
  if (projects === null) {
    return unknownDraft("Portfolio evidence has not been entered.", "portfolio evidence");
  }

  const jobFamilies = classifyRoleFamilies(job.title);
  const jobTechnologies = new Set(job.technologies.map((item) => canonicalSkill(item.name)));
  const jobIndustry = normalize(job.industry.value ?? "");
  const jobResponsibilityTokens = tokenSet(job.responsibilities.join(" "));
  const hasJobSignals =
    jobFamilies.size > 0 ||
    jobTechnologies.size > 0 ||
    Boolean(jobIndustry) ||
    jobResponsibilityTokens.size > 0;
  if (!hasJobSignals) {
    return unknownDraft(
      "The listing lacks enough structured role, skill, industry, or responsibility data to assess project relevance.",
      "job evidence for portfolio comparison",
    );
  }
  if (projects.length === 0) {
    return {
      rawScore: 0,
      coverage: 1,
      rationale: "The portfolio is known to contain no projects.",
      evidence: [
        {
          kind: "gap",
          message: "No portfolio project is available to support this role.",
          source: "candidate",
        },
      ],
    };
  }

  let bestProject: PortfolioEvidence | null = null;
  let bestScore = -1;
  let bestReasons: string[] = [];
  for (const project of projects) {
    let projectScore = 0;
    const reasons: string[] = [];
    const projectFamilies = new Set(
      project.roleFamilies.flatMap((family) => [...classifyRoleFamilies(family)]),
    );
    if ([...projectFamilies].some((family) => jobFamilies.has(family))) {
      projectScore += 35;
      reasons.push("role-family overlap");
    }

    const projectTechnologies = new Set(project.technologies.map(canonicalSkill));
    const matchingTechnologies = [...jobTechnologies].filter((skill) =>
      projectTechnologies.has(skill),
    );
    if (jobTechnologies.size > 0) {
      projectScore += 30 * (matchingTechnologies.length / jobTechnologies.size);
    }
    if (matchingTechnologies.length > 0) reasons.push("technology evidence");

    if (
      jobIndustry &&
      project.industries.some((industry) => adjacentIndustry(normalize(industry), jobIndustry))
    ) {
      projectScore += 20;
      reasons.push("industry overlap");
    }

    const responsibilitySimilarity = tokenSetSimilarity(
      tokenSet(project.responsibilities.join(" ")),
      jobResponsibilityTokens,
    );
    projectScore += 15 * responsibilitySimilarity;
    if (responsibilitySimilarity >= 0.2) reasons.push("responsibility overlap");

    if (projectScore > bestScore) {
      bestScore = projectScore;
      bestProject = project;
      bestReasons = reasons;
    }
  }

  const score = clamp(bestScore, 0, 100);
  return {
    rawScore: score,
    coverage: 0.9,
    rationale:
      "Portfolio relevance measures concrete role, technology, industry, and responsibility overlap; it never increases professional years.",
    evidence: bestProject
      ? [
          {
            kind: score >= 50 ? "match" : "risk",
            message:
              score >= 50 && bestReasons.length > 0
                ? `${bestProject.name} provides ${bestReasons.join(", ")}.`
                : bestReasons.length > 0
                  ? `${bestProject.name} offers only limited support (${bestReasons.join(", ")}) and does not yet demonstrate the role's core work.`
                  : `${bestProject.name} has little direct evidence for this listing.`,
            source: "portfolio",
          },
        ]
      : [],
  };
}

function evaluateCareerValue(job: ScoreJobInput["job"]): ComponentDraft {
  let score = 50;
  const evidence: FitEvidence[] = [];
  let signals = 0;

  const directAiWork =
    /\b(?:implement|configure|integrate|deploy|build|evaluate|test|design)\b[^.!?\n]{0,100}\b(?:ai|artificial intelligence|machine learning|llm|automation)\b/i.test(
      job.descriptionClean,
    ) ||
    /\b(?:ai|artificial intelligence|machine learning|llm|automation)\b[^.!?\n]{0,100}\b(?:implement|configure|integrate|deploy|build|evaluate|test|design)\b/i.test(
      job.descriptionClean,
    );
  if (directAiWork) {
    score += 20;
    signals += 1;
    evidence.push({
      kind: "match",
      message: "The responsibilities describe concrete AI or automation work.",
      source: "listing",
    });
  }
  if (/\b(?:own|launch|prototype|product roadmap|workflow implementation|customer implementation)\b/i.test(job.descriptionClean)) {
    score += 15;
    signals += 1;
    evidence.push({
      kind: "match",
      message: "The listing includes product or implementation ownership.",
      source: "listing",
    });
  }
  if (/\b(?:customer demos?|stakeholders?|cross-functional|onboarding customers?|client workshops?)\b/i.test(job.descriptionClean)) {
    score += 10;
    signals += 1;
    evidence.push({
      kind: "match",
      message: "The role offers customer or cross-functional experience.",
      source: "listing",
    });
  }
  if (/\b(?:mentorship|professional development|career growth|training program)\b/i.test(job.descriptionClean)) {
    score += 10;
    signals += 1;
    evidence.push({
      kind: "match",
      message: "The listing explicitly mentions structured growth or mentorship.",
      source: "listing",
    });
  }
  if (/\b(?:tier 1|password resets?|high-volume tickets?|scripted support)\b/i.test(job.descriptionClean)) {
    score -= 20;
    signals += 1;
    evidence.push({
      kind: "risk",
      message: "The work may be primarily repetitive first-line support.",
      source: "listing",
    });
  }
  if (/\b(?:commission[- ]only|uncapped commission|sales quota|quota-carrying)\b/i.test(job.descriptionClean)) {
    score -= 15;
    signals += 1;
    evidence.push({
      kind: "risk",
      message: "The role appears commission- or quota-heavy.",
      source: "listing",
    });
  }
  if (job.employmentType.value === "contract" || job.employmentType.value === "temporary") {
    score -= 15;
    signals += 1;
    evidence.push({
      kind: "risk",
      message: "Contract or temporary employment reduces stability.",
      source: "listing",
    });
  }
  if ((job.travelRequirement?.percent ?? 0) > 25) {
    score -= 15;
    signals += 1;
    evidence.push({
      kind: "risk",
      message: "Travel above 25% may reduce flexibility and learning value.",
      source: "listing",
    });
  }
  if (/\bai\b|artificial intelligence/i.test(job.title) && !directAiWork) {
    score -= 15;
    signals += 1;
    evidence.push({
      kind: "risk",
      message: "AI appears in the title without concrete AI responsibilities.",
      source: "listing",
      excerpt: job.title,
    });
  }

  if (signals === 0) {
    return unknownDraft(
      "Career value is too speculative without concrete learning, ownership, AI-work, or risk signals.",
      "career-value signals",
    );
  }
  return {
    rawScore: clamp(score, 0, 100),
    coverage: 0.65,
    rationale:
      "Career value is a low-confidence heuristic based only on explicit responsibilities and risks, never company prestige guesses.",
    evidence,
  };
}

function evaluateIndustry(
  jobIndustry: string | null,
  candidate: CandidateFitProfile,
): ComponentDraft {
  if (!jobIndustry) {
    return unknownDraft("The listing industry could not be determined safely.", "industry");
  }
  if (candidate.preferredIndustries === null) {
    return unknownDraft("Industry preferences have not been recorded.", "industry preferences");
  }
  if (candidate.preferredIndustries.length === 0) {
    return {
      rawScore: 50,
      coverage: 1,
      rationale: "No preferred industries are configured, so industry is neutral.",
      evidence: [],
    };
  }
  const normalizedJob = normalize(jobIndustry);
  const exact = candidate.preferredIndustries.some(
    (industry) => normalize(industry) === normalizedJob,
  );
  const adjacent = candidate.preferredIndustries.some((industry) =>
    adjacentIndustry(normalize(industry), normalizedJob),
  );
  const rawScore = exact ? 100 : adjacent ? 75 : 50;
  return {
    rawScore,
    coverage: 0.9,
    rationale: exact
      ? "The parsed industry is directly preferred."
      : adjacent
        ? "The parsed industry is adjacent to a preferred industry."
        : "A non-preferred industry is neutral unless explicitly excluded.",
    evidence: [
      {
        kind: rawScore > 50 ? "match" : "unknown",
        message: `${jobIndustry} is ${exact ? "a direct" : adjacent ? "an adjacent" : "not a configured"} industry preference.`,
        source: "listing",
      },
    ],
  };
}

function evaluateEligibility(input: ScoreJobInput): EligibilityResult {
  const { job, candidate } = input;
  const reasons: FitEvidence[] = [];

  const restriction = overallRestrictionCompatibility(job.remoteRestrictions, candidate.location);
  if (job.workArrangement.value === "remote" && restriction === "incompatible") {
    reasons.push({
      kind: candidate.relocationPreference === false ? "blocker" : "unknown",
      message:
        candidate.relocationPreference === false
          ? "The remote-location restriction conflicts with the candidate location and relocation is declined."
          : "The remote-location restriction would require a location change or manual confirmation.",
      source: "derived",
    });
  } else if (job.workArrangement.value === "remote" && restriction === "unresolved") {
    reasons.push({
      kind: "unknown",
      message: "Eligibility for the remote region or timezone restriction is unresolved.",
      source: "derived",
    });
  }

  if (job.workArrangement.value === "hybrid" || job.workArrangement.value === "on_site") {
    const locationCompatibility = jobLocationCompatibility(job.location, candidate.location);
    if (locationCompatibility === "incompatible") {
      reasons.push({
        kind: candidate.relocationPreference === false ? "blocker" : "unknown",
        message:
          candidate.relocationPreference === false
            ? "The office location conflicts with the candidate location and relocation is declined."
            : "The office location would require relocation or manual confirmation.",
        source: "derived",
      });
    } else if (locationCompatibility === "unresolved") {
      reasons.push({
        kind: "unknown",
        message: "Geographic feasibility for the office requirement is unresolved.",
        source: "derived",
      });
    }
  }

  const dealBreakers = candidate.dealBreakers;
  if (
    dealBreakers?.allowedWorkArrangements &&
    job.workArrangement.value &&
    job.workArrangement.value !== "unknown" &&
    !dealBreakers.allowedWorkArrangements.includes(job.workArrangement.value)
  ) {
    reasons.push({
      kind: "blocker",
      message: `${humanize(job.workArrangement.value)} violates an explicit work-arrangement dealbreaker.`,
      source: "candidate",
    });
  }
  if (dealBreakers?.allowedEmploymentTypes) {
    if (!job.employmentType.value || job.employmentType.value === "unknown") {
      reasons.push({
        kind: "unknown",
        message: "Employment type is unknown but is constrained by a candidate dealbreaker.",
        source: "derived",
      });
    } else if (!dealBreakers.allowedEmploymentTypes.includes(job.employmentType.value)) {
      reasons.push({
        kind: "blocker",
        message: `${humanize(job.employmentType.value)} violates an employment-type dealbreaker.`,
        source: "candidate",
      });
    }
  }
  if (dealBreakers?.maximumTravelPercent !== undefined && dealBreakers.maximumTravelPercent !== null) {
    if (job.travelRequirement?.required && job.travelRequirement.percent === null) {
      reasons.push({
        kind: "unknown",
        message: "Travel is required, but the amount cannot be checked against the travel limit.",
        source: "listing",
      });
    } else if ((job.travelRequirement?.percent ?? 0) > dealBreakers.maximumTravelPercent) {
      reasons.push({
        kind: "blocker",
        message: `Travel of ${job.travelRequirement?.percent}% exceeds the ${dealBreakers.maximumTravelPercent}% limit.`,
        source: "candidate",
      });
    }
  }
  if (dealBreakers?.excludedIndustries?.length && job.industry.value) {
    if (
      dealBreakers.excludedIndustries.some((industry) =>
        adjacentIndustry(normalize(industry), normalize(job.industry.value ?? "")),
      )
    ) {
      reasons.push({
        kind: "blocker",
        message: `${job.industry.value} is an explicitly excluded industry.`,
        source: "candidate",
      });
    }
  }
  evaluateSalaryDealBreaker(job, candidate, reasons);
  evaluateParsedEligibilityRequirements(job.eligibilityRequirements, candidate, reasons);

  const hasBlocker = reasons.some((reason) => reason.kind === "blocker");
  const hasUnknown = reasons.some((reason) => reason.kind === "unknown");
  return {
    status: hasBlocker ? "ineligible" : hasUnknown ? "unresolved" : "eligible",
    reasons,
  };
}

function evaluateSalaryDealBreaker(
  job: ScoreJobInput["job"],
  candidate: CandidateFitProfile,
  reasons: FitEvidence[],
): void {
  const floor = candidate.dealBreakers?.minimumAnnualSalaryCents;
  if (floor === undefined || floor === null) return;
  const salary = job.salary;
  if (
    salary.period !== "year" ||
    (salary.minimumCents === null && salary.maximumCents === null) ||
    salary.source !== "employer_posted"
  ) {
    reasons.push({
      kind: "unknown",
      message: "Posted base salary cannot yet satisfy the explicit compensation floor.",
      source: "derived",
    });
    return;
  }
  if ((salary.maximumCents ?? salary.minimumCents ?? 0) < floor) {
    reasons.push({
      kind: "blocker",
      message: "The entire employer-posted base range is below the explicit salary floor.",
      source: "candidate",
    });
    return;
  }
  if (salary.minimumCents === null || salary.minimumCents < floor) {
    reasons.push({
      kind: "unknown",
      message: "The employer-posted range straddles the explicit salary floor.",
      source: "derived",
    });
  }
}

function evaluateParsedEligibilityRequirements(
  requirements: EligibilityRequirement[],
  candidate: CandidateFitProfile,
  reasons: FitEvidence[],
): void {
  for (const requirement of requirements) {
    const candidateValues =
      requirement.kind === "citizenship"
        ? candidate.citizenships
        : requirement.kind === "work_authorization"
          ? candidate.workAuthorizationCountries
          : requirement.kind === "security_clearance"
            ? candidate.securityClearances
            : candidate.licenses;
    if (candidateValues === null || candidateValues === undefined) {
      reasons.push({
        kind: "unknown",
        message: `${humanize(requirement.kind)} eligibility is required but not recorded.`,
        source: "listing",
        excerpt: requirement.evidence.excerpt,
      });
      continue;
    }
    const requirementNormalized = normalize(requirement.value);
    const matches = candidateValues.some((value) => {
      const candidateNormalized = normalize(value);
      if (requirement.kind === "work_authorization") {
        return (
          candidateNormalized.includes("united states") ||
          candidateNormalized === "us" ||
          candidateNormalized === "usa"
        );
      }
      return (
        requirementNormalized.includes(candidateNormalized) ||
        candidateNormalized.includes(requirementNormalized)
      );
    });
    if (!matches) {
      reasons.push({
        kind: "blocker",
        message: `The recorded profile does not satisfy the ${humanize(requirement.kind)} requirement.`,
        source: "derived",
        excerpt: requirement.evidence.excerpt,
      });
    }
  }
}

function overallRestrictionCompatibility(
  restrictions: RemoteRestriction[],
  candidateLocation: CandidateLocation | null,
): RestrictionCompatibility {
  if (restrictions.length === 0) return "compatible";
  const results = restrictions.map((restriction) =>
    restrictionCompatibility(restriction, candidateLocation),
  );
  if (results.includes("incompatible")) return "incompatible";
  if (results.includes("unresolved")) return "unresolved";
  return "compatible";
}

function restrictionCompatibility(
  restriction: RemoteRestriction,
  candidateLocation: CandidateLocation | null,
): RestrictionCompatibility {
  if (!candidateLocation) return "unresolved";
  if (restriction.kind === "radius" || restriction.kind === "other") return "unresolved";
  if (restriction.kind === "timezone") {
    if (!candidateLocation.timezone) return "unresolved";
    return restriction.values.some((value) =>
      normalize(value).includes(normalize(candidateLocation.timezone ?? "")),
    )
      ? "compatible"
      : "incompatible";
  }
  if (restriction.kind === "country") {
    if (!candidateLocation.country) return "unresolved";
    const candidateCountry = canonicalCountry(candidateLocation.country);
    return restriction.values.some((value) => canonicalCountry(value) === candidateCountry)
      ? "compatible"
      : "incompatible";
  }
  const candidateValues = [candidateLocation.city, candidateLocation.region]
    .filter((value): value is string => Boolean(value))
    .map(normalize);
  if (candidateValues.length === 0) return "unresolved";
  return restriction.values.some((value) => {
    const allowed = normalize(value);
    return candidateValues.some(
      (candidateValue) =>
        allowed.includes(candidateValue) || candidateValue.includes(allowed),
    );
  })
    ? "compatible"
    : "incompatible";
}

function jobLocationCompatibility(
  jobLocation: string | null,
  candidateLocation: CandidateLocation | null,
): RestrictionCompatibility {
  if (!jobLocation || !candidateLocation) return "unresolved";
  if (/\bremote\b/i.test(jobLocation)) return "compatible";
  const normalizedJob = normalize(jobLocation);
  const candidateValues = [candidateLocation.city, candidateLocation.region, candidateLocation.country]
    .filter((value): value is string => Boolean(value))
    .map(normalize);
  if (candidateValues.length === 0) return "unresolved";
  return candidateValues.some(
    (value) => normalizedJob.includes(value) || value.includes(normalizedJob),
  )
    ? "compatible"
    : "incompatible";
}

function calculateStretch(
  score: number,
  coverage: number,
  eligibility: EligibilityResult,
  experience: ExperienceEvaluation,
): number {
  if (eligibility.status === "ineligible") return 10;
  let stretch = Math.round((100 - score) / 10);
  if (coverage < MINIMUM_SCORE_COVERAGE) stretch = Math.max(stretch, 5);
  if (experience.requiredGap !== null) {
    if (experience.requiredGap >= 4) stretch = 10;
    else if (experience.requiredGap >= 3) stretch = Math.max(stretch, 8);
    else if (experience.requiredGap >= 2) stretch = Math.max(stretch, 7);
    else if (experience.requiredGap > 0) stretch = Math.max(stretch, 4);
  }
  if ((experience.seniorityGap ?? 0) >= 3) stretch = Math.max(stretch, 9);
  else if ((experience.seniorityGap ?? 0) >= 2) stretch = Math.max(stretch, 7);
  if (eligibility.status === "unresolved") stretch = Math.max(stretch, 4);
  return clamp(Math.round(stretch), 0, 10);
}

function deriveDisposition(input: {
  score: number;
  coverage: number;
  eligibility: EligibilityResult;
  experience: ExperienceEvaluation;
  skills: ComponentDraft;
  compensation: ComponentDraft;
  stretchScore: number;
}): { readiness: Readiness | null; verdict: FitVerdict; explanation: string } {
  const { score, coverage, eligibility, experience, skills, compensation, stretchScore } = input;
  if (eligibility.status === "ineligible") {
    return {
      readiness: "not_yet_efficient",
      verdict: "skip",
      explanation: "A confirmed eligibility or explicit dealbreaker conflict overrides the preference score.",
    };
  }
  if (coverage < MINIMUM_SCORE_COVERAGE) {
    return {
      readiness: null,
      verdict: "save_for_later",
      explanation: "There is not enough deterministic evidence for an apply recommendation; verify the missing facts first.",
    };
  }
  if ((experience.requiredGap ?? 0) >= 4 || (experience.seniorityGap ?? 0) >= 3) {
    return {
      readiness: "not_yet_efficient",
      verdict: "save_for_later",
      explanation: "The role requires years or seniority that cannot be closed by a short skill sprint.",
    };
  }
  if ((experience.requiredGap ?? 0) >= 2 || (experience.seniorityGap ?? 0) >= 2) {
    return {
      readiness:
        (experience.requiredGap ?? 0) >= 3
          ? "not_yet_efficient"
          : "ready_with_positioning",
      verdict: "apply_as_stretch",
      explanation: "A material professional-experience or seniority gap caps the verdict at Apply as a Stretch.",
    };
  }
  if ((experience.requiredGap ?? 0) > 0 || (experience.seniorityGap ?? 0) > 0) {
    return {
      readiness: "ready_with_positioning",
      verdict: "apply_as_stretch",
      explanation:
        "A real professional-experience or seniority gap keeps this from being a standard apply recommendation.",
    };
  }
  if (skills.rawScore !== null && skills.rawScore < 45 && (experience.requiredGap ?? 0) < 2) {
    return {
      readiness: "ready_after_skill_sprint",
      verdict: "learn_first",
      explanation: "The main recorded gap is skill coverage rather than years of professional experience.",
    };
  }

  const hasHighImpactUnknown = compensation.rawScore === null;
  if (
    score >= 82 &&
    stretchScore <= 2 &&
    eligibility.status === "eligible" &&
    !hasHighImpactUnknown
  ) {
    return {
      readiness: "ready_now",
      verdict: "strong_apply",
      explanation: "The known evidence is strong across fit, experience, compensation, and eligibility.",
    };
  }
  if (score >= 68 && stretchScore <= 4) {
    return {
      readiness: "ready_with_positioning",
      verdict: "apply",
      explanation:
        eligibility.status === "unresolved"
          ? "The role is promising, but unresolved eligibility must be confirmed before applying."
          : "The role is a credible target with manageable positioning or preparation needs.",
    };
  }
  if (score >= 52) {
    return {
      readiness: "ready_with_positioning",
      verdict: "apply_as_stretch",
      explanation: "The role has enough overlap to consider, but the deterministic gaps make it a stretch.",
    };
  }
  if (score >= 45) {
    return {
      readiness: "not_yet_efficient",
      verdict: "save_for_later",
      explanation: "The current evidence is mixed and does not justify prioritizing an application.",
    };
  }
  return {
    readiness: "not_yet_efficient",
    verdict: "skip",
    explanation: "The known fit is too weak to make this an efficient application target now.",
  };
}

function selectEvidence(
  components: FitComponentBreakdown[],
  direction: "positive" | "negative",
): FitEvidence[] {
  return components
    .map((component) => ({
      component,
      impact:
        (component.weight * (component.effectiveScore - NEUTRAL_COMPONENT_SCORE)) / 100,
    }))
    .filter(({ impact }) => (direction === "positive" ? impact > 0 : impact < 0))
    .sort((a, b) =>
      direction === "positive" ? b.impact - a.impact : a.impact - b.impact,
    )
    .flatMap(({ component }) =>
      component.evidence.filter((item) =>
        direction === "positive"
          ? item.kind === "match"
          : item.kind === "gap" || item.kind === "risk" || item.kind === "blocker",
      ),
    )
    .filter(uniqueEvidence)
    .slice(0, 3);
}

function buildReasonsNotToApply(
  components: FitComponentBreakdown[],
  eligibility: EligibilityResult,
  gaps: FitEvidence[],
): string[] {
  const unknowns = components
    .filter((component) => component.coverage < 0.5)
    .sort((a, b) => b.weight - a.weight)
    .map((component) => `${component.label} is not supported by enough listing/profile evidence.`);
  const reasons = [
    ...eligibility.reasons.map((reason) => reason.message),
    ...gaps.map((gap) => gap.message),
    ...unknowns,
  ];
  const uniqueReasons = unique(reasons).slice(0, 5);
  if (uniqueReasons.length > 0) return uniqueReasons;
  return [
    "Even with a strong initial fit, the listing's actual interview bar and day-to-day scope still need verification.",
  ];
}

function buildReasonsToApply(
  matches: FitEvidence[],
  eligibility: EligibilityResult,
): string[] {
  const reasons = unique(matches.map((match) => match.message)).slice(0, 5);
  if (reasons.length > 0) return reasons;
  if (eligibility.status === "eligible") {
    return ["No explicit eligibility blocker was found in the structured listing data."];
  }
  return ["No strong deterministic reason to apply was established from the available evidence."];
}

function unknownDraft(rationale: string, unknownName: string): ComponentDraft {
  return {
    rawScore: null,
    coverage: 0,
    rationale,
    evidence: [
      {
        kind: "unknown",
        message: `${humanize(unknownName)} remains unknown.`,
        source: "derived",
      },
    ],
  };
}

function canonicalSkill(value: string): string {
  const normalized = normalize(value);
  const aliases: Record<string, string> = {
    postgres: "postgresql",
    "rest api": "rest apis",
    "restful api": "rest apis",
    "restful apis": "rest apis",
    gcp: "google cloud",
    "amazon web services": "aws",
    nextjs: "next js",
    nodejs: "node js",
    golang: "go",
  };
  return aliases[normalized] ?? normalized;
}

function canonicalCountry(value: string): string {
  const normalized = normalize(value);
  if (["us", "usa", "u s", "united states", "united states of america"].includes(normalized)) {
    return "united states";
  }
  return normalized;
}

function adjacentIndustry(first: string, second: string): boolean {
  if (!first || !second) return false;
  if (first === second || first.includes(second) || second.includes(first)) return true;
  const health = /\b(?:healthcare|health tech|health technology|medical|hospital)\b/;
  return health.test(first) && health.test(second);
}

function tokenSimilarity(first: string, second: string): number {
  return tokenSetSimilarity(tokenSet(first, ROLE_STOP_WORDS), tokenSet(second, ROLE_STOP_WORDS));
}

function tokenSet(
  value: string,
  stopWords: ReadonlySet<string> = new Set(["the", "and", "of", "to", "a", "an", "with", "for"]),
): Set<string> {
  return new Set(
    normalize(value)
      .split(" ")
      .filter((token) => token.length > 1 && !stopWords.has(token)),
  );
}

function tokenSetSimilarity(first: Set<string>, second: Set<string>): number {
  if (first.size === 0 || second.size === 0) return 0;
  const intersection = [...first].filter((token) => second.has(token)).length;
  const union = new Set([...first, ...second]).size;
  return union === 0 ? 0 : intersection / union;
}

function phrasePresent(haystack: string, needle: string): boolean {
  return ` ${haystack} `.includes(` ${needle} `);
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9+#]+/g, " ").trim();
}

function humanize(value: string): string {
  return value.replace(/_/g, " ");
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function uniqueEvidence(item: FitEvidence, index: number, items: FitEvidence[]): boolean {
  return items.findIndex((candidate) => candidate.message === item.message) === index;
}
