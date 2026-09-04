"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent,
} from "react";
import { flushSync } from "react-dom";
import { safelyAnimate, waitForDeckMotion } from "./job-deck-motion";
import { swipeDecision, swipePose } from "./swipe-physics";

type Decision = "saved" | "skipped";
const REST = "translate3d(0, 0, 0) rotate(0deg)";
const UNDER = "translate3d(0, 10px, 0) scale(.965)";

export function useSwipeCard<Element extends HTMLElement = HTMLElement>({
  id,
  disabled,
  onDecision,
  onOpen,
}: {
  id: string | undefined;
  disabled: boolean;
  onDecision: (decision: Decision) => void;
  onOpen: () => void;
}) {
  const activeRef = useRef<Element>(null);
  const nextRef = useRef<HTMLDivElement>(null);
  const frame = useRef<number | null>(null);
  const animations = useRef<Animation[]>([]);
  const cancelCompletion = useRef<(() => void) | null>(null);
  const locked = useRef(false);
  const reduced = useRef(false);
  const [busy, setBusy] = useState(false);
  const callbacks = useRef({ onDecision, onOpen });
  const gesture = useRef({
    active: false,
    id: -1,
    startX: 0,
    startY: 0,
    x: 0,
    y: 0,
    vx: 0,
    lastX: 0,
    lastAt: 0,
    distance: 0,
    width: 360,
  });
  const layers = useRef<{
    glare: HTMLElement | null;
    save: HTMLElement | null;
    pass: HTMLElement | null;
  }>({ glare: null, save: null, pass: null });

  useLayoutEffect(() => {
    callbacks.current = { onDecision, onOpen };
  });

  const stop = useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    cancelCompletion.current?.();
    cancelCompletion.current = null;
    animations.current.forEach((animation) => animation.cancel());
    animations.current = [];
  }, []);

  const clear = useCallback(() => {
    const card = activeRef.current;
    if (card) {
      card.style.transform = REST;
      card.style.opacity = "1";
      card.dataset.interacting = "false";
    }
    if (nextRef.current) {
      nextRef.current.style.transform = UNDER;
      nextRef.current.style.opacity = ".76";
    }
    for (const layer of Object.values(layers.current))
      if (layer) layer.style.opacity = "0";
  }, []);

  useLayoutEffect(() => {
    stop();
    locked.current = false;
    gesture.current.active = false;
    const card = activeRef.current;
    layers.current = {
      glare: card?.querySelector(".job-card-interactive-glare") ?? null,
      save:
        card?.querySelector(".deck-stamp-save, .mobile-swipe-cue-save") ?? null,
      pass:
        card?.querySelector(".deck-stamp-pass, .mobile-swipe-cue-pass") ?? null,
    };
    clear();
    return stop;
  }, [id, clear, stop]);

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => {
      reduced.current = preference.matches;
    };
    update();
    preference.addEventListener("change", update);
    return () => preference.removeEventListener("change", update);
  }, []);

  const paint = useCallback(() => {
    frame.current = null;
    const card = activeRef.current;
    if (!card) return;
    const { x, y, width } = gesture.current;
    const pose = swipePose(x, y, width, reduced.current);
    card.style.transform = pose.transform;
    if (nextRef.current) {
      nextRef.current.style.transform = pose.nextTransform;
      nextRef.current.style.opacity = String(0.76 + 0.24 * pose.progress);
    }
    const { glare, save, pass } = layers.current;
    if (glare) {
      glare.style.transform = `translate3d(${x * 0.07}px, ${y * 0.05}px, 0) scale(1.08)`;
      glare.style.opacity = reduced.current
        ? "0"
        : String(Math.min(0.18, Math.abs(x) / 1000));
    }
    if (save)
      save.style.opacity = String(Math.max(0, Math.min(1, (x - 16) / 70)));
    if (pass)
      pass.style.opacity = String(Math.max(0, Math.min(1, (-x - 16) / 70)));
  }, []);

  const settle = useCallback(() => {
    const card = activeRef.current;
    stop();
    if (!card) return;
    const from = card.style.transform || REST;
    const underFrom = nextRef.current?.style.transform || UNDER;
    clear();
    if (reduced.current) return;
    const a = safelyAnimate(card, [{ transform: from }, { transform: REST }], {
      duration: 280,
      easing: "cubic-bezier(.2,.9,.25,1.08)",
    });
    const b = safelyAnimate(
      nextRef.current,
      [{ transform: underFrom }, { transform: UNDER }],
      { duration: 280, easing: "cubic-bezier(.2,.9,.25,1)" },
    );
    animations.current = [a, b].filter(
      (animation): animation is Animation => animation !== null,
    );
  }, [clear, stop]);

  const decide = useCallback(
    (decision: Decision) => {
      if (!id || disabled || locked.current) return;
      locked.current = true;
      gesture.current.active = false;
      setBusy(true);
      stop();
      const card = activeRef.current;
      const direction = decision === "saved" ? 1 : -1;
      const duration = reduced.current ? 0 : 230;
      const a = duration
        ? safelyAnimate(
            card,
            [
              { transform: card?.style.transform || REST, opacity: 1 },
              {
                transform: `translate3d(${direction * (window.innerWidth + 180)}px, ${gesture.current.y * 0.16}px, 0) rotate(${direction * 18}deg)`,
                opacity: 0,
              },
            ],
            {
              duration,
              easing: "cubic-bezier(.22,.65,.35,1)",
              fill: "forwards",
            },
          )
        : null;
      const b = duration
        ? safelyAnimate(
            nextRef.current,
            [
              {
                transform: nextRef.current?.style.transform || UNDER,
                opacity: 0.76,
              },
              { transform: REST, opacity: 1 },
            ],
            { duration, easing: "cubic-bezier(.2,.8,.25,1)", fill: "forwards" },
          )
        : null;
      animations.current = [a, b].filter(
        (animation): animation is Animation => animation !== null,
      );
      cancelCompletion.current = waitForDeckMotion({
        animations: [a, b],
        durationMs: duration,
        onComplete: () => {
          // Persistence runs after the gesture animation, never in the pointer frame.
          // Commit promotion before removing fill-forwards from the old surface.
          // Otherwise WebKit can paint the outgoing card back at its origin once.
          flushSync(() => {
            callbacks.current.onDecision(decision);
            setBusy(false);
          });
          locked.current = false;
          stop();
          clear();
        },
      });
    },
    [id, disabled, stop, clear],
  );

  const cancel = useCallback(() => {
    if (!gesture.current.active) return;
    gesture.current.active = false;
    settle();
  }, [settle]);

  useEffect(() => {
    const visibility = () => {
      if (document.hidden) cancel();
    };
    window.addEventListener("blur", cancel);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("blur", cancel);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [cancel]);

  return {
    activeRef,
    nextRef,
    busy,
    decide,
    handlers: {
      onPointerDown(event: PointerEvent<HTMLElement>) {
        if (
          !id ||
          disabled ||
          locked.current ||
          !event.isPrimary ||
          (event.pointerType === "mouse" && event.button !== 0)
        )
          return;
        let carryX = 0;
        let carryY = 0;
        if (animations.current.length) {
          try {
            const matrix = new DOMMatrixReadOnly(
              getComputedStyle(event.currentTarget).transform,
            );
            carryX = matrix.m41;
            carryY = reduced.current ? 0 : matrix.m42 / 0.16;
          } catch {
            /* Browsers without matrix parsing start from rest. */
          }
        }
        stop();
        clear();
        gesture.current = {
          active: true,
          id: event.pointerId,
          startX: event.clientX - carryX,
          startY: event.clientY - carryY,
          x: carryX,
          y: carryY,
          vx: 0,
          lastX: event.clientX,
          lastAt: event.timeStamp,
          distance: 0,
          width: event.currentTarget.offsetWidth,
        };
        paint();
        event.currentTarget.dataset.interacting = "true";
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          /* older WebKit */
        }
      },
      onPointerMove(event: PointerEvent<HTMLElement>) {
        const state = gesture.current;
        if (!state.active || state.id !== event.pointerId) return;
        const sample =
          event.nativeEvent.getCoalescedEvents?.().at(-1) ?? event.nativeEvent;
        const elapsed = Math.max(1, sample.timeStamp - state.lastAt);
        state.vx =
          0.45 * state.vx +
          0.55 *
            Math.max(-3, Math.min(3, (sample.clientX - state.lastX) / elapsed));
        state.lastX = sample.clientX;
        state.lastAt = sample.timeStamp;
        state.x = sample.clientX - state.startX;
        state.y = sample.clientY - state.startY;
        state.distance = Math.max(state.distance, Math.hypot(state.x, state.y));
        if (frame.current === null)
          frame.current = requestAnimationFrame(paint);
      },
      onPointerUp(event: PointerEvent<HTMLElement>) {
        const state = gesture.current;
        if (!state.active || state.id !== event.pointerId) return;
        state.active = false;
        state.x = event.clientX - state.startX;
        state.y = event.clientY - state.startY;
        state.distance = Math.max(state.distance, Math.hypot(state.x, state.y));
        if (frame.current !== null) cancelAnimationFrame(frame.current);
        paint();
        try {
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId);
        } catch {
          /* already released */
        }
        const decision = swipeDecision(
          state.x,
          state.vx,
          state.width,
          event.timeStamp - state.lastAt,
        );
        if (decision) decide(decision);
        else {
          settle();
          if (state.distance < 9) callbacks.current.onOpen();
        }
      },
      onPointerCancel: cancel,
      onLostPointerCapture: cancel,
      onClick(event: React.MouseEvent<HTMLElement>) {
        if (event.detail === 0 && !disabled && !locked.current)
          callbacks.current.onOpen();
      },
      onKeyDown(event: React.KeyboardEvent<HTMLElement>) {
        if (disabled || locked.current || event.repeat) return;
        if (["ArrowLeft", "ArrowRight", "Enter", " "].includes(event.key))
          event.preventDefault();
        if (event.key === "ArrowLeft") decide("skipped");
        if (event.key === "ArrowRight") decide("saved");
        if (event.key === "Enter" || event.key === " ")
          callbacks.current.onOpen();
      },
    },
  };
}
