import type { Metadata } from "next";
import Link from "next/link";

import { SupportForm } from "@/features/product/components/support-form";

export const metadata: Metadata = {
  title: "Support",
  description: "Get help with JobSwipe or report an issue.",
};

export default function SupportPage() {
  return (
    <div className="ambient-page min-h-dvh">
      <article className="safe-page-top mx-auto w-full max-w-2xl px-5 pb-28 text-[#aeb8c8] sm:px-8">
        <Link href="/profile" className="text-sm font-semibold text-[#aaa3ff]">
          ← Back to JobSwipe
        </Link>
        <h1 className="mt-8 text-4xl font-semibold tracking-[-0.05em] text-white">
          Support
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-[#8d98ab]">
          Ask a question, report a broken listing, or tell us what would make
          your search better. Include no passwords, government identifiers, or
          other sensitive information.
        </p>

        <SupportForm />

        <div className="mt-8 grid gap-3 text-xs sm:grid-cols-2">
          <Link href="/privacy" className="rounded-xl border border-white/10 p-4 text-[#c8cfdb] hover:bg-white/[0.04]">
            Privacy policy
          </Link>
          <Link href="/terms" className="rounded-xl border border-white/10 p-4 text-[#c8cfdb] hover:bg-white/[0.04]">
            Terms of use
          </Link>
        </div>
      </article>
    </div>
  );
}
