# Adversarial multi-axis review — Office Profile

**Date:** 2026-08-06  
**Range:** `5cb0493^`…`HEAD` (through `cd3be8e` second-pass fixes)  
**Sources:**
- Local security subagent (completed)
- Local design/maintainability subagent (completed)
- Codex gpt-5.6-sol adversarial pass: **probes completed**, final markdown **blocked by content filter** (`flagged for possible cybersecurity risk`). Findings below synthesize local reviews + Codex probe logs.

---

## Verdict: **ship-with-nits** (conditional)

| Condition | Verdict |
| --- | --- |
| Ship **office** path (`AGENT_PROFILE=office`), MCP default off, local demo | **ship-with-nits** |
| Ship **default minimal** + untrusted workspace content, or enable live MCP without HITL proof | treat as **block** until P1s below closed |

Fake Runtime / RuntimePort contracts unchanged; `check:workbench` OK.

---

## Axis A — Adversarial security / correctness

### No confirmed P0 (after second-pass allowlist)

Exact read-only allowlist + default `needsApproval` closes the earlier compound-name bypass class for **unknown** names.

### P1

1. **minimal DIY FS is lexical-only (symlink follow)** — `tools.ts` uses `resolvePathWithinRoot` then bare `readFile`/`writeFile`.  
   **PoC sketch:** under `WORKSPACE_ROOT`, `ln -s /etc evil` then `read_file({path:"evil/passwd"})` (or write under symlink).  
   **Impact high because default profile is `minimal`.** Office path uses `NodeFilesystemBackend` `contained:true` (safer).  
   **Fix:** realpath / `assertCanonicalWithinRoot` on every DIY open.

2. **`applyMcpNeedsApproval` only proven on plain mocks** — mutates `.needsApproval` on objects; tests use `{name}` stubs, not real MCP SDK / `createTool` instances (may be frozen or copy-at-register).  
   **Fix:** wrap with framework-supported tool config; integration assert real mutator pauses HITL.

3. **Built-in free-name allowlist can still be fail-open if a server names a mutator exactly** (e.g. tool literally named `list` / `search`). Exact match is fail-closed for unknowns; free list is a residual trust surface.  
   **Fix:** empty built-in free set; only `MCP_READ_ONLY_TOOL_NAMES` env opt-out, or per-connector schema.

### P2

- **`VOLTAGENT_MEMORY_URL`** can point outside workspace (operator intent; document as high-trust).
- **LibSQL memory files under workspace** (`.voltagent/memory.db*`) are readable via Workspace FS tools if agent is tricked — Codex probe: WAL may contain conversation text (`containsSentinel:true` on `memory.db-wal` while main db did not). Treat as **privacy / agent self-read**, not host escape.
- Static honesty tool lists may diverge from live toolkit names.
- OPERATOR may still mention “名称启发式” in places while code is exact allowlist.

### What looks solid

- Bootstrap/skills/default memory symlink refuse + `wx` write-if-absent.
- MCP load: throw / empty tools → `failed`, local FS continues.
- Stdio child env connector-scoped; model API keys hard-denied (incl. pattern `*_API_KEY`).
- Compound mutators require approval (`get_and_set`, `mark_as_read`) per tests + Codex probe.
- Adapter empty capabilities fallback (no inventing DIY tools).
- Fake vs 本机侧车 honesty split.

---

## Axis B — Readability

- Clear O-slice file headers and pure env-injectable helpers → good testability.
- **Weak:** `create-agent.ts` office branch is a long composition script (bootstrap → MCP → long instruction blob → Agent).
- **Weak:** repeated `docs|calendar` mapping loops in `office-mcp.ts`.
- Static name lists harder to keep honest than live tool enumeration.

---

## Axis C — Maintainability

- Adding **skill #4**: cheap (`OFFICE_SKILL_IDS` + `bundled-skills/`).
- Adding **MCP connector #3**: Shotgun Surgery across `McpConnectorId`, secret maps, dual loops, docs — prefer connector registry.
- `VoltAgentRuntimeAdapter` remains a large class (stream + approval + path normalize).
- Duplicated `ProfileEnv` type in `model.ts` vs `profile.ts` (nit).

---

## Axis D — Design principles

| Principle | Assessment |
| --- | --- |
| Deep modules | Path confinement / MCP load-with-degrade / honesty copy are relatively deep |
| Fail-closed security | Office MCP/bootstrap good; **minimal DIY fails this** |
| Dependency direction | Renderer has no Node/`@voltagent`; secrets stay in sidecar — **good** |
| RuntimePort honesty | Empty tool fallback, Fake ≠ production — **good** |
| No speculative generality | Fixed 2 MCP + 3 skills — appropriate for template stage |
| Divergent Change | Static tool honesty lists vs live toolkit |

---

## Prior fix re-check (second-pass)

| Item | Status |
| --- | --- |
| Exact MCP allowlist / compound names | **fixed** (probe: `calendar_get_and_set_event` → needs approval) |
| LibSQL default path via `ensureDirWithinRoot` | **fixed** for default path |
| Model key hard-deny (GEMINI etc.) | **fixed** in code path |
| CI `pnpm typecheck` | **fixed** in `ci.yml` |
| Generic VoltAgent honesty copy | **fixed** in UI; docs largely aligned |

---

## Codex process note

Codex completed exploit-oriented probes and package verification (~16 min), then **refused to emit the final structured report** due to platform cybersecurity filtering. This document is the authoritative synthesis for the adversarial pass.

## Verification (observed)

- Sidecar tests/typecheck: green at last fix commit (54 tests)
- `pnpm check:workbench`: OK
- Codex socket-free probes: approval allowlist behavior; memory WAL readable under workspace FS

## Recommended follow-ups (priority)

1. Harden **minimal** DIY tools with canonical path checks (P1).
2. Prove MCP `needsApproval` on **real** Tool objects (P1).
3. Optional: empty default read-only allowlist; env-only free names (P1/P2 policy).
4. Registry for MCP connectors when adding a third connector (maintainability).
