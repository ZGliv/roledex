import { createAppIconV4 } from "@/app/icons/_lib/create-app-icon";

export const size = {
  width: 32,
  height: 32,
};

export const contentType = "image/png";

export default function Icon() {
  return createAppIconV4(size.width);
}
