"use client";
// ui-lab-ten.vercel.app/components/blocks/agent-composer

import { ArrowUpIcon as ArrowUp, ChevronDownIcon as ChevronDown, XMarkIcon as X } from "@heroicons/react/24/outline";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  type ButtonHTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
  forwardRef,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { EASE_OUT, SPRING_PANEL } from "@/lib/ease";
import { cn } from "@/lib/utils";

export { ComposerAutonomyDial } from "./autonomy-dial";
export { ComposerEffortSlider } from "./effort-slider";

export interface ComposerProps {
  className?: string;
  children?: ReactNode;
  "data-testid"?: string;
}

/**
 * Composer shell — a translucent, rounded card that hosts a textarea and a
 * toolbar row. Renders `children` directly (auto-height textarea and toolbar
 * are stacked by the caller); the hairline shadow trio and glass surface use
 * the same `--composer-hairline` CSS-variable technique as
 * `WorkbenchSummaryCard`, so the right shade is picked per color scheme.
 * Sits at `z-10` so it stacks above a sibling `ComposerContextBar`.
 */
export function Composer({
  className,
  children,
  "data-testid": dataTestId,
}: ComposerProps) {
  return (
    <div
      data-slot="agent-composer"
      data-testid={dataTestId}
      style={{
        // Dark (Codex CDP): no shell shadow; light keeps hairline trio via token.
        boxShadow: "var(--wb-composer-shell-shadow)",
      }}
      className={cn(
        "relative z-10 flex w-full max-w-full flex-col rounded-[25px] px-4 py-3",
        "bg-[var(--wb-surface-composer)] backdrop-blur-lg",
        // No shell focus outline (Codex-like): caret in textarea is enough.
        className,
      )}
    >
      {children}
    </div>
  );
}

export interface ComposerContextBarProps {
  className?: string;
  children?: ReactNode;
  "data-testid"?: string;
}

/**
 * Optional context bar above `<Composer>`. Codex (CDP): inset strip, top radius
 * 20px / square bottom, negative margin so shell covers lower half; rail uses
 * `--wb-composer-rail` (fog above canvas, darker than elevated shell).
 */
