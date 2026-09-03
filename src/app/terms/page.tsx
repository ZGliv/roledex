import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Terms of use" };

export default function TermsPage() {
  return (
    <div className="ambient-page app-viewport">
      <article className="safe-page-top mx-auto w-full max-w-2xl px-5 pb-28 text-sm leading-7 text-[#aeb8c8] sm:px-8">
        <Link href="/profile" className="font-semibold text-[#aaa3ff]">← Back</Link>
        <h1 className="mt-8 text-4xl font-semibold tracking-[-0.05em] text-white">Terms of use</h1>
        <p className="mt-3 text-[#8d98ab]">Last updated August 12, 2026</p>
        <div className="mt-10 space-y-8">
          <section><h2 className="text-lg font-semibold text-white">Early access service</h2><p className="mt-2">JobSwipe is an evolving service. Features, listings, and availability may change. Do not rely on JobSwipe as the only place you store application deadlines or employer correspondence.</p></section>
          <section><h2 className="text-lg font-semibold text-white">Listings and estimates</h2><p className="mt-2">Employer listings can change or expire. Always verify requirements, compensation, location, deadlines, and application instructions on the original employer page. Market salary estimates are clearly labeled and are not employer offers.</p></section>
          <section><h2 className="text-lg font-semibold text-white">Matching</h2><p className="mt-2">Eligibility and fit labels compare available listing evidence with your profile. They do not guarantee qualification, sponsorship, an interview, or employment.</p></section>
          <section><h2 className="text-lg font-semibold text-white">Acceptable use</h2><p className="mt-2">Do not abuse source sites, attempt to access another user’s workspace, share device-pairing codes publicly, submit unlawful content, or interfere with the service.</p></section>
          <section><h2 className="text-lg font-semibold text-white">Your data</h2><p className="mt-2">Your use is also governed by the <Link href="/privacy" className="text-[#aaa3ff]">privacy policy</Link>. You remain responsible for the accuracy of profile and application information you enter.</p></section>
        </div>
      </article>
    </div>
  );
}
