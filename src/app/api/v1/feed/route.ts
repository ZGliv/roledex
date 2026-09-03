import { nativeJobCard } from "@/features/native/dto";
import {
  nativeJson,
  nativeRouteError,
  requireNativeSession,
} from "@/features/native/http";
import { NativeFeedQuerySchema } from "@/features/native/input";
import { getDeckJobCardsPageForVisitor } from "@/features/jobs/queries";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const installation = await requireNativeSession(request);
    const search = new URL(request.url).searchParams;
    const input = NativeFeedQuerySchema.parse({
      cursor: search.get("cursor"),
      lane: search.get("lane") ?? undefined,
      limit: search.get("limit") ?? undefined,
    });
    const page = await getDeckJobCardsPageForVisitor(installation.visitorId, {
      cursor: input.cursor,
      lane: input.lane === "stretch" ? "explore" : "matches",
      limit: input.limit,
    });
    return nativeJson({
      data: page.jobs.map(nativeJobCard),
      meta: {
        lane: page.lane === "explore" ? "stretch" : "matches",
        mode: page.mode,
        counts: {
          matches: page.admissionCounts.matches,
          stretch: page.admissionCounts.explore,
          filtered: page.admissionCounts.blocked,
        },
        hasMore: page.hasMore,
        nextCursor: page.nextCursor,
      },
    });
  } catch (error) {
    return nativeRouteError(error);
  }
}
