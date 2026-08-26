"use client";
// github.com/xiaowen-0725/ui-lab — components/motion/agent-thread

import {
  ConversationIcon,
  conversationSentenceClassName,
  conversationSentenceChevronClassName,
} from "@/components/icons/conversation-icon";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Fragment, type ReactNode, useLayoutEffect, useRef, useState } from "react";
import { EASE_OUT, SPRING_PANEL } from "@/lib/ease";
import { cn } from "@/lib/utils";
import { ThreadCard, ThreadCardButton, ThreadShimmerText } from "./cards";

export type ThreadToolCallStatus = "running" | "done" | "error" | "stopped";

export interface ThreadToolCallProps {
  /** 16px leading icon, e.g. `<Globe className="h-4 w-4" />`. */
  icon?: ReactNode;
  status?: ThreadToolCallStatus;
  /** Supplement after the label — e.g. a mono query or path; wrapping (such as `font-mono text-[13px]`) is the caller's choice. */
  detail?: ReactNode;
  /** Trailing elapsed-time readout. */
  elapsed?: ReactNode;
  className?: string;
  /** The label, verb-tensed by the caller: "Searching the web" while running, "Searched the web" when done. */
  children?: ReactNode;
}

/**
 * Generic tool-invocation row — web searches, file reads, directory
 * listings, MCP tools and anything else the agent runs mid-turn. The
 * general-purpose sibling of `ThreadCommandRow`, which stays around as the
 * command-scenario interface; both share the same row layout. `running`
 * pulses the icon and shimmers the label (`detail` stays static); `done` is
 * fully static and muted; `error` paints icon and label red while `detail`
 * stays muted; `stopped` stays muted with the caller wording the label
 * (e.g. "Stopped command").
 */
