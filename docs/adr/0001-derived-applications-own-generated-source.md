# Derived applications own generated source

Agent Workbench Template 采用“复制并拥有源码”的复用契约：模板负责提供初始化时的高质量起点，Derived Application 创建后可独立修改，不承诺自动跟随模板升级，也不以共享 UI package 作为默认前提。只有当多个真实 Archetype 证明某个 seam 稳定且具有复用价值时，才将对应能力提取为 package 或升级工具；这保留了产品定制自由，也避免过早设计浅层共享接口，代价是模板改进不会自动进入既有应用。
