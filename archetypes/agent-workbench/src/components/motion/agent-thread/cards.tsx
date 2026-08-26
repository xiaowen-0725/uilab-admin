"use client";
// github.com/xiaowen-0725/ui-lab — components/motion/agent-thread

import { ConversationIcon } from "@/components/icons/conversation-icon";
import { motion, useReducedMotion } from "motion/react";
import { type ReactNode, useLayoutEffect, useRef, useState } from "react";
import { EASE_OUT } from "@/lib/ease";
import { cn } from "@/lib/utils";

export interface ThreadShimmerTextProps {
  className?: string;
  children?: ReactNode;
}

/**
 * Loading-state shimmer text — a dim → bright → dim mask window sweeping
 * across the label, shared by working turn headers, thinking labels and
 * running tool/command rows. The sweep is cadenced — a 1s sweep followed by
 * a 2s rest — rather than a continuous loop, so it reads as a periodic
 * pulse of activity instead of a spinner. Deliberately self-contained (no
 * dependency on the standalone text-shimmer component) so the thread block
 * distributes as one unit. Under `useReducedMotion()` it renders a plain
 * muted span with no sweep.
 */
export function ThreadShimmerText({ className, children }: ThreadShimmerTextProps) {
  const reduce = useReducedMotion() ?? false;

  if (reduce) {
    return <span className={cn("text-muted-foreground", className)}>{children}</span>;
  }

  return (
    <motion.span
      style={{
        backgroundImage:
          "linear-gradient(90deg, var(--wb-shimmer-dim) 0%, var(--wb-shimmer-dim) 40%, var(--wb-shimmer-bright) 50%, var(--wb-shimmer-dim) 60%, var(--wb-shimmer-dim) 100%)",
        backgroundSize: "200% 100%",
      }}
      animate={{ backgroundPosition: ["100% 0%", "-100% 0%"] }}
      transition={{ duration: 1, repeat: Infinity, repeatDelay: 2, ease: "linear" }}
      className={cn(
        "bg-clip-text text-transparent",
        className,
      )}
    >
      {children}
    </motion.span>
  );
}

export interface ThreadCardProps {
  className?: string;
  children?: ReactNode;
}

/**
 * Shared card shell for file and diff artifacts — a hairline-ringed surface
 * using the same CSS-variable box-shadow technique as `WorkbenchSummaryCard`
 * / `Composer`, so the right hairline shade is picked per color scheme.
 * `my-1` gives two adjacent cards an 8px gap (4px contributed by each).
 */