export function ThreadToolCall({
  icon,
  status = "done",
  detail,
  elapsed,
  className,
  children,
}: ThreadToolCallProps) {
  const reduce = useReducedMotion() ?? false;
  const running = status === "running";
  const error = status === "error";

  return (
    <div className={cn("flex items-center gap-2 py-1 text-sm text-muted-foreground", className)}>
      {icon ? (
        running ? (
          <motion.span
            className="flex h-4 w-4 shrink-0 items-center justify-center"
            animate={reduce ? { opacity: 1 } : { opacity: [0.4, 1, 0.4] }}
            transition={reduce ? undefined : { duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
          >
            {icon}
          </motion.span>
        ) : (
          <span
            className={cn(
              "flex h-4 w-4 shrink-0 items-center justify-center",
              error && "text-[var(--wb-danger)]",
            )}
          >
            {icon}
          </span>
        )
      ) : null}
      {running ? (
        <ThreadShimmerText>{children}</ThreadShimmerText>
      ) : (
        <span className={cn(error && "text-[var(--wb-danger)]")}>{children}</span>
      )}
      {detail !== undefined && detail !== null ? (
        <span className="min-w-0 truncate">{detail}</span>
      ) : null}
      {elapsed !== undefined && elapsed !== null ? (
        <span className="text-[13px] text-muted-foreground/70 tabular-nums">{elapsed}</span>
      ) : null}
    </div>
  );
}

export interface ThreadThinkingProps {
  /** Still reasoning: the label shimmers, the chevron is hidden and expansion is disabled (there is no summary to show yet). */
  thinking?: boolean;
  /** Controlled open state for the summary region. */
  open?: boolean;
  onOpenChange?: (next: boolean) => void;
  className?: string;
  /** "Thinking…" while `thinking`, then e.g. "Thought for 8s". */
  label: ReactNode;
  /** Optional reasoning summary revealed below the header once `thinking` is over. */
  children?: ReactNode;
}

/**
 * Reasoning-state row. Visually matches `ThreadTurnHeader` (deliberately an
 * independent implementation to avoid coupling): while `thinking` the label
 * shimmers with no chevron; once done, pass a summary as `children` to get
 * an expandable region — measured with a `ResizeObserver` and animated
 * height 0 ↔ measured (`EASE_OUT`, 0.25s), shown instantly under
 * `useReducedMotion()` — rendered as a left-ruled quote block. Works
 * controlled (`open`/`onOpenChange`) or uncontrolled.
 */
export function ThreadThinking({
  thinking = false,
  open: openProp,
  onOpenChange,
  className,
  label,
  children,
}: ThreadThinkingProps) {
  const reduce = useReducedMotion() ?? false;
  const [openState, setOpenState] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState(0);

  const expandable = !thinking && children !== undefined && children !== null;
  const open = expandable && (openProp ?? openState);

  const toggle = () => {
    const next = !open;
    setOpenState(next);
    onOpenChange?.(next);
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: `expandable` is the trigger — the summary region only mounts once thinking ends, so the observer must re-attach to the node the effect reads from the DOM at that point.
  useLayoutEffect(() => {
    const node = contentRef.current;
    if (!node) return;
    const update = () => setContentHeight(node.offsetHeight);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, [expandable]);

  return (
    <div className={cn("flex flex-col", className)}>
      <button
        type="button"
        disabled={!expandable}
        aria-expanded={expandable ? open : undefined}
        onClick={toggle}
        className={conversationSentenceClassName(
          "-mx-1 my-1 h-[26px] gap-1 rounded-lg px-1 text-[length:var(--tl-thought-size,15px)] leading-[var(--tl-thought-leading,1.786)] disabled:pointer-events-none",
        )}
      >
        {thinking ? <ThreadShimmerText>{label}</ThreadShimmerText> : label}
        {expandable ? (
          <motion.span
            aria-hidden
            className={cn("flex", conversationSentenceChevronClassName(open))}
            animate={reduce ? undefined : { rotate: open ? 90 : 0 }}
            style={reduce ? { transform: open ? "rotate(90deg)" : "rotate(0deg)" } : undefined}
            transition={reduce ? undefined : { duration: 0.15, ease: [0.4, 0, 0.2, 1] }}
          >
            <ConversationIcon name="chevron-up" className="size-4 rotate-90" />
          </motion.span>
        ) : null}
      </button>
      {expandable ? (
        <motion.div
          initial={false}
          animate={reduce ? undefined : { height: open ? contentHeight : 0 }}
          transition={{ duration: 0.25, ease: EASE_OUT }}
          className={cn("overflow-hidden", reduce && (open ? "h-auto" : "h-0"))}
        >
          <div
            ref={contentRef}
            className="border-[var(--wb-border)] border-l-2 py-1 pl-3 text-[length:var(--tl-thought-size,15px)] leading-[var(--tl-thought-leading,1.786)] text-black/50 dark:text-white/50"
          >
            {children}
          </div>
        </motion.div>
      ) : null}
    </div>
  );
}

export interface ThreadStreamingCaretProps {
  className?: string;
}

/**
 * Blinking block caret appended to text that is still streaming in. Inline —
 * drop it right after the last streamed character. Static at half opacity
 * under `useReducedMotion()`.
 */
export function ThreadStreamingCaret({ className }: ThreadStreamingCaretProps) {
  const reduce = useReducedMotion() ?? false;
  const base = "ml-0.5 inline-block h-3.5 w-[7px] translate-y-[2px] rounded-[2px] bg-foreground/70";

  if (reduce) {
    return <span aria-hidden className={cn(base, "opacity-50", className)} />;
  }

  return (
    <motion.span
      aria-hidden
      className={cn(base, className)}
      animate={{ opacity: [1, 0.15, 1] }}
      transition={{ duration: 1, repeat: Infinity, ease: "easeInOut" }}
    />
  );
}

export type ThreadApprovalStatus = "pending" | "approved" | "denied";

export interface ThreadApprovalCardProps {
  /** 20px icon rendered in a 40px rounded slot, e.g. `<ShieldAlert className="h-5 w-5" />`. */
  icon?: ReactNode;
  title: ReactNode;
  /** Sub-line under the title — wraps, never truncated. */
  description?: ReactNode;
  /** Optional mono one-liner of what will run. */
  command?: ReactNode;
  status?: ThreadApprovalStatus;
  /** Shown in place of the buttons once `status` is no longer "pending". */
  resolution?: ReactNode;
  onApprove?: () => void;
  onDeny?: () => void;
  approveLabel?: ReactNode;
  denyLabel?: ReactNode;
  className?: string;
}

/**
 * Approval-gate card — the agent pauses and asks before running something
 * sensitive. While `pending`, a ghost Deny and a primary Approve button sit
 * at the trailing edge; once resolved, `resolution` replaces them (green
 * when `approved`, muted when `denied`). Built on `ThreadCard`, so it shares
 * the hairline surface with the file and diff cards.
 */
export function ThreadApprovalCard({
  icon,
  title,
  description,
  command,
  status = "pending",
  resolution,
  onApprove,
  onDeny,
  approveLabel = "Approve",
  denyLabel = "Deny",
  className,
}: ThreadApprovalCardProps) {
  return (
    <ThreadCard className={className}>
      <div className="flex items-center gap-3 px-3 py-2.5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--wb-inset-strong)]">
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-medium text-sm">{title}</div>
          {description ? <div className="text-[13px] text-muted-foreground">{description}</div> : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {status === "pending" ? (
            <>
              <ThreadCardButton variant="ghost" onClick={onDeny}>
                {denyLabel}
              </ThreadCardButton>
              <ThreadCardButton variant="primary" onClick={onApprove}>
                {approveLabel}
              </ThreadCardButton>
            </>
          ) : resolution ? (
            <span
              className={cn(
                "text-[13px]",
                status === "approved"
                  ? "text-[var(--wb-success)]"
                  : "text-muted-foreground",
              )}
            >
              {resolution}
            </span>
          ) : null}
        </div>
      </div>
      {command ? (
        <div className="mx-3 mb-3 rounded-lg bg-[var(--wb-code-block)] px-3 py-2 font-mono text-[13px]">
          {command}
        </div>
      ) : null}
    </ThreadCard>
  );
}

export interface ThreadElicitationProps {
  /** 20px icon rendered in a 40px rounded slot, e.g. `<MessageCircleQuestion className="h-5 w-5" />`. */
  icon?: ReactNode;
  prompt: ReactNode;
  options: { value: string; label: ReactNode; description?: ReactNode }[];
  /** Selected option value; `null`/`undefined` means still awaiting an answer. */
  value?: string | null;
  onSelect?: (value: string) => void;
  className?: string;
}

/**
 * Blocking clarification picker — the agent pauses on an ambiguous request
 * and offers a fixed set of answers instead of free text. Built on
 * `ThreadCard`, matching `ThreadApprovalCard`'s header row (icon slot plus a
 * medium-weight prompt). Once `value` is set the whole list locks: the
 * matching option gets a primary ring and a trailing check, the rest dim —
 * the same pending → resolved shape as `ThreadApprovalCard`, but for an
 * N-way choice instead of approve/deny.
 */
export function ThreadElicitation({
  icon,
  prompt,
  options,
  value = null,
  onSelect,
  className,
}: ThreadElicitationProps) {
  return (
    <ThreadCard className={className}>
      <div className="flex items-center gap-3 px-3 py-2.5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--wb-inset-strong)]">
          {icon}
        </span>
        <div className="min-w-0 flex-1 font-medium text-sm">{prompt}</div>
      </div>
      <div className="flex flex-col gap-1 px-3 pb-3">
        {options.map((option) => {
          const selected = value === option.value;
          const locked = value !== null;
          return (
            <button
              key={option.value}
              type="button"
              disabled={locked}
              onClick={() => onSelect?.(option.value)}
              className={cn(
                "flex w-full items-start gap-2 rounded-lg border border-[var(--wb-border)] px-3 py-2 text-left text-sm transition-colors",
                "hover:bg-[var(--wb-hover-subtle)] disabled:pointer-events-none",
                selected && "border-[var(--wb-accent)] ring-1 ring-[var(--wb-accent)]/30",
                locked && !selected && "opacity-50",
              )}
            >
              <span className="min-w-0 flex-1">
                <span className="block">{option.label}</span>
                {option.description ? (
                  <span className="block text-[13px] text-muted-foreground">
                    {option.description}
                  </span>
                ) : null}
              </span>
              {selected ? (
                <ConversationIcon name="check" className="mt-0.5 size-3.5 text-[var(--wb-accent)]" />
              ) : null}
            </button>
          );
        })}
      </div>
    </ThreadCard>
  );
}

export interface ThreadErrorStateProps {
  message: ReactNode;
  detail?: ReactNode;
  onRetry?: () => void;
  retryLabel?: ReactNode;
  className?: string;
}

/**
 * Inline error row — a failed tool call, request or turn surfaced as a
 * red-tinted banner with a retry action. Not built on `ThreadCard`: the
 * failure isn't a browsable artifact, just a transient state to recover
 * from. `onRetry` renders a `ThreadCardButton`, so retrying matches every
 * other card's action styling.
 */
export function ThreadErrorState({
  message,
  detail,
  onRetry,
  retryLabel = "Retry",
  className,
}: ThreadErrorStateProps) {
  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-xl border border-[var(--wb-danger-surface)]/25 bg-[var(--wb-danger-surface)]/[0.06] px-3 py-2.5 text-sm",
        className,
      )}
    >
      <ConversationIcon name="alert" className="mt-0.5 text-[var(--wb-danger)]" />
      <div className="min-w-0 flex-1">
        <div className="text-foreground">{message}</div>
        {detail ? <div className="text-[13px] text-muted-foreground">{detail}</div> : null}
      </div>
      {onRetry ? (
        <ThreadCardButton onClick={onRetry} className="shrink-0">
          {retryLabel}
        </ThreadCardButton>
      ) : null}
    </div>
  );
}

export interface ThreadSystemBannerProps {
  icon?: ReactNode;
  children?: ReactNode;
  className?: string;
}

/** Centered pill for low-emphasis system notices — e.g. "Model switched to
 * 5.6" — dropped inline in the stream without a `ThreadItem` entrance
 * wrapper (it's a passive notice, not a message). */
export function ThreadSystemBanner({ icon, children, className }: ThreadSystemBannerProps) {
  return (
    <div
      className={cn(
        "mx-auto my-2 flex w-fit items-center gap-1.5 rounded-full bg-[var(--wb-inset)] px-3 py-1 text-muted-foreground text-xs",
        className,
      )}
    >
      {icon ? (
        <span className="flex h-3 w-3 shrink-0 items-center justify-center">{icon}</span>
      ) : null}
      {children}
    </div>
  );
}

export interface ThreadBranchSwitcherProps {
  /** 1-based position of the branch currently shown. */
  index: number;
  count: number;
  onPrev?: () => void;
  onNext?: () => void;
  className?: string;
}

/**
 * Prev/next control for switching between sibling response branches (e.g.
 * regenerated replies) — small chevron buttons flanking a tabular-nums
 * "2/3" readout, disabled past either end. The readout crossfades with a
 * short y-shift on change (`AnimatePresence mode="popLayout"`), reduced to
 * an instant swap under `useReducedMotion()`.
 */
export function ThreadBranchSwitcher({
  index,
  count,
  onPrev,
  onNext,
  className,
}: ThreadBranchSwitcherProps) {
  const reduce = useReducedMotion() ?? false;

  return (
    <div className={cn("flex items-center gap-0.5 text-muted-foreground text-xs", className)}>
      <button
        type="button"
        aria-label="Previous branch"
        disabled={index <= 1}
        onClick={onPrev}
        className="flex h-5 w-5 items-center justify-center rounded hover:bg-[var(--wb-hover)] disabled:pointer-events-none disabled:opacity-30"
      >
        <ConversationIcon name="chevron-up" className="size-3 -rotate-90" />
      </button>
      <span className="relative inline-flex h-4 min-w-[2.5ch] items-center justify-center overflow-hidden tabular-nums">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={`${index}/${count}`}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -4 }}
            transition={{ duration: 0.15, ease: EASE_OUT }}
            className="absolute inset-0 flex items-center justify-center"
          >
            {index}/{count}
          </motion.span>
        </AnimatePresence>
      </span>
      <button
        type="button"
        aria-label="Next branch"
        disabled={index >= count}
        onClick={onNext}
        className="flex h-5 w-5 items-center justify-center rounded hover:bg-[var(--wb-hover)] disabled:pointer-events-none disabled:opacity-30"
      >
        <ConversationIcon name="chevron-up" className="size-3 rotate-90" />
      </button>
    </div>
  );
}

