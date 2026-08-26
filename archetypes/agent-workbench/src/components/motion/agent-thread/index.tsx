"use client";
// github.com/xiaowen-0725/ui-lab — components/motion/agent-thread

import { ConversationIcon } from "@/components/icons/conversation-icon";
import { motion, useReducedMotion } from "motion/react";
import { type ReactNode, useState } from "react";
import { EASE_OUT } from "@/lib/ease";
import { cn } from "@/lib/utils";
import { ThreadShimmerText } from "./cards";
import { ThreadStreamingCaret } from "./status";

export {
  ThreadCard,
  ThreadCardButton,
  ThreadCommandRow,
  ThreadDiffCard,
  ThreadDiffRow,
  ThreadFileCard,
  ThreadShimmerText,
} from "./cards";
export {
  ThreadApprovalCard,
  ThreadBranchSwitcher,
  ThreadCheckpoint,
  ThreadElicitation,
  ThreadErrorState,
  ThreadScrollPill,
  ThreadStreamingCaret,
  ThreadSuggestions,
  ThreadSystemBanner,
  ThreadTask,
  ThreadTaskList,
  ThreadThinking,
  ThreadToolCall,
  ThreadUsage,
} from "./status";

export interface ThreadProps {
  className?: string;
  children?: ReactNode;
}

/**
 * Conversation column — centers the message stream at a fixed reading
 * width. Renders `children` directly; spacing between items (user messages,
 * turns) comes from each item's own margins rather than a gap here, so a
 * lone item still looks right regardless of what precedes it.
 */
export function Thread({ className, children }: ThreadProps) {
  return (
    <div className={cn("relative mx-auto flex w-full max-w-3xl flex-col px-4", className)}>
      {children}
    </div>
  );
}

export interface ThreadItemProps {
  className?: string;
  children?: ReactNode;
}

/**
 * Entrance wrapper for a stream item (a user message or an agent turn) as it
 * streams in — a short opacity + upward slide, reduced to an opacity-only
 * fade under `useReducedMotion()`. Purely presentational: callers decide
 * whether to wrap a given item at all (e.g. history rendered on first paint
 * may skip it to avoid replaying the entrance).
 */
export function ThreadItem({ className, children }: ThreadItemProps) {
  const reduce = useReducedMotion() ?? false;

  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduce ? 0.15 : 0.25, ease: EASE_OUT }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export interface ThreadUserMessageProps {
  className?: string;
  children?: ReactNode;
}

/** User bubble — #F2F2F2, 16 16 0 16, 15px / 1.78. */
export function ThreadUserMessage({ className, children }: ThreadUserMessageProps) {
  return (
    <div className={cn("group flex w-full flex-col items-end pt-8 pb-2", className)}>
      <div className="max-w-[90%] overflow-hidden break-words rounded-[16px_16px_0_16px] bg-[var(--tl-user-bg,#f2f2f2)] px-3 py-2 text-[length:var(--tl-prose-size,15px)] leading-[var(--tl-prose-leading,1.78)] text-[var(--tl-prose-color,#000)]">
        {children}
      </div>
    </div>
  );
}

export interface ThreadTurnHeaderProps {
  /** Controlled open state — purely a chevron-rotation signal (see below). */
  open?: boolean;
  onOpenChange?: (next: boolean) => void;
  /** While the turn is still executing: shimmers the label. The header stays fully interactive — a running turn's live work log can be expanded and collapsed too. */
  working?: boolean;
  className?: string;
  children?: ReactNode;
  "data-testid"?: string;
}

/**
 * Turn-header button, e.g. "Worked for 2m 4s ›". Renders only the header
 * itself — label plus a chevron that rotates 90° to signal open/closed —
 * and does not fold or animate any content region below it: pair it with
 * `ThreadCollapse` (wired to the same `open`) to collapse the turn's work
 * log, or render your own region. Works controlled (`open`/`onOpenChange`)
 * or uncontrolled. `working` (the turn is still executing, e.g. a live
 * elapsed-seconds label) only swaps the label into `ThreadShimmerText`;
 * chevron and toggling stay live, since a running turn's work log can be
 * inspected mid-flight.
 */
export function ThreadTurnHeader({
  open: openProp,
  onOpenChange,
  working = false,
  className,
  children,
  'data-testid': testId,
}: ThreadTurnHeaderProps) {
  const reduce = useReducedMotion() ?? false;
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;

  const toggle = () => {
    const next = !open;
    setOpenState(next);
    onOpenChange?.(next);
  };

  return (
    <button
      type="button"
      aria-expanded={open}
      data-testid={testId}
      onClick={toggle}
      className={cn(
        "-mx-1 my-3 inline-flex h-[26px] items-center gap-1.5 self-start rounded-lg px-1 text-[length:var(--tl-chrome-size,15px)] font-normal leading-[var(--tl-chrome-leading,1.75)] text-black/50 transition-colors hover:bg-[var(--wb-hover)] dark:text-white/50",
        className,
      )}
    >
      {working ? <ThreadShimmerText>{children}</ThreadShimmerText> : children}
      <motion.span
        aria-hidden
        className="flex text-muted-foreground/60"
        animate={reduce ? undefined : { rotate: open ? 90 : 0 }}
        style={reduce ? { transform: open ? "rotate(90deg)" : "rotate(0deg)" } : undefined}
        transition={reduce ? undefined : { duration: 0.15, ease: [0.4, 0, 0.2, 1] }}
      >
        <ConversationIcon name="chevron-up" className="size-4 rotate-90" />
      </motion.span>
    </button>
  );
}

