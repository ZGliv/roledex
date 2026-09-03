import { hasValidCronAuthorization } from "@/features/discovery/cron-auth";
import { TECHNICAL_CAREER_MOVER_DISCOVERY_PROFILE } from "@/features/discovery/relevance";
import { refreshDiscoveryJobs } from "@/features/discovery/service";
import { runDailyDataLifecycleMaintenance } from "@/features/data-lifecycle/service";

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

  let maintenance:
    | Awaited<ReturnType<typeof runDailyDataLifecycleMaintenance>>
    | null = null;
  let maintenanceFailed = false;
  try {
    maintenance = await runDailyDataLifecycleMaintenance();
  } catch (error) {
    maintenanceFailed = true;
    console.error("Scheduled data-lifecycle cleanup failed.", error);
  }

  try {
    // The daily scheduler bypasses only the short global UI cooldown. Source
    // due times and the bounded round-robin still determine what is fetched.
    const result = await refreshDiscoveryJobs("scheduled", {
      focus: TECHNICAL_CAREER_MOVER_DISCOVERY_PROFILE,
      force: true,
    });
    const refreshFailed =
      result.kind === "completed" && result.status === "failed";
    const failed = refreshFailed || maintenanceFailed;
    return Response.json(
      {
        ok: !failed,
        maintenance:
          maintenance ?? { error: "Data-lifecycle cleanup failed." },
        result,
      },
      { status: failed ? 503 : 200, headers: RESPONSE_HEADERS },
    );
  } catch (error) {
    console.error("Scheduled job discovery refresh failed.", error);
    return Response.json(
      {
        ok: false,
        error: "Scheduled refresh failed.",
        maintenance:
          maintenance ?? { error: "Data-lifecycle cleanup failed." },
      },
      { status: 500, headers: RESPONSE_HEADERS },
    );
  }
}
