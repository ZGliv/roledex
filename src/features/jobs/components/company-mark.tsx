import type { SimpleIcon } from "simple-icons";
import {
  siAirtable,
  siAnthropic,
  siAsana,
  siBrex,
  siClickhouse,
  siCloudflare,
  siCoinbase,
  siCursor,
  siDatadog,
  siDiscord,
  siDropbox,
  siDuolingo,
  siElevenlabs,
  siFigma,
  siGithub,
  siGitlab,
  siHubspot,
  siIntercom,
  siLangchain,
  siLinear,
  siModal,
  siMongodb,
  siNotion,
  siOpenrouter,
  siPalantir,
  siPerplexity,
  siPosthog,
  siReddit,
  siReplit,
  siResend,
  siRobinhood,
  siShopify,
  siStripe,
  siSupabase,
  siTemporal,
  siVercel,
  siWebflow,
  siZapier,
} from "simple-icons";

import { cn } from "@/lib/utils";

const COMPANY_ICONS: Record<string, SimpleIcon> = {
  airtable: siAirtable,
  anthropic: siAnthropic,
  asana: siAsana,
  brex: siBrex,
  clickhouse: siClickhouse,
  cloudflare: siCloudflare,
  coinbase: siCoinbase,
  cursor: siCursor,
  datadog: siDatadog,
  discord: siDiscord,
  dropbox: siDropbox,
  duolingo: siDuolingo,
  elevenlabs: siElevenlabs,
  figma: siFigma,
  github: siGithub,
  gitlab: siGitlab,
  hubspot: siHubspot,
  intercom: siIntercom,
  langchain: siLangchain,
  linear: siLinear,
  modal: siModal,
  mongodb: siMongodb,
  notion: siNotion,
  openrouter: siOpenrouter,
  palantir: siPalantir,
  perplexity: siPerplexity,
  posthog: siPosthog,
  reddit: siReddit,
  replit: siReplit,
  resend: siResend,
  robinhood: siRobinhood,
  shopify: siShopify,
  stripe: siStripe,
  supabase: siSupabase,
  temporal: siTemporal,
  vercel: siVercel,
  webflow: siWebflow,
  zapier: siZapier,
};

export function CompanyMark({
  className,
  compact = false,
  company,
}: {
  className?: string;
  compact?: boolean;
  company: string;
}) {
  const icon = COMPANY_ICONS[company.trim().toLowerCase()];
  const cleanCompany = company.trim();
  const fallback = compact || cleanCompany.length > 6
    ? cleanCompany
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((word) => word[0]?.toUpperCase())
        .join("") || "?"
    : cleanCompany || "?";

  if (icon) {
    return (
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className={cn("size-20 fill-current sm:size-24", className)}
      >
        <path d={icon.path} />
      </svg>
    );
  }

  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex h-full w-full max-w-full items-center justify-center overflow-hidden whitespace-nowrap break-normal px-1 text-center font-semibold uppercase leading-none tracking-[0.045em]",
        compact
          ? "text-[13px]"
          : cleanCompany.length > 4
            ? "text-[clamp(.82rem,3.8vw,1.05rem)]"
            : "text-[clamp(1.05rem,5vw,1.4rem)]",
        className,
      )}
    >
      {fallback}
    </span>
  );
}