export interface ThreadSuggestionsProps {
  suggestions: { value: string; label: ReactNode }[];
  onSelect?: (value: string) => void;
  className?: string;
}

/**
 * Row of tappable follow-up prompts offered after an agent turn. Each chip
 * stagger-fades in (opacity plus a 4px rise, staggered 0.05s per index) so
 * the row reads as offered rather than dumped in all at once, reduced to an
 * instant render under `useReducedMotion()`.
 */
export function ThreadSuggestions({ suggestions, onSelect, className }: ThreadSuggestionsProps) {
  const reduce = useReducedMotion() ?? false;

  return (
    <div className={cn("flex flex-wrap gap-1.5 py-2", className)}>
      {suggestions.map((suggestion, i) => (
        <motion.span
          key={suggestion.value}
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: EASE_OUT, delay: reduce ? 0 : i * 0.05 }}
        >
          <button
            type="button"
            onClick={() => onSelect?.(suggestion.value)}
            className="h-7 rounded-full border border-[var(--wb-border)] px-3 text-[13px] text-muted-foreground transition-colors hover:border-[var(--wb-border-emphasis)] hover:text-foreground"
          >
            {suggestion.label}
          </button>
        </motion.span>
      ))}
    </div>
  );
}

export type ThreadTaskStatus = "pending" | "active" | "done";

