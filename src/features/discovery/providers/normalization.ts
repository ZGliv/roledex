import type {
  DiscoveryEmploymentType,
  DiscoverySalaryPeriod,
  DiscoveryWorkArrangement,
} from "@/features/discovery/types";

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  apos: "'",
  bull: "•",
  gt: ">",
  hellip: "…",
  ldquo: "“",
  lsquo: "‘",
  lt: "<",
  mdash: "—",
  middot: "·",
  nbsp: " ",
  ndash: "–",
  quot: '"',
  rdquo: "”",
  rsquo: "’",
};

function decodeHtmlEntities(value: string) {
  return value.replace(
    /&(?:#(\d{1,7})|#x([\da-f]{1,6})|([a-z][\da-z]{1,31}));/gi,
    (match, decimal: string | undefined, hexadecimal: string | undefined, named: string | undefined) => {
      if (decimal || hexadecimal) {
        const codePoint = Number.parseInt(decimal ?? hexadecimal ?? "", decimal ? 10 : 16);
        if (Number.isInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff) {
          try {
            return String.fromCodePoint(codePoint);
          } catch {
            return "�";
          }
        }
        return "�";
      }
      return named ? (NAMED_ENTITIES[named.toLowerCase()] ?? match) : match;
    },
  );
}

export function normalizeDescription(value: string | null | undefined) {
  if (!value) return "";

  // Greenhouse content is commonly HTML-entity encoded more than once.
  let decoded = value;
  for (let pass = 0; pass < 3; pass += 1) {
    const next = decodeHtmlEntities(decoded);
    if (next === decoded) break;
    decoded = next;
  }

  return decodeHtmlEntities(
    decoded
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<(?:br|hr)\b[^>]*\/?\s*>/gi, "\n")
      .replace(/<\/(?:p|div|li|ul|ol|h[1-6]|section|article|tr)>/gi, "\n")
      .replace(/<li\b[^>]*>/gi, "• ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\r\n?/g, "\n")
    .replace(/[\t\f\v ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function normalizeTimestamp(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? null : date.toISOString();
}

export function inferWorkArrangement(input: {
  explicit?: string | null;
  isRemote?: boolean | null;
  location?: string | null;
}): DiscoveryWorkArrangement {
  const explicit = input.explicit?.toLowerCase().replace(/[_\s]+/g, "-") ?? "";
  if (explicit.includes("hybrid")) return "hybrid";
  if (explicit === "remote" || input.isRemote === true) return "remote";
  if (explicit.includes("on-site") || explicit.includes("onsite")) return "on_site";

  const location = input.location?.toLowerCase() ?? "";
  if (/\bhybrid\b/.test(location)) return "hybrid";
  if (/\bremote\b|anywhere/.test(location)) return "remote";
  if (/\bon[ -]?site\b/.test(location)) return "on_site";
  return "unknown";
}

export function normalizeEmploymentType(
  value: string | null | undefined,
): DiscoveryEmploymentType {
  const compact = value?.toLowerCase().replace(/[^a-z]/g, "") ?? "";
  if (compact.includes("fulltime") || compact === "regular") return "full_time";
  if (compact.includes("parttime")) return "part_time";
  if (compact.includes("intern")) return "internship";
  if (compact.includes("season")) return "seasonal";
  if (compact.includes("temp")) return "temporary";
  if (compact.includes("contract") || compact.includes("freelance")) return "contract";
  return "unknown";
}

export function normalizeSalaryPeriod(
  value: string | null | undefined,
): DiscoverySalaryPeriod {
  const normalized = value?.toLowerCase() ?? "";
  if (/hour|hourly/.test(normalized)) return "hour";
  if (/day|daily/.test(normalized)) return "day";
  if (/week|weekly/.test(normalized)) return "week";
  if (/month|monthly/.test(normalized)) return "month";
  if (/year|annual|annually/.test(normalized)) return "year";
  return "unknown";
}
