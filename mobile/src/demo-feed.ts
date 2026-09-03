import type { FeedCard } from "@/features/api-v2/contracts";

type DemoSeed = Pick<
  FeedCard,
  "company" | "employmentType" | "location" | "tier" | "title" | "workMode"
> & { salary: string; score: number; why: string; risk: string };

const SEEDS: readonly DemoSeed[] = [
  { company: "Abridge", employmentType: "full_time", location: "Pittsburgh, PA", tier: "ready_now", title: "Implementation Specialist", workMode: "hybrid", salary: "$82K–$104K", score: 93, why: "Your healthcare systems background and client-facing implementation work line up unusually well.", risk: "Confirm how much travel is expected during enterprise launches." },
  { company: "Samsara", employmentType: "full_time", location: "Remote · US", tier: "ready_now", title: "Technical Customer Success Specialist", workMode: "remote", salary: "$78K–$112K", score: 89, why: "Strong overlap with troubleshooting, customer enablement, and translating technical workflows.", risk: "The role may include an expansion target; verify how performance is measured." },
  { company: "Notion", employmentType: "full_time", location: "New York, NY", tier: "credible_stretch", title: "Product Operations Analyst", workMode: "hybrid", salary: "$96K–$128K", score: 86, why: "Your systems thinking and process-improvement examples map directly to the operating cadence.", risk: "The listing prefers deeper analytics experience than your profile currently shows." },
  { company: "Intercom", employmentType: "full_time", location: "Chicago, IL", tier: "credible_stretch", title: "AI Enablement Program Coordinator", workMode: "hybrid", salary: "$88K–$118K", score: 84, why: "Your automation projects and enablement experience create a credible bridge into AI operations.", risk: "Ask whether direct experience with enterprise AI governance is required on day one." },
  { company: "Oscar Health", employmentType: "full_time", location: "Remote · East Coast", tier: "ready_now", title: "Business Systems Analyst", workMode: "remote", salary: "$85K–$115K", score: 91, why: "Healthcare domain knowledge plus workflow automation makes this a high-confidence match.", risk: "Validate whether the team expects advanced SQL ownership or only working proficiency." },
] as const;

export function demoFeedCards(): FeedCard[] {
  const retrievedAt = new Date().toISOString();
  return SEEDS.map((seed, index) => {
    const id = `demo-role-${index + 1}`;
    return {
      id,
      exposure: { id: `demo-exposure-${index + 1}`, sessionId: "demo-session", jobId: id, position: index },
      tier: seed.tier,
      title: seed.title,
      company: seed.company,
      location: seed.location,
      workMode: seed.workMode,
      employmentType: seed.employmentType,
      compensation: { display: seed.salary, annualMinimumCents: null, annualMaximumCents: null, source: "employer_posted", confidence: "high" },
      fit: { label: "Profile fit", score: seed.score, evidenceConfidence: "high", whyItFits: seed.why, biggestRisk: seed.risk },
      source: { name: "RoleDex demo", url: null, postedAt: retrievedAt },
      state: { decision: "unseen", decisionEventId: null },
      features: {
        version: 1,
        roleFamilies: [], responsibilities: [], requiredSkills: [], preferredSkills: [],
        experience: { minimumYears: null, maximumYears: null, seniority: null },
        compensation: { annualMinimumCents: null, annualMaximumCents: null, currency: "USD", source: "employer_posted", confidence: "high" },
        workplace: { location: seed.location, mode: seed.workMode, employmentType: seed.employmentType, authorization: null, sponsorship: null, travelPercent: null },
        company: { name: seed.company, industry: null },
        freshness: { postedAt: retrievedAt, retrievedAt, isDuplicate: false },
        extractionConfidence: "high",
      },
    };
  });
}
