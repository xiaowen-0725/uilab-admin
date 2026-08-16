# Board 原型（#121）

形态原型，**不接 Runtime、不落库、不接侧车**。实施期按生产约束重写，见地图 [#111](https://github.com/xiaowen-0725/uilab-admin/issues/111)。

## 跑起来

```bash
pnpm dev:workbench
# 打开 http://localhost:5174/prototype/board.html
```

顶部「原型开关」可切换：缩略图真渲染/静态降级、浅色/深色、会话内预览面板。右侧显示 widget 就绪耗时统计。

## 能试什么

| 目标 | 怎么试 |
|---|---|
| 拖拽移动 | 在看板详情页拖 widget 标题栏；虚线框是吸附后的落点 |
| 调尺寸 | 拖 widget 右下角的小握把 |
| 键盘布局 | Tab 到 widget，方向键移动，Shift+方向键调尺寸 |
| 单 widget 放大 | widget 头部「全屏」按钮，Esc 退出 |
| 取数刷新 | 有取数作业的 widget（汇率/资讯）点刷新，旧数据保留、chrome 变状态 |
| 无作业 widget | 番茄钟点刷新 = 重载沙箱文档（换 nonce） |
| 失败态 | 「我的工作台」里的「故障演示组件」 |
| 缩略图上限 | 列表页「我的工作台」有 5 个组件，缩略图只画 4 个 |

## 结构

```text
src/modules/board/
  model/            纯逻辑：网格数学、srcdoc + CSP 组装、SDK 源码
  ui/board-canvas/  唯一网格组件（详情页 / 会话内预览 / 列表页缩略图三处复用）
  ui/board-widget-host/  不透明源沙箱 + 宿主 chrome + 桥
  ui/board-*-page/  列表页 / 详情页 / 预览面板
  fixtures/         手写的示例 widget（按「Agent 生成的 widget 必须遵守的规则」写）
prototype/          本目录：独立入口 + 截图
```

## 截图

`screenshots/` 下是 1440×900 headless Chromium 的实际渲染：`list.png`、`detail.png`、`preview.png`、`detail-dark.png`。
