import {
  apiV2Json,
  apiV2Options,
  apiV2RouteError,
  parseApiV2Json,
  requireApiV2Session,
} from "@/features/api-v2/http";
import { ApiV2PreferenceOverrideSchema } from "@/features/api-v2/input";
import { getProfileFeedImpactForVisitor } from "@/features/jobs/queries";
import { updatePreferenceOverrideForVisitor } from "@/features/personalization/preference-overrides";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function OPTIONS(request: Request) {
  return apiV2Options(request);
}

export async function PATCH(request: Request) {
  try {
    const installation = await requireApiV2Session(request);
    const input = await parseApiV2Json(
      request,
      ApiV2PreferenceOverrideSchema,
      4 * 1_024,
    );
    const result = await updatePreferenceOverrideForVisitor(
      installation.visitorId,
      input,
    );
    const impact = await getProfileFeedImpactForVisitor(
      installation.visitorId,
    );

    return apiV2Json(request, {
      data: {
        changed: result.changed,
        learnedPreferences: impact.learnedPreferences,
      },
      meta: {
        queueInvalidated: result.changed,
      },
    });
  } catch (error) {
    return apiV2RouteError(request, error);
  }
}
