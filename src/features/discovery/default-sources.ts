import type { JobSourceProvider } from "@/db/schema";

export type StarterJobSource = {
  companyDomain: string;
  companyName: string;
  provider: JobSourceProvider;
  providerKey: string;
  refreshIntervalHours?: number;
};

/**
 * A broad, editable network of official public ATS boards spanning AI,
 * product-led software, fintech, and health technology. Every provider key
 * below returned a valid response from its first-party Greenhouse, Lever, or
 * Ashby endpoint on 2026-08-05. A changing or retired board is isolated during
 * refresh and can be disabled or removed from the Sources screen.
 */
export const DEFAULT_JOB_SOURCES = [
  // Greenhouse
  { provider: "greenhouse", providerKey: "vercel", companyName: "Vercel", companyDomain: "vercel.com" },
  { provider: "greenhouse", providerKey: "samsara", companyName: "Samsara", companyDomain: "samsara.com" },
  { provider: "greenhouse", providerKey: "intercom", companyName: "Intercom", companyDomain: "intercom.com" },
  { provider: "greenhouse", providerKey: "airtable", companyName: "Airtable", companyDomain: "airtable.com" },
  { provider: "greenhouse", providerKey: "asana", companyName: "Asana", companyDomain: "asana.com" },
  { provider: "greenhouse", providerKey: "scaleai", companyName: "Scale AI", companyDomain: "scale.com" },
  { provider: "greenhouse", providerKey: "zocdoc", companyName: "Zocdoc", companyDomain: "zocdoc.com" },
  { provider: "greenhouse", providerKey: "flatironhealth", companyName: "Flatiron Health", companyDomain: "flatiron.com" },
  { provider: "greenhouse", providerKey: "mavenclinic", companyName: "Maven Clinic", companyDomain: "mavenclinic.com" },
  { provider: "greenhouse", providerKey: "oscar", companyName: "Oscar Health", companyDomain: "hioscar.com" },
  { provider: "greenhouse", providerKey: "omadahealth", companyName: "Omada Health", companyDomain: "omadahealth.com" },
  { provider: "greenhouse", providerKey: "pathai", companyName: "PathAI", companyDomain: "pathai.com" },
  { provider: "greenhouse", providerKey: "anthropic", companyName: "Anthropic", companyDomain: "anthropic.com" },
  { provider: "greenhouse", providerKey: "figma", companyName: "Figma", companyDomain: "figma.com" },
  { provider: "greenhouse", providerKey: "datadog", companyName: "Datadog", companyDomain: "datadoghq.com" },
  { provider: "greenhouse", providerKey: "stripe", companyName: "Stripe", companyDomain: "stripe.com" },
  { provider: "greenhouse", providerKey: "reddit", companyName: "Reddit", companyDomain: "redditinc.com" },
  { provider: "greenhouse", providerKey: "discord", companyName: "Discord", companyDomain: "discord.com" },
  { provider: "greenhouse", providerKey: "webflow", companyName: "Webflow", companyDomain: "webflow.com" },
  { provider: "greenhouse", providerKey: "twilio", companyName: "Twilio", companyDomain: "twilio.com" },
  { provider: "greenhouse", providerKey: "mongodb", companyName: "MongoDB", companyDomain: "mongodb.com" },
  { provider: "greenhouse", providerKey: "gitlab", companyName: "GitLab", companyDomain: "gitlab.com" },
  { provider: "greenhouse", providerKey: "duolingo", companyName: "Duolingo", companyDomain: "duolingo.com" },
  { provider: "greenhouse", providerKey: "cresta", companyName: "Cresta", companyDomain: "cresta.com" },
  { provider: "greenhouse", providerKey: "gleanwork", companyName: "Glean", companyDomain: "glean.com" },
  { provider: "greenhouse", providerKey: "brex", companyName: "Brex", companyDomain: "brex.com" },
  { provider: "greenhouse", providerKey: "robinhood", companyName: "Robinhood", companyDomain: "robinhood.com" },
  { provider: "greenhouse", providerKey: "coinbase", companyName: "Coinbase", companyDomain: "coinbase.com" },
  { provider: "greenhouse", providerKey: "chime", companyName: "Chime", companyDomain: "chime.com" },
  { provider: "greenhouse", providerKey: "komodohealth", companyName: "Komodo Health", companyDomain: "komodohealth.com" },
  { provider: "greenhouse", providerKey: "klaviyo", companyName: "Klaviyo", companyDomain: "klaviyo.com" },
  { provider: "greenhouse", providerKey: "verkada", companyName: "Verkada", companyDomain: "verkada.com" },

  // Lever
  { provider: "lever", providerKey: "whoop", companyName: "WHOOP", companyDomain: "whoop.com" },
  { provider: "lever", providerKey: "swordhealth", companyName: "Sword Health", companyDomain: "swordhealth.com" },
  { provider: "lever", providerKey: "palantir", companyName: "Palantir", companyDomain: "palantir.com" },

  // Ashby
  { provider: "ashby", providerKey: "abridge", companyName: "Abridge", companyDomain: "abridge.com" },
  { provider: "ashby", providerKey: "notion", companyName: "Notion", companyDomain: "notion.so" },
  { provider: "ashby", providerKey: "cohere", companyName: "Cohere", companyDomain: "cohere.com" },
  { provider: "ashby", providerKey: "ramp", companyName: "Ramp", companyDomain: "ramp.com" },
  { provider: "ashby", providerKey: "linear", companyName: "Linear", companyDomain: "linear.app" },
  { provider: "ashby", providerKey: "decagon", companyName: "Decagon", companyDomain: "decagon.ai" },
  { provider: "ashby", providerKey: "posthog", companyName: "PostHog", companyDomain: "posthog.com" },
  { provider: "ashby", providerKey: "cursor", companyName: "Cursor", companyDomain: "cursor.com" },
  { provider: "ashby", providerKey: "perplexity", companyName: "Perplexity", companyDomain: "perplexity.ai" },
  { provider: "ashby", providerKey: "elevenlabs", companyName: "ElevenLabs", companyDomain: "elevenlabs.io" },
  { provider: "ashby", providerKey: "harvey", companyName: "Harvey", companyDomain: "harvey.ai" },
  { provider: "ashby", providerKey: "openrouter", companyName: "OpenRouter", companyDomain: "openrouter.ai" },
  { provider: "ashby", providerKey: "langchain", companyName: "LangChain", companyDomain: "langchain.com" },
  { provider: "ashby", providerKey: "attio", companyName: "Attio", companyDomain: "attio.com" },
  { provider: "ashby", providerKey: "pylon", companyName: "Pylon", companyDomain: "usepylon.com" },
  { provider: "ashby", providerKey: "pinecone", companyName: "Pinecone", companyDomain: "pinecone.io" },
  { provider: "ashby", providerKey: "temporal", companyName: "Temporal", companyDomain: "temporal.io" },
  { provider: "ashby", providerKey: "supabase", companyName: "Supabase", companyDomain: "supabase.com" },
  { provider: "ashby", providerKey: "replit", companyName: "Replit", companyDomain: "replit.com" },
  { provider: "ashby", providerKey: "modal", companyName: "Modal", companyDomain: "modal.com" },
  { provider: "ashby", providerKey: "baseten", companyName: "Baseten", companyDomain: "baseten.co" },
  { provider: "ashby", providerKey: "writer", companyName: "Writer", companyDomain: "writer.com" },
  { provider: "ashby", providerKey: "runway", companyName: "Runway", companyDomain: "runwayml.com" },
  { provider: "ashby", providerKey: "clickhouse", companyName: "ClickHouse", companyDomain: "clickhouse.com" },
  { provider: "ashby", providerKey: "resend", companyName: "Resend", companyDomain: "resend.com" },
  { provider: "ashby", providerKey: "sierra", companyName: "Sierra", companyDomain: "sierra.ai" },
  { provider: "ashby", providerKey: "lovable", companyName: "Lovable", companyDomain: "lovable.dev" },
] as const satisfies readonly StarterJobSource[];
