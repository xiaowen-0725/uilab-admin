"use client";
// ui-lab-ten.vercel.app/components/blocks/agent-composer

import { motion, useReducedMotion } from "motion/react";
import {
  type KeyboardEvent,
  type PointerEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { EASE_OUT, SPRING_PANEL } from "@/lib/ease";
import { cn } from "@/lib/utils";

const DEFAULT_LABELS = ["Minimal", "Low", "Standard", "High", "Max"];
/** Tick centers are inset this many px from either end of the track so the
 * end dots clear the rounded caps. */
const TRACK_INSET = 12;
/** How long the one-shot thumb bounce plays after landing on the top tier. */
const MAX_BOUNCE_MS = 400;

export interface ComposerEffortSliderProps {
  value: number;
  onChange: (next: number) => void;
  /** Step labels — length sets the number of segments (defaults to 5). */
  labels?: string[];
  "aria-label"?: string;
  className?: string;
  disabled?: boolean;
}

/**
 * Segmented reasoning-effort slider. Snaps to one of `labels.length` evenly
 * spaced steps via drag (pointer capture) or the keyboard (ArrowLeft/Right,
 * Home/End). Reaching the last step bounces the thumb once and sends out a
 * pair of accent-token ripple rings — both skipped under
 * `useReducedMotion()`, which also drops the spring glide in favor of an
 * instant snap.
 */
export function ComposerEffortSlider({
  value,
  onChange,
  labels = DEFAULT_LABELS,
  "aria-label": ariaLabel,
  className,
  disabled = false,
}: ComposerEffortSliderProps) {
  const reduce = useReducedMotion() ?? false;
  const trackRef = useRef<HTMLDivElement>(null);
  const [trackWidth, setTrackWidth] = useState(0);
  // False until the frame carrying the first real measurement has painted —
  // fill/thumb transitions run at duration 0 while false, so mounting inside
  // a popover lands them in place instead of sweeping in from the left edge.
  const [ready, setReady] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [justMaxed, setJustMaxed] = useState(false);

  const maxIndex = Math.max(0, labels.length - 1);
  const clampedValue = Math.min(maxIndex, Math.max(0, value));
  const isMax = maxIndex > 0 && clampedValue === maxIndex;

  // Fires the one-shot bounce only on the transition into the top tier, not
  // on every render while already there.
  const wasMaxRef = useRef(isMax);
  useEffect(() => {
    const wasMax = wasMaxRef.current;
    wasMaxRef.current = isMax;
    if (isMax && !wasMax && !reduce) {
      setJustMaxed(true);
      const timer = setTimeout(() => setJustMaxed(false), MAX_BOUNCE_MS);
      return () => clearTimeout(timer);
    }
  }, [isMax, reduce]);

  // Synchronous first measure so the initial thumb position is correct
  // before paint, then keep it correct if the track is ever resized (e.g. a
  // wider className override). `offsetWidth` (layout width) rather than a
  // bounding rect: a host popover's scale entrance would otherwise skew the
  // measure and leave the geometry permanently off by the entrance scale.
  // `ready` flips only after a double rAF — i.e. after the browser has
  // painted the correctly-placed first frame — so the springs can't animate
  // the 0-width → measured-width jump.
  useLayoutEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    setTrackWidth(el.offsetWidth);
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setReady(true));
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, []);

  useEffect(() => {
    const el = trackRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => setTrackWidth(el.offsetWidth));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const centerFor = useCallback(
    (index: number) => {
      const usable = Math.max(0, trackWidth - TRACK_INSET * 2);
      const step = maxIndex > 0 ? usable / maxIndex : 0;
      return TRACK_INSET + step * index;
    },
    [trackWidth, maxIndex],
  );

  const indexFromClientX = useCallback(
    (clientX: number) => {
      const el = trackRef.current;
      if (!el || maxIndex === 0) return 0;
      const rect = el.getBoundingClientRect();
      const usable = Math.max(1, rect.width - TRACK_INSET * 2);
      const ratio = (clientX - rect.left - TRACK_INSET) / usable;
      return Math.round(Math.min(1, Math.max(0, ratio)) * maxIndex);
    },
    [maxIndex],
  );

  const onPointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (disabled) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      setDragging(true);
      onChange(indexFromClientX(event.clientX));
    },
    [disabled, indexFromClientX, onChange],
  );

  const onPointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (!dragging || disabled) return;
      onChange(indexFromClientX(event.clientX));
    },
    [dragging, disabled, indexFromClientX, onChange],
  );

  const endDrag = useCallback((event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    setDragging(false);
  }, []);

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (disabled) return;
      const map: Record<string, number> = {
        ArrowLeft: clampedValue - 1,
        ArrowRight: clampedValue + 1,
        Home: 0,
        End: maxIndex,
      };
      const next = map[event.key];
      if (next !== undefined) {
        event.preventDefault();
        onChange(Math.min(maxIndex, Math.max(0, next)));
      }
    },
    [clampedValue, disabled, maxIndex, onChange],
  );

  const thumbCenter = centerFor(clampedValue);
  const thumbScale = reduce ? 1 : justMaxed ? [1, 1.15, 1] : dragging ? 1.08 : 1;
  // Instant placement until the first measured frame has painted, and always
  // under reduced motion; spring glide otherwise.
  const glideTransition = !ready || reduce ? { duration: 0 } : SPRING_PANEL;

  return (
    <div
      ref={trackRef}
      role="slider"
      aria-valuemin={0}
      aria-valuemax={maxIndex}
      aria-valuenow={clampedValue}
      aria-valuetext={labels[clampedValue]}
      aria-label={ariaLabel}
      aria-disabled={disabled || undefined}
      tabIndex={disabled ? -1 : 0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={onKeyDown}
      className={cn(
        "relative h-6 w-[200px] touch-none select-none overflow-visible rounded-full bg-[var(--wb-inset-strong)] outline-none",
        "shadow-[inset_0_0_0_0.5px_var(--wb-control-hairline)]",
        "focus-visible:ring-2 focus-visible:ring-[var(--wb-accent)]/50",
        disabled && "pointer-events-none opacity-50",
        className,
      )}
    >
      {/* fill — left edge to the thumb center */}
      <motion.div
        aria-hidden
        className="absolute inset-y-0 left-0 rounded-full"
        style={{ backgroundColor: "var(--wb-accent)" }}
        animate={{ width: thumbCenter }}
        transition={glideTransition}
      />

      {/* tick dots */}
      {labels.map((label, index) => (
        <span
          key={label}
          aria-hidden
          className={cn(
            "-translate-x-1/2 -translate-y-1/2 absolute top-1/2 h-1 w-1 rounded-full",
            index <= clampedValue
              ? "bg-[var(--wb-accent-fg)]/50"
              : "bg-[var(--wb-control-tick)]",
          )}
          style={{ left: centerFor(index) }}
        />
      ))}

      {/* thumb */}
      <motion.div
        aria-hidden
        className="absolute top-0 h-7 w-7 rounded-full bg-[var(--wb-accent-fg)]"
        style={{
          y: "-2px",
          boxShadow:
            "0 0 0 0.5px var(--wb-control-hairline), 0 1px 4px color-mix(in srgb, var(--wb-inverse) 24%, transparent)",
        }}
        animate={{ left: thumbCenter, x: "-50%", scale: thumbScale }}
        transition={{
          left: glideTransition,
          x: { duration: 0 },
          scale: justMaxed ? { duration: MAX_BOUNCE_MS / 1000, ease: EASE_OUT } : SPRING_PANEL,
        }}
      >
        {isMax && !reduce ? (
          <>
            <RippleRing delay={0} />
            <RippleRing delay={0.9} />
          </>
        ) : null}
      </motion.div>
    </div>
  );
}

/** One expanding ring in the "reached max effort" ripple pair. */
function RippleRing({ delay }: { delay: number }) {
  return (
    <motion.span
      aria-hidden
      className="pointer-events-none absolute inset-0 rounded-full border-2"
      style={{ borderColor: "color-mix(in srgb, var(--wb-accent) 60%, transparent)" }}
      initial={{ scale: 1, opacity: 0.6 }}
      animate={{ scale: 2.4, opacity: 0 }}
      transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut", delay }}
    />
  );
}
