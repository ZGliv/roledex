"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import {
  Bell,
  Check,
  Copy,
  Download,
  FileText,
  Link2,
  LoaderCircle,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  addResumeSourceAction,
  createDevicePairingCodeAction,
  deleteResumeSourceAction,
  redeemDevicePairingCodeAction,
  updateProductSettingsAction,
} from "@/features/product/actions";
import { ResetWorkspaceControl } from "@/features/visitor/components/reset-workspace-control";

export type ProductSettingsView = {
  dailyDigestEnabled: boolean;
  onboardingCompletedAt: string | null;
  reminderNotificationsEnabled: boolean;
};

export type ResumeSourceView = {
  createdAt: string;
  id: string;
  label: string;
  sourceFileName: string | null;
};

const controlClass =
  "h-13 w-full rounded-[1rem] border border-white/[0.13] bg-[linear-gradient(145deg,rgba(255,255,255,.075),rgba(255,255,255,.035))] px-4 text-[16px] font-medium text-[#f2f4f9] shadow-[inset_0_1px_0_rgba(255,255,255,.07)] outline-none placeholder:text-[#6f7c91] focus:border-[#9c93ff]/55 focus:ring-4 focus:ring-[#8176ff]/15";

function SettingToggle({
  checked,
  label,
  description,
  onChange,
}: {
  checked: boolean;
  description: string;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex min-h-14 cursor-pointer items-center justify-between gap-4 py-2">
      <span>
        <span className="block text-[14px] font-semibold text-[#e5e9f1]">{label}</span>
        <span className="mt-1 block text-[12px] leading-5 text-[#8c98ab]">{description}</span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="size-5 accent-[#8176ff]"
      />
    </label>
  );
}

