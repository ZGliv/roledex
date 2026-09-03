import { z } from "zod";

import { getCurrentVisitorId } from "@/features/auth/visitor";
import { syncEmergencyDecisionsForVisitor } from "@/features/jobs/emergency-feed-sync";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const DecisionSchema = z
  .object({
    decision: z.enum(["saved", "skipped"]),
    externalId: z.string().trim().min(1).max(200),
    id: z.string().trim().min(1).max(500),
    provider: z.enum(["ashby", "greenhouse", "lever"]),
    sourceKey: z.string().trim().min(1).max(200).regex(/^[a-z\d_-]+$/i),
  })
  .strict();
const BodySchema = z.object({ decisions: z.array(DecisionSchema).min(1).max(10) }).strict();

export async function POST(request: Request) {
  try {
    const body = BodySchema.parse(await request.json());
    const syncedIds = await syncEmergencyDecisionsForVisitor(
      await getCurrentVisitorId(),
      body.decisions,
    );
    return Response.json(
      { syncedIds },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    console.error("Emergency decision sync deferred.", error);
    return Response.json(
      { syncedIds: [], error: "Sync is still waiting for the live workspace." },
      { status: 503, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
