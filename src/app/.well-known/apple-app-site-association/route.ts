import { buildAppleAppSiteAssociation } from "@/features/product/apple-app-site-association";

export const dynamic = "force-dynamic";

export function GET() {
  const association = buildAppleAppSiteAssociation({
    bundleId: process.env.JOBSWIPE_BUNDLE_ID,
    teamId: process.env.APPLE_TEAM_ID,
  });

  if (!association) {
    return new Response(null, {
      status: 404,
      headers: {
        "Cache-Control": "public, max-age=300",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  return Response.json(association, {
    headers: {
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
      "Content-Type": "application/json",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
