import { App as NativeApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle } from "@capacitor/haptics";
import { Share } from "@capacitor/share";
import {
  Archive,
  ArrowUpRight,
  Check,
  Compass,
  Heart,
  Pencil,
  Search,
  SlidersHorizontal,
  RotateCcw,
  Trash2,
  UserRound,
  WifiOff,
  X,
} from "lucide-react";
import {
  lazy,
  Suspense,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

import { JobSwipeGlyph } from "@/components/jobswipe-glyph";
import type {
  FeedCard,
  InteractionEvent,
  SavedJob,
} from "@/features/api-v2/contracts";
import { companyVisual } from "@/features/jobs/components/company-visual";

import {
  mobileApi,
  MobileApiError,
  type MobileProfileData,
} from "./api";
import {
  enqueueInteraction,
  pendingInteractions,
  reconcileInteractions,
} from "./outbox";
import { mobileCardKeyboardAction } from "./card-interaction";
import { mobileClientId } from "./client-id";
import { demoFeedCards } from "./demo-feed";
import { MobileJobCard } from "./mobile-job-card";

const ProfileProductScreen = lazy(() =>
  import("./profile-product").then((module) => ({
    default: module.ProfileProductScreen,
  })),
);

type Screen = "feed" | "saved" | "profile";
type FeedCache = {
  cachedAt: string;
  cards: FeedCard[];
  nextCursor: string | null;
};

const FEED_CACHE_KEY = "jobswipe:mobile-feed:v2";
const SAVED_CACHE_KEY = "jobswipe:mobile-saved:v1";
const DEMO_REVEAL_MS = 900;
const SWIPE_THRESHOLD = 92;

function readCachedFeed(): FeedCache | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(FEED_CACHE_KEY) ?? "null") as Partial<FeedCache> | null;
    if (!parsed || !Array.isArray(parsed.cards)) return null;
    return {
      cachedAt: typeof parsed.cachedAt === "string" ? parsed.cachedAt : new Date(0).toISOString(),
      cards: parsed.cards,
      nextCursor: typeof parsed.nextCursor === "string" ? parsed.nextCursor : null,
    };
  } catch {
    return null;
  }
}

function cacheFeed(cache: FeedCache) {
  localStorage.setItem(FEED_CACHE_KEY, JSON.stringify(cache));
}

function currentFeedCache(cards: FeedCard[], nextCursor: string | null): FeedCache {
  return { cachedAt: new Date().toISOString(), cards, nextCursor };
}

function workArrangement(card: FeedCard) {
  if (card.workMode === "remote") return "Remote";
  if (card.workMode === "hybrid") return "Hybrid";
  if (card.workMode === "on_site") return "On-site";
  return "Unclear";
}

function readSavedCache(): SavedJob[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(SAVED_CACHE_KEY) ?? "[]") as unknown;
    return Array.isArray(parsed) ? (parsed as SavedJob[]) : [];
  } catch {
    return [];
  }
}

function cacheSaved(jobs: readonly SavedJob[]) {
  localStorage.setItem(SAVED_CACHE_KEY, JSON.stringify(jobs));
}

function CenterSpinner({ label = "Loading" }: { label?: string }) {
  return (
    <div className="mobile-center-state" role="status" aria-label={label}>
      <span className="mobile-spinner" />
    </div>
  );
}

