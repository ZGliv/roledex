import { Capacitor } from "@capacitor/core";

import type {
  ApiEnvelope,
  FeedCard,
  FeedSession,
  InteractionEvent,
  InteractionResult,
  SavedJob,
  SearchContract,
} from "@/features/api-v2/contracts";
import type { ApiV2SavedUpdate } from "@/features/api-v2/input";

import { sessionVault, type MobileSession } from "./session-vault";
import { clearPendingInteractions } from "./outbox";

export type MobileRoleTargetInput = {
  aliases: string[];
  allowedSeniorityLevels: string[];
  canonicalFamily: string;
  exclusions: string[];
  label: string;
  maximumRequiredExperienceYears: number | null;
  minimumRequiredExperienceYears: number | null;
  priorityRank: number;
  readiness: "ready_now" | "stretch";
};

export type MobileProfileEditor = {
  currentRole: string;
  currentSalaryCents: number;
  location: string | null;
  relocationPreference: string | null;
  yearsExperience: number;
  preferredIndustries: string[];
  targetRoleFamilies: string[];
  skills: string[];
  strengths: string[];
  weaknesses: string[];
  interests: string[];
  careerGoals: string[];
  dealBreakers: string[];
  interviewConcerns: string[];
};

export type MobileProfileData = {
  searchContract: SearchContract;
  onboardingCompleted: boolean;
  editor: MobileProfileEditor;
  improveFeed: { id: string; title: string; detail: string };
  learnedPreferences: Record<string, unknown> & {
    controls: readonly ("more" | "less" | "ignore" | "reset")[];
  };
  resumes: readonly {
    id: string;
    label: string;
    sourceFileName: string | null;
    createdAt: string;
  }[];
  settings: {
    dailyDigestEnabled: boolean;
    reminderNotificationsEnabled: boolean;
  };
};

export type MobileProfileUpdate =
  | {
      section: "core";
      values: MobileProfileEditor & {
        expectedRevision: number;
        location: string;
        relocationPreference: string;
        preferredSalaryMinimumCents: number;
        preferredSalaryTargetCents: number;
        preferredWorkArrangements: string[];
      };
    }
  | {
      section: "search";
      values: {
        expectedRevision: number;
        desiredSeniorityLevels: string[];
        excludedTitles: string[];
        excludedCompanies: string[];
        excludedIndustries: string[];
        acceptedEmploymentTypes: string[];
        preferredWorkModes: string[];
        strictWorkModes: boolean;
        commuteRadiusMiles: number | null;
        maxOfficeDaysPerWeek: number | null;
        relocationDestinations: string[];
        maxTravelPercent: number | null;
        workAuthorization: string;
        requiresSponsorship: boolean | null;
        missingSalaryPolicy: "show" | "explore_only" | "hide";
      };
    }
  | {
      section: "role_targets";
      values: {
        expectedRevision: number;
        targets: MobileRoleTargetInput[];
      };
    }
  | { section: "onboarding"; values: { completed: true } };

export type MobileDeviceSession = {
  id: string;
  platform: string;
  deviceName: string | null;
  appVersion: string;
  buildNumber: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  current: boolean;
};

export type MobileAuthCapabilities = {
  guest: boolean;
  pairingCodeClaim: boolean;
  signInWithApple: boolean;
  signInWithAppleBlockers: string[];
};

export type MobileResumeDraft = {
  parserVersion: "resume-deterministic-v1";
  workHistory: readonly {
    company: string;
    title: string;
    confidence: "low" | "medium" | "high";
  }[];
  education: readonly {
    institution: string;
    degree: string;
    confidence: "low" | "medium" | "high";
  }[];
  skills: readonly {
    name: string;
    confidence: "low" | "medium" | "high";
  }[];
  projects: readonly {
    name: string;
    confidence: "low" | "medium" | "high";
  }[];
  warnings: readonly string[];
};

type ApiErrorBody = { error?: { code?: string; message?: string } };

