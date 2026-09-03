import { Capacitor, registerPlugin } from "@capacitor/core";

export interface MobileSession {
  accessToken: string;
  accessTokenExpiresAt: string;
  installationCredential: string;
  installationCredentialExpiresAt: string;
  installationId: string;
  workspaceId: string;
}

interface SessionVaultPlugin {
  clear(): Promise<void>;
  read(): Promise<{ value: string | null }>;
  write(options: { value: string }): Promise<void>;
}

const NativeSessionVault = registerPlugin<SessionVaultPlugin>("SessionVault");
const WEB_SESSION_KEY = "jobswipe:mobile-session:v2";

function isMobileSession(value: unknown): value is MobileSession {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const session = value as Record<string, unknown>;
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return (
    typeof session.accessToken === "string" &&
    session.accessToken.length > 0 &&
    session.accessToken.length <= 4_096 &&
    typeof session.accessTokenExpiresAt === "string" &&
    Number.isFinite(Date.parse(session.accessTokenExpiresAt)) &&
    typeof session.installationCredential === "string" &&
    /^jsi_[A-Za-z0-9_-]{43}$/.test(session.installationCredential) &&
    typeof session.installationCredentialExpiresAt === "string" &&
    Number.isFinite(Date.parse(session.installationCredentialExpiresAt)) &&
    typeof session.installationId === "string" &&
    uuid.test(session.installationId) &&
    typeof session.workspaceId === "string" &&
    uuid.test(session.workspaceId)
  );
}

export const sessionVault = {
  async read(): Promise<MobileSession | null> {
    const serialized = Capacitor.isNativePlatform()
      ? (await NativeSessionVault.read()).value
      : sessionStorage.getItem(WEB_SESSION_KEY);
    if (!serialized) return null;
    try {
      const parsed: unknown = JSON.parse(serialized);
      if (isMobileSession(parsed)) return parsed;
    } catch {
      // Corrupt or tampered preview storage is handled like a missing session.
    }
    await sessionVault.clear();
    return null;
  },

  async write(session: MobileSession) {
    const serialized = JSON.stringify(session);
    if (Capacitor.isNativePlatform()) {
      await NativeSessionVault.write({ value: serialized });
    } else {
      // Browser preview credentials intentionally disappear with the tab.
      sessionStorage.setItem(WEB_SESSION_KEY, serialized);
    }
  },

  async clear() {
    if (Capacitor.isNativePlatform()) {
      await NativeSessionVault.clear();
    } else {
      sessionStorage.removeItem(WEB_SESSION_KEY);
    }
  },
};