function MobileRoleCard({
  card,
  onDecision,
  onOpen,
}: {
  card: FeedCard;
  onDecision: (decision: "saved" | "skipped") => void;
  onOpen: () => void;
}) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number | null>(null);
  const instructionsId = useId();
  const decisionPending = useRef(false);
  const gesture = useRef({
    active: false,
    clientX: 0,
    lastClientX: 0,
    lastTime: 0,
    maxDistance: 0,
    pointerId: -1,
    startX: 0,
    velocityX: 0,
  });

  const reset = useCallback(() => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    gesture.current.active = false;
    const surface = surfaceRef.current;
    if (!surface) return;
    surface.style.transition = "transform 420ms cubic-bezier(.22,1,.36,1)";
    surface.style.transform = "translate3d(0,0,0) rotate(0)";
    surface.style.removeProperty("opacity");
    surface.style.setProperty("--swipe-pass-opacity", "0");
    surface.style.setProperty("--swipe-save-opacity", "0");
    surface.dataset.interacting = "false";
  }, []);

  const paintGesture = useCallback(() => {
    frameRef.current = null;
    const state = gesture.current;
    const surface = surfaceRef.current;
    if (!state.active || !surface) return;
    const deltaX = state.clientX - state.startX;
    const dragIntent = Math.max(0, Math.min(1, (Math.abs(deltaX) - 12) / 30));
    const resistedX = Math.sign(deltaX) * Math.max(0, Math.abs(deltaX) - 12) * dragIntent;
    const rotateZ = Math.max(-8, Math.min(8, resistedX / 22));
    surface.style.setProperty("--swipe-pass-opacity", deltaX < 0 ? String(Math.min(1, Math.abs(resistedX) / 90)) : "0");
    surface.style.setProperty("--swipe-save-opacity", deltaX > 0 ? String(Math.min(1, Math.abs(resistedX) / 90)) : "0");
    surface.style.transform = `translate3d(${resistedX}px,${-Math.abs(resistedX) * 0.015}px,0) rotate(${rotateZ}deg)`;
  }, []);

  function pointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    const surface = surfaceRef.current;
    if (!surface || event.button !== 0 || decisionPending.current) return;
    gesture.current = {
      active: true,
      clientX: event.clientX,
      lastClientX: event.clientX,
      lastTime: event.timeStamp,
      maxDistance: 0,
      pointerId: event.pointerId,
      startX: event.clientX,
      velocityX: 0,
    };
    surface.setPointerCapture(event.pointerId);
    surface.style.transition = "none";
    surface.dataset.interacting = "true";
  }

  function pointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const state = gesture.current;
    if (!state.active || state.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - state.startX;
    state.maxDistance = Math.max(state.maxDistance, Math.abs(deltaX));
    const elapsed = Math.max(1, event.timeStamp - state.lastTime);
    const instantaneousVelocity = (event.clientX - state.lastClientX) / elapsed;
    state.velocityX = state.velocityX * 0.72 + instantaneousVelocity * 0.28;
    state.lastClientX = event.clientX;
    state.lastTime = event.timeStamp;
    state.clientX = event.clientX;
    if (frameRef.current === null) frameRef.current = requestAnimationFrame(paintGesture);
  }

  function pointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const state = gesture.current;
    const surface = surfaceRef.current;
    if (!state.active || state.pointerId !== event.pointerId || !surface) return;
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    state.active = false;
    const deltaX = event.clientX - state.startX;
    const projectedX = deltaX + state.velocityX * 110;
    if (Math.abs(deltaX) >= SWIPE_THRESHOLD || (Math.abs(deltaX) >= 36 && Math.abs(projectedX) >= SWIPE_THRESHOLD)) {
      dismiss(projectedX > 0 ? "saved" : "skipped");
      return;
    }
    if (state.maxDistance < 9) onOpen();
    reset();
  }

  function dismiss(decision: "saved" | "skipped") {
    const surface = surfaceRef.current;
    if (!surface || decisionPending.current) return;
    decisionPending.current = true;
    const direction = decision === "saved" ? 1 : -1;
    surface.style.transition = "transform 260ms cubic-bezier(.2,.82,.25,1), opacity 220ms ease";
    surface.style.transform = `translate3d(${direction * (window.innerWidth + 120)}px,-16px,0) rotate(${direction * 14}deg)`;
    surface.style.opacity = "0";
    void Haptics.impact({ style: ImpactStyle.Medium }).catch(() => undefined);
    window.setTimeout(() => onDecision(decision), 250);
  }

  function keyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.repeat || decisionPending.current) return;
    const action = mobileCardKeyboardAction(event.key);
    if (!action) return;
    event.preventDefault();
    if (action === "open") {
      onOpen();
      return;
    }
    dismiss(action);
  }

  return (
    <div
      ref={surfaceRef}
      className="mobile-role-card"
      data-interacting="false"
      role="button"
      tabIndex={0}
      aria-describedby={instructionsId}
      aria-keyshortcuts="ArrowLeft ArrowRight Enter Space"
      aria-label={`Open ${card.title} at ${card.company}. ${card.compensation.display}. ${card.location}. ${workArrangement(card)}. ${card.fit.whyItFits}`}
      onClick={(event) => {
        if (event.detail === 0 && !decisionPending.current) onOpen();
      }}
      onKeyDown={keyDown}
      onPointerDown={pointerDown}
      onPointerMove={pointerMove}
      onPointerUp={pointerUp}
      onPointerCancel={reset}
    >
      <MobileJobCard card={card} />
      <span id={instructionsId} className="sr-only">
        Press Enter or Space to open details, Left Arrow to pass, or Right Arrow to save.
      </span>
      <div className="mobile-swipe-cue mobile-swipe-cue-pass">Pass</div>
      <div className="mobile-swipe-cue mobile-swipe-cue-save">Save</div>
    </div>
  );
}

