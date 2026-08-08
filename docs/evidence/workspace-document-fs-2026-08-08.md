# 真工作区 DocumentContent（Phase A+B）

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

## 路径

与 Agent tool 一致：相对路径或 `/virtual` 前缀；禁 `..`；根外 403。
