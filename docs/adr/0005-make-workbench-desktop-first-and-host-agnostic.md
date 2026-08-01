# Make Workbench desktop-first and host-agnostic

Workbench Shell 以键盘、鼠标和宽屏多面板画布为首要验收目标，窄屏通过 Drawer 或 Overlay 做可用降级，而不是用 Mobile-first 约束核心布局；同时保持 Web Renderer 可直接运行，不把 Electron、Tauri 等 Desktop Host 能力写入 Shell Interface。原生能力以后通过 Adapter 接入，因此 Desktop-first 的交互设计可以独立于宿主技术演进。
