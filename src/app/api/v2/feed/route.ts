import { apiV2FeedCard, apiV2FeedSession } from "@/features/api-v2/dto";
import {
  apiV2Json,
  apiV2Options,
  apiV2RouteError,
  requireApiV2Session,
} from "@/features/api-v2/http";
import { ApiV2FeedQuerySchema } from "@/features/api-v2/input";
import { getDeckJobCardsPageForVisitor } from "@/features/jobs/queries";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function OPTIONS(request: Request) {
  return apiV2Options(request);
}

export async function GET(request: Request) {
  try {
    const installation = await requireApiV2Session(request);
    const search = new URL(request.url).searchParams;
    const input = ApiV2FeedQuerySchema.parse({
      cursor: search.get("cursor"),
      limit: search.get("limit") ?? undefined,
    });
    const page = await getDeckJobCardsPageForVisitor(installation.visitorId, {
      cursor: input.cursor,
      limit: input.limit,
    });
    const session = apiV2FeedSession({
      profileRevision: page.profileRevision,
      cursor: input.cursor ?? null,
      jobs: page.jobs,
      modelVersion: page.personalizationModelVersion,
      now: page.feedSession.generatedAt,
      persisted: {
        id: page.feedSession.id,
        queueVersion: page.feedSession.queueVersion,
        source: page.feedSession.source,
      },
    });
    const cards = page.jobs.map((job, index) =>
      apiV2FeedCard(job, session.id, index),
    );
    return apiV2Json(request, {
      data: { session, cards },
      meta: {
        hasMore: page.hasMore,
        nextCursor: page.nextCursor,
        cursorReset: page.cursorReset,
        caughtUp: cards.length === 0 && !page.hasMore,
        totalAvailable: page.totalAvailable,
        personalization: {
          modelVersion: page.personalizationModelVersion,
          signalCount: page.personalizationSignalCount,
        },
      },
    });
  } catch (error) {
    return apiV2RouteError(request, error);
  }
}
