# Work Surface Document+Browser — A1–A10 evidence (2026-08-08)

| ID | Evidence |
| --- | --- |
| A1 | `surface-registry.test.ts`, `host-boundary.test.ts`, Host gate in `check:workbench` |
| A2 | `workbench-session/reducer.test.ts` openTabs/dedup; Host unknown fallback test |
| A3 | `work-surface-user-open.test.tsx` Timeline → open pane + document |
| A4 | `work-surface-runtime-open.test.tsx` open_requested; `file.changed` empty tabs; controller listener test |
| A5 | `open-work-surface-intent.test.ts` path/URL/kind reject; illegal Fake scenario |
| A6 | `document-panel.test.tsx` text/md/code/image/pdf/docx/xlsx + states |
| A7 | `heavy-lazy.ts` + mammoth/xlsx dynamic import; `docs/evidence/work-surface-heavy-libs-2026-08-08.md` |
| A8 | `browser-panel.test.tsx` open/unsupported/timeout/external; Host key remount |
| A9 | Browser honesty copy; AGENTS non-goals; no CDP/Computer Use claims as shipped |
| A10 | `pnpm --filter @uilab/agent-workbench typecheck` + `test` (248) + `pnpm check:workbench` green |

Codex adversarial review: initial **block**, hard findings fixed; residual nits deferred.
