"use client";

import {
  Award,
  BriefcaseBusiness,
  CheckCircle2,
  ExternalLink,
  FolderKanban,
  GraduationCap,
  LoaderCircle,
  PencilLine,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  createCandidateEducationAction,
  createCandidateSkillEvidenceAction,
  createCandidateWorkExperienceAction,
  createPortfolioProjectAction,
  deleteCandidateEducationAction,
  deleteCandidateSkillEvidenceAction,
  deleteCandidateWorkExperienceAction,
  deletePortfolioProjectAction,
  updateCandidateEducationAction,
  updateCandidateSkillEvidenceAction,
  updateCandidateWorkExperienceAction,
  updatePortfolioProjectAction,
  type CandidateProfileMutationState,
} from "@/features/candidate/actions";
import { cn } from "@/lib/utils";

export type WorkExperienceValue = {
  achievements: string[];
  company: string;
  employmentType: string | null;
  endDate: string | null;
  id: string;
  isCurrent: boolean;
  location: string | null;
  skills: string[];
  sortOrder: number;
  startDate: string;
  summary: string;
  title: string;
  workArrangement: string | null;
};

export type EducationValue = {
  degree: string;
  description: string;
  endYear: number | null;
  fieldOfStudy: string;
  id: string;
  institution: string;
  sortOrder: number;
  startYear: number | null;
};

export type SkillEvidenceValue = {
  confidence: string;
  evidenceNote: string | null;
  evidenceType: string;
  id: string;
  lastUsedYear: number | null;
  name: string;
  proficiency: string;
  sourceRecordId: string | null;
  yearsExperience: number | null;
};

export type PortfolioProjectValue = {
  appStoreUrl: string | null;
  businessProblem: string;
  description: string;
  id: string;
  liveUrl: string | null;
  name: string;
  relevantRoleFamilies: string[];
  repositoryUrl: string | null;
  responsibilities: string[];
  screenshots: string[];
  status: string;
  strongestEvidence: string[];
  technologies: string[];
  userImpact: string;
};

type Props = {
  education: readonly EducationValue[];
  embedded?: boolean;
  onRevisionChange: (revision: number) => void;
  projects: readonly PortfolioProjectValue[];
  revision: number;
  skills: readonly SkillEvidenceValue[];
  workHistory: readonly WorkExperienceValue[];
};

const INPUT_CLASS =
  "h-13 rounded-[1rem] border-white/[0.13] bg-[linear-gradient(145deg,rgba(255,255,255,.075),rgba(255,255,255,.035))] px-4 text-[16px] font-medium text-[#f2f4f9] shadow-[inset_0_1px_0_rgba(255,255,255,.07)] placeholder:text-[#6f7c91] focus-visible:border-[#9c93ff]/55 focus-visible:ring-4 focus-visible:ring-[#8176ff]/15";
const TEXTAREA_CLASS =
  "min-h-28 resize-y rounded-[1rem] border-white/[0.13] bg-[linear-gradient(145deg,rgba(255,255,255,.075),rgba(255,255,255,.035))] px-4 py-3.5 text-[16px] font-medium leading-7 text-[#f2f4f9] shadow-[inset_0_1px_0_rgba(255,255,255,.07)] placeholder:text-[#6f7c91] focus-visible:border-[#9c93ff]/55 focus-visible:ring-4 focus-visible:ring-[#8176ff]/15";
const LABEL_CLASS = "text-[13px] font-semibold text-[#d7dde8]";

function stringValue(form: FormData, name: string) {
  return String(form.get(name) ?? "").trim();
}

function nullableString(form: FormData, name: string) {
  return stringValue(form, name) || null;
}

