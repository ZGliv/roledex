"use client";

import { useMemo, useState, useTransition } from "react";

import {
  confirmCandidateResumeImportAction,
  createCandidateResumeImportFromFileAction,
  createCandidateResumeImportAction,
  discardCandidateResumeImportAction,
  type CandidateResumeImportActionState,
} from "@/features/candidate/actions";
import type { CandidateResumeDraft } from "@/features/candidate/input";

export type ResumeImportDraftValue = {
  createdAt: string;
  draft: CandidateResumeDraft;
  id: string;
  parserVersion: string;
};

type DraftKind = "education" | "projects" | "skills" | "work";

function selectionKey(kind: DraftKind, index: number) {
  return `${kind}:${index}`;
}

function allSelections(draft: CandidateResumeDraft) {
  return new Set([
    ...draft.workHistory.map((_, index) => selectionKey("work", index)),
    ...draft.education.map((_, index) => selectionKey("education", index)),
    ...draft.skills.map((_, index) => selectionKey("skills", index)),
    ...draft.projects.map((_, index) => selectionKey("projects", index)),
  ]);
}

function ReviewGroup({
  children,
  count,
  title,
}: {
  children: React.ReactNode;
  count: number;
  title: string;
}) {
  if (count === 0) return null;
  return (
    <section className="border-t border-white/[0.08] py-4 first:border-t-0">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h4 className="text-[11px] font-semibold text-[#dfe4ed]">{title}</h4>
        <span className="text-[10px] tabular-nums text-[#758198]">{count}</span>
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function ReviewItem({
  checked,
  confidence,
  detail,
  onChange,
  title,
}: {
  checked: boolean;
  confidence: string;
  detail: string;
  onChange: (checked: boolean) => void;
  title: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/[0.08] bg-white/[0.025] p-3 transition has-[:checked]:border-[#8176ff]/30 has-[:checked]:bg-[#8176ff]/[0.06]">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 size-4 accent-[#8176ff]"
      />
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] font-semibold leading-4 text-[#e5e9f1]">
          {title}
        </span>
        <span className="mt-0.5 block line-clamp-2 text-[10px] leading-4 text-[#8793a7]">
          {detail}
        </span>
      </span>
      <span className="shrink-0 rounded-full border border-white/[0.08] px-2 py-1 text-[8px] font-semibold uppercase tracking-[0.08em] text-[#8894a8]">
        {confidence}
      </span>
    </label>
  );
}

export function ResumeImportReview({
  initialDrafts,
  onRevisionChange,
  revision,
}: {
  initialDrafts: readonly ResumeImportDraftValue[];
  onRevisionChange: (revision: number) => void;
  revision: number;
}) {
  const [active, setActive] = useState<ResumeImportDraftValue | null>(
    initialDrafts[0] ?? null,
  );
  const [rawText, setRawText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [label, setLabel] = useState("Primary résumé");
  const [retainRawSource, setRetainRawSource] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(() =>
    active ? allSelections(active.draft) : new Set(),
  );

  const selectedCount = selected.size;
  const proposalCount = useMemo(() => {
    if (!active) return 0;
    return (
      active.draft.workHistory.length +
      active.draft.education.length +
      active.draft.skills.length +
      active.draft.projects.length
    );
  }, [active]);

  function toggle(kind: DraftKind, index: number, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      const key = selectionKey(kind, index);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  function indexes(kind: DraftKind, count: number) {
    return Array.from({ length: count }, (_, index) => index).filter((index) =>
      selected.has(selectionKey(kind, index)),
    );
  }

  function createDraft() {
    setMessage(null);
    startTransition(async () => {
      const result = await createCandidateResumeImportAction({
        label,
        rawText,
        sourceFileName: fileName,
      });
      activateDraft(result);
    });
  }

  function activateDraft(result: CandidateResumeImportActionState) {
    if (!result.ok || !result.draft || !result.importId) {
      setMessage(
        Object.values(result.fieldErrors ?? {}).flat()[0] ?? result.message,
      );
      return;
    }
    const next = {
      createdAt: new Date().toISOString(),
      draft: result.draft,
      id: result.importId,
      parserVersion: result.draft.parserVersion,
    };
    setActive(next);
    setSelected(allSelections(next.draft));
    setMessage(result.message);
    setRawText("");
  }

  function createFileDraft(file: File) {
    setMessage(`Reading ${file.name}…`);
    setFileName(file.name);
    setLabel(file.name.replace(/\.[^.]+$/, "") || "Primary résumé");
    startTransition(async () => {
      const formData = new FormData();
      formData.set("file", file);
      formData.set(
        "label",
        file.name.replace(/\.[^.]+$/, "") || "Primary résumé",
      );
      activateDraft(await createCandidateResumeImportFromFileAction(formData));
    });
  }

  function confirmDraft() {
    if (!active) return;
    setMessage(null);
    startTransition(async () => {
      const result = await confirmCandidateResumeImportAction({
        expectedProfileRevision: revision,
        importId: active.id,
        retainRawSource,
        selectedEducationIndexes: indexes(
          "education",
          active.draft.education.length,
        ),
        selectedProjectIndexes: indexes("projects", active.draft.projects.length),
        selectedSkillIndexes: indexes("skills", active.draft.skills.length),
        selectedWorkIndexes: indexes("work", active.draft.workHistory.length),
      });
      setMessage(result.message);
      if (result.ok) {
        if (result.revision !== undefined) onRevisionChange(result.revision);
        setActive(null);
        setSelected(new Set());
      }
    });
  }

  function discardDraft() {
    if (!active) return;
    setMessage(null);
    startTransition(async () => {
      const result = await discardCandidateResumeImportAction({
        importId: active.id,
      });
      setMessage(result.message);
      if (result.ok) {
        setActive(null);
        setSelected(new Set());
      }
    });
  }

  if (!active) {
    return (
      <div>
        <div className="border-b border-white/[0.08] pb-5">
          <p className="text-[13px] font-semibold text-[#eef2f7]">Import a résumé</p>
          <p className="mt-1 text-[11px] leading-5 text-[#8995a9]">
            Choose your existing PDF, Word, or text résumé. JobSwipe proposes structured facts; nothing is added until you review and confirm it.
          </p>
        </div>
        <div className="mt-4 space-y-3">
          <label className="block text-[10px] font-medium text-[#8e9aae]">
            Résumé label
            <input
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              className="mt-1.5 h-11 w-full rounded-xl border border-white/10 bg-[#101726] px-3 text-[14px] text-white outline-none focus:border-[#8176ff]/55"
            />
          </label>
          <label className="block text-[10px] font-medium text-[#8e9aae]">
            Résumé text
            <textarea
              value={rawText}
              onChange={(event) => setRawText(event.target.value)}
              placeholder="Paste the text from your résumé"
              className="mt-1.5 min-h-40 w-full resize-y rounded-xl border border-white/10 bg-[#101726] px-3 py-3 text-[14px] leading-6 text-white outline-none placeholder:text-[#667287] focus:border-[#8176ff]/55"
            />
          </label>
          <label className="inline-flex min-h-11 cursor-pointer items-center rounded-full border border-white/[0.1] px-4 text-[10px] font-semibold text-[#b8c1cf] transition hover:border-white/[0.18] hover:bg-white/[0.035]">
            {pending ? "Reading résumé…" : "Choose résumé file"}
            <input
              type="file"
              accept=".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown"
              className="sr-only"
              disabled={pending}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                createFileDraft(file);
                event.currentTarget.value = "";
              }}
            />
          </label>
          <p className="text-[10px] text-[#737f93]">PDF, DOCX, TXT, or Markdown · 5 MB max</p>
          <p className="text-[10px] leading-4 text-[#737f93]">
            The parser is deterministic and conservative. Raw text is deleted after confirmation unless you explicitly keep it.
          </p>
        </div>
        <div className="mt-5 flex items-center justify-between gap-3 border-t border-white/[0.08] pt-4">
          <p role="status" className="text-[10px] leading-4 text-[#8e9aae]">
            {message}
          </p>
          <button
            type="button"
            disabled={pending || rawText.trim().length < 100}
            onClick={createDraft}
            className="min-h-11 shrink-0 rounded-full bg-[#8176ff] px-5 text-[11px] font-semibold text-white disabled:opacity-40"
          >
            {pending ? "Reading…" : "Review résumé"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-4 border-b border-white/[0.08] pb-4">
        <div>
          <p className="text-[13px] font-semibold text-[#eef2f7]">Confirm résumé facts</p>
          <p className="mt-1 text-[10px] leading-4 text-[#8490a4]">
            {selectedCount} of {proposalCount} selected · uncheck anything overstated or incorrect
          </p>
        </div>
        <span className="rounded-full border border-white/[0.08] px-2.5 py-1 text-[8px] font-semibold uppercase tracking-[0.09em] text-[#7f8ba0]">
          Draft
        </span>
      </div>

      <div className="max-h-[32rem] overflow-y-auto pr-1">
        <ReviewGroup title="Work history" count={active.draft.workHistory.length}>
          {active.draft.workHistory.map((item, index) => (
            <ReviewItem
              key={`${item.company}-${item.title}-${index}`}
              checked={selected.has(selectionKey("work", index))}
              confidence={item.confidence}
              detail={`${item.company} · ${item.startDate}–${item.isCurrent ? "present" : item.endDate}`}
              title={item.title}
              onChange={(checked) => toggle("work", index, checked)}
            />
          ))}
        </ReviewGroup>
        <ReviewGroup title="Education" count={active.draft.education.length}>
          {active.draft.education.map((item, index) => (
            <ReviewItem
              key={`${item.institution}-${index}`}
              checked={selected.has(selectionKey("education", index))}
              confidence={item.confidence}
              detail={[item.degree, item.fieldOfStudy].filter(Boolean).join(" · ") || item.sourceExcerpt}
              title={item.institution}
              onChange={(checked) => toggle("education", index, checked)}
            />
          ))}
        </ReviewGroup>
        <ReviewGroup title="Skills" count={active.draft.skills.length}>
          {active.draft.skills.map((item, index) => (
            <ReviewItem
              key={`${item.name}-${index}`}
              checked={selected.has(selectionKey("skills", index))}
              confidence={item.confidence}
              detail="Proposed as self-reported familiarity; adjust the evidence after import if needed."
              title={item.name}
              onChange={(checked) => toggle("skills", index, checked)}
            />
          ))}
        </ReviewGroup>
        <ReviewGroup title="Projects" count={active.draft.projects.length}>
          {active.draft.projects.map((item, index) => (
            <ReviewItem
              key={`${item.name}-${index}`}
              checked={selected.has(selectionKey("projects", index))}
              confidence={item.confidence}
              detail={item.description}
              title={item.name}
              onChange={(checked) => toggle("projects", index, checked)}
            />
          ))}
        </ReviewGroup>
      </div>

      {active.draft.warnings.length > 0 ? (
        <div className="border-t border-white/[0.08] py-3">
          {active.draft.warnings.map((warning) => (
            <p key={warning} className="text-[9px] leading-4 text-[#7f8ba0]">{warning}</p>
          ))}
        </div>
      ) : null}

      <label className="flex min-h-11 cursor-pointer items-center justify-between gap-4 border-t border-white/[0.08] py-3 text-[10px] text-[#9ba6b8]">
        Keep the original résumé text after import
        <input
          type="checkbox"
          checked={retainRawSource}
          onChange={(event) => setRetainRawSource(event.target.checked)}
          className="size-4 accent-[#8176ff]"
        />
      </label>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.08] pt-4">
        <button
          type="button"
          disabled={pending}
          onClick={discardDraft}
          className="min-h-11 rounded-full px-3 text-[10px] font-semibold text-[#d995a0] disabled:opacity-40"
        >
          Discard and delete raw text
        </button>
        <button
          type="button"
          disabled={pending || selectedCount === 0}
          onClick={confirmDraft}
          className="min-h-11 rounded-full bg-[#8176ff] px-5 text-[11px] font-semibold text-white disabled:opacity-40"
        >
          {pending ? "Adding…" : `Add ${selectedCount} confirmed facts`}
        </button>
      </div>
      {message ? (
        <p role="status" className="mt-3 text-[10px] leading-4 text-[#8f9bad]">
          {message}
        </p>
      ) : null}
    </div>
  );
}