export interface ThreadTaskListProps {
  title?: ReactNode;
  /** Short counter, e.g. "2/5". Swaps with a `popLayout` crossfade when it changes. */
  progress?: ReactNode;
  className?: string;
  children?: ReactNode;
}

/**
 * Checklist card for a long-running agent task, built on `ThreadCard` so it
 * shares the hairline ring and tint with the file/diff/approval cards. The
 * optional title row pairs a medium-weight label with a tabular-nums
 * progress readout on the trailing edge; the readout crossfades with a
 * short y-shift on change (`AnimatePresence mode="popLayout"`, mirroring
 * `ThreadBranchSwitcher`'s counter), reduced to an opacity-only swap under
 * `useReducedMotion()`. Compose `ThreadTask` rows as `children`.
 */
export function ThreadTaskList({ title, progress, className, children }: ThreadTaskListProps) {
  const reduce = useReducedMotion() ?? false;

  return (
    <ThreadCard className={cn("px-3 py-2", className)}>
      {title !== undefined ? (
        <div className="flex items-center justify-between pb-1">
          <span className="font-medium text-[13px]">{title}</span>
          {progress !== undefined ? (
            <span className="relative inline-flex h-4 min-w-[2.5ch] items-center justify-center overflow-hidden text-muted-foreground text-xs tabular-nums">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={String(progress)}
                  initial={reduce ? { opacity: 0 } : { opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduce ? { opacity: 0 } : { opacity: 0, y: -4 }}
                  transition={{ duration: 0.15, ease: EASE_OUT }}
                  className="absolute inset-0 flex items-center justify-center"
                >
                  {progress}
                </motion.span>
              </AnimatePresence>
            </span>
          ) : null}
        </div>
      ) : null}
      <div className="flex flex-col">{children}</div>
    </ThreadCard>
  );
}

export interface ThreadTaskProps {
  status?: ThreadTaskStatus;
  className?: string;
  children?: ReactNode;
}

/**
 * Single row inside a `ThreadTaskList` — a 16px status slot followed by the
 * task's label. `pending` is a hollow ring, `active` is a solid blue dot
 * wrapped in a pulsing ring (frozen, not removed, under
 * `useReducedMotion()`) and its label runs through `ThreadShimmerText`,
 * `done` is a check mark. The icon swap itself is a springy scale pop
 * (`SPRING_PANEL`, `AnimatePresence mode="wait"`), reduced to a plain
 * opacity cut. `done` text stays muted rather than a celebratory color —
 * finishing a step should read as quiet progress, not an event.
 */
export function ThreadTask({ status = "pending", className, children }: ThreadTaskProps) {
  const reduce = useReducedMotion() ?? false;

  return (
    <div className={cn("flex items-center gap-2 py-1 text-sm", className)}>
      <span className="relative flex h-4 w-4 shrink-0 items-center justify-center">
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={status}
            initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.5 }}
            transition={reduce ? { duration: 0.15, ease: EASE_OUT } : SPRING_PANEL}
            className="flex items-center justify-center"
          >
            {status === "done" ? (
              <ConversationIcon name="check" className="size-3.5 text-[var(--wb-success)]" />
            ) : status === "active" ? (
              <span className="relative flex h-2 w-2 items-center justify-center">
                {reduce ? (
                  <span
                    aria-hidden
                    className="absolute inset-0 rounded-full bg-[var(--wb-accent)] opacity-25"
                  />
                ) : (
                  <motion.span
                    aria-hidden
                    className="absolute inset-0 rounded-full bg-[var(--wb-accent)]"
                    animate={{ scale: [1, 1.8], opacity: [0.5, 0] }}
                    transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut" }}
                  />
                )}
                <span className="h-2 w-2 rounded-full bg-[var(--wb-accent)]" />
              </span>
            ) : (
              <span className="h-3.5 w-3.5 rounded-full border-[1.5px] border-[var(--wb-border-emphasis)]" />
            )}
          </motion.span>
        </AnimatePresence>
      </span>
      {status === "active" ? (
        <ThreadShimmerText>{children}</ThreadShimmerText>
      ) : (
        <span className="text-muted-foreground">{children}</span>
      )}
    </div>
  );
}

