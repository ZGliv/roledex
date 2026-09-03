import {
  apiV2Json,
  apiV2Options,
  apiV2RouteError,
  requireApiV2Session,
} from "@/features/api-v2/http";
import { listApiV2Sessions } from "@/features/api-v2/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function OPTIONS(request: Request) {
  return apiV2Options(request);
}

export async function GET(request: Request) {
  try {
    const installation = await requireApiV2Session(request);
    const sessions = await listApiV2Sessions(installation.visitorId);
    return apiV2Json(request, {
      data: sessions.map((session) => ({
        ...session,
        current: session.id === installation.id,
      })),
      meta: { count: sessions.length },
    });
  } catch (error) {
    return apiV2RouteError(request, error);
  }
}