function nullableNumber(form: FormData, name: string) {
  const raw = stringValue(form, name);
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function listValue(form: FormData, name: string) {
  const seen = new Set<string>();
  return stringValue(form, name)
    .split(/\n|,/)
    .flatMap((rawValue) => {
      const value = rawValue.replace(/^[-*•]\s*/, "").replace(/\s+/g, " ").trim();
      const key = value.toLocaleLowerCase();
      if (!value || seen.has(key)) return [];
      seen.add(key);
      return [value];
    });
}

function MutationMessage({
  id,
  state,
}: {
  id: string;
  state: CandidateProfileMutationState;
}) {
  const fieldMessage = Object.values(state.fieldErrors ?? {}).flat()[0];
  return state.message ? (
    <p
      id={id}
      role={state.ok ? "status" : "alert"}
      className={cn(
        "text-[11px] leading-4",
        state.ok ? "text-[#73d8b1]" : "text-[#ff9aaa]",
      )}
    >
      {fieldMessage ? `${state.message} ${fieldMessage}` : state.message}
    </p>
  ) : null;
}

function EditorActions({
  existing,
  pending,
  state,
  statusId,
}: {
  existing: boolean;
  pending: boolean;
  state: CandidateProfileMutationState;
  statusId: string;
}) {
  return (
    <div className="flex flex-col gap-3 border-t border-white/[0.08] pt-4 sm:flex-row sm:items-center sm:justify-between">
      <MutationMessage id={statusId} state={state} />
      <Button
        type="submit"
        disabled={pending}
        className="h-11 rounded-full bg-[#8176ff] px-4 text-white hover:bg-[#7064f4]"
      >
        {pending ? (
          <LoaderCircle className="animate-spin" aria-hidden="true" />
        ) : existing ? (
          <PencilLine aria-hidden="true" />
        ) : (
          <Plus aria-hidden="true" />
        )}
        {pending ? "Saving…" : existing ? "Save changes" : "Add to profile"}
      </Button>
    </div>
  );
}

function useMutationResult(onRevisionChange: (revision: number) => void) {
  const [pending, setPending] = useState(false);
  const [state, setState] = useState<CandidateProfileMutationState>({
    message: "",
    ok: false,
  });

  const run = async (action: () => Promise<CandidateProfileMutationState>) => {
    setPending(true);
    setState({ message: "", ok: false });
    try {
      const result = await action();
      setState(result);
      if (result.ok && result.revision) onRevisionChange(result.revision);
      return result;
    } catch {
      const result = {
        message: "That change could not be saved. Check your connection and try again.",
        ok: false,
      };
      setState(result);
      return result;
    } finally {
      setPending(false);
    }
  };

  const resetState = () => {
    if (state.message) setState({ message: "", ok: false });
  };

  return { pending, resetState, run, state };
}

function FormField({
  children,
  htmlFor,
  label,
}: {
  children: ReactNode;
  htmlFor: string;
  label: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor} className={LABEL_CLASS}>
        {label}
      </Label>
      {children}
    </div>
  );
}

function resetCreateForm(
  form: HTMLFormElement,
  existing: unknown,
  result: CandidateProfileMutationState,
) {
  if (existing || !result.ok) return;
  form.reset();
  const disclosure = form.closest("details");
  if (disclosure) disclosure.open = false;
}

function focusFirstFieldError(
  form: HTMLFormElement,
  result: CandidateProfileMutationState,
) {
  if (result.ok) return;
  const firstField = Object.keys(result.fieldErrors ?? {})[0];
  if (!firstField) return;
  const control = form.elements.namedItem(firstField);
  if (control instanceof HTMLElement) control.focus();
}

