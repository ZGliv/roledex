import { hasValidCronAuthorization } from "@/features/discovery/cron-auth";
import { refreshDiscoveryJobs } from "@/features/discovery/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

const RESPONSE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
};

export async function GET(request: Request) {
  if (
    !hasValidCronAuthorization(
      request.headers.get("authorization"),
      process.env.CRON_SECRET,
    )
  ) {
    return Response.json(
      { ok: false, error: "Unauthorized" },
      { status: 401, headers: RESPONSE_HEADERS },
    );
  }

  try {
    // The daily scheduler bypasses only the short global UI cooldown. Source
    // due times and the bounded round-robin still determine what is fetched.
    const result = await refreshDiscoveryJobs("scheduled", { force: true });
    const failed = result.kind === "completed" && result.status === "failed";
    return Response.json(
      { ok: !failed, result },
      { status: failed ? 503 : 200, headers: RESPONSE_HEADERS },
    );
  } catch (error) {
    console.error("Scheduled job discovery refresh failed.", error);
    return Response.json(
      { ok: false, error: "Scheduled refresh failed." },
      { status: 500, headers: RESPONSE_HEADERS },
    );
  }
}
