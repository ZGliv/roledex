import {
  apiV2Json,
  apiV2Options,
  apiV2RouteError,
  requireApiV2Session,
} from "@/features/api-v2/http";
import { createDevicePairingCode } from "@/features/product/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function OPTIONS(request: Request) {
  return apiV2Options(request);
}

export async function POST(request: Request) {
  try {
    const installation = await requireApiV2Session(request);
    const pairing = await createDevicePairingCode(installation.visitorId);
    return apiV2Json(request, {
      data: {
        code: pairing.code,
        expiresAt: pairing.expiresAt.toISOString(),
      },
      meta: { singleUse: true },
    });
  } catch (error) {
    return apiV2RouteError(request, error);
  }
}