export function ComposerContextBar({
  className,
  children,
  "data-testid": dataTestId,
}: ComposerContextBarProps) {
  return (
    <div
      data-testid={dataTestId}
      style={{
        // Top edge catch-light so the rounded lip reads even on low-contrast panels.
        boxShadow: "inset 0 1px 0 rgb(255 255 255 / 0.06)",
      }}
      className={cn(
        // Stronger tuck so chips sit on the shell lip (Codex ~18–22px overlap).
        "relative z-0 mx-3 -mb-6 flex items-center gap-1 overflow-x-auto",
        "rounded-t-[20px] rounded-b-none px-1.5 pt-1.5 pb-8",
        "bg-[var(--wb-composer-rail)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

export interface ComposerChipProps {
  icon?: ReactNode;
  /** Swapped in for `icon` on hover/focus (opacity crossfade, no layout shift).
   * Only meaningful on interactive chips — pair it with `onClick`. */
  hoverIcon?: ReactNode;
  /** Makes the chip a `<button>` with a hover pill surface. */
  onClick?: () => void;
  /** Native tooltip, e.g. "Change project". */
  title?: string;
  children?: ReactNode;
  className?: string;
  /** Host apps use data-testid / other DOM attrs for tests and wiring. */
  "data-testid"?: string;
}

const CHIP_BASE = "flex h-7 items-center gap-1.5 rounded-full px-2 text-[13px] text-muted-foreground";

/**
 * A single label inside `ComposerContextBar` — an optional 16px icon plus
 * text. With `onClick` it becomes a button whose hover state paints a pill
 * surface and (when `hoverIcon` is set) crossfades the icon — e.g. a project
 * chip whose folder icon turns into a clear-mark.
 */
export function ComposerChip({
  icon,
  hoverIcon,
  onClick,
  title,
  children,
  className,
  "data-testid": dataTestId,
}: ComposerChipProps) {
  const iconSlot = icon ? (
    hoverIcon ? (
      <span className="relative flex h-4 w-4 shrink-0 items-center justify-center">
        <span className="absolute inset-0 flex items-center justify-center opacity-100 transition-opacity group-focus-visible:opacity-0 group-hover:opacity-0">
          {icon}
        </span>
        <span className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-focus-visible:opacity-100 group-hover:opacity-100">
          {hoverIcon}
        </span>
      </span>
    ) : (
      <span className="flex h-4 w-4 shrink-0 items-center justify-center">{icon}</span>
    )
  ) : null;

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        title={title}
        data-testid={dataTestId}
        className={cn(
          CHIP_BASE,
          "group transition-colors hover:bg-[var(--wb-hover-strong)] hover:text-foreground",
          className,
        )}
      >
        {iconSlot}
        {children}
      </button>
    );
  }

  return (
    <span title={title} data-testid={dataTestId} className={cn(CHIP_BASE, className)}>
      {iconSlot}
      {children}
    </span>
  );
}

export interface ComposerTextareaProps {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  /** Fires when Enter is pressed without Shift — the caller owns what "submit" means. */
  onSubmit?: () => void;
  /**
   * Runs before built-in Enter→submit. Call `event.preventDefault()` to block
   * submit (e.g. while a slash palette is open and Enter selects a row).
   */
  onKeyDown?: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  /**
   * Inline leading tokens (e.g. selected skills) rendered in the same flow
   * as the text field — Codex embeds skill mentions inside the input area.
   */
  leading?: ReactNode;
  "aria-label"?: string;
  className?: string;
  id?: string;
  "data-testid"?: string;
}

/**
 * Auto-growing message field. A real `<textarea rows={1}>` — height tracks
 * content via `scrollHeight`, up to the scrollable container's
 * `max-h-[25dvh]`. The measure runs in a layout effect keyed on `value` (not
 * an input handler), so programmatic updates — e.g. the caller clearing the
 * draft after a send — collapse the field just like keystrokes do. Enter
 * submits (and is prevented from inserting a newline); Shift+Enter inserts a
 * newline as usual.
 *
 * Focus ring is intentionally suppressed: global `:focus-visible { ring-3 }`
 * would paint a bright blue box inside the glass shell (not Codex-like).
 */
export function ComposerTextarea({
  value,
  onChange,
  placeholder,
  onSubmit,
  onKeyDown: onKeyDownProp,
  leading,
  "aria-label": ariaLabel,
  className,
  id,
  "data-testid": dataTestId,
}: ComposerTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const hasLeading = Boolean(leading);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `value` is the trigger — the height depends on the rendered content, which this effect reads from the DOM rather than from the prop.
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value, leading]);

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      onKeyDownProp?.(event);
      if (event.defaultPrevented) return;
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        onSubmit?.();
      }
    },
    [onKeyDownProp, onSubmit],
  );

  return (
    <div className="max-h-[25dvh] overflow-y-auto px-0 pt-0.5 pb-1">
      <div className="flex min-h-[44px] flex-wrap items-center gap-x-1.5 gap-y-1">
        {hasLeading ? (
          <div
            className="flex max-w-full flex-wrap items-center gap-x-1.5 gap-y-1"
            data-testid="composer-inline-tokens"
          >
            {leading}
          </div>
        ) : null}
        <textarea
          ref={textareaRef}
          id={id}
          data-testid={dataTestId}
          rows={1}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={hasLeading && !value ? undefined : placeholder}
          aria-label={ariaLabel}
          className={cn(
            "flex-1 resize-none border-none bg-transparent text-sm leading-5",
            "shadow-none outline-none ring-0 focus:shadow-none focus:outline-none focus:ring-0",
            "focus-visible:shadow-none focus-visible:outline-none focus-visible:ring-0",
            "placeholder:text-muted-foreground",
            hasLeading ? "min-h-[28px] min-w-[8rem]" : "min-h-[44px] w-full",
            className,
          )}
          style={{ boxShadow: 'none' }}
        />
      </div>
    </div>
  );
}

export interface ComposerFloatingPanelProps {
  open: boolean;
  children?: ReactNode;
  className?: string;
  "data-testid"?: string;
}