function DeleteRecordButton({
  action,
  label,
  onRevisionChange,
  recordId,
  revision,
}: {
  action: (input: unknown) => Promise<CandidateProfileMutationState>;
  label: string;
  onRevisionChange: (revision: number) => void;
  recordId: string;
  revision: number;
}) {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const remove = async () => {
    if (!window.confirm(`Remove ${label}? This cannot be undone.`)) return;
    setPending(true);
    setFailed(false);
    try {
      const result = await action({
        id: recordId,
        expectedProfileRevision: revision,
      });
      if (result.ok && result.revision) onRevisionChange(result.revision);
      else setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  };
  return (
    <div className="flex flex-col items-end gap-1.5">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={remove}
        disabled={pending}
        className="text-[#d98290] hover:bg-[#d98290]/10 hover:text-[#ff9aaa]"
      >
        {pending ? (
          <LoaderCircle className="animate-spin" aria-hidden="true" />
        ) : (
          <Trash2 aria-hidden="true" />
        )}
        Remove
      </Button>
      {failed ? <p className="text-[10px] text-[#ff9aaa]" role="alert">Could not remove this record.</p> : null}
    </div>
  );
}

function WorkExperienceEditor({
  existing,
  onRevisionChange,
  revision,
}: {
  existing?: WorkExperienceValue;
  onRevisionChange: (revision: number) => void;
  revision: number;
}) {
  const { pending, resetState, run, state } = useMutationResult(onRevisionChange);
  const prefix = `work-${existing?.id ?? "new"}`;
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const isCurrent = form.get("isCurrent") === "on";
    const payload = {
      ...(existing ? { id: existing.id } : {}),
      expectedProfileRevision: revision,
      sortOrder: existing?.sortOrder ?? 0,
      company: stringValue(form, "company"),
      title: stringValue(form, "title"),
      employmentType: nullableString(form, "employmentType"),
      location: nullableString(form, "location"),
      workArrangement: nullableString(form, "workArrangement"),
      startDate: stringValue(form, "startDate"),
      endDate: isCurrent ? null : nullableString(form, "endDate"),
      isCurrent,
      summary: stringValue(form, "summary"),
      achievements: listValue(form, "achievements"),
      skills: listValue(form, "skills"),
    };
    const result = await run(() =>
      existing
        ? updateCandidateWorkExperienceAction(payload)
        : createCandidateWorkExperienceAction(payload),
    );
    focusFirstFieldError(formElement, result);
    resetCreateForm(formElement, existing, result);
  };

  return (
    <form onSubmit={submit} onInput={resetState} aria-busy={pending} aria-describedby={`${prefix}-status`}>
      <fieldset disabled={pending} className="m-0 min-w-0 space-y-5 border-0 p-0">
        <legend className="sr-only">{existing ? "Edit work experience" : "Add work experience"}</legend>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField htmlFor={`${prefix}-company`} label="Company">
          <Input id={`${prefix}-company`} name="company" required maxLength={180} defaultValue={existing?.company} className={INPUT_CLASS} />
        </FormField>
        <FormField htmlFor={`${prefix}-title`} label="Title">
          <Input id={`${prefix}-title`} name="title" required maxLength={180} defaultValue={existing?.title} className={INPUT_CLASS} />
        </FormField>
        <FormField htmlFor={`${prefix}-start`} label="Started">
          <Input id={`${prefix}-start`} name="startDate" type="month" required defaultValue={existing?.startDate} className={INPUT_CLASS} />
        </FormField>
        <FormField htmlFor={`${prefix}-end`} label="Ended">
          <Input id={`${prefix}-end`} name="endDate" type="month" defaultValue={existing?.endDate ?? ""} className={INPUT_CLASS} />
        </FormField>
        <FormField htmlFor={`${prefix}-type`} label="Employment type">
          <select id={`${prefix}-type`} name="employmentType" defaultValue={existing?.employmentType ?? ""} className={cn(INPUT_CLASS, "w-full px-3 outline-none")}>
            <option value="">Not specified</option>
            <option value="full_time">Full-time</option>
            <option value="part_time">Part-time</option>
            <option value="contract">Contract</option>
            <option value="temporary">Temporary</option>
            <option value="internship">Internship</option>
          </select>
        </FormField>
        <FormField htmlFor={`${prefix}-mode`} label="Work mode">
          <select id={`${prefix}-mode`} name="workArrangement" defaultValue={existing?.workArrangement ?? ""} className={cn(INPUT_CLASS, "w-full px-3 outline-none")}>
            <option value="">Not specified</option>
            <option value="remote">Remote</option>
            <option value="hybrid">Hybrid</option>
            <option value="on_site">On-site</option>
          </select>
        </FormField>
      </div>
      <FormField htmlFor={`${prefix}-location`} label="Location">
        <Input id={`${prefix}-location`} name="location" maxLength={220} defaultValue={existing?.location ?? ""} placeholder="Pittsburgh, PA" className={INPUT_CLASS} />
      </FormField>
      <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-[12px] font-medium text-[#b5bfd0]">
        <input type="checkbox" name="isCurrent" defaultChecked={existing?.isCurrent} className="size-4 accent-[#8176ff]" />
        I currently work here
      </label>
      <FormField htmlFor={`${prefix}-summary`} label="Role summary">
        <Textarea id={`${prefix}-summary`} name="summary" maxLength={2000} defaultValue={existing?.summary} placeholder="Scope, customers, systems, and the kind of problems you owned." className={TEXTAREA_CLASS} />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField htmlFor={`${prefix}-achievements`} label="Achievements · one per line">
          <Textarea id={`${prefix}-achievements`} name="achievements" defaultValue={existing?.achievements.join("\n")} className={TEXTAREA_CLASS} />
        </FormField>
        <FormField htmlFor={`${prefix}-skills`} label="Skills used · one per line">
          <Textarea id={`${prefix}-skills`} name="skills" defaultValue={existing?.skills.join("\n")} className={TEXTAREA_CLASS} />
        </FormField>
      </div>
        <EditorActions existing={Boolean(existing)} pending={pending} state={state} statusId={`${prefix}-status`} />
      </fieldset>
    </form>
  );
}

function EducationEditor({
  existing,
  onRevisionChange,
  revision,
}: {
  existing?: EducationValue;
  onRevisionChange: (revision: number) => void;
  revision: number;
}) {
  const { pending, resetState, run, state } = useMutationResult(onRevisionChange);
  const prefix = `education-${existing?.id ?? "new"}`;
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const payload = {
      ...(existing ? { id: existing.id } : {}),
      expectedProfileRevision: revision,
      sortOrder: existing?.sortOrder ?? 0,
      institution: stringValue(form, "institution"),
      degree: stringValue(form, "degree"),
      fieldOfStudy: stringValue(form, "fieldOfStudy"),
      startYear: nullableNumber(form, "startYear"),
      endYear: nullableNumber(form, "endYear"),
      description: stringValue(form, "description"),
    };
    const result = await run(() =>
      existing
        ? updateCandidateEducationAction(payload)
        : createCandidateEducationAction(payload),
    );
    focusFirstFieldError(formElement, result);
    resetCreateForm(formElement, existing, result);
  };
  return (
    <form onSubmit={submit} onInput={resetState} aria-busy={pending} aria-describedby={`${prefix}-status`}>
      <fieldset disabled={pending} className="m-0 min-w-0 space-y-5 border-0 p-0">
        <legend className="sr-only">{existing ? "Edit education" : "Add education"}</legend>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <FormField htmlFor={`${prefix}-institution`} label="Institution">
            <Input id={`${prefix}-institution`} name="institution" required maxLength={220} defaultValue={existing?.institution} className={INPUT_CLASS} />
          </FormField>
        </div>
        <FormField htmlFor={`${prefix}-degree`} label="Degree or credential">
          <Input id={`${prefix}-degree`} name="degree" maxLength={180} defaultValue={existing?.degree} className={INPUT_CLASS} />
        </FormField>
        <FormField htmlFor={`${prefix}-field`} label="Field of study">
          <Input id={`${prefix}-field`} name="fieldOfStudy" maxLength={180} defaultValue={existing?.fieldOfStudy} className={INPUT_CLASS} />
        </FormField>
        <FormField htmlFor={`${prefix}-start-year`} label="Start year">
          <Input id={`${prefix}-start-year`} name="startYear" type="number" min={1900} max={2200} defaultValue={existing?.startYear ?? ""} className={INPUT_CLASS} />
        </FormField>
        <FormField htmlFor={`${prefix}-end-year`} label="End year">
          <Input id={`${prefix}-end-year`} name="endYear" type="number" min={1900} max={2200} defaultValue={existing?.endYear ?? ""} className={INPUT_CLASS} />
        </FormField>
      </div>
      <FormField htmlFor={`${prefix}-description`} label="Relevant coursework or context">
        <Textarea id={`${prefix}-description`} name="description" maxLength={2000} defaultValue={existing?.description} className={TEXTAREA_CLASS} />
      </FormField>
        <EditorActions existing={Boolean(existing)} pending={pending} state={state} statusId={`${prefix}-status`} />
      </fieldset>
    </form>
  );
}

