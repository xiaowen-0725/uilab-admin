# Widget SDK

宿主会把 agent 产出的 HTML 改写成不透明源 iframe，并注入 `widget` 全局对象。主体必须写成「被 SDK 调用」的形状。

## 时序

1. 宿主装入 srcdoc，注入 SDK 与主题 CSS 变量
2. SDK 与宿主完成桥握手（自动，不要自己监听 `message`）
3. **init 之后才执行你的主体**
4. 你画完后必须调用 `widget.ready()`
5. 之后数据与主题变化走回调，不要依赖 `DOMContentLoaded`

不要自己 `addEventListener('message')`。

## 方法

```text
widget.data                        // 当前作业产物；尚未取数时为 null
widget.onDataChange(handler)       // 数据更新；handler(data) 必须能接受 null
widget.ready()                     // 内容级就绪；board_widget_finish 校验必须出现
widget.resize()                    // 按内容高度通知宿主
widget.saveInput(key, value)       // 草稿；单 key ≤ 32 KiB，单 widget ≤ 16 key
widget.getInput(key)               // 读草稿；没有则 undefined
widget.submit(payload)             // 向宿主提交用户动作
widget.openLink(href)              // 打开外链；不要 window.open / location =
widget.theme                       // 'light' | 'dark'
widget.onThemeChange(handler)      // 主题切换
```

## 主题变量

宿主注入 `--widget-fg`、`--widget-bg`、`--widget-muted`、`--widget-border`。用这些变量，不要硬编码颜色。