/**
 * Full-width panel anchored above the Composer shell (Codex + / slash menus).
 * Parent must be `position: relative` (the `Composer` root is).
 * `max-h-[320px]` + internal scroll matches desktop Codex add palette.
 */
export const ComposerFloatingPanel = forwardRef<
  HTMLDivElement,
  ComposerFloatingPanelProps
>(function ComposerFloatingPanel(
  { open, children, className, "data-testid": dataTestId },
  ref,
) {
  const reduce = useReducedMotion() ?? false;

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          ref={ref}
          data-testid={dataTestId}
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6 }}
          animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: 6 }}
          transition={reduce ? { duration: 0.12, ease: EASE_OUT } : SPRING_PANEL}
          style={{
            boxShadow:
              "0 0 0 0.5px var(--wb-hairline-soft), 0 8px 28px rgba(0,0,0,0.18)",
          }}
          className={cn(
            "absolute inset-x-0 bottom-full z-50 mb-1 flex max-h-[320px] w-full flex-col",
            "overflow-hidden rounded-2xl border border-[var(--wb-border)]",
            // Solid fill: --wb-surface-raised is semi-transparent and stream text bleeds through.
            "bg-[var(--wb-surface)] p-1 text-sm shadow-lg",
            "dark:bg-[#2a2a2a]",
            className,
          )}
        >
          <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
});

export interface ComposerPanelSectionProps {
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
}

/** Section header + rows inside `ComposerFloatingPanel`. */
export function ComposerPanelSection({
  title,
  children,
  className,
}: ComposerPanelSectionProps) {
  return (
    <div className={cn("flex flex-col", className)}>
      {title ? (
        <div className="px-2 pt-1.5 pb-1 text-xs text-muted-foreground">{title}</div>
      ) : null}
      {children}
    </div>
  );
}

export interface ComposerPanelItemProps {
  icon?: ReactNode;
  description?: ReactNode;
  /** Right-aligned meta (e.g. skill scope "个人"). */
  trailing?: ReactNode;
  active?: boolean;
  onSelect?: () => void;
  children?: ReactNode;
  className?: string;
  "data-testid"?: string;
}

/** Full-width row for add / slash palettes. */
export function ComposerPanelItem({
  icon,
  description,
  trailing,
  active,
  onSelect,
  children,
  className,
  "data-testid": dataTestId,
}: ComposerPanelItemProps) {
  return (
    <button
      type="button"
      data-testid={dataTestId}
      data-active={active ? "true" : "false"}
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-[13px] transition-colors",
        active ? "bg-[var(--wb-hover-strong)]" : "hover:bg-[var(--wb-hover)]",
        className,
      )}
    >
      {icon ? (
        <span className="flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground">
          {icon}
        </span>
      ) : null}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-foreground">{children}</span>
        {description ? (
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
            {description}
          </span>
        ) : null}
      </span>
      {trailing ? (
        <span className="max-w-[40%] shrink-0 truncate text-xs text-muted-foreground">
          {trailing}
        </span>
      ) : null}
    </button>
  );
}

export interface ComposerSkillChipProps {
  label: ReactNode;
  /** Optional leading glyph (e.g. cube icon). */
  icon?: ReactNode;
  onRemove?: () => void;
  className?: string;
  "data-testid"?: string;
}

/**
 * Inline skill tag in the composer input.
 * Neutral muted pill; icon crossfades to × on hover/focus (Codex-style tag chrome).
 */
