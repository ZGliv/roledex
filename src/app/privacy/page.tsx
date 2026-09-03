import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Privacy policy" };

export default function PrivacyPage() {
  return (
    <div className="ambient-page app-viewport">
      <article className="safe-page-top mx-auto w-full max-w-2xl px-5 pb-28 text-[#aeb8c8] sm:px-8">
        <Link href="/profile#privacy" className="text-sm font-semibold text-[#aaa3ff]">← Back to your data</Link>
        <h1 className="mt-8 text-4xl font-semibold tracking-[-0.05em] text-white">Privacy policy</h1>
        <p className="mt-3 text-sm leading-6 text-[#8d98ab]">Last updated August 12, 2026</p>

        <div className="mt-10 space-y-8 text-sm leading-7">
          <section>
            <h2 className="text-lg font-semibold text-white">What RoleDex stores</h2>
            <p className="mt-2">RoleDex stores the profile details you enter, work and education evidence, saved résumé text, job decisions, notes, application plans, device-pairing records, notification preferences, and feedback you submit. Job listings and company information come from public employer job boards and public sources.</p>
          </section>
          <section>
            <h2 className="text-lg font-semibold text-white">How it is used</h2>
            <p className="mt-2">Your information is used to filter and rank jobs, keep your workspace synchronized, show your application history, deliver reminders you enable, and improve the beta. RoleDex does not sell your personal information or send your private profile to employers.</p>
          </section>
          <section>
            <h2 className="text-lg font-semibold text-white">Service providers</h2>
            <p className="mt-2">The service is hosted on Vercel and stores application data in Turso. Their infrastructure may process network and operational data needed to provide the service. Any future analytics, authentication, email, or push provider must be added to this policy before it is enabled.</p>
          </section>
          <section>
            <h2 className="text-lg font-semibold text-white">Retention and deletion</h2>
            <p className="mt-2">Your workspace remains available until it is deleted. Guest users can export or permanently delete their profile, decisions, notes, and related records from You → Privacy & data. Short-lived device-pairing codes expire after ten minutes and cannot be reused.</p>
          </section>
          <section>
            <h2 className="text-lg font-semibold text-white">Your choices</h2>
            <p className="mt-2">You can turn reminders off, export your workspace as JSON, delete stored résumé evidence individually, or delete the guest workspace. Privacy and data requests can be sent through the <Link href="/support" className="text-[#aaa3ff]">RoleDex support form</Link>.</p>
          </section>
          <section>
            <h2 className="text-lg font-semibold text-white">Important limitation</h2>
            <p className="mt-2">RoleDex provides job-discovery and organizational tools, not employment, legal, immigration, or financial advice. Fit scores are evidence-based profile comparisons, not predictions that an employer will interview or hire you.</p>
          </section>
        </div>
        <p className="mt-12 border-t border-white/10 pt-6 text-xs text-[#778399]">
          Also read the <Link href="/terms" className="text-[#aaa3ff]">terms of use</Link> or <Link href="/support" className="text-[#aaa3ff]">contact support</Link>.
        </p>
      </article>
    </div>
  );
}
