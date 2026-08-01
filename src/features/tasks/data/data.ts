import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  CheckCircle2,
  Circle,
  CircleHelp,
  Timer,
  XCircle,
} from "lucide-react"

export const labels = [
  { value: "bug", label: "缺陷" },
  { value: "feature", label: "功能" },
  { value: "documentation", label: "文档" },
]

export const statuses = [
  { value: "todo", label: "待办", icon: Circle },
  { value: "in-progress", label: "进行中", icon: Timer },
  { value: "done", label: "已完成", icon: CheckCircle2 },
  { value: "canceled", label: "已取消", icon: XCircle },
]

export const priorities = [
  { value: "low", label: "低", icon: ArrowDown },
  { value: "medium", label: "中", icon: ArrowRight },
  { value: "high", label: "高", icon: ArrowUp },
]

export const statusHelp = {
  icon: CircleHelp,
}
