# Goal (locked): Workbench Codex Task Surface 1:1

> Status: **Locked** · 2026-08-02  
> Mode: goal-driven execution  
> Archetype: `@uilab/agent-workbench`

## One-liner

In `@uilab/agent-workbench`, 1:1-replicate three Codex task-shell surfaces: **(A) left rail**, **(B) empty-task launch pad + interactive cards + composer**, **(C) main task event-stream replay** (same prompt → capture Codex stream → template replay, including in-progress → completed). Done when all three pass side-by-side review.

## In scope

| ID | Surface | Must include |
|---|---|---|
| **A** | Left rail | 新对话, utility rows (拉取请求/站点/已安排/插件), 置顶 sessions, 项目 groups; selection/hover structure |
| **B** | Empty / new-task hub | Title “要在 {project} 内开发什么？”, four action cards (探索/构建/审查/修复), bottom composer; **click interactions** (not dead images; fixture-honest if no Runtime) |
| **C** | Main task content | Event stream with intermediate + terminal states (e.g. 处理中 → 已处理 + duration), tool/search fold rows, Markdown body; **record Codex events for a fixed prompt and replay** |

Component sources may include `/Users/zhoujw/develop/tmp/ui-components` and local Workbench modules.

## Out of scope (this goal)

- Real Agent Runtime / streaming production adapter
- Full settings system / account product
- Real Document/Browser/Review Work Surfaces
- Pixel-perfect entire desktop chrome beyond A/B/C

## Failure = not done

- Missing event types in replay (tool start/end, search folds, etc.)
- Wrong status copy or timing (stuck in 处理中, etc.)
- Final-state-only (no intermediate replay)
- Side-by-side visual/interaction mismatch for A, B, or C

## Done when

- [x] A: left rail structure (新对话 / utilities / 置顶 / 项目) + tests
- [x] B: launch pad layout + card clicks → stream
- [x] C: golden capture + fold + replay UI (处理中→已处理, tools, Markdown)
- [x] `pnpm --filter @uilab/agent-workbench test|typecheck|build` green

## Golden capture protocol (C)

1. Fix one **golden prompt** (document in capture notes).
2. Run once in Codex (CDP optional for screenshots).
3. Persist event stream JSON under e.g. `archetypes/agent-workbench/src/config/captures/` or `docs/evidence/...`.
4. Workbench loads capture and renders timeline without live Runtime.

## Execution order (recommended)

1. **Inventory** current Navigator / Task empty / ExecutionStream vs A/B/C.
2. **A** left rail structure (static + selection).
3. **B** empty hub + card click wiring (fixture).
4. **C** event model + capture schema + replay renderer (Markdown + tool rows + status chip).
5. Side-by-side evidence (screenshots / CDP).

## Related

- Prior shell: Phase 3 / 3A / 3B pane chrome + drawer
- Theme: Workbench-local light/dark tokens
- CDP: ChatGPT/Codex desktop via `--remote-debugging-port` for capture/compare