function apiBase() {
  const configured = import.meta.env.VITE_JOBSWIPE_API_BASE_URL;
  const fallback = Capacitor.isNativePlatform()
    ? "https://jobswipe-amber.vercel.app"
    : "http://localhost:3100";
  const url = new URL(configured || fallback);
  const localHttp =
    !Capacitor.isNativePlatform() &&
    url.protocol === "http:" &&
    ["localhost", "127.0.0.1"].includes(url.hostname);
  if (url.protocol !== "https:" && !localHttp) {
    throw new Error("JobSwipe API requests require HTTPS outside local preview.");
  }
  url.pathname = url.pathname.replace(/\/$/, "");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

const API_BASE = apiBase();
const REQUEST_TIMEOUT_MS = 15_000;
let refreshInFlight: Promise<MobileSession> | null = null;
let guestSessionInFlight: Promise<MobileSession> | null = null;

function apiFetch(url: string, init: RequestInit = {}) {
  return fetch(url, {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
}

export class MobileApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "MobileApiError";
  }
}

async function responseJson<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => ({}))) as ApiErrorBody & T;
  if (!response.ok) {
    throw new MobileApiError(
      response.status,
      body.error?.code ?? "request_failed",
      body.error?.message ?? "The request could not be completed.",
    );
  }
  return body;
}

async function createGuestSession() {
  const response = await apiFetch(`${API_BASE}/api/v2/installations`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      platform: "ios",
      appVersion: import.meta.env.VITE_JOBSWIPE_APP_VERSION || "0.1.0",
      buildNumber: import.meta.env.VITE_JOBSWIPE_BUILD_NUMBER || "1",
      deviceName: null,
    }),
  });
  const envelope = await responseJson<ApiEnvelope<MobileSession>>(response);
  await sessionVault.write(envelope.data);
  return envelope.data;
}

async function refreshSession(session: MobileSession) {
  if (refreshInFlight) return refreshInFlight;
  const pending = (async () => {
    const response = await apiFetch(`${API_BASE}/api/v2/sessions/refresh`, {
      method: "POST",
      headers: { authorization: `Bearer ${session.installationCredential}` },
    });
    const envelope = await responseJson<ApiEnvelope<MobileSession>>(response);
    await sessionVault.write(envelope.data);
    return envelope.data;
  })();
  refreshInFlight = pending;
  try {
    return await pending;
  } finally {
    if (refreshInFlight === pending) refreshInFlight = null;
  }
}

async function validSession() {
  const current = await sessionVault.read();
  if (!current) {
    if (!guestSessionInFlight) {
      const pending = createGuestSession();
      guestSessionInFlight = pending;
      void pending.then(
        () => {
          if (guestSessionInFlight === pending) guestSessionInFlight = null;
        },
        () => {
          if (guestSessionInFlight === pending) guestSessionInFlight = null;
        },
      );
    }
    return guestSessionInFlight;
  }
  const refreshAt = new Date(current.accessTokenExpiresAt).getTime() - 60_000;
  if (Date.now() < refreshAt) return current;
  try {
    return await refreshSession(current);
  } catch (error) {
    if (error instanceof MobileApiError && error.status === 401) {
      // Never silently replace an established workspace with a blank guest.
      // Keep the credential available for recovery or a later grace retry.
      throw new MobileApiError(
        401,
        "session_recovery_required",
        "This device needs to reconnect to your existing search.",
      );
    }
    throw error;
  }
}

