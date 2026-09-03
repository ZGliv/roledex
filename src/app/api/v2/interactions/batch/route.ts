import {
  apiV2Json,
  apiV2Options,
  apiV2RouteError,
  parseApiV2Json,
  requireApiV2Session,
} from "@/features/api-v2/http";
import { ApiV2InteractionBatchSchema } from "@/features/api-v2/input";
import { applyApiV2InteractionBatch } from "@/features/api-v2/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function OPTIONS(request: Request) {
  return apiV2Options(request);
}

export async function POST(request: Request) {
  try {
    const installation = await requireApiV2Session(request);
    const input = await parseApiV2Json(request, ApiV2InteractionBatchSchema);
    const results = await applyApiV2InteractionBatch(
      installation.visitorId,
      input.events,
    );
    return apiV2Json(request, {
      data: results,
      meta: {
        accepted: results.filter((result) => result.status !== "rejected").length,
        rejected: results.filter((result) => result.status === "rejected").length,
      },
    });
  } catch (error) {
    return apiV2RouteError(request, error);
  }
}
