import { getSavedJobCardsForVisitor } from "@/features/jobs/queries";
import { nativeJobCard } from "@/features/native/dto";
import {
  nativeJson,
  nativeRouteError,
  requireNativeSession,
} from "@/features/native/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const installation = await requireNativeSession(request);
    const jobs = await getSavedJobCardsForVisitor(installation.visitorId);
    return nativeJson({ data: jobs.map(nativeJobCard), meta: { count: jobs.length } });
  } catch (error) {
    return nativeRouteError(error);
  }
}
