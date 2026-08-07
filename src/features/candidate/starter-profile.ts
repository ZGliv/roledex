import {
  candidateProfileFingerprint,
  type CandidateProfileUpdate,
} from "@/features/candidate/input";

export const STARTER_PROFILE: CandidateProfileUpdate = {
  currentRole: "Exploring new opportunities",
  currentSalaryCents: 0,
  preferredSalaryMinimumCents: 0,
  preferredSalaryTargetCents: 0,
  preferredWorkArrangements: ["remote", "hybrid", "on_site"],
  preferredIndustries: ["Technology", "Professional services"],
  targetRoleFamilies: [
    "Customer success",
    "Implementation",
    "Operations",
    "Product support",
  ],
  strengths: ["Communication", "Problem solving"],
  weaknesses: [],
  interests: [],
  skills: ["Communication", "Problem solving", "Project coordination"],
  yearsExperience: 0,
  location: "",
  relocationPreference: "",
  careerGoals: ["Find a role with room to learn and grow"],
  interviewConcerns: [],
  dealBreakers: [],
};

export const STARTER_PROFILE_FINGERPRINT =
  candidateProfileFingerprint(STARTER_PROFILE);