function SkillEvidenceEditor({
  existing,
  onRevisionChange,
  revision,
}: {
  existing?: SkillEvidenceValue;
  onRevisionChange: (revision: number) => void;
  revision: number;
}) {
  const { pending, resetState, run, state } = useMutationResult(onRevisionChange);
  const prefix = `skill-${existing?.id ?? "new"}`;
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const payload = {
      ...(existing ? { id: existing.id } : {}),
      expectedProfileRevision: revision,
      name: stringValue(form, "name"),
      proficiency: stringValue(form, "proficiency"),
      yearsExperience: nullableNumber(form, "yearsExperience"),
      lastUsedYear: nullableNumber(form, "lastUsedYear"),
      evidenceType: stringValue(form, "evidenceType"),
      confidence: stringValue(form, "confidence"),
      sourceRecordId: existing?.sourceRecordId ?? null,
      evidenceNote: nullableString(form, "evidenceNote"),
    };
    const result = await run(() =>
      existing
        ? updateCandidateSkillEvidenceAction(payload)
        : createCandidateSkillEvidenceAction(payload),
    );
    focusFirstFieldError(formElement, result);
    resetCreateForm(formElement, existing, result);
  };
  return (
    <form onSubmit={submit} onInput={resetState} aria-busy={pending} aria-describedby={`${prefix}-status`}>
      <fieldset disabled={pending} className="m-0 min-w-0 space-y-5 border-0 p-0">
        <legend className="sr-only">{existing ? "Edit skill evidence" : "Add skill evidence"}</legend>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField htmlFor={`${prefix}-name`} label="Skill">
          <Input id={`${prefix}-name`} name="name" required maxLength={160} defaultValue={existing?.name} placeholder="SQL" className={INPUT_CLASS} />
        </FormField>
        <FormField htmlFor={`${prefix}-proficiency`} label="Proficiency">
          <select id={`${prefix}-proficiency`} name="proficiency" defaultValue={existing?.proficiency ?? "working"} className={cn(INPUT_CLASS, "w-full px-3 outline-none")}>
            <option value="learning">Learning</option>
            <option value="working">Working</option>
            <option value="advanced">Advanced</option>
            <option value="expert">Expert</option>
          </select>
        </FormField>
        <FormField htmlFor={`${prefix}-years`} label="Years used">
          <Input id={`${prefix}-years`} name="yearsExperience" type="number" min={0} max={50} defaultValue={existing?.yearsExperience ?? ""} className={INPUT_CLASS} />
        </FormField>
        <FormField htmlFor={`${prefix}-last-used`} label="Last used">
          <Input id={`${prefix}-last-used`} name="lastUsedYear" type="number" min={1900} max={2200} defaultValue={existing?.lastUsedYear ?? ""} className={INPUT_CLASS} />
        </FormField>
        <div>
          <FormField htmlFor={`${prefix}-source`} label="Where the proof comes from">
            <select id={`${prefix}-source`} name="evidenceType" defaultValue={existing?.evidenceType ?? "self_reported"} className={cn(INPUT_CLASS, "w-full px-3 outline-none")}>
              <option value="work_experience">Professional experience</option>
              <option value="portfolio_project">Shipped project</option>
              <option value="education">Coursework or education</option>
              <option value="certification">Certification</option>
              <option value="assessment">Verified assessment</option>
              <option value="self_reported">Self-reported familiarity</option>
              <option value="other">Other proof</option>
            </select>
          </FormField>
        </div>
        <div>
          <FormField htmlFor={`${prefix}-confidence`} label="Evidence confidence">
            <select id={`${prefix}-confidence`} name="confidence" defaultValue={existing?.confidence ?? "medium"} className={cn(INPUT_CLASS, "w-full px-3 outline-none")}>
              <option value="low">Early exposure</option>
              <option value="medium">Can discuss it</option>
              <option value="high">Can demonstrate it</option>
              <option value="verified">Externally verified</option>
            </select>
          </FormField>
        </div>
      </div>
      <FormField htmlFor={`${prefix}-note`} label="Proof or context">
        <Textarea id={`${prefix}-note`} name="evidenceNote" maxLength={1000} defaultValue={existing?.evidenceNote ?? ""} placeholder="Where you used it, what you built, or the credential you earned." className={TEXTAREA_CLASS} />
      </FormField>
        <EditorActions existing={Boolean(existing)} pending={pending} state={state} statusId={`${prefix}-status`} />
      </fieldset>
    </form>
  );
}

