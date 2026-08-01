# Scope initial Work Surfaces

首版 Work Surface Host 实际交付 Document Surface、Browser Surface 与 Review Surface，并把 Resource Explorer 作为 Document/Review 的辅助面板。Document Surface 是由格式 Renderer 组成的工作面家族，覆盖文本、代码、Markdown、DOCX、PDF 与只读 XLSX；HTML 源码由 Document Surface 查看，渲染与交互由 Browser Surface 承载。XLSX 只有在需要单元格编辑、公式、筛选和 Sheet 管理时才分化为 Spreadsheet Surface。Terminal Surface 与完整 Editor Surface 首版只保留注册 Interface，不实现进程、权限或编辑运行时，以优先验证任务、产物、浏览与审查之间的核心闭环，并推迟 Desktop Host 耦合。
