# Use archetype-specific shells

Admin Console 与 Agent Workbench 各自拥有完整、平级的 Admin Shell 和 Workbench Shell，Foundation 只提供 Base UI、主题、动画与面板等共同 primitives，不提供通过大量配置兼容所有形态的 UniversalShell。这个 seam 保留两种核心交互模型的独立演进能力，避免把 Archetype 差异暴露成不断膨胀的 Shell Interface。
