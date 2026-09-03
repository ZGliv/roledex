import "server-only";

import { ZodError, type ZodType } from "zod";

import { GuestWorkspaceCapacityError } from "@/features/candidate/visitor-admission";
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

const MAX_JSON_BODY_BYTES = 16 * 1024;

const API_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
  "X-JobSwipe-API-Version": "1",
};

export function nativeJson(data: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  for (const [key, value] of Object.entries(API_HEADERS)) headers.set(key, value);
  return Response.json(data, { ...init, headers });
}

export function nativeError(
  status: number,
  code: string,
  message: string,
  headers?: HeadersInit,
) {
  return nativeJson({ error: { code, message } }, { status, headers });
}

export async function parseNativeJson<T>(request: Request, schema: ZodType<T>) {
  if (
    !/^application\/json(?:\s*;|$)/i.test(
      request.headers.get("content-type") ?? "",
    )
  ) {
    throw new NativeRequestError(415, "unsupported_media_type", "Send a JSON request body.");
  }
  const contentLength = request.headers.get("content-length");
  if (contentLength && !/^\d+$/.test(contentLength)) {
    throw new NativeRequestError(400, "invalid_content_length", "The content length is invalid.");
  }
  const declaredLength = Number(contentLength ?? "0");
  if (declaredLength > MAX_JSON_BODY_BYTES) {
    throw new NativeRequestError(413, "payload_too_large", "The request body is too large.");
  }
  let text: string;
  try {
    text = await readRequestTextWithinLimit(request, MAX_JSON_BODY_BYTES);
  } catch (error) {
    if (!(error instanceof RequestBodyLimitError)) {
      throw new NativeRequestError(400, "invalid_text", "The request body is not valid UTF-8.");
    }
    throw new NativeRequestError(413, "payload_too_large", "The request body is too large.");
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new NativeRequestError(400, "invalid_json", "The request body is not valid JSON.");
  }
  return schema.parse(value);
}

export class NativeRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "NativeRequestError";
  }
}

export function nativeBearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const match = /^Bearer ([A-Za-z0-9._~-]+)$/.exec(authorization);
  return match?.[1];
}

export function requireNativeSession(request: Request) {
  return authenticateNativeAccessToken(nativeBearerToken(request));
}

export function nativeRouteError(error: unknown) {
  if (error instanceof NativeRequestError) {
    return nativeError(error.status, error.code, error.message);
  }
  if (error instanceof ZodError) {
    return nativeJson(
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
    return nativeError(401, "invalid_session", error.message, {
      "WWW-Authenticate": 'Bearer realm="jobswipe-native"',
    });
  }
  if (error instanceof NativeInstallationRateLimitError) {
    return nativeError(
      429,
      "installation_rate_limited",
      error.message,
      { "Retry-After": String(error.retryAfterSeconds) },
    );
  }
  if (error instanceof GuestWorkspaceCapacityError) {
    return nativeError(429, "guest_capacity_reached", error.message, {
      "Retry-After": "3600",
    });
  }
  if (error instanceof NativeConfigurationError) {
    return nativeError(503, "native_sessions_unavailable", error.message);
  }
  if (error instanceof NativeWorkspaceConflictError) {
    return nativeError(409, "workspace_claim_conflict", error.message);
  }
  console.error("Native API request failed.", error);
  return nativeError(500, "internal_error", "The request could not be completed.");
}
