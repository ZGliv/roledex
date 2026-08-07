import type { JobGauntletAnalysis } from "@/features/analysis/schema";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue };

export interface AnalyzeJobInput {
  listingFingerprint: string;
  candidateFingerprint: string;
  job: Record<string, JsonValue>;
  candidate: Record<string, JsonValue>;
  portfolioProjects: Array<Record<string, JsonValue>>;
  deterministicAnalysis: Record<string, JsonValue>;
}

export interface JobQuestionInput extends AnalyzeJobInput {
  question: string;
}

export interface CompareJobsInput {
  candidateFingerprint: string;
  candidate: Record<string, JsonValue>;
  jobs: Array<Record<string, JsonValue>>;
}

export interface JobComparison {
  summary: string;
  recommendedJobId: string | null;
  tradeoffs: string[];
}

export interface AIProvider {
  readonly id: string;
  analyzeJob(input: AnalyzeJobInput): Promise<JobGauntletAnalysis>;
  answerJobQuestion(input: JobQuestionInput): Promise<string>;
  compareJobs(input: CompareJobsInput): Promise<JobComparison>;
}

export interface ManualAnalysisRequest {
  requestId: string;
  schemaVersion: string;
  promptVersion: string;
  inputHash: string;
  listingFingerprint: string;
  candidateFingerprint: string;
  prompt: string;
  createdAt: string;
}
