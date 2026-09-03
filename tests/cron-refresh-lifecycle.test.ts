import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  cleanup: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("@/features/data-lifecycle/service", () => ({
  runDailyDataLifecycleMaintenance: mocks.cleanup,
}));

vi.mock("@/features/discovery/service", () => ({
  refreshDiscoveryJobs: mocks.refresh,
}));

describe("daily refresh lifecycle maintenance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "test-cron-secret";
    mocks.cleanup.mockResolvedValue({
      feedTelemetry: {
        deletedExposures: 3,
        deletedSessions: 1,
        hasMore: false,
      },
      resumeDrafts: {
        deletedDrafts: 1,
        deletedRawSources: 1,
        hasMore: false,
      },
    });
    mocks.refresh.mockResolvedValue({
      kind: "completed",
      status: "succeeded",
    });
  });

  it("runs bounded lifecycle cleanup before the scheduled source refresh", async () => {
    const { GET } = await import("@/app/api/cron/refresh/route");
    const response = await GET(
      new Request("http://localhost/api/cron/refresh", {
        headers: { authorization: "Bearer test-cron-secret" },
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.cleanup).toHaveBeenCalledTimes(1);
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    expect(mocks.cleanup.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.refresh.mock.invocationCallOrder[0]!,
    );
    expect(body).toMatchObject({
      ok: true,
      maintenance: {
        feedTelemetry: { deletedSessions: 1 },
        resumeDrafts: { deletedDrafts: 1 },
      },
    });
  });

  it("still refreshes sources but fails the cron run when cleanup fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.cleanup.mockRejectedValueOnce(new Error("cleanup unavailable"));
    const { GET } = await import("@/app/api/cron/refresh/route");
    const response = await GET(
      new Request("http://localhost/api/cron/refresh", {
        headers: { authorization: "Bearer test-cron-secret" },
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    expect(body).toMatchObject({
      ok: false,
      maintenance: { error: "Data-lifecycle cleanup failed." },
    });
    errorSpy.mockRestore();
  });

  it("does not run maintenance for an unauthorized request", async () => {
    const { GET } = await import("@/app/api/cron/refresh/route");
    const response = await GET(
      new Request("http://localhost/api/cron/refresh"),
    );
    expect(response.status).toBe(401);
    expect(mocks.cleanup).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});
