import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath: string) => readFile(path.join(projectRoot, relativePath), "utf8");

describe("RoleDex v5 app icons", () => {
  it("uses the v5 family everywhere an install surface declares an icon", async () => {
    const [layout, manifest, iconRoute, appStoreRoute] = await Promise.all([
      read("src/app/layout.tsx"),
      read("src/app/manifest.ts"),
      read("src/app/icon.tsx"),
      read("src/app/icons/v5/app-store/route.ts"),
    ]);

    expect(layout).toContain('/icons/v5/32');
    expect(layout).toContain('/icons/v5/apple');
    expect(manifest).toContain('/icons/v5/192');
    expect(manifest).toContain('/icons/v5/512');
    expect(manifest).toContain('/icons/v5/maskable');
    expect(manifest).not.toContain('/icons/v4/');
    expect(iconRoute).toContain('createAppIconV5');
    expect(appStoreRoute).toContain('createAppIconV5(1024)');
  });

  it("keeps the maskable artwork distinct and cache-busts immutable v4 URLs", async () => {
    const [renderer, maskableRoute, serviceWorker] = await Promise.all([
      read("src/app/icons/_lib/create-app-icon.tsx"),
      read("src/app/icons/v5/maskable/route.ts"),
      read("public/sw.js"),
    ]);

    expect(renderer).toContain('size * 0.74');
    expect(maskableRoute).toContain('{ maskable: true }');
    expect(serviceWorker).toContain('const CACHE_NAME = `${CACHE_PREFIX}v5`;');
    expect(serviceWorker).toContain('/icons/v5/maskable');
    expect(serviceWorker).not.toContain('/icons/v4/');
  });

  it("shares the RoleDex deck glyph with the offline fallback", async () => {
    const [glyph, serviceWorker] = await Promise.all([
      read("src/components/jobswipe-glyph.tsx"),
      read("public/sw.js"),
    ]);

    for (const source of [glyph, serviceWorker]) {
      expect(source).toContain('#3468ff');
      expect(source).toContain('roledex-active-card');
      expect(source).toContain('x="6.55"');
      expect(source).toContain('x="10.2"');
      expect(source).toContain('x="13.45"');
      expect(source).toContain('roledex-swipe-arc');
      expect(source).toContain('M7.55 24.7c4.85 2.2 13.2 1.65 17.1-1.95');
    }
  });

  it("never serves navigations or visitor-scoped job data from Cache Storage", async () => {
    const [registration, serviceWorker] = await Promise.all([
      read("src/components/pwa-registration.tsx"),
      read("public/sw.js"),
    ]);

    expect(registration).toContain('process.env.NODE_ENV !== "production"');
    expect(registration).toContain('updateViaCache: "none"');
    expect(serviceWorker).toContain(
      'request.mode === "navigate" || request.destination === "document"',
    );
    expect(serviceWorker).toContain("event.respondWith(networkOnlyDocument(request))");
    expect(serviceWorker).toContain("if (!isImmutableAssetRequest(url))");
    expect(serviceWorker).toContain(
      "VERSIONED_ICON_PATHS.has(url.pathname) || HASHED_NEXT_STATIC_PATH.test(url.pathname)",
    );
  });
});