function ProjectEditor({
  existing,
  onRevisionChange,
  revision,
}: {
  existing?: PortfolioProjectValue;
  onRevisionChange: (revision: number) => void;
  revision: number;
}) {
  const { pending, resetState, run, state } = useMutationResult(onRevisionChange);
  const prefix = `project-${existing?.id ?? "new"}`;
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const payload = {
      ...(existing ? { id: existing.id } : {}),
      expectedProfileRevision: revision,
      name: stringValue(form, "name"),
      description: stringValue(form, "description"),
      technologies: listValue(form, "technologies"),
      status: stringValue(form, "status"),
      liveUrl: nullableString(form, "liveUrl"),
      repositoryUrl: nullableString(form, "repositoryUrl"),
      appStoreUrl: existing?.appStoreUrl ?? null,
      screenshots: existing?.screenshots ?? [],
      responsibilities: listValue(form, "responsibilities"),
      businessProblem: stringValue(form, "businessProblem"),
      userImpact: stringValue(form, "userImpact"),
      strongestEvidence: listValue(form, "strongestEvidence"),
      relevantRoleFamilies: listValue(form, "relevantRoleFamilies"),
    };
    const result = await run(() =>
      existing
        ? updatePortfolioProjectAction(payload)
        : createPortfolioProjectAction(payload),
    );
    focusFirstFieldError(formElement, result);
    resetCreateForm(formElement, existing, result);
  };
  return (
    <form onSubmit={submit} onInput={resetState} aria-busy={pending} aria-describedby={`${prefix}-status`}>
      <fieldset disabled={pending} className="m-0 min-w-0 space-y-5 border-0 p-0">
        <legend className="sr-only">{existing ? "Edit portfolio project" : "Add portfolio project"}</legend>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField htmlFor={`${prefix}-name`} label="Project name">
          <Input id={`${prefix}-name`} name="name" required maxLength={180} defaultValue={existing?.name} className={INPUT_CLASS} />
        </FormField>
        <FormField htmlFor={`${prefix}-status`} label="Status">
          <select id={`${prefix}-status`} name="status" defaultValue={existing?.status ?? "shipped"} className={cn(INPUT_CLASS, "w-full px-3 outline-none")}>
            <option value="idea">Idea</option>
            <option value="prototype">Prototype</option>
            <option value="shipped">Shipped</option>
            <option value="published">Published</option>
          </select>
        </FormField>
        <FormField htmlFor={`${prefix}-live`} label="Live URL">
          <Input id={`${prefix}-live`} name="liveUrl" type="url" defaultValue={existing?.liveUrl ?? ""} placeholder="https://" className={INPUT_CLASS} />
        </FormField>
        <FormField htmlFor={`${prefix}-repo`} label="Repository URL">
          <Input id={`${prefix}-repo`} name="repositoryUrl" type="url" defaultValue={existing?.repositoryUrl ?? ""} placeholder="https://" className={INPUT_CLASS} />
        </FormField>
      </div>
      <FormField htmlFor={`${prefix}-description`} label="What you built">
        <Textarea id={`${prefix}-description`} name="description" required maxLength={2000} defaultValue={existing?.description} className={TEXTAREA_CLASS} />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField htmlFor={`${prefix}-technology`} label="Technologies · one per line">
          <Textarea id={`${prefix}-technology`} name="technologies" defaultValue={existing?.technologies.join("\n")} className={TEXTAREA_CLASS} />
        </FormField>
        <FormField htmlFor={`${prefix}-roles`} label="Relevant roles · one per line">
          <Textarea id={`${prefix}-roles`} name="relevantRoleFamilies" defaultValue={existing?.relevantRoleFamilies.join("\n")} className={TEXTAREA_CLASS} />
        </FormField>
        <FormField htmlFor={`${prefix}-responsibilities`} label="Your responsibilities">
          <Textarea id={`${prefix}-responsibilities`} name="responsibilities" defaultValue={existing?.responsibilities.join("\n")} className={TEXTAREA_CLASS} />
        </FormField>
        <FormField htmlFor={`${prefix}-evidence`} label="Strongest proof">
          <Textarea id={`${prefix}-evidence`} name="strongestEvidence" defaultValue={existing?.strongestEvidence.join("\n")} className={TEXTAREA_CLASS} />
        </FormField>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField htmlFor={`${prefix}-problem`} label="Business problem">
          <Textarea id={`${prefix}-problem`} name="businessProblem" defaultValue={existing?.businessProblem} className={TEXTAREA_CLASS} />
        </FormField>
        <FormField htmlFor={`${prefix}-impact`} label="User or business impact">
          <Textarea id={`${prefix}-impact`} name="userImpact" defaultValue={existing?.userImpact} className={TEXTAREA_CLASS} />
        </FormField>
      </div>
        <EditorActions existing={Boolean(existing)} pending={pending} state={state} statusId={`${prefix}-status`} />
      </fieldset>
    </form>
  );
}