export function ComposerSkillChip({
  label,
  icon,
  onRemove,
  className,
  "data-testid": dataTestId,
}: ComposerSkillChipProps) {
  const iconSlot =
    icon && onRemove ? (
      <span className="relative flex h-3.5 w-3.5 shrink-0 items-center justify-center">
        <span className="absolute inset-0 flex items-center justify-center opacity-100 transition-opacity group-hover/skill:opacity-0 group-focus-within/skill:opacity-0">
          {icon}
        </span>
        <span className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover/skill:opacity-100 group-focus-within/skill:opacity-100">
          <X className="size-3.5" />
        </span>
      </span>
    ) : icon ? (
      <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">
        {icon}
      </span>
    ) : null

  if (onRemove) {
    const removeLabel =
      typeof label === 'string' ? `移除 ${label}` : '移除技能'
    return (
      <button
        type="button"
        title={removeLabel}
        aria-label={removeLabel}
        onClick={onRemove}
        data-testid={dataTestId}
        className={cn(
          'group/skill inline-flex h-6 max-w-full items-center gap-1.5 rounded-full px-2',
          'bg-[var(--wb-inset-strong)] text-[13px] text-muted-foreground',
          'transition-colors hover:bg-[var(--wb-hover-strong)] hover:text-foreground',
          className,
        )}
      >
        {iconSlot}
        <span className="truncate" aria-hidden="true">
          {label}
        </span>
      </button>
    )
  }

  return (
    <span
      data-testid={dataTestId}
      className={cn(
        'inline-flex h-6 max-w-full items-center gap-1.5 rounded-full px-2',
        'bg-[var(--wb-inset-strong)] text-[13px] text-muted-foreground',
        className,
      )}
    >
      {icon ? (
        <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">
          {icon}
        </span>
      ) : null}
      <span className="truncate">{label}</span>
    </span>
  );
}

export interface ComposerModeBadgeProps {
  children?: ReactNode;
  onClear?: () => void;
  className?: string;
  "data-testid"?: string;
}

/** Active session mode (plan / goal) — amber, distinct from skill chips. */
export function ComposerModeBadge({
  children,
  onClear,
  className,
  "data-testid": dataTestId,
}: ComposerModeBadgeProps) {
  return (
    <span
      data-testid={dataTestId}
      className={cn(
        "inline-flex h-7 items-center gap-1 rounded-full",
        "bg-[var(--wb-warning)]/15 px-2 text-[13px] text-[var(--wb-warning-text)]",
        className,
      )}
    >
      <span className="truncate">{children}</span>
      {onClear ? (
        <button
          type="button"
          aria-label="关闭模式"
          onClick={onClear}
          className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full hover:bg-[var(--wb-warning)]/20"
        >
          <X className="h-3 w-3" />
        </button>
      ) : null}
    </span>
  );
}

export interface ComposerToolbarProps {
  className?: string;
  children?: ReactNode;
}

/**
 * Bottom action row. Just a flex container — order children left to right
 * and drop in a `<div className="ml-auto" />` spacer to split left/right
 * clusters (see the preview for the exact arrangement).
 */
export function ComposerToolbar({ className, children }: ComposerToolbarProps) {
  return <div className={cn("flex items-center gap-1 px-2 pb-2", className)}>{children}</div>;
}

export interface ComposerIconButtonProps {
  "aria-label": string;
  onClick?: () => void;
  children?: ReactNode;
  className?: string;
  disabled?: boolean;
  "data-testid"?: string;
  "aria-expanded"?: boolean;
  "aria-haspopup"?: boolean | "dialog" | "menu" | "listbox" | "tree" | "grid";
}

/** Circular 28px icon button for the toolbar (add attachment, dictate, ...). */
export const ComposerIconButton = forwardRef<
  HTMLButtonElement,
  ComposerIconButtonProps
>(function ComposerIconButton(
  {
    "aria-label": ariaLabel,
    onClick,
    children,
    className,
    disabled,
    "data-testid": dataTestId,
    "aria-expanded": ariaExpanded,
    "aria-haspopup": ariaHasPopup,
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={ariaLabel}
      aria-expanded={ariaExpanded}
      aria-haspopup={ariaHasPopup}
      data-testid={dataTestId}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors",
        "hover:bg-[var(--wb-hover)] hover:text-foreground",
        className,
      )}
    >
      {children}
    </button>
  );
});

export interface ComposerAccessChipProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  icon?: ReactNode;
  /** "warning" (default) reads as an orange access-level alert; "default" is muted. */
  tone?: "warning" | "default";
  children?: ReactNode;
}

/** Pill button surfacing the current permission level (e.g. "Full access"). */
export const ComposerAccessChip = forwardRef<
  HTMLButtonElement,
  ComposerAccessChipProps
