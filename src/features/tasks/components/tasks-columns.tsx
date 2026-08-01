import type { ColumnDef } from "@tanstack/react-table"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { labels, priorities, statuses } from "../data/data"
import type { Task } from "../data/schema"

export const tasksColumns: ColumnDef<Task>[] = [
  {
    id: "select",
    header: ({ table }) => (
      <Checkbox
        checked={table.getIsAllPageRowsSelected()}
        indeterminate={
          table.getIsSomePageRowsSelected() && !table.getIsAllPageRowsSelected()
        }
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="全选"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label="选择行"
      />
    ),
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: "id",
    header: "编号",
    cell: ({ row }) => (
      <div className="w-24 font-mono text-xs">{row.getValue("id")}</div>
    ),
  },
  {
    accessorKey: "title",
    header: "标题",
    cell: ({ row }) => {
      const label = labels.find((item) => item.value === row.original.label)

      return (
        <div className="flex min-w-0 items-center gap-2">
          {label ? <Badge variant="outline">{label.label}</Badge> : null}
          <span className="truncate font-medium">{row.getValue("title")}</span>
        </div>
      )
    },
  },
  {
    accessorKey: "status",
    header: "状态",
    cell: ({ row }) => {
      const status = statuses.find(
        (item) => item.value === row.getValue("status")
      )
      if (!status) return null
      return (
        <div className="flex items-center gap-2">
          <status.icon className="size-4 text-muted-foreground" />
          <span>{status.label}</span>
        </div>
      )
    },
    filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
  },
  {
    accessorKey: "priority",
    header: "优先级",
    cell: ({ row }) => {
      const priority = priorities.find(
        (item) => item.value === row.getValue("priority")
      )
      if (!priority) return null
      return (
        <div className="flex items-center gap-2">
          <priority.icon className="size-4 text-muted-foreground" />
          <span>{priority.label}</span>
        </div>
      )
    },
    filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
  },
]
