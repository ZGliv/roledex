export const APP_TIME_ZONE = "America/New_York";

const appDateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: APP_TIME_ZONE,
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZoneName: "short",
});

const appTimeFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: APP_TIME_ZONE,
  hour: "numeric",
  minute: "2-digit",
  timeZoneName: "short",
});

export function formatAppDateTime(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  return appDateTimeFormatter.format(date);
}

export function formatAppTime(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  return appTimeFormatter.format(date);
}

export function formatMoney(cents: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

export function formatSalaryRange(options: {
  minimumCents: number | null;
  maximumCents: number | null;
  currency?: string | null;
  period?: string | null;
}) {
  const { minimumCents, maximumCents } = options;
  const currency = options.currency ?? "USD";
  const period = options.period ?? "year";
  const suffix =
    period === "hour"
      ? "/hr"
      : period === "month"
        ? "/mo"
        : period === "day"
          ? "/day"
          : period === "week"
            ? "/wk"
            : "/yr";

  if (minimumCents === null && maximumCents === null) {
    return "Salary not posted";
  }

  if (minimumCents !== null && maximumCents !== null) {
    if (minimumCents === maximumCents) {
      return `${formatMoney(minimumCents, currency)}${suffix}`;
    }
    return `${formatMoney(minimumCents, currency)}–${formatMoney(maximumCents, currency)}${suffix}`;
  }

  if (minimumCents !== null) {
    return `From ${formatMoney(minimumCents, currency)}${suffix}`;
  }

  return `Up to ${formatMoney(maximumCents as number, currency)}${suffix}`;
}

export function formatDate(value: string | Date | null | undefined) {
  if (!value) return "Unknown";
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export function titleCaseToken(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}
