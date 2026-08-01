import {
  Activity,
  CreditCard,
  DollarSign,
  Users,
} from "lucide-react"
import { Header } from "@/components/layout/header"
import { Main } from "@/components/layout/main"
import { PageHeaderActions } from "@/components/layout/page-header-actions"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

const stats = [
  {
    title: "总收入",
    value: "¥452,318",
    hint: "较上月 +20.1%",
    icon: DollarSign,
  },
  {
    title: "订阅数",
    value: "+2,350",
    hint: "较上月 +180.1%",
    icon: Users,
  },
  {
    title: "成交量",
    value: "+12,234",
    hint: "较上月 +19%",
    icon: CreditCard,
  },
  {
    title: "当前活跃",
    value: "+573",
    hint: "过去一小时 +201",
    icon: Activity,
  },
]

const recentSales = [
  { name: "张三", email: "zhangsan@example.com", amount: "+¥1,999" },
  { name: "李四", email: "lisi@example.com", amount: "+¥399" },
  { name: "王五", email: "wangwu@example.com", amount: "+¥2,999" },
  { name: "赵六", email: "zhaoliu@example.com", amount: "+¥99" },
  { name: "钱七", email: "qianqi@example.com", amount: "+¥499" },
]

export function Dashboard() {
  return (
    <>
      <Header>
        <div className="me-auto font-medium">仪表盘</div>
        <PageHeaderActions />
      </Header>
      <Main>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">工作台</h1>
            <p className="text-muted-foreground">
              通用中后台模板的概览页，可替换为真实业务指标。
            </p>
          </div>
        </div>

        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList>
            <TabsTrigger value="overview">概览</TabsTrigger>
            <TabsTrigger value="analytics">分析</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {stats.map((item) => (
                <Card key={item.title}>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">
                      {item.title}
                    </CardTitle>
                    <item.icon className="size-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{item.value}</div>
                    <p className="text-xs text-muted-foreground">{item.hint}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="grid gap-4 lg:grid-cols-7">
              <Card className="lg:col-span-4">
                <CardHeader>
                  <CardTitle>业务趋势</CardTitle>
                  <CardDescription>
                    这里可换成真实图表组件（如 recharts）。
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex h-[260px] items-end gap-2 rounded-lg border border-dashed p-4">
                    {[40, 65, 48, 80, 56, 90, 70, 88, 62, 75, 95, 68].map(
                      (height, index) => (
                        <div
                          key={index}
                          className="flex-1 rounded-t-md bg-primary/80"
                          style={{ height: `${height}%` }}
                        />
                      )
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card className="lg:col-span-3">
                <CardHeader>
                  <CardTitle>最近成交</CardTitle>
                  <CardDescription>本月完成 265 笔交易</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {recentSales.map((sale) => (
                    <div
                      key={sale.email}
                      className="flex items-center justify-between gap-4"
                    >
                      <div className="min-w-0 space-y-1">
                        <p className="truncate text-sm font-medium leading-none">
                          {sale.name}
                        </p>
                        <p className="truncate text-sm text-muted-foreground">
                          {sale.email}
                        </p>
                      </div>
                      <div className="font-medium">{sale.amount}</div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="analytics">
            <Card>
              <CardHeader>
                <CardTitle>分析面板</CardTitle>
                <CardDescription>
                  预留扩展位：可接入漏斗、留存、渠道等分析模块。
                </CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                第一期仅提供模式页骨架，不绑定具体业务数据源。
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </Main>
    </>
  )
}
