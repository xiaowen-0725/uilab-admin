import { Link, useLocation } from "@tanstack/react-router"
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import type { NavGroup as NavGroupProps, NavItem, NavLink } from "./types"

export function NavGroup({ title, items }: NavGroupProps) {
  const href = useLocation({ select: (location) => location.pathname })

  return (
    <SidebarGroup>
      <SidebarGroupLabel>{title}</SidebarGroupLabel>
      <SidebarMenu>
        {items.map((item) => {
          if (item.items) {
            return item.items.map((subItem) => (
              <SidebarMenuLink
                key={`${item.title}-${subItem.title}`}
                item={subItem}
                href={href}
              />
            ))
          }

          return (
            <SidebarMenuLink
              key={`${item.title}-${item.url}`}
              item={item}
              href={href}
            />
          )
        })}
      </SidebarMenu>
    </SidebarGroup>
  )
}

function SidebarMenuLink({
  item,
  href,
}: {
  item: NavLink
  href: string
}) {
  const { setOpenMobile } = useSidebar()

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={checkIsActive(href, item)}
        tooltip={item.title}
        render={
          <Link to={item.url} onClick={() => setOpenMobile(false)}>
            {item.icon ? <item.icon /> : null}
            <span>{item.title}</span>
          </Link>
        }
      />
    </SidebarMenuItem>
  )
}

function checkIsActive(href: string, item: NavItem) {
  if ("url" in item && item.url) {
    return href === item.url || href.startsWith(`${item.url}/`)
  }

  return Boolean(item.items?.some((child) => child.url === href))
}