function FeedDetail({ card, onClose }: { card: FeedCard; onClose: () => void }) {
  async function share() {
    if (!card.source.url) return;
    await Share.share({
      title: `${card.title} at ${card.company}`,
      text: `${card.title} at ${card.company} — ${card.compensation.display}`,
      url: card.source.url,
      dialogTitle: "Share this role",
    });
  }

  return (
    <div className="mobile-sheet-backdrop" role="presentation" onClick={onClose}>
      <section className="mobile-detail-sheet" role="dialog" aria-modal="true" aria-label={`${card.title} details`} onClick={(event) => event.stopPropagation()}>
        <div className="mobile-sheet-handle" />
        <div className="mobile-detail-heading">
          <div>
            <p className="mobile-eyebrow">{card.company}</p>
            <h2>{card.title}</h2>
          </div>
          <button className="mobile-detail-close" type="button" aria-label="Close role" onClick={onClose}><X /></button>
        </div>
        <div className="mobile-detail-compensation">{card.compensation.display}</div>
        <div className="mobile-detail-grid">
          <article><span>Location</span><strong>{card.location}</strong></article>
          <article><span>Work setup</span><strong>{workArrangement(card)}</strong></article>
          <article className="mobile-detail-wide"><span>Why it fits</span><strong>{card.fit.whyItFits}</strong></article>
          <article className="mobile-detail-wide mobile-detail-risk"><span>What to verify</span><strong>{card.fit.biggestRisk}</strong></article>
        </div>
        <div className="mobile-sheet-actions">
          <button type="button" onClick={() => void share()} disabled={!card.source.url}>Share</button>
          <button className="primary" type="button" onClick={() => card.source.url && window.open(card.source.url, "_blank", "noopener,noreferrer")} disabled={!card.source.url}>Original listing <ArrowUpRight /></button>
        </div>
      </section>
    </div>
  );
}

type SavedStatus = "all" | "saved" | "applied" | "archived";
type SavedSort = "recent" | "fit" | "salary" | "company";

