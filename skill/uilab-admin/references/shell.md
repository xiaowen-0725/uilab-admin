# Route: shell

调整壳层默认与导航信息架构。可改代码，但 **不要分叉 layout 组件**。

## 行动前

1. 读 `src/config/admin-preferences.ts`
2. 读 `src/components/layout/data/sidebar-data.ts`
3. 需要时看 Theme Settings / Config Drawer 的导出能力
4. 读 [map.md](../../../docs/ai/map.md) 的 App Config 段

## 两类改动

### A. 项目默认布局（应用 A / 应用 B 不同默认壳）

改：

- `src/config/admin-preferences.ts` 的 `adminPreferenceDefaults`
- 如有 provider 初始 default 常量，与之保持一致（theme / layout / direction / sidebar variant）

支持字段：

- `theme`: `system | light | dark`
- `sidebar`: `inset | floating | sidebar`
- `layout`: `default | compact | full`
- `direction`: `ltr | rtl`

来源建议：

1. 用户在 Theme Settings 里试好
2. 复制导出的 JSON / defaults 代码 / Agent 提示词
3. 写入 `adminPreferenceDefaults`

说明：

- **项目默认** = 新用户/清 cookie 后的起点
- **runtime cookie** = 个人临时偏好
- 不要为了换 inset/floating 去复制 `src/components/layout/*`

### B. 导航 IA

改：

- `src/components/layout/data/sidebar-data.ts`

规则：

- title 中文，url/标识英文
- 分组清晰（概览 / 业务 / 页面 / 其他）
- 删除页面时同步删 nav，避免死链
- 认证页可以挂在“页面”组方便预览，但真实未登录入口仍走 `(auth)` 路由

## 建议的 shell profile 命名（文档层，非强制代码枚举）

| profile | 倾向 |
|---|---|
| `console-default` | inset + default + system |
| `ops-dense` | sidebar + compact |
| `portal-light` | floating + default + light |
| `canvas-first` | full layout，内容优先 |

第一期只需用 preferences 表达，不必先做多 profile 运行时切换框架。

## 不要做

- 复制整套 layout 组件变成 `layout-compact/` 分叉
- 把业务页面塞进 layout 组件
- 为单个应用硬编码第二套 header/sidebar 原子层

## 完成输出

```md
## Shell

### 变更类型
- preferences / sidebar / both

### 新的项目默认
- theme/sidebar/layout/direction

### 导航变更
- ...

### 验收
- 页面可导航
- typecheck + build
```