>(function ComposerAccessChip(
  { icon, tone = "warning", children, className, type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        "flex h-7 items-center gap-1 rounded-full px-2 text-[13px] transition-colors",
        tone === "warning"
          ? "text-[var(--wb-warning-text)] hover:bg-[var(--wb-warning-hover)]/10"
          : "text-muted-foreground hover:bg-[var(--wb-hover)]",
        className,
      )}
      {...props}
    >
      {icon ? <span className="flex h-4 w-4 shrink-0 items-center justify-center">{icon}</span> : null}
      {children}
    </button>
  );
});

/**
 * Shared open state + dismiss behavior for the popover triggers below.
 * Controlled (`openProp`/`onOpenChange`) or uncontrolled; while open, Escape
 * or a pointerdown outside trigger + portaled panel closes.
 */
function usePopover(openProp: boolean | undefined, onOpenChange?: (open: boolean) => void) {
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const setOpen = useCallback(
    (next: boolean) => {
      setOpenState(next);
      onOpenChange?.(next);
    },
    [onOpenChange],
  );

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const onPointerDown = (event: PointerEvent) => {
      const t = event.target as Node;
      if (rootRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open, setOpen]);

  return { open, setOpen, rootRef, panelRef };
}

interface PopoverPanelProps {
  open: boolean;
  /** Horizontal anchor against the trigger: "start" = left edges flush, "end" = right edges flush. */
  align: "start" | "end";
  /** Trigger root — panel is portaled and fixed above this box. */
  anchorRef: RefObject<HTMLElement | null>;
  /** Used by outside-click so portaled panel is still "inside". */
  panelRef: RefObject<HTMLDivElement | null>;
  className?: string;
  children?: ReactNode;
}

/**
 * Portaled floating panel (fixed) — shared by `ComposerModelPicker` /
 * `ComposerMenuButton`. Must portal: composer sits under overflow-hidden
 * shell ancestors; in-tree absolute menus paint but fail hit-testing over
 * EmptyHub. Glass + SPRING_PANEL entrance; reduced-motion → opacity only.
 */
function PopoverPanel({
  open,
  align,
  anchorRef,
  panelRef,
  className,
  children,
}: PopoverPanelProps) {
  const reduce = useReducedMotion() ?? false;
  const [box, setBox] = useState<{
    bottom: number;
    left: number;
    right: number;
  } | null>(null);

  useLayoutEffect(() => {
    if (!open) {
      setBox(null);
      return;
    }
    const update = () => {
      const el = anchorRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setBox({
        bottom: window.innerHeight - r.top + 8,
        left: r.left,
        right: window.innerWidth - r.right,
      });
    };
    update();
    window.addEventListener("resize", update);
    // Capture scroll from overflow ancestors (task stage, etc.).
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, anchorRef]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open && box ? (
        <motion.div
          ref={panelRef}
          initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 4 }}
          animate={reduce ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 4 }}
          transition={reduce ? { duration: 0.15, ease: EASE_OUT } : SPRING_PANEL}
          style={{
            position: "fixed",
            bottom: box.bottom,
            left: align === "start" ? box.left : undefined,
            right: align === "end" ? box.right : undefined,
            transformOrigin: align === "end" ? "bottom right" : "bottom left",
            boxShadow:
              "0 0 0 0.5px var(--wb-hairline-soft), 0 3px 7.5px rgba(0,0,0,0.04), 0 0 20px rgba(0,0,0,0.05)",
          }}
          className={cn(
            "z-[80] min-w-[224px] rounded-2xl bg-[var(--wb-surface-raised)] p-1 backdrop-blur-xl",
            className,
          )}
        >
          {children}
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}

export interface ComposerModelPickerProps {
  /** Trigger content, e.g. `"5.6 · High"` — a chevron is appended automatically. */
  label: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: ReactNode;
  className?: string;
  title?: string;
  "data-testid"?: string;
}

/**
 * Trigger plus a popover that springs open above and right-aligned to it —
 * for model/effort pickers. Works controlled (`open`/`onOpenChange`) or
 * uncontrolled; dismiss and entrance behavior come from `usePopover` /
 * `PopoverPanel`.
 */
