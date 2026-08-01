# Acceptance

## 任意改动

- [ ] `pnpm typecheck` 通过
- [ ] `pnpm build` 通过
- [ ] `pnpm check:ai` 通过
- [ ] 无新增 `@radix-ui/*` / `asChild` 回潮

## 新增页面

- [ ] feature 目录存在且承载实现
- [ ] route 文件存在且只做薄封装
- [ ] 需要导航时已更新 `sidebar-data.ts`
- [ ] 中文主文案可用
- [ ] 复用了对应 pattern（list/settings/auth）

## 列表页额外

- [ ] 使用 `components/data-table`
- [ ] 有 columns / table（或等价结构）
- [ ] 筛选/分页/空状态可用

## 布局改动

- [ ] 项目默认写入 `admin-preferences.ts` 或明确仅 runtime
- [ ] 未无故改 kernel layout 组件 API

## Review 结论词

- `Pass`：门禁通过
- `Block`：存在硬违规
- `Insufficient evidence`：信息不足，不能判 Pass
