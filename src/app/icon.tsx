import { createAppIconV5 } from "@/app/icons/_lib/create-app-icon";

export const size = {
  width: 32,
  height: 32,
};

export const contentType = "image/png";

export default function Icon() {
  return createAppIconV5(size.width);
}