export function ThreadCard({ className, children }: ThreadCardProps) {
  return (
    <div
      style={{ boxShadow: "0 0 0 0.5px var(--wb-hairline)" }}
      className={cn(
        "my-1 flex max-w-full flex-col overflow-hidden rounded-xl bg-[var(--wb-card)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

export interface ThreadCardButtonProps {
  /** "outline" (default) draws a hairline border; "ghost" is borderless — for a de-emphasized action beside it (e.g. "Undo" next to "Review"); "primary" is a filled emphasis button (e.g. "Approve"). */
  variant?: "outline" | "ghost" | "primary";
  onClick?: () => void;
  "aria-label"?: string;
  children?: ReactNode;
  className?: string;
}

/** Small action button used inside file/diff/approval card headers. */
export function ThreadCardButton({
  variant = "outline",
  onClick,
  "aria-label": ariaLabel,
  children,
  className,
}: ThreadCardButtonProps) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      className={cn(
        "flex h-7 items-center gap-1 rounded-lg text-sm transition-colors",
        variant === "outline" &&
          "border border-[var(--wb-border)] px-2 hover:bg-[var(--wb-hover)]",
        variant === "ghost" &&
          "px-2 text-muted-foreground hover:bg-[var(--wb-hover)] hover:text-foreground",
        variant === "primary" &&
          "bg-foreground px-3 text-background transition-opacity hover:opacity-85",
        className,
      )}
    >
      {children}
    </button>
  );
}

export interface ThreadFileCardProps {
  /** 24px icon rendered in a 40px rounded slot, e.g. `<FileText className="h-6 w-6" />`. */
  icon?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  /** Trailing slot for the caller's own controls, e.g. an "Open" `ThreadCardButton`. */
  action?: ReactNode;
  className?: string;
  /** Optional content appended below the header row, extending the card body. */
  children?: ReactNode;
}

/** File-artifact card — icon, title/subtitle, and an optional trailing action. */
export function ThreadFileCard({
  icon,
  title,
  subtitle,
  action,
  className,
  children,
}: ThreadFileCardProps) {
  return (
    <ThreadCard className={className}>
      <div className="flex items-center gap-3 px-3 py-2.5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--wb-inset-strong)]">
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium text-sm">{title}</div>
          {subtitle ? <div className="text-[13px] text-muted-foreground">{subtitle}</div> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children}
    </ThreadCard>
  );
}

export interface ThreadDiffRowProps {
  /** Split at the last `/` into a muted directory prefix and a bright filename. Ignored when `children` is passed. */
  path?: string;
  added?: number;
  removed?: number;
  className?: string;
  children?: ReactNode;
}

/** One changed-file row inside a `ThreadDiffCard`. */
export function ThreadDiffRow({ path, added, removed, className, children }: ThreadDiffRowProps) {
  let content = children;
  if (content === undefined && path !== undefined) {
    const lastSlash = path.lastIndexOf("/");
    const prefix = lastSlash >= 0 ? path.slice(0, lastSlash + 1) : "";
    const name = lastSlash >= 0 ? path.slice(lastSlash + 1) : path;
    content = (
      <>
        <span className="text-muted-foreground">{prefix}</span>
        <span className="text-foreground">{name}</span>
      </>
    );
  }

  return (
    <div
      className={cn(
        "flex h-9 items-center justify-between gap-3 border-[var(--wb-divider)] border-t-[0.5px] px-3 text-sm",
        className,
      )}
    >
      <div className="min-w-0 truncate">{content}</div>
      {added !== undefined || removed !== undefined ? (
        <div className="flex shrink-0 gap-1.5 text-[13px]">
          {added !== undefined ? (
            <span className="text-[var(--wb-success)]">+{added}</span>
          ) : null}
          {removed !== undefined ? (
            <span className="text-[var(--wb-danger)]">−{removed}</span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export interface ThreadDiffCardProps {
  /** 20px icon rendered in a 40px rounded slot, e.g. `<SquarePen className="h-5 w-5" />`. */
  icon?: ReactNode;
  title: ReactNode;
  added?: number;
  removed?: number;
  /** Trailing slot for the caller's own controls, e.g. an "Undo" ghost button plus a "Review" outline button. */
  actions?: ReactNode;
  /** Visible `ThreadDiffRow`s. */
  children?: ReactNode;
  /** Extra `ThreadDiffRow`s revealed by the "show more" row below `children`. */
  hiddenRows?: ReactNode;
  /** Label for the "show more" row, e.g. "Show 2 more files". */
  moreLabel?: ReactNode;
  /** Row count represented by `hiddenRows` — the "show more" row only renders when this is greater than 0. */
  moreCount?: number;
  className?: string;
}

/**
 * Diff/change-summary card — a header (icon, title, +added/−removed counts,
 * trailing actions) followed by a row region for `ThreadDiffRow` children.
 * When `moreCount` is positive, a "show more" row is appended after
 * `children`; clicking it reveals `hiddenRows` with a measured height 0 →
 * auto tween (`EASE_OUT`, 0.25s) and hides the row itself.
 * `useReducedMotion()` swaps the tween for an instant show, matching the
 * measure-with-`ResizeObserver` idiom used by `BouncyAccordion`.
 */
export function ThreadDiffCard({
  icon,
  title,
  added,
  removed,
  actions,
  children,
  hiddenRows,
  moreLabel,
  moreCount = 0,
  className,
}: ThreadDiffCardProps) {
  const reduce = useReducedMotion() ?? false;
  const [expanded, setExpanded] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState(0);

  useLayoutEffect(() => {
    const node = contentRef.current;
    if (!node) return;
    const update = () => setContentHeight(node.offsetHeight);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const showMoreRow = moreCount > 0 && !expanded;

  return (
    <ThreadCard className={className}>
      <div className="flex items-center gap-3 px-3 py-2.5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--wb-inset-strong)]">
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-medium text-sm">{title}</div>
          {added !== undefined || removed !== undefined ? (
            <div className="flex gap-1.5 text-[13px]">
              {added !== undefined ? (
                <span className="text-[var(--wb-success)]">+{added}</span>
              ) : null}
              {removed !== undefined ? (
                <span className="text-[var(--wb-danger)]">−{removed}</span>
              ) : null}
            </div>
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-1">{actions}</div> : null}
      </div>
      {children}
      {moreCount > 0 ? (
        <>
          <motion.div
            initial={false}
            animate={reduce ? undefined : { height: expanded ? contentHeight : 0 }}
            transition={{ duration: 0.25, ease: EASE_OUT }}
            className={cn("overflow-hidden", reduce && (expanded ? "h-auto" : "h-0"))}
          >
            <div ref={contentRef}>{hiddenRows}</div>
          </motion.div>
          {showMoreRow ? (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="flex w-full items-center gap-1 px-3 py-2 text-[13px] text-muted-foreground transition-colors hover:bg-[var(--wb-hover)]"
            >
              {moreLabel}
              <ConversationIcon name="chevron-up" className="size-3.5 rotate-180" />
            </button>
          ) : null}
        </>
      ) : null}
    </ThreadCard>
  );
}

export interface ThreadCommandRowProps {
  /** 16px leading icon, e.g. `<SquareTerminal className="h-4 w-4" />`. */
  icon?: ReactNode;
  /** Pulses the icon's opacity while the command is executing. */
  running?: boolean;
  className?: string;
  children?: ReactNode;
}

/** Single command-execution line — a leading icon (pulsing while `running`, with the text shimmering) followed by the command text. */
export function ThreadCommandRow({ icon, running, className, children }: ThreadCommandRowProps) {
  const reduce = useReducedMotion() ?? false;

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
          <span className="flex h-4 w-4 shrink-0 items-center justify-center">{icon}</span>
        )
      ) : null}
      {running ? <ThreadShimmerText>{children}</ThreadShimmerText> : children}
    </div>
  );
}
