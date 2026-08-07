import type { DiscoveryProvider } from "@/features/discovery/types";

export type DiscoveryProviderErrorCode =
  | "invalid_config"
  | "timeout"
  | "network"
  | "http_status"
  | "response_too_large"
  | "invalid_json"
  | "invalid_payload";

export class DiscoveryProviderError extends Error {
  readonly provider: DiscoveryProvider;
  readonly sourceId: string;
  readonly code: DiscoveryProviderErrorCode;
  readonly status: number | null;
  override readonly cause: unknown;

  constructor(input: {
    provider: DiscoveryProvider;
    sourceId: string;
    code: DiscoveryProviderErrorCode;
    message: string;
    status?: number;
    cause?: unknown;
  }) {
    super(input.message);
    this.name = "DiscoveryProviderError";
    this.provider = input.provider;
    this.sourceId = input.sourceId;
    this.code = input.code;
    this.status = input.status ?? null;
    this.cause = input.cause;
  }
}
