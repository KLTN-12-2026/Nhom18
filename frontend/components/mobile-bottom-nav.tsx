"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Home, Film, Ticket, User, Heart } from "lucide-react"
import { cn } from "@/lib/utils"
import { useAuth } from "@/lib/auth"
import { useHiddenItems } from "@/lib/admin-menu-prefs"

const navItems = [
  {
    name: "Trang chủ",
    href: "/",
    icon: Home,
  },
  {
    name: "Phim",
    href: "/movies",
    icon: Film,
  },
  {
    name: "Yêu thích",
    href: "/favorites",
    icon: Heart,
    requireAuth: true,
  },
  {
    name: "Vé của tôi",
    href: "/bookings",
    icon: Ticket,
    requireAuth: true,
  },
  {
    name: "Tài khoản",
    href: "/profile",
    icon: User,
    requireAuth: true,
  },
]

export function MobileBottomNav() {
  const pathname = usePathname()
  const { user } = useAuth()
  const hiddenItems = useHiddenItems()
  const visibleNavItems = navItems.filter((item) => item.href !== "/favorites" || !hiddenItems.includes("feature:favorites"))

  // Don't show on admin pages or auth pages
  if (pathname?.startsWith("/admin") || pathname === "/login" || pathname === "/register") {
    return null
  }

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border">
      <div className="grid h-16" style={{ gridTemplateColumns: `repeat(${visibleNavItems.length}, 1fr)` }}>
        {visibleNavItems.map((item) => {
          // If item requires auth and user is not logged in, show login instead
          const href = item.requireAuth && !user ? "/login" : item.href
          const isActive = pathname === item.href
          const Icon = item.icon

          return (
            <Link
              key={item.name}
              href={href}
              className={cn(
                "flex flex-col items-center justify-center gap-1 transition-colors",
                isActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="h-5 w-5" />
              <span className="text-xs font-medium">{item.name}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
