# CLI Contract — `uilab-admin`

命令名：**`uilab-admin`**  
定位：确定性装配引擎。Skill 负责判断与编排，CLI 负责准确落盘。

> 状态：本文是合同与目标 UX。实现可分阶段；未实现的命令要在 `--help` 与文档中标 planned，禁止 skill 假装已执行成功。

## 设计原则

1. 只服务“从本模板派生 + 在本模板规范内扩展”
2. 默认非交互可脚本化；需要确认的信息由 Skill 先收齐再传 flag
3. 能 JSON 输出的命令提供 `--json`
4. 路径、文件集合、注册项必须完整，失败要非 0 退出码
5. 不绑定 UI Lab runtime

## 命令地图

### 已规划（第一期最小集）

#### 1. `uilab-admin init <app-name>`

从当前模板（或指定模板路径/版本）创建新应用目录。

```bash
uilab-admin init my-agent \
  --scenario agent-desktop \
  --dir ./apps \
  --package-manager pnpm
```

行为目标：

1. 复制模板内核到 `<dir>/<app-name>`
2. 替换 package name / 标题等基础标识
3. apply scenario pack
4. 写 `APP_BRIEF.md`
5. 写/保留 `desktop/README.md`（L2）
6. 打印 next steps

关键 flag：

| flag | 说明 |
|---|---|
| `--scenario <id>` | 必填（或由交互选择；Agent 场景应显式传） |
| `--dir <path>` | 父目录，默认 `.` |
| `--force` | 允许非空目录（谨慎） |
| `--dry-run` | 只打印计划 |
| `--json` | 机器输出 |

#### 2. `uilab-admin apply-scenario <id>`

对**已存在**的派生仓库套 scenario（兼容手动 clone/fork）。

```bash
uilab-admin apply-scenario agent-desktop --dir .
```

#### 3. `uilab-admin add <pattern>`

在现有应用内按 pattern 落文件。

```bash
# 列表
uilab-admin add data-table-list --domain orders --title 订单列表

# 设置分段
uilab-admin add settings-section --section billing --title 账单

# 认证页（可选）
uilab-admin add auth-page --flow sign-in
```

必须同时处理：

- feature 文件
- route 文件
- sidebar / settings nav 注册（可加 `--no-nav` 跳过）

#### 4. `uilab-admin set-shell`

```bash
uilab-admin set-shell \
  --theme system \
  --sidebar inset \
  --layout default \
  --direction ltr
```

写入 `src/config/admin-preferences.ts`（及必要 provider defaults）。

#### 5. `uilab-admin check`

```bash
uilab-admin check
uilab-admin check --json
```

最小检查应对齐/复用：

- 模板内 `pnpm check:ai` 合同
- 必要文件存在
- 无 `@radix-ui/*` 依赖回潮
- scenario/pattern 引用可解析

### 后置（不做进第一期最小集）

- `adopt` 任意老项目
- `add` 从 OpenAPI 生成完整 CRUD
- desktop host 打包命令（`electron:dev` 等可后挂，但不冒充第一期核心）

## 退出码

| code | 含义 |
|---|---|
| 0 | 成功 |
| 1 | 通用失败 / 校验失败 |
| 2 | 参数错误 |
| 3 | 目标路径冲突 |
| 4 | scenario/pattern 不存在 |

## Skill 调用约定

Skill 在 bootstrap/extend 中应：

1. 先判断模式
2. 收齐参数（scenario/domain/title...）
3. 宣布将执行的 CLI 命令
4. 执行后读 stdout + 检查 git diff / 文件是否真实存在
5. 再跑 `check` / typecheck / build

禁止：

- CLI 未实现时报告“已 init 成功”
- 跳过 nav 注册却声称页面完成
- 用自然语言“大约创建”替代 CLI 文件集合

## 实现分期建议

### Phase CLI-0（文档/合同）
- 本文件 + scenarios catalog
- skill 路由认识 bootstrap/extend

### Phase CLI-1（最小可用）
- `check`（可先包装 `node scripts/check-ai.mjs`）
- `add data-table-list|settings-section`
- `set-shell`

### Phase CLI-2（0→1）
- `init`
- `apply-scenario`
- APP_BRIEF / desktop README 生成

### Phase CLI-3
- auth-page add
- JSON 稳定 schema
- desktop host 插件位

## 包形态（建议）

- 仓库内：`packages/cli` 或 `cli/`
- bin 名：`uilab-admin`
- 本地开发：`pnpm uilab-admin` / `node cli/dist/index.js`
- 发布：后置；第一期可仅 repo-local
