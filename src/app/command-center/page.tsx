import type { Metadata } from "next";

import { CommandCenter } from "@/features/command-center/components/command-center";

export const metadata: Metadata = {
  title: "Command Center",
};

export default function CommandCenterPage() {
  return <CommandCenter />;
}