export interface ThreadCollapseProps {
  open: boolean;
  className?: string;
  children?: ReactNode;
}

/**
 * CSS-grid collapse region — the pairing for `ThreadTurnHeader`. Wire `open`
 * to the header so the work log folds. Grid `0fr`/`1fr` tracks streaming
 * height without measuring a clipped `offsetHeight` (measured height stuck
 * at one row after the process fold closed).
 */
export function ThreadCollapse({ open, className, children }: ThreadCollapseProps) {
  return (
    <div
      className={cn(
        "grid transition-[grid-template-rows] duration-[var(--tl-motion-base,200ms)] ease-[var(--tl-ease-standard,cubic-bezier(0.4,0,0.2,1))] motion-reduce:transition-none",
        open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        className,
      )}
    >
      <div className="overflow-hidden">
        <div className="flex flex-col">{children}</div>
      </div>
    </div>
  );
}

export interface ThreadMessageProps {
  /** Appends a blinking `ThreadStreamingCaret` after `children` while the response is still streaming in. */
  streaming?: boolean;
  className?: string;
  children?: ReactNode;
}

/**
 * Typography container for agent-authored prose. A pure styling shell — the
 * Markdown → JSX rendering engine is left to the caller (this component
 * doesn't depend on any particular one); descendant selectors give
 * paragraphs, lists and inline marks consistent spacing regardless of which
 * renderer produced them. `streaming` appends a `ThreadStreamingCaret` at
 * the container tail — after a block-level last paragraph that lands on its
 * own line; to embed the caret inside the last line of text, place
 * `ThreadStreamingCaret` directly in your own JSX instead.
 */
export function ThreadMessage({ streaming = false, className, children }: ThreadMessageProps) {
  return (
    <div
      className={cn(
        "text-[length:var(--tl-prose-size,15px)] leading-[var(--tl-prose-leading,1.78)] text-[var(--tl-prose-color,#000)]",
        "[&_p]:mb-3 [&_p:last-child]:mb-0 [&_ul]:mb-4 [&_ul]:list-disc [&_ul]:pl-[34px] [&_ol]:mb-4 [&_ol]:list-decimal [&_ol]:pl-[34px] [&_li]:mb-1 [&_li]:pl-0 [&_a]:text-[var(--tl-link,#1470b4)] [&_a]:no-underline hover:[&_a]:underline [&_strong]:font-semibold",
        className,
      )}
    >
      {children}
      {streaming ? <ThreadStreamingCaret /> : null}
    </div>
  );
}

export interface ThreadInlineCodeProps {
  className?: string;
  children?: ReactNode;
}

/** Inline code chip for use inside `ThreadMessage` prose. */
export function ThreadInlineCode({ className, children }: ThreadInlineCodeProps) {
  return (
    <span
      className={cn(
        "rounded-[6px] bg-[var(--wb-code-inline)] px-1.5 py-px font-mono text-[0.92em]",
        className,
      )}
    >
      {children}
    </span>
  );
}

export interface ThreadCodeBlockProps {
  /** Small label in the top-right corner, e.g. a language name like "bash". */
  label?: ReactNode;
  className?: string;
  children?: ReactNode;
}

/** Fenced code block for `ThreadMessage` prose — a `pre > code` structure with an optional corner label. */
export function ThreadCodeBlock({ label, className, children }: ThreadCodeBlockProps) {
  return (
    <div className={cn("relative mb-[11px]", className)}>
      {label ? (
        <span className="absolute top-2 right-3 text-muted-foreground text-xs">{label}</span>
      ) : null}
      <pre className="overflow-x-auto whitespace-pre rounded-xl bg-[var(--wb-code-block)] p-3 font-mono text-sm leading-[22px]">
        <code>{children}</code>
      </pre>
    </div>
  );
}

export interface ThreadActionBarProps {
  /** Rendered after the buttons, e.g. a relative send time. */
  timestamp?: ReactNode;
  className?: string;
  children?: ReactNode;
}

/**
 * Turn-tail action row — hidden until the turn is hovered or a child gains
 * focus. Pair it with a parent that carries the `group/turn` class (see the
 * preview) so `group-hover/turn:opacity-100` has something to key off; a
 * bare hover on the bar itself would only reveal it once the pointer is
 * already over these 20px-tall icons.
 */
export function ThreadActionBar({ timestamp, className, children }: ThreadActionBarProps) {
  return (
    <div
      className={cn(
        "flex h-5 items-center gap-0.5 text-muted-foreground opacity-0 transition-opacity focus-within:opacity-100 group-hover/turn:opacity-100",
        className,
      )}
    >
      {children}
      {timestamp ? <span className="ml-1.5 text-muted-foreground/80 text-xs">{timestamp}</span> : null}
    </div>
  );
}

export interface ThreadActionButtonProps {
  "aria-label": string;
  onClick?: () => void;
  children?: ReactNode;
  className?: string;
}

/** One icon button inside a `ThreadActionBar` (copy, react, share, ...). */
export function ThreadActionButton({
  "aria-label": ariaLabel,
  onClick,
  children,
  className,
}: ThreadActionButtonProps) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      className={cn(
        "flex h-6 w-6 items-center justify-center rounded-md transition-colors hover:bg-[var(--wb-hover)] hover:text-foreground",
        className,
      )}
    >
      {children}
    </button>
  );
}
