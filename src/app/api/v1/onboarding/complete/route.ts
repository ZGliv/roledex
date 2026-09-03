import {
  nativeJson,
  nativeRouteError,
  requireNativeSession,
} from "@/features/native/http";
import { markOnboardingComplete } from "@/features/product/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const installation = await requireNativeSession(request);
    await markOnboardingComplete(installation.visitorId);
    return nativeJson({ data: { completed: true } });
  } catch (error) {
    return nativeRouteError(error);
  }
}
