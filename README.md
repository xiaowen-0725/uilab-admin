# UI Lab Admin

AI-first 通用中后台项目模板。

基于 [shadcn-admin](https://github.com/satnaing/shadcn-admin) 二创：保留成熟 admin shell / 页面模式 / data-table 交互，改用官方 shadcn **Base UI**，并补齐中文优先与 AI 装配约定。

## 快速开始

```bash
pnpm install
pnpm dev
```

```bash
pnpm typecheck
pnpm build
```

## 技术栈

- Vite + React 19 + TypeScript
- Tailwind CSS 4
- 官方 shadcn/ui（Base UI / `base-nova`）
- TanStack Router / Query / Table
- 中文优先文案，代码标识英文

## 当前页面

- `/` 仪表盘
- `/tasks` 数据列表（完整 faceted filter / toolbar）
- `/settings/*` 设置
- `/sign-in` `/sign-up` 等认证页
- 错误页

## 目录约定

```text
src/
  components/
    layout/        # App shell
    data-table/    # 表格模式
    ui/            # shadcn Base UI
  features/        # 业务页面（厚）
  routes/          # 文件路由（薄）
  context/         # theme / layout / direction / search
  config/          # 项目默认布局等
docs/ai/           # AI 合同与 pattern 文档
skill/uilab-admin/ # Agent skill 入口
```

## 布局差异怎么做

1. 在页面 Theme Settings 试布局
2. 导出 JSON / defaults 代码 / Agent 提示词
3. 写入 `src/config/admin-preferences.ts` 作为项目默认

运行时个人偏好仍走 cookie；项目默认用于“应用 A / 应用 B 不同默认壳”。

## AI-first

本仓库面向 Agent 装配：

- 硬规则：[AGENTS.md](AGENTS.md)
- 地图与模式：[docs/ai/](docs/ai/)
- Skill：`skill/uilab-admin`

典型能力：

- 发现 pattern / 落点
- 按 `data-table-list` / `settings-section` / `auth-page` scaffold
- 改 shell 默认与导航
- review 门禁

## 与 UI Lab 关系

独立仓库，弱连接。  
不绑定 UI Lab runtime / Create / Design Package 主链路；后续若接视觉，只作为可选增强。

## License

基于 shadcn-admin（MIT）二创，见 `LICENSE`。
