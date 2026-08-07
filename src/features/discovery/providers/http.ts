import type {
  DiscoveryFetchOptions,
  DiscoveryProvider,
} from "@/features/discovery/types";
import { DiscoveryProviderError } from "@/features/discovery/providers/errors";

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_RESPONSE_BYTES = 2_000_000;
const DEFAULT_MAX_ITEMS = 250;

const HARD_MAX_TIMEOUT_MS = 30_000;
// Some otherwise healthy large Greenhouse boards return a little over 5 MB
// when descriptions are included. Keep a firm ceiling while allowing those
// feeds to validate and refresh.
const HARD_MAX_RESPONSE_BYTES = 8_000_000;
const HARD_MAX_ITEMS = 500;

interface RequestContext {
  provider: DiscoveryProvider;
  sourceId: string;
}

export interface ResolvedDiscoveryLimits {
  fetcher: NonNullable<DiscoveryFetchOptions["fetcher"]>;
  timeoutMs: number;
  maxResponseBytes: number;
  maxItems: number;
}

function boundedInteger(
  context: RequestContext,
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
  label: string,
) {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved < minimum || resolved > maximum) {
    throw new DiscoveryProviderError({
      ...context,
      code: "invalid_config",
      message: `${context.provider} source "${context.sourceId}" has an invalid ${label}; expected an integer from ${minimum} to ${maximum}.`,
    });
  }
  return resolved;
}

export function resolveDiscoveryLimits(
  context: RequestContext,
  options: DiscoveryFetchOptions,
): ResolvedDiscoveryLimits {
  return {
    fetcher: options.fetcher ?? globalThis.fetch,
    timeoutMs: boundedInteger(
      context,
      options.timeoutMs,
      DEFAULT_TIMEOUT_MS,
      1,
      HARD_MAX_TIMEOUT_MS,
      "timeout",
    ),
    maxResponseBytes: boundedInteger(
      context,
      options.maxResponseBytes,
      DEFAULT_MAX_RESPONSE_BYTES,
      1,
      HARD_MAX_RESPONSE_BYTES,
      "response-size cap",
    ),
    maxItems: boundedInteger(
      context,
      options.maxItems,
      DEFAULT_MAX_ITEMS,
      1,
      HARD_MAX_ITEMS,
      "item cap",
    ),
  };
}

async function readBoundedBody(
  response: Response,
  context: RequestContext,
  maxResponseBytes: number,
) {
  const declaredLength = response.headers.get("content-length");
  if (declaredLength !== null) {
    const parsedLength = Number(declaredLength);
    if (Number.isFinite(parsedLength) && parsedLength > maxResponseBytes) {
      throw new DiscoveryProviderError({
        ...context,
        code: "response_too_large",
        message: `${context.provider} source "${context.sourceId}" declared a response larger than the ${maxResponseBytes}-byte limit.`,
      });
    }
  }

  if (!response.body) return "";

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      byteLength += value.byteLength;
      if (byteLength > maxResponseBytes) {
        await reader.cancel("Discovery response exceeded its configured limit.");
        throw new DiscoveryProviderError({
          ...context,
          code: "response_too_large",
          message: `${context.provider} source "${context.sourceId}" returned more than the ${maxResponseBytes}-byte limit.`,
        });
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(body);
}

export async function fetchBoundedJson(input: {
  context: RequestContext;
  url: URL;
  limits: ResolvedDiscoveryLimits;
}): Promise<unknown> {
  const { context, limits, url } = input;
  const controller = new AbortController();
  let timedOut = false;
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

  const timeout = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      timedOut = true;
      controller.abort();
      reject(
        new DiscoveryProviderError({
          ...context,
          code: "timeout",
          message: `${context.provider} source "${context.sourceId}" timed out after ${limits.timeoutMs}ms.`,
        }),
      );
    }, limits.timeoutMs);
  });

  const request = (async () => {
    let response: Response;
    try {
      response = await limits.fetcher(url, {
        method: "GET",
        headers: { accept: "application/json" },
        signal: controller.signal,
        cache: "no-store",
        redirect: "error",
      });
    } catch (error) {
      if (timedOut || controller.signal.aborted) {
        throw new DiscoveryProviderError({
          ...context,
          code: "timeout",
          message: `${context.provider} source "${context.sourceId}" timed out after ${limits.timeoutMs}ms.`,
          cause: error,
        });
      }
      throw new DiscoveryProviderError({
        ...context,
        code: "network",
        message: `${context.provider} source "${context.sourceId}" could not be reached.`,
        cause: error,
      });
    }

    if (!response.ok) {
      throw new DiscoveryProviderError({
        ...context,
        code: "http_status",
        status: response.status,
        message: `${context.provider} source "${context.sourceId}" returned HTTP ${response.status}.`,
      });
    }

    const body = await readBoundedBody(response, context, limits.maxResponseBytes);
    try {
      return JSON.parse(body) as unknown;
    } catch (error) {
      throw new DiscoveryProviderError({
        ...context,
        code: "invalid_json",
        message: `${context.provider} source "${context.sourceId}" returned invalid JSON.`,
        cause: error,
      });
    }
  })();

  try {
    return await Promise.race([request, timeout]);
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}
