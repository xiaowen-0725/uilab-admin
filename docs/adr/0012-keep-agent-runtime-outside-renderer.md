# Keep Agent Runtime outside the Renderer

Agent Workbench Renderer 负责 Workbench Session、流式事件投影、交互与布局恢复，但不承载 Agent 执行引擎。Agent Runtime 位于后端或 Desktop Host，通过 Task Module 所有的 Port 接入，并提供生产 Adapter 与测试 Fake；这让 Web Renderer 可独立运行，也避免进程、凭据、工具授权和宿主能力渗入 Shell 与 Surface Interface。
