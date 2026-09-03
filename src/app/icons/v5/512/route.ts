import { createAppIconV5 } from "../../_lib/create-app-icon";

export const dynamic = "force-static";

export function GET() {
  return createAppIconV5(512);
}
