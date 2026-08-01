# Route: discover

只读。用于回答“这个模板怎么用 / 新页面落哪 / 有哪些 pattern / 哪些示例可删”。

## 必读

1. [AGENTS.md](../../../AGENTS.md)
2. [docs/ai/map.md](../../../docs/ai/map.md)
3. [docs/ai/patterns.catalog.json](../../../docs/ai/patterns.catalog.json)
4. 相关 pattern 文档：
   - [data-table-list](../../../docs/ai/patterns/data-table-list.md)
   - [settings-section](../../../docs/ai/patterns/settings-section.md)
   - [auth-page](../../../docs/ai/patterns/auth-page.md)

## 做什么

- 定位真正的 app 根（含 `package.json`、`components.json`、`src/`）
- 说明四层模型与当前参考实现
- 根据用户目标推荐 **一个** pattern 与落点
- 指出可删示例与必须保留的 kernel/pattern

## 不做什么

- 不改代码
- 不发明第二套目录约定
- 不把 UI Lab Package / Create 流程塞进来

## 输出模板

```md
## Discover

### 目标理解
...

### 推荐 route / pattern
- next route: scaffold | shell | review
- pattern: data-table-list | settings-section | auth-page | none

### 建议落点
- feature: ...
- route: ...
- sidebar/settings nav: ...

### 可复用参考
- ...

### 可删示例（若开新应用）
- ...

### 风险 / 不要做
- ...
```

## 参考路径速查

| 需求 | 先看 |
|---|---|
| 列表 | `src/features/tasks` + `src/components/data-table` |
| 设置 | `src/features/settings/*` |
| 登录注册 | `src/features/auth/*` |
| 布局默认 | `src/config/admin-preferences.ts` |
| 导航 | `src/components/layout/data/sidebar-data.ts` |
| 主题设置导出 | `src/components/config-drawer*` / Theme Settings UI |
