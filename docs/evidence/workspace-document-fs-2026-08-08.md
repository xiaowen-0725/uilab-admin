# 真工作区 DocumentContent（Phase A+B+C）

## 行为

| 模式 | DocumentContent 实现 |
| --- | --- |
| `VITE_RUNTIME_ADAPTER=fake`（默认 / 测试） | `createMemoryDocumentContent` |
| `VITE_RUNTIME_ADAPTER=voltagent` | `createHttpWorkspaceDocumentContent` → sidecar `GET /workspace/file` |

**不降级 Memory**：voltagent 模式下侧车不可达 → `read-failed` + 中文「工作区侧车未连接」。

## 侧车

- `tooling/workbench-runtime-voltagent/src/workspace-file-api.ts` — 路径规范化 + `resolveExistingPathWithinRoot`
- `server.ts` `configureApp` 注册 `/workspace/file`、`/workspace/info`
- 测：`workspace-file-api.test.ts`（读成功 / 越界 / 缺失 / 过大 / 符号链接）

## 前端

- `adapters/http-workspace-document-content.ts` + 单测（mock fetch）
- Composition：`createDocumentContentPort()` 按 adapter 选择
- Phase C：`coerceWorkspaceResourceKey` 统一 Timeline/tool 主机绝对路径 → 工作区相对 key
- Phase C：`DocumentPanel` 优先展示 Port `message`（侧车失败细节）
- Phase C：voltagent 启动时 `fetchWorkspaceHint`（`GET /workspace/info`）→ Document 头「工作区：…」

## 路径

与 Agent tool 一致：相对路径或 host 绝对路径中的 `/output|/notes|/skills` 段；禁 `..`；根外 403。

## Phase C 验收点

1. Timeline/tool 路径含 `/…/output/x.md` → open 的 `resourceKey` 为 `output/x.md`
2. 侧车 down → Document 状态区显示「工作区侧车未连接…」而非笼统「渲染失败」
3. 侧车 up → Document 标题下可选显示 `工作区：<workspaceRoot>`
4. Fake 模式无 hint、仍用 Memory fixtures
