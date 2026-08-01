# Keep Foundation minimal and proven

Foundation 只接纳不依赖任何 Application Archetype、并被至少两个 Archetype 以相同语义复用的 Module；首轮迁移仅预置明显中立的 Base UI、设计 tokens、主题能力与纯工具，不将当前 Admin Kernel 整包提升为公共层。Admin 的 layout、data-table 以及尚未验证共有语义的 Router、Query、搜索等能力先留在各自 Archetype，代价是允许短期重复，以避免 Foundation 退化为难以演进的 `shared/common` 杂物层。