export interface ThreadScrollPillProps {
  open: boolean;
  count?: number;
  onClick?: () => void;
  className?: string;
}

/**
 * "New messages" pill for auto-scrolling thread containers. Needs a
 * `relative` ancestor to anchor against — toggle `open` when the user has
 * scrolled away from the bottom while new content streams in below (see the
 * preview). Springs up from the bottom edge (`SPRING_PANEL`), reduced to an
 * opacity-only fade under `useReducedMotion()`.
 */
export function ThreadScrollPill({ open, count, onClick, className }: ThreadScrollPillProps) {
  const reduce = useReducedMotion() ?? false;

  return (
    <AnimatePresence>
      {open ? (
        <motion.button
          type="button"
          onClick={onClick}
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
          transition={reduce ? { duration: 0.15, ease: EASE_OUT } : SPRING_PANEL}
          className={cn(
            "absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1 rounded-full bg-[var(--wb-inverse)] px-3 py-1.5 text-[var(--wb-inverse-fg)] text-xs shadow-lg",
            className,
          )}
        >
          <ConversationIcon name="chevron-up" className="size-3 rotate-180" />
          {count !== undefined ? `${count} new messages` : null}
        </motion.button>
      ) : null}
    </AnimatePresence>
  );
}

export interface ThreadCheckpointProps {
  /** @default "Checkpoint" */
  label?: ReactNode;
  timestamp?: ReactNode;
  onRestore?: () => void;
  /** @default "Restore" */
  restoreLabel?: ReactNode;
  className?: string;
}

