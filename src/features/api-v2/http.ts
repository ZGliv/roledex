import "server-only";

import { ZodError, type ZodType } from "zod";

import { JOBSWIPE_API_VERSION } from "@/features/api-v2/contracts";
import {
  CandidateResumeImportNotFoundError,
  CandidateResumeImportSelectionError,
} from "@/features/candidate/search-contract-service";
import {
  CandidateProfileConflictError,
  CandidateProfileRateLimitError,
} from "@/features/candidate/service";
import { GuestWorkspaceCapacityError } from "@/features/candidate/visitor-admission";
import {
  DecisionIdempotencyConflictError,
  GuestActivityWriteRateLimitError,
} from "@/features/decisions/service";
import {
  NativeAuthenticationError,
  NativeConfigurationError,
  NativeWorkspaceConflictError,
  authenticateNativeAccessToken,
} from "@/features/native/service";
import { NativeInstallationRateLimitError } from "@/features/native/rate-limit";
import {
  readRequestTextWithinLimit,
  RequestBodyLimitError,
} from "@/lib/http/read-request-text";

const DEFAULT_MAX_JSON_BODY_BYTES = 128 * 1024;
const NATIVE_ORIGIN = "capacitor://localhost";

export class ApiV2RequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiV2RequestError";
  }
}

export class ApiV2ConflictError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiV2ConflictError";
  }
}

function configuredMobileOrigins() {
  const configured = process.env.JOBSWIPE_MOBILE_ORIGINS
    ?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean) ?? [];
  const origins = new Set([NATIVE_ORIGIN, ...configured]);
  if (process.env.NODE_ENV !== "production") {
    origins.add("http://localhost:4173");
    origins.add("http://127.0.0.1:4173");
  }
  return origins;
}

function corsHeaders(request: Request) {
  const headers = new Headers();
  const origin = request.headers.get("origin");
  if (origin) headers.set("Vary", "Origin");
  if (origin && configuredMobileOrigins().has(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set(
      "Access-Control-Allow-Headers",
      "Authorization, Content-Type, X-Installation-Credential",
    );
    headers.set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
    headers.set(
      "Access-Control-Expose-Headers",
      "Content-Disposition, Retry-After, X-JobSwipe-API-Version",
    );
    headers.set("Access-Control-Max-Age", "86400");
  }
  return headers;
}

export function apiV2Json(
  request: Request,
  data: unknown,
  init: ResponseInit = {},
) {
  const headers = new Headers(init.headers);
  for (const [key, value] of corsHeaders(request)) headers.set(key, value);
  headers.set("Cache-Control", "private, no-store, max-age=0");
  headers.set("Expires", "0");
  headers.set("Pragma", "no-cache");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-JobSwipe-API-Version", String(JOBSWIPE_API_VERSION));
  return Response.json(data, { ...init, headers });
}

export function apiV2Options(request: Request) {
  const headers = corsHeaders(request);
  headers.set("Cache-Control", "public, max-age=86400");
  headers.set("X-JobSwipe-API-Version", String(JOBSWIPE_API_VERSION));
  return new Response(null, { status: 204, headers });
}

export function apiV2Error(
  request: Request,
  status: number,
  code: string,
  message: string,
  headers?: HeadersInit,
) {
  return apiV2Json(request, { error: { code, message } }, { status, headers });
}

export async function parseApiV2Json<T>(
  request: Request,
  schema: ZodType<T>,
  maximumBytes = DEFAULT_MAX_JSON_BODY_BYTES,
) {
  if (
    !/^application\/json(?:\s*;|$)/i.test(
      request.headers.get("content-type") ?? "",
    )
  ) {
    throw new ApiV2RequestError(
      415,
      "unsupported_media_type",
      "Send a JSON request body.",
    );
  }
  const contentLength = request.headers.get("content-length");
  if (contentLength && !/^\d+$/.test(contentLength)) {
    throw new ApiV2RequestError(400, "invalid_content_length", "The content length is invalid.");
  }
  const declaredLength = Number(contentLength ?? "0");
  if (declaredLength > maximumBytes) {
    throw new ApiV2RequestError(413, "payload_too_large", "The request body is too large.");
  }
  let text: string;
  try {
    text = await readRequestTextWithinLimit(request, maximumBytes);
  } catch (error) {
    if (!(error instanceof RequestBodyLimitError)) {
      throw new ApiV2RequestError(400, "invalid_text", "The request body is not valid UTF-8.");
    }
    throw new ApiV2RequestError(413, "payload_too_large", "The request body is too large.");
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new ApiV2RequestError(400, "invalid_json", "The request body is not valid JSON.");
  }
  return schema.parse(value);
}

export function apiV2BearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const match = /^Bearer ([A-Za-z0-9._~-]+)$/.exec(authorization);
  return match?.[1];
}

export function requireApiV2Session(request: Request) {
  return authenticateNativeAccessToken(apiV2BearerToken(request));
}

export function apiV2RouteError(request: Request, error: unknown) {
  if (error instanceof ApiV2RequestError) {
    return apiV2Error(request, error.status, error.code, error.message);
  }
  if (error instanceof ApiV2ConflictError) {
    return apiV2Error(request, 409, error.code, error.message);
  }
  if (error instanceof CandidateProfileConflictError) {
    return apiV2Error(request, 409, "profile_conflict", error.message);
  }
  if (error instanceof CandidateProfileRateLimitError) {
    return apiV2Error(request, 429, "profile_rate_limited", error.message);
  }
  if (error instanceof CandidateResumeImportNotFoundError) {
    return apiV2Error(request, 404, "resume_import_not_found", error.message);
  }
  if (error instanceof CandidateResumeImportSelectionError) {
    return apiV2Error(request, 422, "resume_selection_invalid", error.message);
  }
  if (error instanceof DecisionIdempotencyConflictError) {
    return apiV2Error(request, 409, "idempotency_conflict", error.message);
  }
  if (error instanceof GuestActivityWriteRateLimitError) {
    return apiV2Error(request, 429, "activity_rate_limited", error.message);
  }
  if (error instanceof NativeInstallationRateLimitError) {
    return apiV2Error(
      request,
      429,
      "installation_rate_limited",
      error.message,
      { "Retry-After": String(error.retryAfterSeconds) },
    );
  }
  if (error instanceof GuestWorkspaceCapacityError) {
    return apiV2Error(request, 429, "guest_capacity_reached", error.message, {
      "Retry-After": "3600",
    });
  }
  if (error instanceof ZodError) {
    return apiV2Json(
      request,
      {
        error: {
          code: "validation_failed",
          message: "Check the submitted values.",
          fields: error.flatten().fieldErrors,
        },
      },
      { status: 422 },
    );
  }
  if (error instanceof NativeAuthenticationError) {
    return apiV2Error(request, 401, "invalid_session", error.message, {
      "WWW-Authenticate": 'Bearer realm="jobswipe-native"',
    });
  }
  if (error instanceof NativeConfigurationError) {
    return apiV2Error(request, 503, "native_sessions_unavailable", error.message);
  }
  if (error instanceof NativeWorkspaceConflictError) {
    return apiV2Error(request, 409, "workspace_claim_conflict", error.message);
  }
  console.error("RoleDex API v2 request failed.", error);
  return apiV2Error(request, 500, "internal_error", "The request could not be completed.");
}
