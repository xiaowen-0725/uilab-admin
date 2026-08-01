# Organize Workbench as deep Modules

Agent Workbench Archetype 内部以 Workbench Session、Task、Work Surface 和 Project 等 Deep Module 组织产品能力，每个 Module 只从根部公开自己的 Interface；Shell 只依赖这些 Interface，Document、Browser、Review 等 Surface 通过 Work Surface Registry 在 Composition Root 注册，不由 Host 直接引用具体实现。外部依赖的 Port 由使用它的 Module 所有，具体 Adapter 集中装配，从而保持依赖方向、测试 Seam 和新增 Surface 的 Locality。