function EvidenceGroup({
  addEditor,
  children,
  count,
  description,
  icon,
  title,
}: {
  addEditor: ReactNode;
  children: ReactNode;
  count: number;
  description: string;
  icon: ReactNode;
  title: string;
}) {
  return (
    <section className="border-t border-white/[0.09] first:border-t-0">
      <div className="flex items-start justify-between gap-4 px-4 py-5 sm:px-6">
        <div className="flex min-w-0 gap-3">
          <span className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-white/[0.1] bg-white/[0.04] text-[#938aff]">
            {icon}
          </span>
          <div>
            <h3 className="text-[13px] font-semibold text-[#edf1f8]">{title}</h3>
            <p className="mt-1 max-w-lg text-[11px] leading-4 text-[#7f8ba1]">{description}</p>
          </div>
        </div>
        <span className="shrink-0 text-[11px] tabular-nums text-[#78849a]">{count}</span>
      </div>
      {children}
      <details className="group border-t border-white/[0.08]">
        <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-4 text-[12px] font-semibold text-[#aaa3ff] outline-none transition hover:bg-white/[0.025] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#8176ff]/45 sm:px-6 [&::-webkit-details-marker]:hidden">
          <Plus className="size-4 transition-transform group-open:rotate-45" aria-hidden="true" />
          Add {title.toLocaleLowerCase().replace(/s$/, "")}
        </summary>
        <div className="border-t border-white/[0.08] bg-black/10 px-4 py-5 sm:px-6">{addEditor}</div>
      </details>
    </section>
  );
}

function ExistingRecord({
  children,
  deleteAction,
  label,
  meta,
  onRevisionChange,
  recordId,
  revision,
  title,
}: {
  children: ReactNode;
  deleteAction: (input: unknown) => Promise<CandidateProfileMutationState>;
  label: string;
  meta: string;
  onRevisionChange: (revision: number) => void;
  recordId: string;
  revision: number;
  title: string;
}) {
  return (
    <details className="group border-t border-white/[0.07] first:border-t-0">
      <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 outline-none transition hover:bg-white/[0.025] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#8176ff]/45 sm:px-6 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">
          <span className="block truncate text-[12px] font-semibold text-[#dfe4ed]">{title}</span>
          <span className="mt-0.5 block truncate text-[11px] text-[#7f8ba1]">{meta}</span>
        </span>
        <PencilLine className="size-4 shrink-0 text-[#7168e8]" aria-hidden="true" />
      </summary>
      <div className="border-t border-white/[0.08] bg-black/10 px-4 py-5 sm:px-6">
        {children}
        <div className="mt-4 flex justify-end">
          <DeleteRecordButton
            action={deleteAction}
            label={label}
            onRevisionChange={onRevisionChange}
            recordId={recordId}
            revision={revision}
          />
        </div>
      </div>
    </details>
  );
}

export function ProfileEvidenceEditor({
  education,
  embedded = false,
  onRevisionChange,
  projects,
  revision,
  skills,
  workHistory,
}: Props) {
  return (
    <div
      className={cn(
        "overflow-hidden",
        !embedded &&
          "profile-glass-surface rounded-[1.45rem] border border-white/[0.1] bg-[linear-gradient(145deg,rgba(15,21,35,.76),rgba(7,11,21,.72))] shadow-[0_24px_70px_rgba(0,3,12,.28)] backdrop-blur-2xl",
      )}
    >
      <div
        className={cn(
          "flex items-start justify-between gap-4 px-4 py-5 sm:px-6",
          embedded && "border-b border-white/[0.08] px-1 pt-1 sm:px-1",
        )}
      >
        <div>
          <div className="flex items-center gap-2 text-[#aaa3ff]">
            <Sparkles className="size-4" aria-hidden="true" />
            <p className="text-[10px] font-semibold uppercase tracking-[0.13em]">Evidence</p>
          </div>
          <h2 className="mt-2 text-lg font-semibold tracking-[-0.025em] text-[#f4f6fb]">Skills and experience</h2>
          <p className="mt-1 max-w-xl text-[12px] leading-5 text-[#8793a8]">
            Structured proof keeps fit honest. Skill evidence and projects inform scoring; history and education make the profile defensible.
          </p>
        </div>
        <CheckCircle2 className="mt-1 size-5 shrink-0 text-[#62cfa4]" aria-hidden="true" />
      </div>

      <EvidenceGroup
        title="Work history"
        description="Roles, scope, achievements, and skills you used in professional settings."
        count={workHistory.length}
        icon={<BriefcaseBusiness className="size-4" aria-hidden="true" />}
        addEditor={<WorkExperienceEditor revision={revision} onRevisionChange={onRevisionChange} />}
      >
        {workHistory.map((item) => (
          <ExistingRecord
            key={item.id}
            recordId={item.id}
            revision={revision}
            title={item.title}
            meta={`${item.company} · ${item.startDate}${item.isCurrent ? "–Present" : item.endDate ? `–${item.endDate}` : ""}`}
            label={`${item.title} at ${item.company}`}
            deleteAction={deleteCandidateWorkExperienceAction}
            onRevisionChange={onRevisionChange}
          >
            <WorkExperienceEditor existing={item} revision={revision} onRevisionChange={onRevisionChange} />
          </ExistingRecord>
        ))}
      </EvidenceGroup>

      <EvidenceGroup
        title="Education"
        description="Degrees, credentials, and coursework that support your direction."
        count={education.length}
        icon={<GraduationCap className="size-4" aria-hidden="true" />}
        addEditor={<EducationEditor revision={revision} onRevisionChange={onRevisionChange} />}
      >
        {education.map((item) => (
          <ExistingRecord
            key={item.id}
            recordId={item.id}
            revision={revision}
            title={item.institution}
            meta={[item.degree, item.fieldOfStudy].filter(Boolean).join(" · ") || "Education record"}
            label={item.institution}
            deleteAction={deleteCandidateEducationAction}
            onRevisionChange={onRevisionChange}
          >
            <EducationEditor existing={item} revision={revision} onRevisionChange={onRevisionChange} />
          </ExistingRecord>
        ))}
      </EvidenceGroup>

      <EvidenceGroup
        title="Skill evidence"
        description="Name the source, recency, years used, and confidence so the feed does not treat every keyword equally."
        count={skills.length}
        icon={<Award className="size-4" aria-hidden="true" />}
        addEditor={<SkillEvidenceEditor revision={revision} onRevisionChange={onRevisionChange} />}
      >
        {skills.map((item) => (
          <ExistingRecord
            key={item.id}
            recordId={item.id}
            revision={revision}
            title={item.name}
            meta={`${item.proficiency.replace("_", " ")} · ${item.evidenceType.replaceAll("_", " ")} · ${item.confidence}`}
            label={item.name}
            deleteAction={deleteCandidateSkillEvidenceAction}
            onRevisionChange={onRevisionChange}
          >
            <SkillEvidenceEditor existing={item} revision={revision} onRevisionChange={onRevisionChange} />
          </ExistingRecord>
        ))}
      </EvidenceGroup>

      <EvidenceGroup
        title="Portfolio projects"
        description="Shipped work, prototypes, and the outcomes that prove adjacent-role capability."
        count={projects.length}
        icon={<FolderKanban className="size-4" aria-hidden="true" />}
        addEditor={<ProjectEditor revision={revision} onRevisionChange={onRevisionChange} />}
      >
        {projects.map((item) => (
          <ExistingRecord
            key={item.id}
            recordId={item.id}
            revision={revision}
            title={item.name}
            meta={`${item.status} · ${item.technologies.slice(0, 3).join(", ") || "Project evidence"}`}
            label={item.name}
            deleteAction={deletePortfolioProjectAction}
            onRevisionChange={onRevisionChange}
          >
            {(item.liveUrl || item.repositoryUrl) ? (
              <div className="mb-5 flex flex-wrap gap-2">
                {item.liveUrl ? (
                  <a href={item.liveUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/[0.1] px-3 text-[11px] font-semibold text-[#aaa3ff] hover:bg-white/[0.04]">
                    Live project <span className="sr-only">(opens in a new tab)</span><ExternalLink className="size-3.5" aria-hidden="true" />
                  </a>
                ) : null}
                {item.repositoryUrl ? (
                  <a href={item.repositoryUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/[0.1] px-3 text-[11px] font-semibold text-[#aaa3ff] hover:bg-white/[0.04]">
                    Repository <span className="sr-only">(opens in a new tab)</span><ExternalLink className="size-3.5" aria-hidden="true" />
                  </a>
                ) : null}
              </div>
            ) : null}
            <ProjectEditor existing={item} revision={revision} onRevisionChange={onRevisionChange} />
          </ExistingRecord>
        ))}
      </EvidenceGroup>
    </div>
  );
}
