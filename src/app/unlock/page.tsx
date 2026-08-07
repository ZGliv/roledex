import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";

import { JobSwipeMark } from "@/components/jobswipe-mark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const metadata: Metadata = {
  title: "Administrator access",
  description: "Open restricted JobSwipe administration tools.",
};

type UnlockPageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function UnlockPage({ searchParams }: UnlockPageProps) {
  const { error } = await searchParams;
  const errorMessage =
    error === "invalid"
      ? "That administrator key did not match. Try it again."
      : error === "unavailable"
        ? "Administrator access is temporarily unavailable."
        : null;

  return (
    <div className="grid min-h-dvh place-items-center px-4 py-10 sm:px-6">
      <section className="w-full max-w-[28rem] rounded-2xl border border-black/[0.08] bg-white p-6 shadow-sm sm:p-8">
        <div className="flex items-center gap-3">
          <JobSwipeMark className="size-10 rounded-xl shadow-none" />
          <div>
            <p className="text-sm font-semibold text-[#111827]">JobSwipe</p>
            <p className="text-xs text-[#697184]">Administrator tools</p>
          </div>
        </div>

        <div className="mt-8">
          <h1 className="text-balance text-3xl font-semibold tracking-[-0.04em] text-[#111827]">
            Administrator access
          </h1>
          <p className="mt-3 max-w-sm text-sm leading-6 text-[#697184]">
            This key unlocks source management and manual imports. Browsing, saving, and profile edits never require it.
          </p>
        </div>

        <form action="/api/auth/unlock" method="post" className="mt-7 space-y-3">
          <label htmlFor="accessPassword" className="sr-only">
            Administrator access key
          </label>
          <Input
            id="accessPassword"
            name="accessPassword"
            type="password"
            autoComplete="current-password"
            autoCapitalize="none"
            autoCorrect="off"
            maxLength={256}
            required
            autoFocus
            placeholder="Administrator access key"
            className="h-12 rounded-xl bg-white px-4 text-[15px]"
          />
          {errorMessage ? (
            <p role="alert" className="rounded-xl border border-[#cc4257]/15 bg-[#cc4257]/8 px-3.5 py-2.5 text-sm font-medium text-[#9e3042]">
              {errorMessage}
            </p>
          ) : null}
          <Button type="submit" size="lg" className="w-full">
            Open admin tools
            <ArrowRight className="size-4" aria-hidden="true" />
          </Button>
        </form>

        <p className="mt-5 text-xs leading-5 text-[#8a91a0]">
          Administrator access lasts up to 180 days on this device. The key is never stored in the browser.
        </p>
      </section>
    </div>
  );
}
