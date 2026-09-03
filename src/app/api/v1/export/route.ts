import {
  nativeJson,
  nativeRouteError,
  requireNativeSession,
} from "@/features/native/http";
import { exportVisitorWorkspace } from "@/features/product/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const installation = await requireNativeSession(request);
    return nativeJson({
      data: await exportVisitorWorkspace(installation.visitorId),
    });
  } catch (error) {
    return nativeRouteError(error);
  }
}
