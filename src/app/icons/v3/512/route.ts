import { createAppIconV3 } from "../../_lib/create-app-icon";

export const dynamic = "force-static";

export function GET() {
  return createAppIconV3(512);
}