function SavedScreen({
  jobs,
  loading,
  onReload,
  onNote,
  onUpdate,
}: {
  jobs: SavedJob[];
  loading: boolean;
  onReload: () => Promise<void>;
  onNote: (job: SavedJob, note: string) => Promise<void>;
  onUpdate: (job: SavedJob, status: "saved" | "applied" | "archived" | "unseen") => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<SavedStatus>("all");
  const [sort, setSort] = useState<SavedSort>("recent");
  const [noteEditor, setNoteEditor] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [updating, setUpdating] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  if (loading) return <CenterSpinner label="Loading saved jobs" />;
  const normalizedQuery = query.trim().toLocaleLowerCase("en-US");
  const visibleJobs = jobs
    .filter((job) => {
      if (normalizedQuery && !`${job.card.title} ${job.card.company} ${job.card.location}`.toLocaleLowerCase("en-US").includes(normalizedQuery)) return false;
      if (status === "applied") return job.applied;
      if (status === "archived") return job.archived;
      if (status === "saved") return !job.applied && !job.archived;
      return true;
    })
    .toSorted((left, right) => {
      if (sort === "company") return left.card.company.localeCompare(right.card.company);
      if (sort === "fit") return right.card.fit.score - left.card.fit.score;
      if (sort === "salary") return (right.card.compensation.annualMaximumCents ?? 0) - (left.card.compensation.annualMaximumCents ?? 0);
      return (right.updatedAt ?? "").localeCompare(left.updatedAt ?? "");
    });

  async function update(job: SavedJob, next: "saved" | "applied" | "archived" | "unseen") {
    setUpdating(job.card.id);
    try {
      await onUpdate(job, next);
      setActionError(null);
    } catch (reason) {
      setActionError(reason instanceof MobileApiError ? reason.message : "That change could not be saved.");
    } finally {
      setUpdating(null);
    }
  }

  async function saveNote(job: SavedJob) {
    const note = noteDraft.trim();
    if (!note) return;
    setUpdating(job.card.id);
    try {
      await onNote(job, note);
      setNoteEditor(null);
      setNoteDraft("");
      setActionError(null);
    } catch (reason) {
      setActionError(reason instanceof MobileApiError ? reason.message : "That note could not be saved.");
    } finally {
      setUpdating(null);
    }
  }

  return (
    <section className="mobile-scroll-screen">
      <header className="mobile-screen-header"><p>Shortlist</p><h1>Saved</h1></header>
      <div className="mobile-saved-tools">
        <label className="mobile-saved-search"><Search aria-hidden="true" /><span className="sr-only">Search saved jobs</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search roles or companies" /></label>
        <div className="mobile-saved-filters" aria-label="Filter saved jobs">
          {(["all", "saved", "applied", "archived"] as const).map((value) => <button key={value} type="button" className={status === value ? "active" : ""} onClick={() => setStatus(value)}>{value}</button>)}
        </div>
        <label className="mobile-saved-sort"><SlidersHorizontal aria-hidden="true" /><span>Sort</span><select value={sort} onChange={(event) => setSort(event.target.value as SavedSort)}><option value="recent">Recent</option><option value="fit">Profile fit</option><option value="salary">Salary</option><option value="company">Company</option></select></label>
      </div>
      <div className="mobile-saved-list">
        {visibleJobs.map((job) => {
          const { card, note, applied, archived } = job;
          const pending = updating === card.id;
          return (
            <article key={card.id} className="mobile-saved-row">
              <button type="button" className="mobile-saved-main" onClick={() => card.source.url && window.open(card.source.url, "_blank", "noopener,noreferrer")}>
                <span className="mobile-saved-company">{card.company.slice(0, 2).toUpperCase()}</span>
                <span><strong>{card.title}</strong><small>{card.company} · {card.compensation.display}</small>{note ? <small>{note}</small> : null}</span>
                {applied ? <em>Applied</em> : archived ? <em>Archived</em> : <ArrowUpRight />}
              </button>
              <div className="mobile-saved-actions" aria-label={`Actions for ${card.title}`}>
                <button type="button" disabled={pending} onClick={() => { setNoteEditor(noteEditor === card.id ? null : card.id); setNoteDraft(note ?? ""); }}><Pencil aria-hidden="true" />Note</button>
                <button type="button" disabled={pending} onClick={() => void update(job, applied ? "saved" : "applied")}><Check aria-hidden="true" />{applied ? "Undo applied" : "Applied"}</button>
                <button type="button" disabled={pending} onClick={() => void update(job, archived ? "saved" : "archived")}><Archive aria-hidden="true" />{archived ? "Restore" : "Archive"}</button>
                <button type="button" disabled={pending} className="danger" onClick={() => void update(job, "unseen")}><Trash2 aria-hidden="true" />Remove</button>
              </div>
              {noteEditor === card.id ? <div className="mobile-note-editor"><label><span>Private note</span><textarea autoFocus maxLength={2000} value={noteDraft} onChange={(event) => setNoteDraft(event.target.value)} placeholder="What should you remember about this role?" /></label><div><button type="button" onClick={() => setNoteEditor(null)}>Cancel</button><button type="button" className="primary" disabled={pending || !noteDraft.trim()} onClick={() => void saveNote(job)}>Save note</button></div></div> : null}
            </article>
          );
        })}
        {visibleJobs.length === 0 ? <div className="mobile-empty"><Heart /><h2>{jobs.length === 0 ? "Your shortlist is empty" : "Nothing matches these filters"}</h2><p>{jobs.length === 0 ? "Swipe right when a role is worth returning to." : "Try a different search or status."}</p>{jobs.length === 0 ? <button className="mobile-empty-action" type="button" onClick={() => void onReload()}><RotateCcw /> Refresh</button> : null}</div> : null}
      </div>
      {actionError ? <p className="mobile-saved-error" role="status">{actionError}</p> : null}
    </section>
  );
}

export function MobileApp() {
  const [cached] = useState<FeedCache | null>(() => readCachedFeed());
  const [cachedSaved] = useState<SavedJob[]>(() => readSavedCache());
  const [screen, setScreen] = useState<Screen>("feed");
  const [cards, setCards] = useState<FeedCard[]>(cached?.cards ?? []);
  const [nextCursor, setNextCursor] = useState<string | null>(cached?.nextCursor ?? null);
  const [saved, setSaved] = useState<SavedJob[]>(cachedSaved);
  const [profile, setProfile] = useState<MobileProfileData | null>(null);
  const [detail, setDetail] = useState<FeedCard | null>(null);
  const [loading, setLoading] = useState(!cached);
  const [secondaryLoading, setSecondaryLoading] = useState(false);
  const [offline, setOffline] = useState(!navigator.onLine);
  const [error, setError] = useState<string | null>(null);
  const [usingCachedFeed, setUsingCachedFeed] = useState(Boolean(cached));
  const [usingDemoFeed, setUsingDemoFeed] = useState(
    Boolean(cached?.cards[0]?.id.startsWith("demo-role-")),
  );
  const cardsRef = useRef(cards);
  const demoInteracted = useRef(false);

  useEffect(() => {
    cardsRef.current = cards;
  }, [cards]);

  const flush = useCallback(async () => {
    const events = pendingInteractions();
    if (events.length === 0 || !navigator.onLine) return;
    const response = await mobileApi.interactions(events);
    reconcileInteractions(response.data);
  }, []);

  const loadFeed = useCallback(async (cursor: string | null = null, append = false) => {
    if (!append) setLoading(true);
    const demoTimer = !append && cardsRef.current.length === 0
      ? window.setTimeout(() => {
          if (cardsRef.current.length > 0) return;
          const demo = demoFeedCards();
          cacheFeed(currentFeedCache(demo, null));
          cardsRef.current = demo;
          setCards(demo);
          setUsingDemoFeed(true);
          setLoading(false);
        }, DEMO_REVEAL_MS)
      : null;
    try {
      const response = await mobileApi.feed(cursor);
      if (demoInteracted.current) return;
      setCards((current) => {
        const next = append
          ? [...current, ...response.data.cards.filter((card) => !current.some((item) => item.id === card.id))]
          : response.data.cards;
        cacheFeed(currentFeedCache(next, response.meta.nextCursor));
        return next;
      });
      setNextCursor(response.meta.nextCursor);
      setUsingCachedFeed(false);
      setUsingDemoFeed(false);
      setError(null);
    } catch (reason) {
      setCards((current) => {
        if (current.length > 0) return current;
        const demo = demoFeedCards();
        cacheFeed(currentFeedCache(demo, null));
        setUsingDemoFeed(true);
        return demo;
      });
      setError(reason instanceof MobileApiError ? reason.message : "The live feed is taking a moment.");
    } finally {
      if (demoTimer !== null) window.clearTimeout(demoTimer);
      setLoading(false);
    }
  }, []);

  const loadProfile = useCallback(async (revealOnboarding = false) => {
    const next = (await mobileApi.profile()).data;
    setProfile(next);
    if (revealOnboarding && !next.onboardingCompleted) setScreen("profile");
    return next;
  }, []);

  useEffect(() => {
    queueMicrotask(() =>
      void Promise.allSettled([flush(), loadFeed(), loadProfile(true)]),
    );
    const online = () => {
      setOffline(false);
      void flush();
    };
    const offlineListener = () => setOffline(true);
    window.addEventListener("online", online);
    window.addEventListener("offline", offlineListener);
    const appListener = Capacitor.isNativePlatform()
      ? NativeApp.addListener("appStateChange", ({ isActive }) => {
          if (isActive) void Promise.allSettled([flush(), loadFeed()]);
        })
      : null;
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offlineListener);
      void appListener?.then((handle) => handle.remove());
    };
  }, [flush, loadFeed, loadProfile]);

  useEffect(() => {
    if (cards.length > 5 || !nextCursor || loading) return;
    const timer = window.setTimeout(() => void loadFeed(nextCursor, true), 0);
    return () => window.clearTimeout(timer);
  }, [cards.length, nextCursor, loading, loadFeed]);

  async function chooseScreen(next: Screen) {
    setScreen(next);
    if (next === "saved") {
      if (saved.length > 0) setError(null);
      setSecondaryLoading(saved.length === 0);
      try {
        const nextSaved = (await mobileApi.saved()).data;
        setSaved(nextSaved);
        cacheSaved(nextSaved);
        setError(null);
      } catch (reason) {
        if (saved.length === 0) {
          setError(reason instanceof MobileApiError ? reason.message : "Saved jobs could not be loaded.");
        }
      } finally { setSecondaryLoading(false); }
    }
    if (next === "profile") {
      setSecondaryLoading(true);
      try {
        await loadProfile();
        setError(null);
      } catch (reason) {
        setError(reason instanceof MobileApiError ? reason.message : "Your profile could not be loaded.");
      } finally { setSecondaryLoading(false); }
    }
  }

  function resetMobileWorkspace() {
    localStorage.removeItem(FEED_CACHE_KEY);
    window.location.reload();
  }

  const reloadSaved = useCallback(async () => {
    const nextSaved = (await mobileApi.saved()).data;
    setSaved(nextSaved);
    cacheSaved(nextSaved);
  }, []);

  async function updateSaved(job: SavedJob, status: "saved" | "applied" | "archived" | "unseen") {
    if (job.card.id.startsWith("demo-role-")) {
      setSaved((current) => {
        const next = status === "unseen"
          ? current.filter((item) => item.card.id !== job.card.id)
          : current.map((item) => item.card.id === job.card.id
              ? { ...item, applied: status === "applied", archived: status === "archived", updatedAt: new Date().toISOString() }
              : item);
        cacheSaved(next);
        return next;
      });
      return;
    }
    await mobileApi.updateSaved({
      action: "status",
      eventId: mobileClientId(),
      jobId: job.card.id,
      status,
      expectedDecision: job.card.state.decision,
      expectedDecisionEventId: job.card.state.decisionEventId,
    });
    await reloadSaved();
  }

  async function updateSavedNote(job: SavedJob, note: string) {
    if (job.card.id.startsWith("demo-role-")) {
      setSaved((current) => {
        const next = current.map((item) => item.card.id === job.card.id
          ? { ...item, note, updatedAt: new Date().toISOString() }
          : item);
        cacheSaved(next);
        return next;
      });
      return;
    }
    await mobileApi.updateSaved({
      action: "note",
      eventId: mobileClientId(),
      jobId: job.card.id,
      note,
    });
    await reloadSaved();
  }

  function decide(decision: "saved" | "skipped") {
    const card = cards[0];
    if (!card) return;
    if (card.id.startsWith("demo-role-")) demoInteracted.current = true;
    const event: InteractionEvent = {
      id: mobileClientId(),
      kind: "decision",
      jobId: card.id,
      occurredAt: new Date().toISOString(),
      exposureId: card.exposure.id,
      decision,
      expectedDecision: card.state.decision,
      expectedDecisionEventId: card.state.decisionEventId,
      reasonCodes: [],
    };
    enqueueInteraction(event);
    if (decision === "saved") {
      setSaved((current) => {
        if (current.some((job) => job.card.id === card.id)) return current;
        const next = [{ card, note: null, applied: false, archived: false, updatedAt: event.occurredAt }, ...current];
        cacheSaved(next);
        return next;
      });
    }
    setCards((current) => {
      const next = current.slice(1);
      cacheFeed(currentFeedCache(next, nextCursor));
      return next;
    });
    void flush();
  }

  const active = cards[0] ?? null;
  const visual = active ? companyVisual(active.company) : null;
  const sceneStyle = visual
    ? ({ "--deck-company-accent": visual.accent, "--deck-company-glass": visual.background } as CSSProperties)
    : undefined;

  return (
    <main className="mobile-app" style={sceneStyle}>
      {offline ? <div className="mobile-offline"><WifiOff /> Offline · swipes will sync</div> : null}
      {screen === "feed" ? (
        <section className="mobile-feed-screen">
          <header className="mobile-brand"><span className="mobile-brand-mark"><JobSwipeGlyph /></span><span><strong>RoleDex</strong><small>For You</small></span><em>{usingDemoFeed ? "demo deck" : usingCachedFeed ? "saved on phone" : active?.tier.replaceAll("_", " ")}</em></header>
          <div className="mobile-deck-stage">
            {cards[1] ? <div className="mobile-next-card"><MobileJobCard card={cards[1]} preview /></div> : null}
            {active ? <MobileRoleCard key={active.exposure.id} card={active} onDecision={decide} onOpen={() => setDetail(active)} /> : loading ? <CenterSpinner label="Building your feed" /> : error ? (
              <div className="mobile-empty mobile-caught-up"><WifiOff /><h2>Couldn’t refresh your feed</h2><p>{error}</p><button className="mobile-empty-action" type="button" onClick={() => void loadFeed()}><RotateCcw /> Try again</button></div>
            ) : (
              <div className="mobile-empty mobile-caught-up"><Compass /><h2>You’re caught up</h2><p>New roles will appear here without recycling jobs you passed.</p><button className="mobile-empty-action" type="button" onClick={() => void loadFeed()}><RotateCcw /> Check again</button></div>
            )}
          </div>
          {active ? (
            <div className="mobile-feed-controls" aria-label={`Actions for ${active.title} at ${active.company}`}>
              <button type="button" aria-label={`Pass ${active.title} at ${active.company}`} aria-keyshortcuts="ArrowLeft" onClick={() => decide("skipped")}>
                <X aria-hidden="true" />
                <span>Pass</span>
              </button>
              <button type="button" aria-label={`Open details for ${active.title} at ${active.company}`} aria-keyshortcuts="Enter" onClick={() => setDetail(active)}>
                <ArrowUpRight aria-hidden="true" />
                <span>Details</span>
              </button>
              <button type="button" aria-label={`Save ${active.title} at ${active.company}`} aria-keyshortcuts="ArrowRight" onClick={() => decide("saved")}>
                <Heart aria-hidden="true" />
                <span>Save</span>
              </button>
            </div>
          ) : null}
          {error && cards.length > 0 && !usingDemoFeed ? <div className="mobile-inline-error">{error}</div> : null}
        </section>
      ) : screen === "saved" ? <SavedScreen jobs={saved} loading={secondaryLoading} onReload={reloadSaved} onNote={updateSavedNote} onUpdate={updateSaved} /> : <Suspense fallback={<CenterSpinner label="Loading profile" />}><ProfileProductScreen profile={profile} loading={secondaryLoading} onOpenFeed={() => setScreen("feed")} onProfileChanged={setProfile} onWorkspaceChanged={resetMobileWorkspace} /></Suspense>}
      {error && screen !== "feed" ? <div className="mobile-inline-error" role="status">{error}</div> : null}
      <nav className="mobile-dock" aria-label="Main navigation">
        <button type="button" className={screen === "feed" ? "active" : ""} onClick={() => void chooseScreen("feed")} aria-label="For You"><Compass /><span>Discover</span></button>
        <button type="button" className={screen === "saved" ? "active" : ""} onClick={() => void chooseScreen("saved")} aria-label="Saved"><Heart /><span>Saved</span></button>
        <button type="button" className={screen === "profile" ? "active" : ""} onClick={() => void chooseScreen("profile")} aria-label="Profile"><UserRound /><span>Profile</span></button>
      </nav>
      {detail ? <FeedDetail card={detail} onClose={() => setDetail(null)} /> : null}
    </main>
  );
}