export function ComposerModelPicker({
  label,
  open: openProp,
  onOpenChange,
  children,
  className,
  title,
  "data-testid": dataTestId,
}: ComposerModelPickerProps) {
  const { open, setOpen, rootRef, panelRef } = usePopover(openProp, onOpenChange);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        title={title}
        data-testid={dataTestId}
        onClick={() => setOpen(!open)}
        className={cn(
          "flex h-7 items-center gap-1 rounded-full px-2 text-[13px] text-muted-foreground",
          "hover:bg-[var(--wb-hover)]",
          className,
        )}
      >
        {label}
        <ChevronDown className="h-3.5 w-3.5" />
      </button>
      <PopoverPanel
        open={open}
        align="end"
        anchorRef={rootRef}
        panelRef={panelRef}
      >
        {children}
      </PopoverPanel>
    </div>
  );
}

export interface ComposerMenuButtonProps {
  /** 16px icon; alone it renders the circular icon-button look. */
  icon?: ReactNode;
  /** Optional text label; with it the trigger becomes a pill like the model-picker trigger (no chevron). */
  label?: ReactNode;
  "aria-label": string;
  /** Panel anchor edge — defaults to "start" (left-aligned above the trigger). */
  align?: "start" | "end";
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: ReactNode;
  className?: string;
  "data-testid"?: string;
}

/**
 * Trigger plus a popover menu (compose `ComposerMenuSection` /
 * `ComposerMenuItem` as children) — e.g. the "+" add-attachments menu.
 * Controlled or uncontrolled; same panel shell and dismiss behavior as
 * `ComposerModelPicker`.
 */
export function ComposerMenuButton({
  icon,
  label,
  "aria-label": ariaLabel,
  align = "start",
  open: openProp,
  onOpenChange,
  children,
  className,
  "data-testid": dataTestId,
}: ComposerMenuButtonProps) {
  const { open, setOpen, rootRef, panelRef } = usePopover(openProp, onOpenChange);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        data-testid={dataTestId}
        onClick={() => setOpen(!open)}
        className={cn(
          label
            ? "flex h-7 items-center gap-1 rounded-full px-2 text-[13px] text-muted-foreground hover:bg-[var(--wb-hover)]"
            : "flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-[var(--wb-hover)] hover:text-foreground",
          className,
        )}
      >
        {icon}
        {label}
      </button>
      <PopoverPanel
        open={open}
        align={align}
        anchorRef={rootRef}
        panelRef={panelRef}
        className="min-w-[260px] max-w-[320px]"
      >
        {children}
      </PopoverPanel>
    </div>
  );
}

export interface ComposerMenuSectionProps {
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
}

/** A titled group of rows inside a `ComposerMenuButton` panel. */
export function ComposerMenuSection({ title, children, className }: ComposerMenuSectionProps) {
  return (
    <div className={cn("flex flex-col", className)}>
      {title ? <div className="px-2 pt-1.5 pb-1 text-muted-foreground text-xs">{title}</div> : null}
      {children}
    </div>
  );
}

export interface ComposerMenuItemProps {
  icon?: ReactNode;
  /** Muted one-liner rendered inline after the name, truncated when tight. */
  description?: ReactNode;
  onSelect?: () => void;
  disabled?: boolean;
  title?: string;
  children?: ReactNode;
  className?: string;
  "data-testid"?: string;
}

/** One selectable row in a `ComposerMenuButton` panel. */
export function ComposerMenuItem({
  icon,
  description,
  onSelect,
  disabled,
  title,
  children,
  className,
  "data-testid": dataTestId,
}: ComposerMenuItemProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      title={title}
      aria-disabled={disabled || undefined}
      data-testid={dataTestId}
      className={cn(
        "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] transition-colors",
        "hover:bg-[var(--wb-hover)]",
        "disabled:pointer-events-none disabled:opacity-40",
        className,
      )}
    >
      {icon ? (
        <span className="flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground">
          {icon}
        </span>
      ) : null}
      <span className="min-w-0 flex-1 truncate text-left">{children}</span>
      {description ? <span className="min-w-0 truncate text-muted-foreground">{description}</span> : null}
    </button>
  );
}

