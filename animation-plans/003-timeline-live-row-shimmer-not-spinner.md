# 003 — Replace live Timeline spinner with text shimmer

- **Status**: DONE
- **Commit**: 2a8e1c5
- **Severity**: MEDIUM
- **Category**: Cohesion & tokens; Purpose & frequency
- **Estimated scope**: 4 source files + 1–2 tests, small

## Problem

While a turn is running, command and tool rows put a rotating `refresh` icon at the
start of the live line. That icon is hit on every tool/command mid-turn (tens of times
per session). The rest of Task already marks “still working” with a text sweep, so the
spinner reads as a second, noisier progress language.

The row the user pointed at is the live command line: spinner, then the activity
icon, then `$ …`:

```tsx
/* archetypes/agent-workbench/src/modules/task/ui/timeline/blocks/command.tsx:16-26 — current */
<div className='tl-chrome inline-flex h-[26px] max-w-full items-center gap-1.5 self-start px-0.5 text-black/50 dark:text-white/50'>
  <ToolStatusGlyph status={item.status} />
  <ToolActivityIcon kind='command' />
  <span
    className={cn(
      'min-w-0 flex-1 truncate font-mono',
      item.status === 'running' && 'text-foreground',
    )}
  >
    $ {item.title}
  </span>
</div>
```

The spinner is this branch:

```tsx
/* archetypes/agent-workbench/src/modules/task/ui/timeline/tool-status-glyph.tsx:12-20 — current */
if (status === 'running' || status === 'streaming') {
  return (
    <ConversationIcon
      name='refresh'
      className={cn(slot, 'animate-spin motion-reduce:animate-none opacity-80')}
      data-slot='tool-status'
      data-status='running'
    />
  )
}
```

`ToolRow` also mounts that glyph while live:

```tsx
/* archetypes/agent-workbench/src/modules/task/ui/timeline/blocks/tool-row.tsx:21-28 — current */
function showLiveGlyph(status: string | undefined): boolean {
  return (
    isToolRunning(status) ||
    status === 'failed' ||
    status === 'error' ||
    status === 'rejected'
  )
}
```

Working-block headers and activity-group titles already sweep. Do not invent a second
shimmer. Reuse `.wb-live-status-shimmer`.

## Target

Live command / tool rows have **no rotating icon**. Progress is a cadenced brightness
sweep across the status text only. Activity icons (`terminal` / `library` / …) stay
static. Completed / failed glyphs stay as they are today.

Exact motion (already in the repo — copy, do not retune):

```css
/* archetypes/agent-workbench/src/styles/index.css:788-807 — keep as-is */
.wb-live-status-shimmer {
  display: inline-block;
  font-weight: var(--wb-font-weight, 445);
  background-image: linear-gradient(
    90deg,
    var(--wb-shimmer-dim) 0%,
    var(--wb-shimmer-dim) 30%,
    var(--wb-shimmer-bright) 48%,
    var(--wb-shimmer-bright) 52%,
    var(--wb-shimmer-dim) 70%,
    var(--wb-shimmer-dim) 100%
  );
  background-size: 220% 100%;
  background-clip: text;
  -webkit-background-clip: text;
  color: transparent;
  -webkit-text-fill-color: transparent;
  animation: wb-shimmer 1.25s linear infinite;
}
```

```css
/* archetypes/agent-workbench/src/styles/index.css:676-683 — keep as-is */
@keyframes wb-shimmer {
  0% { background-position: 100% 0; }
  100% { background-position: -100% 0; }
}
```

`linear` is the AUDIT.md value for constant motion (marquee / progress). Duration
`1.25s` is the existing cadence. Light tokens: `--wb-shimmer-dim: rgb(0 0 0 / 0.4)`
and `--wb-shimmer-bright: rgb(0 0 0 / 0.85)`. Dark tokens already exist at
`index.css:612-613`.

Reduced motion already forces static muted text:

```css
/* archetypes/agent-workbench/src/styles/index.css:809-816 — keep as-is */
@media (prefers-reduced-motion: reduce) {
  .wb-live-status-shimmer {
    animation: none;
    color: var(--muted-foreground);
    -webkit-text-fill-color: var(--muted-foreground);
    background-image: none;
  }
}
```

Target markup after the change:

```tsx
/* command.tsx — target */
<div className='tl-chrome inline-flex h-[26px] max-w-full items-center gap-1.5 self-start px-0.5 text-black/50 dark:text-white/50'>
  {item.status === 'running' || item.status === 'streaming' ? null : (
    <ToolStatusGlyph status={item.status} />
  )}
  <ToolActivityIcon kind='command' />
  <span
    className={cn(
      'min-w-0 flex-1 truncate font-mono',
      (item.status === 'running' || item.status === 'streaming') &&
        'text-foreground wb-live-status-shimmer',
    )}
  >
    $ {item.title}
  </span>
</div>
```

