# Use an Archetypes-first monorepo layout

Template Platform 采用 `archetypes/admin` 与 `archetypes/agent-workbench` 作为平级模板入口，跨 Archetype 且已经证明稳定的能力进入 `packages/foundation`，模板生成与质量门禁进入 `tooling`，Derived Application 继续位于平台仓库之外。迁移先将当前 Admin 等价搬入 `archetypes/admin` 并完成回归，再创建 Agent Workbench；不长期保留 Admin 在仓库根目录、其他 Archetype 位于子目录的混合结构，也不为方便复制而提前扩大 Foundation。
