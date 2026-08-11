# Capability Surface 黄金路径跑法（真实模型 · 非 Fake）

**Spec:** [workbench-capability-surface-acceptance.md](./workbench-capability-surface-acceptance.md) §G
**原则:** 验收与 E2E **必须**走本地 VoltAgent 侧车 + **真实模型密钥**；**禁止**用 Deterministic Fake 顶替 G.5 工具行证明。

## 0. 前置

| 项 | 要求 |
| --- | --- |
| 模型 | 侧车 `.env` 配置 `DEEPSEEK_API_KEY` 或 `OPENAI_API_KEY`（见 `tooling/workbench-runtime-voltagent/.env.example`） |
| Profile | `AGENT_PROFILE=office` |
| 飞书 plugin | `PLUGINS_ENABLED=cli.feishu`（可叠加其它默认） |
| CLI | 本机 `lark-cli`（建议 `@larksuite/cli@1.0.85`）或 `FEISHU_CLI_PATH` |
| Workbench | `VITE_RUNTIME_ADAPTER=voltagent`（**不是**默认 fake） |

## 1. 启动

```bash
# 终端 A — 侧车（真实模型）
cd tooling/workbench-runtime-voltagent
# 确保 .env 有密钥
AGENT_PROFILE=office \
PLUGINS_ENABLED=cli.feishu \
pnpm dev

# 终端 B — Workbench
cd ../..
VITE_RUNTIME_ADAPTER=voltagent \
pnpm dev:workbench
```

## 2. 自动化探针（侧车 HTTP · 真实模型 stream）

```bash
# 仅 snapshot / selection / startAuth（不强制 stream 工具）
SKIP_STREAM=1 node tooling/workbench-runtime-voltagent/scripts/capability-surface-golden-path.mjs

# 含真实模型 stream；未提供文档时要求
# execute_command(command="lark-cli", args=["skills","list"])：
node tooling/workbench-runtime-voltagent/scripts/capability-surface-golden-path.mjs

# 若要额外验收真实文档读取：
FEISHU_DOC_ID='<文档 URL 或 token>' \
node tooling/workbench-runtime-voltagent/scripts/capability-surface-golden-path.mjs
```

脚本**不**启动 Fake；连不上侧车或无密钥 stream 失败会记 FAIL。
G.5 只认结构化 SSE 中的 `execute_command` 与精确 `command/args`；成功
tool-result 或正确的 Host approval pause 可证明调用路径，prompt/system/schema 回显不算。

## 3. UI 黄金路径（人工 / 浏览器）

1. 打开 Workbench（voltagent 模式），新建对话。
2. Composer「+」→ **连接器 / 技能 / 专家** 三组可见。
3. 飞书未登录 →「去登录」→ 浏览器 CLI 授权页；完成后「我已登录」。
4. 选用飞书 + `会议纪要专家`；芯片可见。
5. 发送需要读飞书文档的 Turn → Timeline 出现 `execute_command` 审批，目标为精确的原生 `lark-cli` argv。
6. 点击「允许一次」后出现成功 tool-result；取消飞书选用后重复，命令能力缺席或失败可解释。
7. 文案/日志**不得**把 CLI 成功写成宿主 OAuth 注入；Renderer 无 token。

## 4. Fake 边界（回归用，不算 §G 通过）

`VITE_RUNTIME_ADAPTER=fake` 仅验证：目录可见、选用芯片、**拒绝**假登录成功。
**不得**用 Fake 勾选 G.5。

## 5. 结果记录

填 [workbench-capability-surface-acceptance.md](./workbench-capability-surface-acceptance.md) §7，附：

- 分支 / commit
- `lark-cli --version`
- 模型 id（`VOLTAGENT_MODEL`）
- 探针脚本输出与 Timeline 截图/日志（无 secret）
