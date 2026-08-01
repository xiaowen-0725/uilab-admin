import {
  LayoutDashboard,
  ListTodo,
  Settings,
  ShieldCheck,
  UserCog,
  Wrench,
} from "lucide-react"
import type { SidebarData } from "../types"

export const sidebarData: SidebarData = {
  user: {
    name: "演示用户",
    email: "demo@uilab.dev",
  },
  app: {
    name: "UI Lab Admin",
    plan: "通用中后台模板",
  },
  navGroups: [
    {
      title: "概览",
      items: [
        {
          title: "仪表盘",
          url: "/",
          icon: LayoutDashboard,
        },
        {
          title: "数据列表",
          url: "/tasks",
          icon: ListTodo,
        },
      ],
    },
    {
      title: "系统",
      items: [
        {
          title: "设置",
          icon: Settings,
          items: [
            {
              title: "个人资料",
              url: "/settings",
              icon: UserCog,
            },
            {
              title: "账户",
              url: "/settings/account",
              icon: Wrench,
            },
          ],
        },
        {
          title: "认证页",
          icon: ShieldCheck,
          items: [
            {
              title: "登录",
              url: "/sign-in",
            },
            {
              title: "注册",
              url: "/sign-up",
            },
          ],
        },
      ],
    },
  ],
}
