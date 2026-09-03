import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

type Check = {
  detail: string;
  label: string;
  ok: boolean;
};

const root = process.cwd();
const checks: Check[] = [];

function add(label: string, ok: boolean, detail: string) {
  checks.push({ detail, label, ok });
}

function hasValue(name: string, minimumLength = 1) {
  return (process.env[name]?.trim().length ?? 0) >= minimumLength;
}

for (const path of [
  "src/app/privacy/page.tsx",
  "src/app/terms/page.tsx",
  "src/app/support/page.tsx",
  "src/app/onboarding/page.tsx",
  "src/app/icons/v5/app-store/route.ts",
  "docs/app-store/metadata.md",
  "docs/app-store/privacy-labels.md",
  "docs/app-store/submission-checklist.md",
  "docs/app-store/production-release-runbook.md",
  "src/app/api/v2/installations/route.ts",
  "src/app/api/v2/sessions/refresh/route.ts",
  "src/app/api/v2/feed/route.ts",
  "src/app/api/v2/profile/route.ts",
  "src/app/api/v2/interactions/batch/route.ts",
  "mobile/ios/App/App.xcodeproj/project.pbxproj",
  "mobile/ios/App/App/PrivacyInfo.xcprivacy",
  "mobile/ios/App/App/App.entitlements",
  "mobile/ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png",
  "mobile/ios/App/App/SceneDelegate.swift",
  "mobile/src/session-vault.ts",
  "mobile/src/outbox.ts",
  "src/app/.well-known/apple-app-site-association/route.ts",
  "scripts/native-api-smoke.ts",
  "scripts/ios-app-store-archive.sh",
  "docs/app-store/screenshots/draft/01-onboarding.png",
  "docs/app-store/screenshots/draft/02-discover-card.png",
]) {
  add(path, existsSync(resolve(root, path)), "required release artifact");
}

function pngSize(relativePath: string) {
  const contents = readFileSync(resolve(root, relativePath));
  if (contents.length < 24 || contents.toString("ascii", 1, 4) !== "PNG") {
    return null;
  }
  return { width: contents.readUInt32BE(16), height: contents.readUInt32BE(20) };
}

for (const path of [
  "docs/app-store/screenshots/draft/01-onboarding.png",
  "docs/app-store/screenshots/draft/02-discover-card.png",
]) {
  const size = existsSync(resolve(root, path)) ? pngSize(path) : null;
  add(
    `${path} accepted size`,
    size?.width === 1206 && size.height === 2622,
    size ? `${size.width} × ${size.height}` : "missing or invalid PNG",
  );
}

const infoPlistPath = resolve(root, "mobile/ios/App/App/Info.plist");
const infoPlist = existsSync(infoPlistPath) ? readFileSync(infoPlistPath, "utf8") : "";
add(
  "Export compliance declaration",
  infoPlist.includes("ITSAppUsesNonExemptEncryption") &&
    /<key>ITSAppUsesNonExemptEncryption<\/key>\s*<false\/>/.test(infoPlist),
  "shipping target declares that it does not use non-exempt encryption",
);

add(
  "Production UI enabled",
  process.env.JOBSWIPE_PRODUCTION_UI === "enabled",
  "set JOBSWIPE_PRODUCTION_UI=enabled in the production deployment",
);
add(
  "Visitor signing secret",
  hasValue("JOBSWIPE_VISITOR_SESSION_SECRET", 32) ||
    hasValue("JOBSWIPE_SESSION_SECRET", 32),
  "configure a production signing secret with at least 32 characters",
);
add(
  "Stable Server Action encryption",
  hasValue("NEXT_SERVER_ACTIONS_ENCRYPTION_KEY", 32),
  "configure one stable value across production instances",
);
add(
  "Native API enabled",
  process.env.JOBSWIPE_NATIVE_API === "enabled",
  "set JOBSWIPE_NATIVE_API=enabled only after native API contract tests pass against production",
);
add(
  "Native signing secret",
  hasValue("JOBSWIPE_NATIVE_SESSION_SECRET", 32),
  "configure a separate native signing secret with at least 32 characters",
);
add(
  "Hosted database URL",
  hasValue("TURSO_DATABASE_URL"),
  "configure a durable production database",
);
add(
  "Hosted database token",
  hasValue("TURSO_AUTH_TOKEN"),
  "configure the production database credential",
);
add(
  "Production database release gate",
  process.env.JOBSWIPE_PRODUCTION_DATABASE_READY === "true",
  "set true only after migrations, reads, writes, cron refresh, export, and deletion pass against the hosted database",
);
add(
  "Apple team",
  hasValue("APPLE_TEAM_ID"),
  "owner must supply the Apple Developer Team ID",
);
add(
  "Bundle identifier",
  hasValue("JOBSWIPE_BUNDLE_ID") && process.env.JOBSWIPE_BUNDLE_ID !== "dev.jobswipe.preview",
  "owner must choose a final Apple-team-controlled reverse-DNS identifier",
);
add(
  "Distinct public app name",
  hasValue("JOBSWIPE_DISPLAY_NAME", 2) && !/jobswipe/i.test(process.env.JOBSWIPE_DISPLAY_NAME ?? ""),
  "choose a distinct public brand; JobSwipe is already used in the App Store",
);
add(
  "App Review email",
  hasValue("APP_STORE_REVIEW_EMAIL"),
  "owner must supply a monitored review email",
);
add(
  "App Review phone",
  hasValue("APP_STORE_REVIEW_PHONE"),
  "owner must supply a reachable review phone number",
);
add(
  "Public production URL",
  /^https:\/\//.test(process.env.JOBSWIPE_PUBLIC_URL ?? ""),
  "set JOBSWIPE_PUBLIC_URL to the permanent HTTPS domain",
);

try {
  const version = execFileSync("xcodebuild", ["-version"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim().replace(/\n/g, " · ");
  add("Xcode toolchain", true, version);
} catch {
  add("Xcode toolchain", false, "install and select a current Xcode release");
}

for (const check of checks) {
  const marker = check.ok ? "✓" : "✗";
  console.log(`${marker} ${check.label} — ${check.detail}`);
}

const failures = checks.filter((check) => !check.ok);
console.log(
  `\n${checks.length - failures.length}/${checks.length} checks ready; ${failures.length} blocker${failures.length === 1 ? "" : "s"} remain.`,
);

if (failures.length > 0) process.exitCode = 1;
