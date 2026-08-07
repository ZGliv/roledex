import { createAppIcon } from "../../_lib/create-app-icon";

export const dynamic = "force-static";

export function GET() {
  return createAppIcon(192);
}