/**
 * Rollback marker dividing the stream at a point the user can restore to —
 * a hairline rule on either side of a pill carrying a history icon, the
 * checkpoint label and an optional timestamp. When `onRestore` is passed, a
 * trailing text button ("Restore") is appended inside the same pill.
 */
export function ThreadCheckpoint({
  label = "Checkpoint",
  timestamp,
  onRestore,
  restoreLabel = "Restore",
  className,
}: ThreadCheckpointProps) {
  return (
    <div className={cn("relative flex items-center gap-3 py-2", className)}>
      <span className="h-px flex-1 bg-[var(--wb-divider)]" />
      <span className="flex h-6 items-center gap-1.5 rounded-full border border-[var(--wb-border)] px-2.5 text-xs text-muted-foreground">
        <ConversationIcon name="refresh" className="size-3" />
        {label}
        {timestamp !== undefined && timestamp !== null ? (
          <span className="text-muted-foreground/70">{timestamp}</span>
        ) : null}
        {onRestore ? (
          <button
            type="button"
            onClick={onRestore}
            className="text-xs transition-colors hover:text-foreground"
          >
            {restoreLabel}
          </button>
        ) : null}
      </span>
      <span className="h-px flex-1 bg-[var(--wb-divider)]" />
    </div>
  );
}

