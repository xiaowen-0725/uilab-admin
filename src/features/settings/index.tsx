import { Link, Outlet, useLocation } from "@tanstack/react-router"
import { Header } from "@/components/layout/header"
import { Main } from "@/components/layout/main"
import { ThemeSwitch } from "@/components/theme-switch"
import { buttonVariants } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"

const sidebarNav = [
  { title: "个人资料", href: "/settings" },
  { title: "账户", href: "/settings/account" },
]

export function Settings() {
  const pathname = useLocation({ select: (location) => location.pathname })

  return (
    <>
      <Header fixed>
        <div className="me-auto font-medium">设置</div>
        <ThemeSwitch />
      </Header>
      <Main fixed>
        <div className="space-y-0.5">
          <h1 className="text-2xl font-bold tracking-tight">设置</h1>
          <p className="text-muted-foreground">
            管理个人资料、账户与偏好。示例表单不连接后端。
          </p>
        </div>
        <Separator className="my-6" />
        <div className="flex flex-1 flex-col gap-8 lg:flex-row lg:space-x-12 lg:space-y-0">
          <aside className="lg:w-1/5">
            <nav className="flex flex-wrap gap-2 lg:flex-col">
              {sidebarNav.map((item) => (
                <Link
                  key={item.href}
                  to={item.href}
                  className={cn(
                    buttonVariants({ variant: "ghost" }),
                    pathname === item.href
                      ? "bg-muted hover:bg-muted"
                      : "hover:bg-transparent hover:underline",
                    "justify-start"
                  )}
                >
                  {item.title}
                </Link>
              ))}
            </nav>
          </aside>
          <div className="flex-1 lg:max-w-2xl">
            <Outlet />
          </div>
        </div>
      </Main>
    </>
  )
}
