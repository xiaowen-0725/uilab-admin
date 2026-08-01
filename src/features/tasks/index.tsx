import { Header } from "@/components/layout/header"
import { Main } from "@/components/layout/main"
import { PageHeaderActions } from "@/components/layout/page-header-actions"
import { Button } from "@/components/ui/button"
import { TasksTable } from "./components/tasks-table"
import { tasks } from "./data/tasks"

export function Tasks() {
  return (
    <>
      <Header fixed>
        <div className="me-auto font-medium">数据列表</div>
        <PageHeaderActions />
      </Header>
      <Main className="flex flex-1 flex-col gap-4 sm:gap-6">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">任务列表</h2>
            <p className="text-muted-foreground">
              基于 TanStack Table 的通用列表模式，可替换数据源与列定义。
            </p>
          </div>
          <Button>新建任务</Button>
        </div>
        <TasksTable data={tasks} />
      </Main>
    </>
  )
}