/** <0.01 keeps 4 decimal places, otherwise 3 — trailing zeros are trimmed either way (e.g. 0.003 → "$0.003", not "$0.0030"). */
function formatUsageCost(cost: number): string {
  const decimals = cost < 0.01 ? 4 : 3;
  const trimmed = cost.toFixed(decimals).replace(/0+$/, "").replace(/\.$/, "");
  return `$${trimmed}`;
}

/** K/M abbreviation for a raw token count; values under 1000 render as-is. */
function formatUsageTokenCount(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
  return `${count}`;
}

export interface ThreadUsageProps {
  cost?: number;
  inputTokens?: number;
  outputTokens?: number;
  duration?: ReactNode;
  cacheHitRate?: number;
  className?: string;
  children?: ReactNode;
}

/**
 * Per-message usage/cost line — cost, input/output token counts, duration
 * and cache-hit rate, each shown only when its prop is present and joined
 * by a muted middle dot. Meant to live alongside `ThreadActionBar` in the
 * same hover group; the component itself renders unconditionally, so pass
 * e.g. `"opacity-0 group-hover/turn:opacity-100"` in `className` if you want
 * it to reveal on turn hover the way the action bar does.
 */
export function ThreadUsage({
  cost,
  inputTokens,
  outputTokens,
  duration,
  cacheHitRate,
  className,
  children,
}: ThreadUsageProps) {
  const fragments: { key: string; node: ReactNode }[] = [];

  if (cost !== undefined) {
    fragments.push({ key: "cost", node: formatUsageCost(cost) });
  }

  if (inputTokens !== undefined || outputTokens !== undefined) {
    const inStr = inputTokens !== undefined ? `${formatUsageTokenCount(inputTokens)} in` : null;
    const outStr = outputTokens !== undefined ? `${formatUsageTokenCount(outputTokens)} out` : null;
    fragments.push({
      key: "tokens",
      node: inStr && outStr ? `${inStr} / ${outStr}` : (inStr ?? outStr),
    });
  }

  if (duration !== undefined && duration !== null) {
    fragments.push({ key: "duration", node: duration });
  }

  if (cacheHitRate !== undefined) {
    fragments.push({ key: "cache", node: `cache ${Math.round(cacheHitRate * 100)}%` });
  }

  if (children !== undefined && children !== null) {
    fragments.push({ key: "children", node: children });
  }

  if (fragments.length === 0) return null;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground/80 tabular-nums",
        className,
      )}
    >
      {fragments.map((fragment, i) => (
        <Fragment key={fragment.key}>
          {i > 0 ? <span className="text-muted-foreground/40">·</span> : null}
          <span>{fragment.node}</span>
        </Fragment>
      ))}
    </div>
  );
}
