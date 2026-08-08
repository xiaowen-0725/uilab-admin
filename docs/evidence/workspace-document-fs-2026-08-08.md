# 真工作区 DocumentContent（Phase A–D）

## 行为

| 模式 | DocumentContent 实现 |
| --- | --- |
| `VITE_RUNTIME_ADAPTER=fake`（默认 / 测试） | `createMemoryDocumentContent`；可选 **FS Access 绑定本地文件夹** 覆盖 |
| `VITE_RUNTIME_ADAPTER=voltagent` | `createHttpWorkspaceDocumentContent` → sidecar `GET /workspace/file`（**不**用本地文件夹绑定） |

**不降级 Memory**：voltagent 模式下侧车不可达 → `read-failed` + 中文「工作区侧车未连接」。

## 侧车

- `tooling/workbench-runtime-voltagent/src/workspace-file-api.ts` — 路径规范化 + `resolveExistingPathWithinRoot`
- `server.ts` `configureApp` 注册 `/workspace/file`、`/workspace/info`
- 测：`workspace-file-api.test.ts`（读成功 / 越界 / 缺失 / 过大 / 符号链接）

## 前端

- `adapters/http-workspace-document-content.ts` + 单测（mock fetch）
- Composition：默认 Port 按 adapter 选择；Fake 可切换 FS Access
- Phase C：`coerceWorkspaceResourceKey` 统一 Timeline/tool 主机绝对路径 → 工作区相对 key
- Phase C：`DocumentPanel` 优先展示 Port `message`（侧车失败细节）
- Phase C：voltagent 启动时 `fetchWorkspaceHint`（`GET /workspace/info`）→ Document 头「工作区：…」
- Phase D：`createFsAccessDocumentContent` + `pickWorkspaceDirectory`（Chromium `showDirectoryPicker`）
- Phase D：Work 空态「绑定本地文件夹 / 恢复演示文档」；**非** Electron/Tauri 桌面宿主

## 路径

与 Agent tool 一致：相对路径或 host 绝对路径中的 `/output|/notes|/skills` 段；禁 `..`；根外 403。

## Phase C 验收点

1. Timeline/tool 路径含 `/…/output/x.md` → open 的 `resourceKey` 为 `output/x.md`
2. 侧车 down → Document 状态区显示「工作区侧车未连接…」而非笼统「渲染失败」
3. 侧车 up → Document 标题下可选显示 `工作区：<workspaceRoot>`
4. Fake 模式无 hint、仍用 Memory fixtures

## Phase D 验收点

1. Chromium 下 Fake 空工作面可「绑定本地文件夹」→ 后续 Document 从该 DirectoryHandle 读
2. 绑定后 Document 头 hint：`本地文件夹 · <name>`
3. 「恢复演示文档」→ 回到 Memory fixtures
4. voltagent **不**提供本地文件夹绑定（文案说明侧车 WORKSPACE_ROOT）
5. 无 Node/Electron 进 renderer；不支持 picker 的浏览器显示诚实说明