export function AccountDataControls({
  isGuest,
  initialSettings,
  initialResumes,
}: {
  initialResumes: ResumeSourceView[];
  initialSettings: ProductSettingsView;
  isGuest: boolean;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [redeemCode, setRedeemCode] = useState("");
  const [settings, setSettings] = useState(initialSettings);
  const [resumes, setResumes] = useState(initialResumes);
  const [resumeLabel, setResumeLabel] = useState("Primary résumé");
  const [resumeFileName, setResumeFileName] = useState<string | null>(null);
  const [resumeText, setResumeText] = useState("");

  function run(action: () => Promise<void>) {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      try {
        await action();
      } catch (actionError) {
        setError(actionError instanceof Error ? actionError.message : "That could not be completed.");
      }
    });
  }

  function createPairingCode() {
    run(async () => {
      const result = await createDevicePairingCodeAction();
      if (!result.ok) throw new Error(result.message);
      setPairingCode(result.value.code);
      setMessage("Use this one-time code on your other device within 10 minutes.");
    });
  }

  function redeemPairingCode() {
    run(async () => {
      const result = await redeemDevicePairingCodeAction(redeemCode);
      if (!result.ok) throw new Error(result.message);
      setMessage(result.message);
      router.replace("/profile");
      router.refresh();
    });
  }

  function saveSettings(nextSettings = settings) {
    run(async () => {
      const result = await updateProductSettingsAction({
        dailyDigestEnabled: nextSettings.dailyDigestEnabled,
        reminderNotificationsEnabled: nextSettings.reminderNotificationsEnabled,
      });
      if (!result.ok) throw new Error(result.message);
      setMessage(result.message);
    });
  }

  async function enableReminders(enabled: boolean) {
    if (enabled && "Notification" in window && Notification.permission === "default") {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setError("Notifications remain off because permission was not granted.");
        return;
      }
    }
    const next = { ...settings, reminderNotificationsEnabled: enabled };
    setSettings(next);
    saveSettings(next);
  }

  function saveResume() {
    run(async () => {
      const result = await addResumeSourceAction({
        label: resumeLabel,
        rawText: resumeText,
        sourceFileName: resumeFileName,
      });
      if (!result.ok) throw new Error(result.message);
      if (result.value.id) {
        setResumes((current) => [
          ...current,
          {
            id: result.value.id!,
            label: resumeLabel,
            sourceFileName: resumeFileName,
            createdAt: new Date().toISOString(),
          },
        ]);
      }
      setResumeText("");
      setResumeFileName(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setMessage(result.message);
    });
  }

  function removeResume(id: string) {
    run(async () => {
      const result = await deleteResumeSourceAction({ id });
      if (!result.ok) throw new Error(result.message);
      setResumes((current) => current.filter((resume) => resume.id !== id));
      setMessage(result.message);
    });
  }

  return (
    <div className="divide-y divide-white/[0.08]">
      {message ? <p role="status" className="pb-4 text-[11px] text-[#71d7ad]">{message}</p> : null}
      {error ? <p role="alert" className="pb-4 text-[11px] text-[#ff9aaa]">{error}</p> : null}

      <section className="pb-5">
        <div className="flex items-center gap-2 text-[#938aff]">
          <Link2 className="size-4" aria-hidden="true" />
          <h3 className="text-[14px] font-semibold text-[#e8ecf3]">Use the same workspace on another device</h3>
        </div>
        <p className="mt-2 text-[12px] leading-5 text-[#8c98ab]">
          Generate a one-time code here, then enter it on the second device. It links your profile, swipes, and saved jobs.
        </p>
        {pairingCode ? (
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-[#8176ff]/25 bg-[#8176ff]/10 p-2.5">
            <code className="flex-1 text-center text-sm font-semibold tracking-[0.14em] text-[#d9d5ff]">{pairingCode}</code>
            <button
              type="button"
              onClick={() => void navigator.clipboard.writeText(pairingCode)}
              className="grid size-11 place-items-center rounded-lg text-[#aaa3ff] hover:bg-white/[0.07]"
              aria-label="Copy pairing code"
            >
              <Copy className="size-4" aria-hidden="true" />
            </button>
          </div>
        ) : (
          <Button type="button" variant="outline" className="mt-3 h-11 w-full" disabled={pending} onClick={createPairingCode}>
            {pending ? <LoaderCircle className="animate-spin" /> : <Link2 />}
            Create pairing code
          </Button>
        )}
        <div className="mt-3 flex gap-2">
          <input
            value={redeemCode}
            onChange={(event) => setRedeemCode(event.target.value)}
            placeholder="Enter code from another device"
            autoCapitalize="characters"
            className={controlClass}
          />
          <Button type="button" variant="outline" className="h-11 shrink-0" disabled={pending || redeemCode.length < 12} onClick={redeemPairingCode}>
            Link
          </Button>
        </div>
      </section>

      <section className="py-5">
        <div className="flex items-center gap-2">
          <Bell className="size-4 text-[#938aff]" aria-hidden="true" />
          <h3 className="text-[14px] font-semibold text-[#e8ecf3]">Reminders</h3>
        </div>
        <SettingToggle
          checked={settings.reminderNotificationsEnabled}
          label="Application reminders"
          description="Notify you about due follow-ups while RoleDex is open."
          onChange={(checked) => void enableReminders(checked)}
        />
        <SettingToggle
          checked={settings.dailyDigestEnabled}
          label="Daily match digest"
          description="Ready for native push or email delivery when a provider is connected."
          onChange={(checked) => {
            const next = { ...settings, dailyDigestEnabled: checked };
            setSettings(next);
            saveSettings(next);
          }}
        />
      </section>

      <section className="py-5">
        <div className="flex items-center gap-2">
          <FileText className="size-4 text-[#938aff]" aria-hidden="true" />
          <h3 className="text-[14px] font-semibold text-[#e8ecf3]">Résumé evidence</h3>
        </div>
        <p className="mt-2 text-[12px] leading-5 text-[#8c98ab]">
          Saved résumé text is private and never changes your profile automatically. Review extracted evidence before using it for matching.
        </p>
        {resumes.length > 0 ? (
          <ul className="mt-3 divide-y divide-white/[0.07]">
            {resumes.map((resume) => (
              <li key={resume.id} className="flex min-h-12 items-center gap-3">
                <FileText className="size-4 text-[#8f9aae]" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate text-[13px] text-[#d1d8e3]">{resume.label}</span>
                <button type="button" onClick={() => removeResume(resume.id)} disabled={pending} className="grid size-11 place-items-center text-[#8f9aae] hover:text-[#ff9aaa]" aria-label={`Delete ${resume.label}`}>
                  <Trash2 className="size-4" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <input
          ref={fileInputRef}
          type="file"
          accept=".txt,.md,text/plain,text/markdown"
          className="mt-3 block w-full text-[10px] text-[#8490a4] file:mr-3 file:rounded-lg file:border-0 file:bg-white/[0.08] file:px-3 file:py-2 file:text-[#d8deea]"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            setResumeFileName(file.name);
            setResumeText(await file.text());
          }}
        />
        <input value={resumeLabel} onChange={(event) => setResumeLabel(event.target.value)} className={`${controlClass} mt-2`} aria-label="Résumé label" />
        <textarea value={resumeText} onChange={(event) => setResumeText(event.target.value)} placeholder="Paste résumé text here" className={`${controlClass} mt-2 min-h-32 resize-y py-3.5 leading-7`} />
        <Button type="button" variant="outline" className="mt-3 h-12 w-full rounded-full text-[13px] font-semibold" onClick={saveResume} disabled={pending || resumeText.trim().length < 100}>
          Save résumé evidence
        </Button>
      </section>

      <section className="pt-5">
        <div className="grid grid-cols-2 gap-2">
          <a href="/api/account/export" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/[0.1] text-[11px] font-semibold text-[#c8d0dd] hover:bg-white/[0.05]">
            <Download className="size-4" aria-hidden="true" /> Export data
          </a>
          <Link href="/privacy" className="inline-flex min-h-11 items-center justify-center rounded-xl border border-white/[0.1] text-[11px] font-semibold text-[#c8d0dd] hover:bg-white/[0.05]">
            Privacy policy
          </Link>
        </div>
        <Link href="/support" className="mt-2 inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-white/[0.1] text-[11px] font-semibold text-[#c8d0dd] hover:bg-white/[0.05]">
          Support
        </Link>
        {isGuest ? <ResetWorkspaceControl /> : <p className="mt-3 inline-flex items-center gap-1.5 text-[10px] text-[#71d7ad]"><Check className="size-3.5" /> Owner workspace connected</p>}
      </section>
    </div>
  );
}