export interface ComposerSendButtonProps {
  running?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  "aria-label"?: string;
  className?: string;
  "data-testid"?: string;
  "data-send-mode"?: "send" | "stop";
  "aria-describedby"?: string;
}

/**
 * Morphing send/stop control. `running` swaps the arrow glyph for a solid
 * square via `AnimatePresence mode="wait"` — a scale+opacity springy pop
 * (`SPRING_PANEL`), reduced to a plain opacity cut under
 * `useReducedMotion()`.
 */
export function ComposerSendButton({
  running = false,
  disabled,
  onClick,
  "aria-label": ariaLabel,
  className,
  "data-testid": dataTestId,
  "data-send-mode": dataSendMode,
  "aria-describedby": ariaDescribedBy,
}: ComposerSendButtonProps) {
  const reduce = useReducedMotion() ?? false;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-testid={dataTestId}
      data-send-mode={dataSendMode ?? (running ? "stop" : "send")}
      aria-describedby={ariaDescribedBy}
      aria-label={ariaLabel ?? (running ? "Stop" : "Send")}
      className={cn(
        "flex h-7 w-7 items-center justify-center rounded-full bg-foreground text-background",
        "disabled:pointer-events-none disabled:opacity-40",
        className,
      )}
    >
      <AnimatePresence mode="wait" initial={false}>
        {running ? (
          <motion.span
            key="stop"
            initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.5 }}
            transition={reduce ? { duration: 0.15, ease: EASE_OUT } : SPRING_PANEL}
            className="block h-2.5 w-2.5 rounded-[2px] bg-current"
          />
        ) : (
          <motion.span
            key="send"
            initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.5 }}
            transition={reduce ? { duration: 0.15, ease: EASE_OUT } : SPRING_PANEL}
            className="flex items-center justify-center"
          >
            <ArrowUp className="h-4 w-4" />
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  );
}

/** 3px dash / 4px gap horizontal dash pattern, colored by `currentColor`. */
const DICTATION_DASHES = "repeating-linear-gradient(90deg, currentColor 0 3px, transparent 3px 7px)";

export interface ComposerDictationProps {
  /** Elapsed recording time, owned by the caller; formatted as m:ss. */
  seconds: number;
  onStop?: () => void;
  className?: string;
  /** Label for the stop button — defaults to "Stop dictation". */
  "aria-label"?: string;
}

/**
 * Voice-dictation state for the toolbar's middle stretch: a dashed sound
 * track whose brighter right-end segment slowly flows leftward while
 * listening, an m:ss timer, and a white stop button (white in both themes).
 * The flow loops over exactly one dash period so it reads as continuous; a
 * static track is shown under `useReducedMotion()`.
 */
export function ComposerDictation({
  seconds,
  onStop,
  className,
  "aria-label": ariaLabel,
}: ComposerDictationProps) {
  const reduce = useReducedMotion() ?? false;
  const minutes = Math.floor(seconds / 60);
  const remainder = `${Math.floor(seconds % 60)}`.padStart(2, "0");

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div
        aria-hidden
        className="relative h-px flex-1 overflow-hidden text-muted-foreground/50"
        style={{ backgroundImage: DICTATION_DASHES }}
      >
        <motion.div
          className="absolute inset-y-0 right-0 w-[72px] text-foreground/80"
          style={{ backgroundImage: DICTATION_DASHES }}
          animate={reduce ? undefined : { backgroundPositionX: ["0px", "-7px"] }}
          transition={reduce ? undefined : { duration: 0.6, repeat: Infinity, ease: "linear" }}
        />
      </div>
      <span className="text-[13px] text-muted-foreground tabular-nums">
        {minutes}:{remainder}
      </span>
      <button
        type="button"
        aria-label={ariaLabel ?? "Stop dictation"}
        onClick={onStop}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--wb-accent-fg)] text-[var(--wb-solid-control-fg)] shadow-[0_0_0_0.5px_rgba(0,0,0,0.08),0_1px_4px_rgba(0,0,0,0.2)]"
      >
        <span className="block h-2.5 w-2.5 rounded-[2px] bg-current" />
      </button>
    </div>
  );
}

export interface ComposerAttachmentsProps {
  className?: string;
  children?: ReactNode;
  "data-testid"?: string;
}