```tsx
/* tool-status-glyph.tsx — target running branch */
if (status === 'running' || status === 'streaming') {
  return null
}
```

```tsx
/* tool-row.tsx — target */
function showLiveGlyph(status: string | undefined): boolean {
  return (
    status === 'failed' ||
    status === 'error' ||
    status === 'rejected'
  )
}

<span
  className={cn(
    'min-w-0 truncate',
    running && 'text-foreground wb-live-status-shimmer',
    item.status === 'error' && 'text-destructive',
  )}
>
  {title}
</span>
```

## Repo conventions to follow

- Live progress on Timeline chrome is **text shimmer**, not a spinner.
  Exemplar: `archetypes/agent-workbench/src/modules/task/ui/timeline/blocks/activity-group.tsx:54-58`

```tsx
<span
  className={cn(
    'min-w-0 truncate',
    live && 'text-foreground wb-live-status-shimmer',
  )}
>
  {title}
</span>
```

- Same class on the working-block header: `working-block.tsx:166`
- Same class on composer-adjacent live copy: `live-status-line.tsx:42`
- Do not add a new keyframe, duration, or easing. Do not wrap the row in a skeleton
  bar. Sweep the **label text** only (`background-clip: text`).
- User-facing copy stays Chinese-first; no new strings.

## Steps

1. In `archetypes/agent-workbench/src/modules/task/ui/timeline/tool-status-glyph.tsx`,
   change the `running` / `streaming` branch to `return null`. Leave `completed` /
   `approved` / `provided` (check) and `failed` / `error` / `rejected` (close) unchanged.
   Leave the empty fallback span for unknown status.

2. In `archetypes/agent-workbench/src/modules/task/ui/timeline/blocks/command.tsx`,
   do not render `ToolStatusGlyph` when `item.status` is `running` or `streaming`.
   Add `wb-live-status-shimmer` to the `$ {item.title}` span for those two statuses
   (keep `text-foreground`). Keep the glyph for settled / failed states.

3. In `archetypes/agent-workbench/src/modules/task/ui/timeline/blocks/tool-row.tsx`,
   drop `isToolRunning(status)` from `showLiveGlyph` so a live row no longer mounts a
   trailing spinner. Add `wb-live-status-shimmer` to the title `span` when `running`
   is true (both the no-children row and the collapsible trigger share `rowContent`).

4. Tests — extend existing files, do not add a new motion library:
   - `tool-row.test.tsx` (or `command` via a small case in the same file / a command
     render): while `status === 'running'`,
     `document.querySelector('[data-slot="tool-status"][data-status="running"]')`
     is `null`, and the title node has class `wb-live-status-shimmer`.
   - Completed / failed glyphs and the “no completed check on ToolRow” case stay green.
   - `working-block.test.tsx` still expects only the chevron SVG on the turn toggle
     (do not add a spinner there).

5. Run:

```bash
pnpm --filter @uilab/agent-workbench exec vitest run --browser.headless \
  src/modules/task/ui/timeline/blocks/tool-row.test.tsx \
  src/modules/task/ui/timeline/working-block.test.tsx
pnpm --filter @uilab/agent-workbench typecheck
```

## Boundaries

- Do NOT edit `.wb-live-status-shimmer`, `@keyframes wb-shimmer`, or shimmer color tokens.
- Do NOT add a skeleton/shine bar behind the row, a glow, or a second animation on the
  activity icon.
- Do NOT change Navigator busy spin (`navigator.tsx`), Context plan-step spin
  (`plan-block.tsx`), Capabilities / Board `animate-spin`.
- Do NOT change `WorkingBlock` header copy or fold behavior.
- Do NOT add dependencies (`motion`, GSAP, etc.).
- Do NOT change command title projection (`正在执行…` copy is already correct).
- If `tool-status-glyph.tsx` no longer has an `animate-spin` running branch at the
  stamped commit, STOP and report drift.

## Verification

- **Mechanical**: the vitest + typecheck commands in step 5 exit 0.
- **Feel check** (Workbench: `pnpm dev:workbench` + `pnpm dev:workbench-runtime`):
  - Send a prompt that runs a shell command (`execute_command` / `write_file` then a check).
  - On the live `正在执行 $ …` row: no rotating refresh icon; `$` text sweeps bright
    band left→right at ~1.25s, looping, no bounce.
  - Activity icon (terminal / file) does not spin or pulse.
  - In DevTools Animations, playback 10%: only `wb-shimmer` on the text
    (`background-position`), no `rotate` on an SVG in that row.
  - Toggle Rendering → `prefers-reduced-motion`: sweep stops; text is static
    `muted-foreground`; still no spinner.
  - When the command completes: shimmer stops; command row may show the existing
    check glyph; ToolRow still hides the completed check.
- **Done when**: no `[data-status="running"]` tool-status glyph exists on a live
  Timeline row, and that row’s title uses `wb-live-status-shimmer`.
