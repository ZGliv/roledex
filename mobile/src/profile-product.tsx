import { Capacitor, registerPlugin } from "@capacitor/core";
import { Share } from "@capacitor/share";
import {
  Check,
  ChevronRight,
  Download,
  FileText,
  Link2,
  LockKeyhole,
  Plus,
  ShieldCheck,
  Smartphone,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { EmploymentType, WorkMode } from "@/features/api-v2/contracts";

import {
  mobileApi,
  MobileApiError,
  type MobileAuthCapabilities,
  type MobileDeviceSession,
  type MobileProfileData,
  type MobileResumeDraft,
} from "./api";
import {
  buildRoleTargetInputs,
  formatPairingCode,
  initialRoleEditorState,
  initialRoleFamilies,
  roleLabelsForFamilies,
  roleOptionsForProfile,
  roleTargetEditorChanged,
  salaryInvariantError,
  salaryValuesFromProfile,
  toggleSelection,
} from "./profile-model";
import { mobileClientId } from "./client-id";

type ProfilePanel = "search" | "resume" | "account";
type OnboardingStep = "roles" | "constraints" | "resume" | "protect";
type WorkAuthorization =
  | "citizen_or_permanent_resident"
  | "work_authorized"
  | "student_or_temporary"
  | "not_authorized"
  | "prefer_not_to_say";

type SearchDraft = {
  acceptedEmploymentTypes: EmploymentType[];
  commuteRadiusMiles: number | null;
  currentRole: string;
  currentSalaryCents: number;
  desiredSeniorityLevels: string[];
  excludedCompanies: string[];
  excludedIndustries: string[];
  excludedTitles: string[];
  location: string;
  maxOfficeDaysPerWeek: number | null;
  maximumRequiredExperienceYears: number;
  maxTravelPercent: number | null;
  missingSalaryPolicy: "show" | "explore_only" | "hide";
  preferredSalaryMinimumCents: number;
  preferredSalaryTargetCents: number;
  preferredWorkModes: WorkMode[];
  relocationDestinations: string[];
  requiresSponsorship: boolean | null;
  roleFamilies: string[];
  strictWorkModes: boolean;
  workAuthorization: WorkAuthorization;
  yearsExperience: number;
};

interface AppleSignInPlugin {
  authorize(options: { nonce: string }): Promise<{
    authorizationCode: string;
    identityToken: string;
  }>;
}

const NativeAppleSignIn = registerPlugin<AppleSignInPlugin>("SignInWithApple");
const ONBOARDING_STEPS: OnboardingStep[] = [
  "roles",
  "constraints",
  "resume",
  "protect",
];
const SENIORITY_CHOICES = ["intern", "entry", "mid", "senior"] as const;
const EMPLOYMENT_CHOICES = [
  "full_time",
  "part_time",
  "contract",
  "internship",
] as const satisfies readonly EmploymentType[];
const WORK_MODE_CHOICES = ["remote", "hybrid", "on_site"] as const satisfies readonly WorkMode[];

function labelForToken(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function dollars(cents: number) {
  if (cents <= 0) return "Not set";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function initialDraft(profile: MobileProfileData): SearchDraft {
  const { constraints, current } = profile.searchContract;
  const roleEditor = initialRoleEditorState(profile);
  return {
    acceptedEmploymentTypes: [...constraints.employmentTypes],
    commuteRadiusMiles: constraints.commuteRadiusMiles,
    currentRole: current.role,
    desiredSeniorityLevels: [...constraints.seniority],
    excludedCompanies: [...constraints.excludedCompanies],
    excludedIndustries: [...constraints.excludedIndustries],
    excludedTitles: [...constraints.excludedTitles],
    location: current.location ?? "",
    maxOfficeDaysPerWeek: constraints.maximumOfficeDaysPerWeek,
    maximumRequiredExperienceYears: roleEditor.maximumRequiredExperienceYears,
    maxTravelPercent: constraints.maximumTravelPercent,
    missingSalaryPolicy: constraints.missingSalaryPolicy,
    ...salaryValuesFromProfile(profile),
    preferredWorkModes: constraints.workModes.filter(
      (mode): mode is Exclude<WorkMode, "unclear"> => mode !== "unclear",
    ),
    relocationDestinations: [...constraints.relocationDestinations],
    requiresSponsorship: constraints.requiresSponsorship,
    roleFamilies: [...initialRoleFamilies(profile)],
    strictWorkModes: constraints.strictWorkModes,
    workAuthorization: constraints.workAuthorization as WorkAuthorization,
    yearsExperience: current.yearsExperience,
  };
}

function ChoiceGroup<T extends string>({
  choices,
  label,
  onChange,
  selected,
}: {
  choices: readonly T[];
  label: string;
  onChange: (value: T) => void;
  selected: readonly T[];
}) {
  return (
    <fieldset className="mobile-choice-field">
      <legend>{label}</legend>
      <div className="mobile-choice-grid">
        {choices.map((choice) => {
          const active = selected.includes(choice);
          return (
            <button
              key={choice}
              type="button"
              className={active ? "active" : ""}
              aria-pressed={active}
              onClick={() => onChange(choice)}
            >
              {active ? <Check aria-hidden="true" /> : null}
              {labelForToken(choice)}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function SegmentedChoice<T extends string | number | boolean | null>({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (value: T) => void;
  options: readonly { label: string; value: T }[];
  value: T;
}) {
  return (
    <fieldset className="mobile-segment-field">
      <legend>{label}</legend>
      <div>
        {options.map((option) => (
          <button
            key={String(option.value)}
            type="button"
            className={value === option.value ? "active" : ""}
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function RangeField({
  format = String,
  label,
  maximum,
  minimum,
  onChange,
  step,
  value,
}: {
  format?: (value: number) => string;
  label: string;
  maximum: number;
  minimum: number;
  onChange: (value: number) => void;
  step: number;
  value: number;
}) {
  return (
    <label className="mobile-range-field">
      <span>{label}</span>
      <strong>{format(value)}</strong>
      <input
        type="range"
        min={minimum}
        max={maximum}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function TagEditor({
  label,
  onChange,
  placeholder,
  values,
}: {
  label: string;
  onChange: (values: string[]) => void;
  placeholder: string;
  values: string[];
}) {
  const [draft, setDraft] = useState("");

  function add() {
    const value = draft.replace(/\s+/g, " ").trim();
    if (!value || values.some((item) => item.toLowerCase() === value.toLowerCase())) return;
    onChange([...values, value]);
    setDraft("");
  }

  return (
    <div className="mobile-tag-field">
      <span>{label}</span>
      <div className="mobile-tag-list">
        {values.map((value) => (
          <button
            key={value}
            type="button"
            aria-label={`Remove ${value}`}
            onClick={() => onChange(values.filter((item) => item !== value))}
          >
            {value}
            <X aria-hidden="true" />
          </button>
        ))}
      </div>
      <div className="mobile-tag-input">
        <input
          value={draft}
          maxLength={160}
          placeholder={placeholder}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            add();
          }}
        />
        <button type="button" disabled={!draft.trim()} onClick={add} aria-label={`Add ${label}`}>
          <Plus aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

function RoleChooser({
  onChange,
  options,
  selected,
}: {
  onChange: (families: string[]) => void;
  options: readonly { canonicalFamily: string; label: string; readiness: "ready_now" | "stretch" }[];
  selected: string[];
}) {
  return (
    <fieldset className="mobile-role-field">
      <legend>Role directions</legend>
      <p>Choose the few lanes you genuinely want. Ready-now roles stay dominant.</p>
      <div className="mobile-role-options">
        {options.map((option) => {
          const active = selected.includes(option.canonicalFamily);
          return (
            <button
              key={option.canonicalFamily}
              type="button"
              className={active ? "active" : ""}
              aria-pressed={active}
              onClick={() =>
                onChange(
                  toggleSelection(selected, option.canonicalFamily, {
                    minimum: 1,
                    maximum: Math.max(4, selected.length),
                  }),
                )
              }
            >
              <span>{option.label}</span>
              <small>{option.readiness === "ready_now" ? "Ready now" : "Credible stretch"}</small>
              {active ? <Check aria-hidden="true" /> : null}
            </button>
          );
        })}
      </div>
      <small className="mobile-field-hint">Two or three focused directions work best. Order becomes feed priority.</small>
    </fieldset>
  );
}

function IdentityFields({
  draft,
  onChange,
}: {
  draft: SearchDraft;
  onChange: (update: Partial<SearchDraft>) => void;
}) {
  return (
    <section className="mobile-editor-card" aria-labelledby="identity-heading">
      <div className="mobile-editor-heading">
        <span>01</span>
        <div><h2 id="identity-heading">Starting point</h2><p>Just enough context to judge level and commute.</p></div>
      </div>
      <div className="mobile-input-grid">
        <label><span>Current or most recent role</span><input value={draft.currentRole} maxLength={180} onChange={(event) => onChange({ currentRole: event.target.value })} /></label>
        <label><span>Home base</span><input value={draft.location} maxLength={220} placeholder="Pittsburgh, PA" onChange={(event) => onChange({ location: event.target.value })} /></label>
      </div>
      <SegmentedChoice
        label="Years of relevant experience"
        value={draft.yearsExperience}
        options={[0, 1, 2, 3, 4, 5, 7].map((value) => ({ label: value === 7 ? "7+" : String(value), value }))}
        onChange={(yearsExperience) => onChange({ yearsExperience })}
      />
    </section>
  );
}

function ConstraintEditor({
  draft,
  onChange,
}: {
  draft: SearchDraft;
  onChange: (update: Partial<SearchDraft>) => void;
}) {
  return (
    <div className="mobile-constraint-stack">
      <section className="mobile-editor-card" aria-labelledby="pay-heading">
        <div className="mobile-editor-heading">
          <span>02</span>
          <div><h2 id="pay-heading">Compensation</h2><p>The floor is absolute. The target shapes ranking.</p></div>
        </div>
        <RangeField label="Current compensation" minimum={0} maximum={Math.max(200_000_00, draft.currentSalaryCents)} step={100} value={draft.currentSalaryCents} format={dollars} onChange={(currentSalaryCents) => onChange({ currentSalaryCents })} />
        <RangeField label="Hard floor" minimum={0} maximum={Math.max(250_000_00, draft.preferredSalaryMinimumCents)} step={100} value={draft.preferredSalaryMinimumCents} format={dollars} onChange={(preferredSalaryMinimumCents) => onChange({ preferredSalaryMinimumCents })} />
        <RangeField label="Preferred target" minimum={0} maximum={Math.max(300_000_00, draft.preferredSalaryTargetCents)} step={100} value={draft.preferredSalaryTargetCents} format={dollars} onChange={(preferredSalaryTargetCents) => onChange({ preferredSalaryTargetCents })} />
        <SegmentedChoice
          label="When salary is missing"
          value={draft.missingSalaryPolicy}
          options={[
            { label: "Show", value: "show" },
            { label: "Discovery only", value: "explore_only" },
            { label: "Hide", value: "hide" },
          ]}
          onChange={(missingSalaryPolicy) => onChange({ missingSalaryPolicy })}
        />
      </section>

      <section className="mobile-editor-card" aria-labelledby="work-heading">
        <div className="mobile-editor-heading">
          <span>03</span>
          <div><h2 id="work-heading">Work setup</h2><p>These rules apply before anything is ranked.</p></div>
        </div>
        <ChoiceGroup choices={WORK_MODE_CHOICES} label="Work modes" selected={draft.preferredWorkModes} onChange={(mode) => onChange({ preferredWorkModes: toggleSelection(draft.preferredWorkModes, mode, { minimum: 1 }) })} />
        <label className="mobile-switch-row"><span><strong>Make work mode strict</strong><small>Hide roles outside the selected modes.</small></span><input type="checkbox" role="switch" checked={draft.strictWorkModes} onChange={(event) => onChange({ strictWorkModes: event.target.checked })} /></label>
        <ChoiceGroup choices={SENIORITY_CHOICES} label="Seniority" selected={draft.desiredSeniorityLevels} onChange={(level) => onChange({ desiredSeniorityLevels: toggleSelection(draft.desiredSeniorityLevels, level) })} />
        <RangeField label="Maximum years required in the listing" minimum={0} maximum={10} step={1} value={draft.maximumRequiredExperienceYears} format={(value) => `${value} yrs`} onChange={(maximumRequiredExperienceYears) => onChange({ maximumRequiredExperienceYears })} />
        <ChoiceGroup choices={EMPLOYMENT_CHOICES} label="Employment type" selected={draft.acceptedEmploymentTypes} onChange={(type) => onChange({ acceptedEmploymentTypes: toggleSelection(draft.acceptedEmploymentTypes, type, { minimum: 1 }) })} />
        <div className="mobile-slider-pair">
          <RangeField label="Commute radius" minimum={0} maximum={100} step={5} value={draft.commuteRadiusMiles ?? 0} format={(value) => value === 0 ? "No commute" : `${value} mi`} onChange={(commuteRadiusMiles) => onChange({ commuteRadiusMiles })} />
          <RangeField label="Office days" minimum={0} maximum={5} step={1} value={draft.maxOfficeDaysPerWeek ?? 0} format={(value) => value === 0 ? "Remote only" : `${value} / wk`} onChange={(maxOfficeDaysPerWeek) => onChange({ maxOfficeDaysPerWeek })} />
        </div>
        <RangeField label="Maximum travel" minimum={0} maximum={100} step={10} value={draft.maxTravelPercent ?? 0} format={(value) => `${value}%`} onChange={(maxTravelPercent) => onChange({ maxTravelPercent })} />
      </section>

      <section className="mobile-editor-card" aria-labelledby="eligibility-heading">
        <div className="mobile-editor-heading">
          <span>04</span>
          <div><h2 id="eligibility-heading">Eligibility</h2><p>Kept private. Used only to remove impossible roles.</p></div>
        </div>
        <SegmentedChoice
          label="US work authorization"
          value={draft.workAuthorization}
          options={[
            { label: "Citizen / permanent", value: "citizen_or_permanent_resident" },
            { label: "Authorized", value: "work_authorized" },
            { label: "Temporary", value: "student_or_temporary" },
            { label: "Not authorized", value: "not_authorized" },
            { label: "Skip", value: "prefer_not_to_say" },
          ]}
          onChange={(workAuthorization) => onChange({ workAuthorization })}
        />
        <SegmentedChoice
          label="Need employer sponsorship?"
          value={draft.requiresSponsorship}
          options={[
            { label: "No", value: false },
            { label: "Yes", value: true },
            { label: "Unsure", value: null },
          ]}
          onChange={(requiresSponsorship) => onChange({ requiresSponsorship })}
        />
      </section>

      <details className="mobile-editor-card mobile-advanced-rules">
        <summary><span><strong>Advanced exclusions</strong><small>Titles, companies, industries, relocation</small></span><ChevronRight aria-hidden="true" /></summary>
        <div>
          <TagEditor label="Excluded titles" placeholder="e.g. Account Executive" values={draft.excludedTitles} onChange={(excludedTitles) => onChange({ excludedTitles })} />
          <TagEditor label="Excluded companies" placeholder="Add a company" values={draft.excludedCompanies} onChange={(excludedCompanies) => onChange({ excludedCompanies })} />
          <TagEditor label="Excluded industries" placeholder="Add an industry" values={draft.excludedIndustries} onChange={(excludedIndustries) => onChange({ excludedIndustries })} />
          <TagEditor label="Relocation destinations" placeholder="Add a city" values={draft.relocationDestinations} onChange={(relocationDestinations) => onChange({ relocationDestinations })} />
        </div>
      </details>
    </div>
  );
}

type ResumeSelection = {
  work: number[];
  education: number[];
  skills: number[];
  projects: number[];
};

function allResumeSelections(draft: MobileResumeDraft): ResumeSelection {
  return {
    work: draft.workHistory.map((_, index) => index),
    education: draft.education.map((_, index) => index),
    skills: draft.skills.map((_, index) => index),
    projects: draft.projects.map((_, index) => index),
  };
}

function ResumeImporter({
  onRevision,
  revision,
}: {
  onRevision: (revision: number) => void;
  revision: number;
}) {
  const [rawText, setRawText] = useState("");
  const [review, setReview] = useState<{ draft: MobileResumeDraft; importId: string } | null>(null);
  const [selection, setSelection] = useState<ResumeSelection>({ work: [], education: [], skills: [], projects: [] });
  const [pending, setPending] = useState<"parse" | "confirm" | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function parseResume() {
    setPending("parse");
    setMessage(null);
    try {
      const response = await mobileApi.createResumeImport(rawText);
      setReview({ draft: response.data.draft, importId: response.data.importId });
      setSelection(allResumeSelections(response.data.draft));
      onRevision(response.data.revision);
    } catch (error) {
      setMessage(error instanceof MobileApiError ? error.message : "The résumé could not be reviewed.");
    } finally {
      setPending(null);
    }
  }

  async function confirmResume() {
    if (!review) return;
    setPending("confirm");
    setMessage(null);
    try {
      const response = await mobileApi.confirmResumeImport(review.importId, {
        expectedProfileRevision: revision,
        selectedWorkIndexes: selection.work,
        selectedEducationIndexes: selection.education,
        selectedSkillIndexes: selection.skills,
        selectedProjectIndexes: selection.projects,
        retainRawSource: false,
      });
      onRevision(response.data.revision);
      const total = Object.values(response.data.imported).reduce((sum, value) => sum + value, 0);
      setMessage(`${total} confirmed résumé items added. The pasted source was deleted.`);
      setReview(null);
      setRawText("");
    } catch (error) {
      setMessage(error instanceof MobileApiError ? error.message : "The selected résumé items could not be added.");
    } finally {
      setPending(null);
    }
  }

  function reviewRows(
    key: keyof ResumeSelection,
    items: readonly { confidence: string }[],
    label: (index: number) => string,
  ) {
    if (items.length === 0) return null;
    return (
      <fieldset className="mobile-resume-review-group">
        <legend>{labelForToken(key)} · {items.length}</legend>
        {items.map((item, index) => {
          const selected = selection[key].includes(index);
          return (
            <label key={`${key}-${index}`}>
              <input type="checkbox" checked={selected} onChange={() => setSelection((current) => ({ ...current, [key]: toggleSelection(current[key], index) }))} />
              <span><strong>{label(index)}</strong><small>{item.confidence} confidence</small></span>
            </label>
          );
        })}
      </fieldset>
    );
  }

  const selectedCount = Object.values(selection).reduce((sum, indexes) => sum + indexes.length, 0);

  return (
    <section className="mobile-resume-card" aria-labelledby="resume-import-heading">
      <div className="mobile-editor-heading">
        <FileText aria-hidden="true" />
        <div><h2 id="resume-import-heading">Add verified context</h2><p>Paste once, review every claim, then delete the raw source.</p></div>
      </div>
      {!review ? (
        <>
          <label className="mobile-resume-input"><span>Résumé text</span><textarea value={rawText} minLength={100} maxLength={100_000} placeholder="Paste the text from your résumé…" onChange={(event) => setRawText(event.target.value)} /></label>
          <button type="button" className="mobile-primary-action" disabled={pending !== null || rawText.trim().length < 100} onClick={() => void parseResume()}>{pending === "parse" ? <span className="mobile-button-spinner" /> : <FileText aria-hidden="true" />}Review extracted evidence</button>
        </>
      ) : (
        <div className="mobile-resume-review">
          <div className="mobile-review-summary"><strong>Nothing is added yet</strong><span>Turn off anything the parser misunderstood.</span></div>
          {reviewRows("work", review.draft.workHistory, (index) => `${review.draft.workHistory[index]?.title} · ${review.draft.workHistory[index]?.company}`)}
          {reviewRows("education", review.draft.education, (index) => `${review.draft.education[index]?.degree || "Education"} · ${review.draft.education[index]?.institution}`)}
          {reviewRows("skills", review.draft.skills, (index) => review.draft.skills[index]?.name ?? "Skill")}
          {reviewRows("projects", review.draft.projects, (index) => review.draft.projects[index]?.name ?? "Project")}
          {review.draft.warnings.length > 0 ? <div className="mobile-resume-warnings"><strong>Review notes</strong>{review.draft.warnings.map((warning) => <p key={warning}>{warning}</p>)}</div> : null}
          <div className="mobile-inline-actions"><button type="button" onClick={() => setReview(null)}>Start over</button><button type="button" className="primary" disabled={pending !== null || selectedCount === 0} onClick={() => void confirmResume()}>{pending === "confirm" ? <span className="mobile-button-spinner" /> : <Check aria-hidden="true" />}Confirm {selectedCount} items</button></div>
        </div>
      )}
      {message ? <p className="mobile-action-message" role="status">{message}</p> : null}
      <p className="mobile-privacy-note"><LockKeyhole aria-hidden="true" /> Raw résumé text is deleted after confirmation unless you explicitly choose otherwise.</p>
    </section>
  );
}

function AccountPanel({ onWorkspaceChanged }: { onWorkspaceChanged: () => void }) {
  const [capabilities, setCapabilities] = useState<MobileAuthCapabilities | null>(null);
  const [sessions, setSessions] = useState<MobileDeviceSession[]>([]);
  const [generatedPairing, setGeneratedPairing] = useState<{
    code: string;
    expiresAt: string;
  } | null>(null);
  const [pairingCode, setPairingCode] = useState("");
  const [deletePhrase, setDeletePhrase] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [loadingAccount, setLoadingAccount] = useState(true);
  const [pending, setPending] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const deleteInputRef = useRef<HTMLInputElement>(null);

  const loadAccount = useCallback(async () => {
    try {
      const [capabilityResponse, sessionResponse] = await Promise.all([
        mobileApi.capabilities(),
        mobileApi.sessions(),
      ]);
      setCapabilities(capabilityResponse.data);
      setSessions(sessionResponse.data);
      setMessage(null);
    } catch (error) {
      setMessage(error instanceof MobileApiError ? error.message : "Account controls could not be loaded.");
    } finally {
      setLoadingAccount(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadAccount(), 0);
    return () => window.clearTimeout(timer);
  }, [loadAccount]);

  useEffect(() => {
    if (!deleteOpen) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const frame = requestAnimationFrame(() => deleteInputRef.current?.focus());
    const dismiss = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDeleteOpen(false);
    };
    window.addEventListener("keydown", dismiss);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("keydown", dismiss);
      previousFocus?.focus();
    };
  }, [deleteOpen]);

  async function pairWorkspace() {
    setPending("pair");
    setMessage(null);
    try {
      await mobileApi.claimWorkspace(pairingCode);
      onWorkspaceChanged();
    } catch (error) {
      setMessage(error instanceof MobileApiError ? error.message : "This device could not be connected.");
    } finally {
      setPending(null);
    }
  }

  async function createPairingCode() {
    setPending("create-pair");
    setMessage(null);
    try {
      const response = await mobileApi.createPairingCode();
      setGeneratedPairing(response.data);
    } catch (error) {
      setMessage(error instanceof MobileApiError ? error.message : "A recovery code could not be created.");
    } finally {
      setPending(null);
    }
  }

  async function signInWithApple() {
    setPending("apple");
    setMessage(null);
    try {
      const nonce = mobileClientId();
      const credential = await NativeAppleSignIn.authorize({ nonce });
      await mobileApi.claimWorkspaceWithApple({ ...credential, nonce });
      onWorkspaceChanged();
    } catch (error) {
      setMessage(error instanceof MobileApiError ? error.message : "Apple sign-in could not be completed.");
    } finally {
      setPending(null);
    }
  }

  async function revoke(session: MobileDeviceSession) {
    setPending(session.id);
    setMessage(null);
    try {
      await mobileApi.revokeSession(session.id);
      await loadAccount();
      setMessage(`${session.deviceName || "Device"} was signed out.`);
    } catch (error) {
      setMessage(error instanceof MobileApiError ? error.message : "That device could not be signed out.");
    } finally {
      setPending(null);
    }
  }

  async function exportAccount() {
    setPending("export");
    setMessage(null);
    try {
      const response = await mobileApi.exportAccount();
      const serialized = JSON.stringify(response.data, null, 2);
      const filename = `jobswipe-export-${new Date().toISOString().slice(0, 10)}.json`;
      if (Capacitor.isNativePlatform()) {
        await Share.share({ title: "JobSwipe data export", text: serialized, dialogTitle: "Save your private export" });
      } else {
        const url = URL.createObjectURL(new Blob([serialized], { type: "application/json" }));
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        link.click();
        URL.revokeObjectURL(url);
      }
      setMessage("Your private data export is ready.");
    } catch (error) {
      setMessage(error instanceof MobileApiError ? error.message : "Your export could not be prepared.");
    } finally {
      setPending(null);
    }
  }

  async function deleteAccount() {
    if (deletePhrase !== "DELETE") return;
    setPending("delete");
    setMessage(null);
    try {
      await mobileApi.deleteAccount();
      onWorkspaceChanged();
    } catch (error) {
      setMessage(error instanceof MobileApiError ? error.message : "The workspace could not be deleted.");
      setPending(null);
    }
  }

  const nativeAppleReady =
    Boolean(capabilities?.signInWithApple) &&
    Capacitor.isNativePlatform() &&
    Capacitor.isPluginAvailable("SignInWithApple");

  return (
    <div className="mobile-account-stack">
      <section className="mobile-account-card mobile-protect-card">
        <div className="mobile-editor-heading"><ShieldCheck aria-hidden="true" /><div><h2>Protect and recover</h2><p>Your guest search works now. Add recovery when you want it on another device.</p></div></div>
        {nativeAppleReady ? <button type="button" className="mobile-apple-action" disabled={pending !== null} onClick={() => void signInWithApple()}>{pending === "apple" ? <span className="mobile-button-spinner" /> : null}Sign in with Apple</button> : <div className="mobile-capability-note"><LockKeyhole aria-hidden="true" /><span><strong>Apple sign-in is not enabled in this build</strong><small>No placeholder login is shown. Pairing remains available.</small></span></div>}
        <div className="mobile-pairing-output">
          <span><strong>{generatedPairing?.code ?? "Use this search elsewhere"}</strong><small>{generatedPairing ? `Single use · expires ${new Date(generatedPairing.expiresAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : "Create a 10-minute code for a fresh device."}</small></span>
          <button type="button" disabled={pending !== null} onClick={() => void createPairingCode()}>{pending === "create-pair" ? <span className="mobile-button-spinner" /> : generatedPairing ? "Replace" : "Create code"}</button>
        </div>
        {capabilities?.pairingCodeClaim !== false ? <div className="mobile-pairing-form"><label><span>Recovery code from another device</span><input autoCapitalize="characters" autoComplete="one-time-code" inputMode="text" value={pairingCode} placeholder="ABCD-EFGH-JKLM" maxLength={14} onChange={(event) => setPairingCode(formatPairingCode(event.target.value))} /></label><button type="button" disabled={pending !== null || pairingCode.length !== 14} onClick={() => void pairWorkspace()}>{pending === "pair" ? <span className="mobile-button-spinner" /> : <Link2 aria-hidden="true" />}Connect search</button><p>Generate a 10-minute code from the profile page on a device that already has your search.</p></div> : null}
      </section>

      <section className="mobile-account-card">
        <div className="mobile-editor-heading"><Smartphone aria-hidden="true" /><div><h2>Signed-in devices</h2><p>Review access and revoke anything you do not recognize.</p></div></div>
        <div className="mobile-session-list">
          {sessions.filter((session) => !session.revokedAt).map((session) => (
            <article key={session.id}>
              <span><strong>{session.deviceName || (session.current ? "This iPhone" : "iPhone")}</strong><small>{session.current ? "Current device" : `Last active ${session.lastUsedAt ? new Date(session.lastUsedAt).toLocaleDateString() : "recently"}`} · v{session.appVersion}</small></span>
              <button type="button" disabled={session.current || pending !== null} aria-label={session.current ? "Current device cannot be revoked here" : `Sign out ${session.deviceName || "device"}`} onClick={() => void revoke(session)}>{pending === session.id ? <span className="mobile-button-spinner" /> : session.current ? <Check aria-hidden="true" /> : "Sign out"}</button>
            </article>
          ))}
          {loadingAccount ? <p className="mobile-muted-copy" role="status">Loading device sessions…</p> : sessions.every((session) => session.revokedAt) ? <p className="mobile-muted-copy">No active device sessions.</p> : null}
        </div>
      </section>

      <section className="mobile-account-card">
        <div className="mobile-editor-heading"><Download aria-hidden="true" /><div><h2>Your data</h2><p>Download everything or permanently remove this guest workspace.</p></div></div>
        <button type="button" className="mobile-secondary-action" disabled={pending !== null} onClick={() => void exportAccount()}>{pending === "export" ? <span className="mobile-button-spinner" /> : <Download aria-hidden="true" />}Export my data</button>
        <button type="button" className="mobile-delete-trigger" disabled={pending !== null} onClick={() => setDeleteOpen(true)}><Trash2 aria-hidden="true" />Delete this workspace</button>
      </section>

      {message ? <p className="mobile-action-message" role="status">{message}</p> : null}
      {deleteOpen ? <div className="mobile-confirm-backdrop" role="presentation" onClick={() => setDeleteOpen(false)}><section className="mobile-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-heading" aria-describedby="delete-description" onClick={(event) => event.stopPropagation()}><button type="button" className="mobile-dialog-close" aria-label="Cancel deletion" onClick={() => setDeleteOpen(false)}><X /></button><Trash2 aria-hidden="true" /><h2 id="delete-heading">Delete this workspace?</h2><p id="delete-description">This permanently removes the profile, résumé evidence, swipes, saves, sessions, and recovery data. It cannot be undone.</p><label><span>Type DELETE to confirm</span><input ref={deleteInputRef} autoCapitalize="characters" autoComplete="off" value={deletePhrase} onChange={(event) => setDeletePhrase(event.target.value.toUpperCase())} /></label><button type="button" className="mobile-destructive-action" disabled={pending !== null || deletePhrase !== "DELETE"} onClick={() => void deleteAccount()}>{pending === "delete" ? <span className="mobile-button-spinner" /> : <Trash2 aria-hidden="true" />}Delete permanently</button><button type="button" className="mobile-dialog-cancel" onClick={() => setDeleteOpen(false)}>Keep my search</button></section></div> : null}
    </div>
  );
}

function LoadedProfileProductScreen({
  onOpenFeed,
  onProfileChanged,
  onWorkspaceChanged,
  profile,
}: {
  onOpenFeed: () => void;
  onProfileChanged: (profile: MobileProfileData) => void;
  onWorkspaceChanged: () => void;
  profile: MobileProfileData;
}) {
  const [panel, setPanel] = useState<ProfilePanel>("search");
  const [step, setStep] = useState<OnboardingStep>("roles");
  const [editing, setEditing] = useState(!profile.onboardingCompleted);
  const [draft, setDraft] = useState<SearchDraft>(() => initialDraft(profile));
  const [revision, setRevision] = useState(profile.searchContract.revision);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const setDraftPart = useCallback((update: Partial<SearchDraft>) => {
    setDraft((current) => ({ ...current, ...update }));
  }, []);

  const roleOptions = useMemo(
    () => roleOptionsForProfile(profile.searchContract.roleTargets),
    [profile.searchContract.roleTargets],
  );
  const selectedRoleLabels = useMemo(
    () => roleLabelsForFamilies(
      draft.roleFamilies,
      profile.searchContract.roleTargets,
    ).join(" · "),
    [draft.roleFamilies, profile.searchContract.roleTargets],
  );

  async function saveSearch(completeOnboarding: boolean) {
    const currentDraft = draft;
    const currentProfile = profile;
    if (!currentDraft || !currentProfile) return;
    if (currentDraft.roleFamilies.length < (completeOnboarding ? 2 : 1)) {
      setMessage(completeOnboarding
        ? "Choose at least two role directions so the feed has enough focus."
        : "Keep at least one role direction in your search.");
      return;
    }
    if (!currentDraft.currentRole.trim()) {
      setMessage("Add your current or most recent role.");
      return;
    }
    const salaryError = salaryInvariantError(currentDraft);
    if (salaryError) {
      setMessage(salaryError);
      return;
    }
    setPending(true);
    setMessage(null);
    try {
      let nextRevision = revision;
      const core = await mobileApi.updateProfile({
        section: "core",
        values: {
          ...currentProfile.editor,
          currentRole: currentDraft.currentRole.trim(),
          currentSalaryCents: currentDraft.currentSalaryCents,
          expectedRevision: nextRevision,
          location: currentDraft.location.trim(),
          relocationPreference: currentProfile.editor.relocationPreference ?? "",
          preferredSalaryMinimumCents: currentDraft.preferredSalaryMinimumCents,
          preferredSalaryTargetCents: currentDraft.preferredSalaryTargetCents,
          preferredWorkArrangements: currentDraft.preferredWorkModes,
          targetRoleFamilies: roleLabelsForFamilies(
            currentDraft.roleFamilies,
            currentProfile.searchContract.roleTargets,
          ),
          yearsExperience: currentDraft.yearsExperience,
        },
      });
      nextRevision = core.data.revision ?? nextRevision;

      if (roleTargetEditorChanged({
        allowedSeniority: currentDraft.desiredSeniorityLevels,
        maximumRequiredExperienceYears:
          currentDraft.maximumRequiredExperienceYears,
        selectedFamilies: currentDraft.roleFamilies,
      }, currentProfile)) {
        const roleTargets = buildRoleTargetInputs(
          currentDraft.roleFamilies,
          currentProfile.searchContract.roleTargets,
          currentDraft.desiredSeniorityLevels,
          currentDraft.maximumRequiredExperienceYears,
        );
        const roles = await mobileApi.updateProfile({
          section: "role_targets",
          values: { expectedRevision: nextRevision, targets: roleTargets },
        });
        nextRevision = roles.data.revision ?? nextRevision;
      }

      const search = await mobileApi.updateProfile({
        section: "search",
        values: {
          expectedRevision: nextRevision,
          desiredSeniorityLevels: currentDraft.desiredSeniorityLevels,
          excludedTitles: currentDraft.excludedTitles,
          excludedCompanies: currentDraft.excludedCompanies,
          excludedIndustries: currentDraft.excludedIndustries,
          acceptedEmploymentTypes: currentDraft.acceptedEmploymentTypes,
          preferredWorkModes: currentDraft.preferredWorkModes,
          strictWorkModes: currentDraft.strictWorkModes,
          commuteRadiusMiles: currentDraft.commuteRadiusMiles,
          maxOfficeDaysPerWeek: currentDraft.maxOfficeDaysPerWeek,
          relocationDestinations: currentDraft.relocationDestinations,
          maxTravelPercent: currentDraft.maxTravelPercent,
          workAuthorization: currentDraft.workAuthorization,
          requiresSponsorship: currentDraft.requiresSponsorship,
          missingSalaryPolicy: currentDraft.missingSalaryPolicy,
        },
      });
      nextRevision = search.data.revision ?? nextRevision;
      if (completeOnboarding) {
        await mobileApi.updateProfile({ section: "onboarding", values: { completed: true } });
      }
      setRevision(nextRevision);
      const fresh = (await mobileApi.profile()).data;
      onProfileChanged(fresh);
      setEditing(false);
      setMessage(completeOnboarding ? "Your first feed is ready." : "Search rules saved.");
      if (completeOnboarding) onOpenFeed();
    } catch (error) {
      setMessage(error instanceof MobileApiError ? error.message : "Your search rules could not be saved.");
    } finally {
      setPending(false);
    }
  }

  if (!profile.onboardingCompleted) {
    const index = ONBOARDING_STEPS.indexOf(step);
    return (
      <section className="mobile-scroll-screen mobile-onboarding-screen">
        <header className="mobile-onboarding-header">
          <div><p>Set up your radar</p><h1>{step === "roles" ? "What should we hunt for?" : step === "constraints" ? "Draw the hard lines" : step === "resume" ? "Give fit real evidence" : "Your search is ready"}</h1></div>
          <span>{index + 1} / {ONBOARDING_STEPS.length}</span>
        </header>
        <div className="mobile-progress-track" role="progressbar" aria-label="Profile setup progress" aria-valuemin={1} aria-valuemax={ONBOARDING_STEPS.length} aria-valuenow={index + 1}><span style={{ width: `${((index + 1) / ONBOARDING_STEPS.length) * 100}%` }} /></div>
        <div className="mobile-onboarding-body">
          {step === "roles" ? <><IdentityFields draft={draft} onChange={setDraftPart} /><section className="mobile-editor-card"><RoleChooser options={roleOptions} selected={draft.roleFamilies} onChange={(roleFamilies) => setDraftPart({ roleFamilies })} /></section></> : null}
          {step === "constraints" ? <ConstraintEditor draft={draft} onChange={setDraftPart} /> : null}
          {step === "resume" ? <ResumeImporter revision={revision} onRevision={setRevision} /> : null}
          {step === "protect" ? <section className="mobile-finish-card"><ShieldCheck aria-hidden="true" /><p>Guest workspace</p><h2>No sign-up wall</h2><span>Your search starts immediately. Pair another device from Account, and Apple recovery appears only when the production capability is enabled.</span><div><article><strong>{draft.roleFamilies.length}</strong><small>role lanes</small></article><article><strong>{dollars(draft.preferredSalaryMinimumCents)}</strong><small>hard floor</small></article><article><strong>{draft.preferredWorkModes.length}</strong><small>work modes</small></article></div></section> : null}
        </div>
        {message ? <p className="mobile-action-message" role="alert">{message}</p> : null}
        <div className="mobile-onboarding-actions">
          {index > 0 ? <button type="button" disabled={pending} onClick={() => setStep(ONBOARDING_STEPS[index - 1]!)}>Back</button> : <span />}
          {step === "protect" ? <button type="button" className="primary" disabled={pending} onClick={() => void saveSearch(true)}>{pending ? <span className="mobile-button-spinner" /> : null}Open my feed</button> : <button type="button" className="primary" disabled={step === "roles" && draft.roleFamilies.length < 2} onClick={() => setStep(ONBOARDING_STEPS[index + 1]!)}>{step === "resume" ? "Continue" : "Next"}<ChevronRight aria-hidden="true" /></button>}
        </div>
      </section>
    );
  }

  return (
    <section className="mobile-scroll-screen mobile-profile-product">
      <header className="mobile-profile-header"><div><p>Your search</p><h1>Built around you</h1></div><button type="button" className={editing ? "active" : ""} onClick={() => { setPanel("search"); setEditing((value) => !value); }}>{editing ? "Close" : "Tune feed"}</button></header>
      <div className="mobile-profile-tabs" role="tablist" aria-label="Profile sections">
        {(["search", "resume", "account"] as const).map((value) => <button key={value} type="button" role="tab" aria-selected={panel === value} className={panel === value ? "active" : ""} onClick={() => setPanel(value)}>{value === "resume" ? "Experience" : labelForToken(value)}</button>)}
      </div>

      {panel === "search" ? (
        editing ? <div className="mobile-profile-editor"><IdentityFields draft={draft} onChange={setDraftPart} /><section className="mobile-editor-card"><RoleChooser options={roleOptions} selected={draft.roleFamilies} onChange={(roleFamilies) => setDraftPart({ roleFamilies })} /></section><ConstraintEditor draft={draft} onChange={setDraftPart} />{message ? <p className="mobile-action-message" role="status">{message}</p> : null}<div className="mobile-sticky-save"><button type="button" disabled={pending} onClick={() => void saveSearch(false)}>{pending ? <span className="mobile-button-spinner" /> : <Check aria-hidden="true" />}Save search rules</button></div></div> : <div className="mobile-search-overview"><section className="mobile-search-passport"><span>For You contract</span><h2>{selectedRoleLabels}</h2><div><article><small>Hard floor</small><strong>{dollars(draft.preferredSalaryMinimumCents)}</strong></article><article><small>Work setup</small><strong>{draft.preferredWorkModes.map(labelForToken).join(" · ")}</strong></article><article><small>Home base</small><strong>{draft.location || "Not set"}</strong></article><article><small>Experience</small><strong>{draft.yearsExperience} years</strong></article></div><button type="button" onClick={() => setEditing(true)}>Tune what appears <ChevronRight /></button></section><section className="mobile-feed-task"><span>Best next step</span><strong>{profile.improveFeed.title}</strong><p>{profile.improveFeed.detail}</p><button type="button" onClick={() => setPanel(profile.improveFeed.id === "add-evidence" ? "resume" : "search")}>Do this now <ChevronRight /></button></section></div>
      ) : null}
      {panel === "resume" ? <ResumeImporter revision={revision} onRevision={setRevision} /> : null}
      {panel === "account" ? <AccountPanel onWorkspaceChanged={onWorkspaceChanged} /> : null}
      {message && panel !== "search" ? <p className="mobile-action-message" role="status">{message}</p> : null}
    </section>
  );
}

export function ProfileProductScreen({
  loading,
  onOpenFeed,
  onProfileChanged,
  onWorkspaceChanged,
  profile,
}: {
  loading: boolean;
  onOpenFeed: () => void;
  onProfileChanged: (profile: MobileProfileData) => void;
  onWorkspaceChanged: () => void;
  profile: MobileProfileData | null;
}) {
  if (loading) {
    return <div className="mobile-center-state" role="status" aria-label="Loading profile"><span className="mobile-spinner" /></div>;
  }
  if (!profile) {
    return <div className="mobile-empty"><Smartphone /><h2>Profile unavailable</h2><p>Reconnect and try again.</p></div>;
  }
  return (
    <LoadedProfileProductScreen
      key={`${profile.searchContract.revision}:${profile.onboardingCompleted}`}
      profile={profile}
      onOpenFeed={onOpenFeed}
      onProfileChanged={onProfileChanged}
      onWorkspaceChanged={onWorkspaceChanged}
    />
  );
}
