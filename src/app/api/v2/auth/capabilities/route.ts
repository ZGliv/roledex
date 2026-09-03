import {
  apiV2Json,
  apiV2Options,
} from "@/features/api-v2/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function OPTIONS(request: Request) {
  return apiV2Options(request);
}

export async function GET(request: Request) {
  return apiV2Json(request, {
    data: {
      guest: true,
      pairingCodeClaim: true,
      signInWithApple: false,
      signInWithAppleBlockers: [
        "APPLE_SIGN_IN_SERVER_VERIFICATION",
        "APPLE_TEAM_ID",
        "APPLE_SERVICES_ID",
        "APPLE_BUNDLE_ID",
        "APPLE_SIGN_IN_KEY_ID",
        "APPLE_SIGN_IN_PRIVATE_KEY",
      ],
    },
    meta: {},
  });
}