async function authorizedFetch(path: string, init: RequestInit = {}) {
  const session = await validSession();
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${session.accessToken}`);
  if (init.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  const response = await apiFetch(`${API_BASE}${path}`, { ...init, headers });
  if (response.status !== 401) return response;
  const latest = await sessionVault.read();
  const refreshed =
    latest && latest.accessToken !== session.accessToken
      ? latest
      : await refreshSession(latest ?? session);
  headers.set("authorization", `Bearer ${refreshed.accessToken}`);
  return apiFetch(`${API_BASE}${path}`, { ...init, headers });
}

export const mobileApi = {
  async feed(cursor: string | null = null) {
    const query = new URLSearchParams({ limit: "20" });
    if (cursor) query.set("cursor", cursor);
    const response = await authorizedFetch(`/api/v2/feed?${query}`);
    return responseJson<
      ApiEnvelope<
        { session: FeedSession; cards: FeedCard[] },
        { hasMore: boolean; nextCursor: string | null; caughtUp: boolean }
      >
    >(response);
  },

  async interactions(events: readonly InteractionEvent[]) {
    const response = await authorizedFetch("/api/v2/interactions/batch", {
      method: "POST",
      body: JSON.stringify({ events }),
    });
    return responseJson<ApiEnvelope<InteractionResult[]>>(response);
  },

  async saved() {
    const response = await authorizedFetch("/api/v2/saved?sort=recent");
    return responseJson<ApiEnvelope<SavedJob[]>>(response);
  },

  async updateSaved(input: ApiV2SavedUpdate) {
    const response = await authorizedFetch("/api/v2/saved", {
      method: "PATCH",
      body: JSON.stringify(input),
    });
    return responseJson<ApiEnvelope<Record<string, unknown>>>(response);
  },

  async profile() {
    const response = await authorizedFetch("/api/v2/profile");
    return responseJson<ApiEnvelope<MobileProfileData>>(response);
  },

  async updateProfile(input: MobileProfileUpdate) {
    const response = await authorizedFetch("/api/v2/profile", {
      method: "PATCH",
      body: JSON.stringify(input),
    });
    return responseJson<ApiEnvelope<{ revision?: number; completed?: boolean }>>(
      response,
    );
  },

  async createResumeImport(rawText: string) {
    const response = await authorizedFetch("/api/v2/resume-import", {
      method: "POST",
      body: JSON.stringify({
        label: "Primary résumé",
        sourceFileName: null,
        rawText,
      }),
    });
    return responseJson<
      ApiEnvelope<{
        draft: MobileResumeDraft;
        importId: string;
        revision: number;
      }>
    >(response);
  },

  async confirmResumeImport(
    importId: string,
    input: {
      expectedProfileRevision: number;
      selectedWorkIndexes: number[];
      selectedEducationIndexes: number[];
      selectedSkillIndexes: number[];
      selectedProjectIndexes: number[];
      retainRawSource: boolean;
    },
  ) {
    const response = await authorizedFetch(
      `/api/v2/resume-import/${encodeURIComponent(importId)}/confirm`,
      { method: "POST", body: JSON.stringify(input) },
    );
    return responseJson<
      ApiEnvelope<{
        imported: { work: number; education: number; skills: number; projects: number };
        revision: number;
      }>
    >(response);
  },

  async capabilities() {
    const response = await apiFetch(`${API_BASE}/api/v2/auth/capabilities`);
    return responseJson<ApiEnvelope<MobileAuthCapabilities>>(response);
  },

  async claimWorkspace(code: string) {
    const response = await authorizedFetch("/api/v2/workspace/claim", {
      method: "POST",
      body: JSON.stringify({ method: "pairing_code", code }),
    });
    const envelope = await responseJson<ApiEnvelope<MobileSession>>(response);
    await sessionVault.write(envelope.data);
    clearPendingInteractions();
    return envelope;
  },

  async createPairingCode() {
    const response = await authorizedFetch("/api/v2/workspace/pairing-code", {
      method: "POST",
    });
    return responseJson<
      ApiEnvelope<{ code: string; expiresAt: string }>
    >(response);
  },

  async claimWorkspaceWithApple(input: {
    identityToken: string;
    authorizationCode: string;
    nonce: string;
  }) {
    const response = await authorizedFetch("/api/v2/workspace/claim", {
      method: "POST",
      body: JSON.stringify({ method: "sign_in_with_apple", ...input }),
    });
    const envelope = await responseJson<ApiEnvelope<MobileSession>>(response);
    await sessionVault.write(envelope.data);
    clearPendingInteractions();
    return envelope;
  },

  async sessions() {
    const response = await authorizedFetch("/api/v2/sessions");
    return responseJson<ApiEnvelope<MobileDeviceSession[]>>(response);
  },

  async revokeSession(installationId: string) {
    const response = await authorizedFetch(
      `/api/v2/sessions/${encodeURIComponent(installationId)}`,
      { method: "DELETE" },
    );
    return responseJson<ApiEnvelope<{ revoked: boolean }>>(response);
  },

  async exportAccount() {
    const response = await authorizedFetch("/api/v2/account/export");
    return responseJson<ApiEnvelope<Record<string, unknown>>>(response);
  },

  async deleteAccount() {
    const session = await validSession();
    const response = await authorizedFetch("/api/v2/account", {
      method: "DELETE",
      headers: {
        "x-installation-credential": session.installationCredential,
      },
      body: JSON.stringify({ confirmation: "DELETE_MY_ACCOUNT" }),
    });
    const result = await responseJson<
      ApiEnvelope<{ deleted: boolean; profilesDeleted: number }>
    >(response);
    if (result.data.deleted) {
      await sessionVault.clear();
      clearPendingInteractions();
    }
    return result;
  },
};
