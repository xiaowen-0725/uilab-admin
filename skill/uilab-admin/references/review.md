# Route: review

只读门禁。不改代码。

## 必读

- [AGENTS.md](../../../AGENTS.md)
- [docs/ai/do-not.md](../../../archetypes/admin/docs/ai/do-not.md)
- [docs/ai/acceptance.md](../../../archetypes/admin/docs/ai/acceptance.md)
- 若审查某 pattern，再读对应 pattern 文档

## 检查清单

### 结构

- [ ] 新页面是否具备 feature + route
- [ ] 需要导航时是否注册 sidebar / settings nav
- [ ] route 是否保持薄封装

### Pattern

- [ ] 列表是否用 `components/data-table` 而非裸 Select 主筛选
- [ ] 设置是否复用 ContentSection + sidebar-nav
- [ ] 认证是否在 `(auth)` 而不是 `_authenticated`

### Base UI / 依赖

- [ ] 无新增 `@radix-ui/*`
- [ ] 无 `asChild` 回潮
- [ ] 未平行造第二套 button/input/table

### 文案与示例

- [ ] 用户可见主路径中文
- [ ] sample mock 可识别为可替换，不是伪业务真源

### 命令

在可执行环境下尽量跑：

```bash
pnpm typecheck
pnpm build
pnpm uilab-admin check   # 或 pnpm check:ai
```

若环境不允许，结论必须是 `Insufficient evidence` 或明确列出未验证项。

## 结论词（只能三选一）

- `Pass`：未发现硬违规，关键门禁通过
- `Block`：存在硬违规（回潮 Radix、缺 route、列表退化等）
- `Insufficient evidence`：信息不足，不能判 Pass

注意：`Pass` ≠ 用户产品批准，也不等于视觉完美。

## 输出模板

```md
## Review

### Scope
...

### Findings
- [Block|Warn|Info] ...

### Commands
- pnpm typecheck: ...
- pnpm build: ...

### Verdict
Pass | Block | Insufficient evidence
```
