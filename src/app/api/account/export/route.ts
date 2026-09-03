import { requireVisitorId } from "@/features/auth/visitor";
import { exportVisitorWorkspace } from "@/features/product/service";

export const dynamic = "force-dynamic";

export async function GET() {
  const workspace = await exportVisitorWorkspace(await requireVisitorId());
  return Response.json(workspace, {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": `attachment; filename="jobswipe-data-${new Date()
        .toISOString()
        .slice(0, 10)}.json"`,
    },
  });
}
