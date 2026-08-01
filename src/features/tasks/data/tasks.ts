import type { Task } from "./schema"

export const tasks: Task[] = [
  {
    id: "TASK-1001",
    title: "修复侧边栏折叠后的焦点回跳",
    status: "in-progress",
    priority: "high",
    label: "bug",
  },
  {
    id: "TASK-1002",
    title: "补充设置页表单校验提示",
    status: "todo",
    priority: "medium",
    label: "feature",
  },
  {
    id: "TASK-1003",
    title: "完善数据表空状态文案",
    status: "done",
    priority: "low",
    label: "documentation",
  },
  {
    id: "TASK-1004",
    title: "登录页增加演示账号提示",
    status: "todo",
    priority: "medium",
    label: "feature",
  },
  {
    id: "TASK-1005",
    title: "表格支持按优先级筛选",
    status: "in-progress",
    priority: "high",
    label: "feature",
  },
  {
    id: "TASK-1006",
    title: "移除过时的示例依赖说明",
    status: "canceled",
    priority: "low",
    label: "documentation",
  },
  {
    id: "TASK-1007",
    title: "统一中文界面文案风格",
    status: "done",
    priority: "medium",
    label: "documentation",
  },
  {
    id: "TASK-1008",
    title: "适配移动端顶栏按钮间距",
    status: "todo",
    priority: "high",
    label: "bug",
  },
]
