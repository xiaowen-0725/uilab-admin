# Evidence: A Expert instruction wiring + B UI walkthrough

**Date:** 2026-08-09

## A — Expert instruction → model input

### Code

- `TurnComposerContext.expert` may include `instruction?: string`
- Composer passes `selectedExpert.instruction` from snapshot
- `modelInputWithComposerContext` injects:

```text
本 Task 专家配置包：…(id)
专家指令（配置包 overlay，非子 Agent）：
<instruction>
```

- Fake expert catalog includes a short instruction for honesty/demo
- Adapter unit test asserts request body contains `专家指令` + instruction text

### Tests

```text
vitest voltagent-runtime-adapter -t 'composer|attachment|Code Review|专家'
→ 1 passed (expert/context path)

Note: full adapter file still has 1 pre-existing flake:
  respondToApproval resumes stream with approval-responded UIMessage
  (approval.requested missing) — unrelated to expert instruction change
```

## B — Ports + browser walkthrough

### Environment

| Process | Port | Notes |
| --- | --- | --- |
| Sidecar (new code) | **3141** | Old 3141 killed; canonical Vite proxy target |
| Workbench | **5177** | `VITE_RUNTIME_ADAPTER=voltagent` (5174 was unrelated design-demo) |

### Snapshot on 3141

- `primaryChannel: domain_cli`, `channelAuth` present, Feishu `connected: true`
- Experts `office-meeting` / `xhs-cover` with `instruction: true`

### UI (Chrome DevTools)

1. Open `http://localhost:5177/` → Agent Workbench
2. 新对话
3. Composer「+」→ Capability Surface
   - **连接器** 飞书：已连接（CLI）；诚实 CLI / 非宿主 OAuth 文案
   - **技能** meeting-notes / research-brief / weekly-report
   - **专家** 会议纪要 / 小红书封面；临时 catalog 说明
4. 选用飞书 + 会议纪要专家 → chips：`飞书`、`会议纪要专家`、`meeting-notes`
5. 状态：「已选用专家（仅后续 Turn 生效）」

Screenshot: `docs/evidence/capability-surface-ui-walkthrough-2026-08-09.png`

## Remaining (non-blocking)

- Optional: full UI send + Timeline tool row (HTTP G.5 already PASS earlier)
- Optional: fix unrelated approval resume test flake
- Pin lark-cli 1.0.85 vs installed 1.0.67