/**
 * Row of attachment chips shown above `ComposerTextarea` — a plain
 * flex-wrap container. Wrap the mapped `ComposerAttachmentChip` list in the
 * caller's own `AnimatePresence` to animate removal (see the preview); this
 * component only supplies the layout.
 */
export function ComposerAttachments({
  className,
  children,
  "data-testid": dataTestId,
}: ComposerAttachmentsProps) {
  return (
    <div
      data-testid={dataTestId}
      className={cn("flex flex-wrap gap-1.5 px-4 pt-3", className)}
    >
      {children}
    </div>
  );
}

export interface ComposerAttachmentChipProps {
  /** 14px icon, e.g. `<FileText className="h-3.5 w-3.5" />`. */
  icon?: ReactNode;
  name: ReactNode;
  /** Muted trailing detail, e.g. a file size. */
  meta?: ReactNode;
  onRemove?: () => void;
  className?: string;
}

/**
 * One attached file/image chip inside `ComposerAttachments`. Carries
 * `layout` so sibling chips reflow smoothly when one is added or removed;
 * the removal transition itself is the caller's responsibility (wrap the
 * list in `AnimatePresence`).
 */
export function ComposerAttachmentChip({
  icon,
  name,
  meta,
  onRemove,
  className,
}: ComposerAttachmentChipProps) {
  return (
    <motion.div
      layout
      className={cn(
        "group/att flex items-center gap-1.5 rounded-lg border border-[var(--wb-border)] bg-[var(--wb-inset-subtle)] py-1 pr-1 pl-2 text-[13px]",
        className,
      )}
    >
      {icon ? (
        <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center text-muted-foreground">
          {icon}
        </span>
      ) : null}
      <span className="max-w-40 truncate text-foreground">{name}</span>
      {meta ? <span className="text-muted-foreground text-xs">{meta}</span> : null}
      {onRemove ? (
        <button
          type="button"
          aria-label={typeof name === "string" ? `Remove ${name}` : "Remove attachment"}
          onClick={onRemove}
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded hover:bg-[var(--wb-hover-strong)]"
        >
          <X className="h-3 w-3" />
        </button>
      ) : null}
    </motion.div>
  );
}

export interface ComposerContextGaugeProps {
  used: number;
  limit: number;
  /** Defaults to a K-abbreviated "32K / 200K" readout. */
  formatLabel?: (used: number, limit: number) => ReactNode;
  className?: string;
}

function formatContextK(n: number) {
  return n >= 1000 ? `${Math.round(n / 1000)}K` : `${n}`;
}

function defaultContextLabel(used: number, limit: number) {
  return `${formatContextK(used)} / ${formatContextK(limit)}`;
}

/**
 * Token-budget gauge for the toolbar or a `ComposerContextBar` — a thin
 * track filled to `used / limit`, colored blue under 80%, orange from
 * 80–95%, red past that. The fill width animates with `SPRING_PANEL`,
 * reduced to an instant cut under `useReducedMotion()`.
 */
export function ComposerContextGauge({
  used,
  limit,
  formatLabel = defaultContextLabel,
  className,
}: ComposerContextGaugeProps) {
  const reduce = useReducedMotion() ?? false;
  const ratio = limit > 0 ? Math.min(Math.max(used / limit, 0), 1) : 0;
  const tone = ratio < 0.8 ? "safe" : ratio < 0.95 ? "warn" : "crit";

  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <div className="h-1 w-16 overflow-hidden rounded-full bg-[var(--wb-border)]">
        <motion.div
          initial={false}
          animate={{ width: `${ratio * 100}%` }}
          transition={reduce ? { duration: 0.15, ease: EASE_OUT } : SPRING_PANEL}
          className={cn(
            "h-full rounded-full",
            tone === "safe" && "bg-[var(--wb-accent)]",
            tone === "warn" && "bg-[var(--wb-warning)]",
            tone === "crit" && "bg-[var(--wb-danger)]",
          )}
        />
      </div>
      <span className="text-muted-foreground text-xs tabular-nums">
        {formatLabel(used, limit)}
      </span>
    </div>
  );
}
