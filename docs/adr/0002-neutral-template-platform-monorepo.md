# Maintain archetypes in a neutral template platform monorepo

当前 `uilab-admin` 将渐进演化并重命名为中立的 Template Platform Monorepo，在同一源码治理空间内维护 Foundation、Admin Console 与 Agent Workbench 等平级 Application Archetype，以及统一的生成和验证工具；Derived Application 仍在仓库外通过复制源码创建并独立演进。迁移期间保持 Admin Console 可运行，避免一次性重写，同时用跨 Archetype 验证防止公共能力漂移。
