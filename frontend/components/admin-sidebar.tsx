"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useAuth } from "@/lib/auth"
import { getHiddenMenuItems, onMenuPrefsChanged } from "@/lib/admin-menu-prefs"
import { Film, BarChart3, Menu, X, Ticket, Home, Sparkles, Building2, Clock, Users, Settings, Bot, Tag, LayoutGrid, MessageSquareText, Gift, Popcorn, Wallet } from "lucide-react"

// `adminOnly: true` = mục mà backend chỉ cho vai trò admin (requireAdmin).
// Quản lý chi nhánh bấm vào sẽ chỉ nhận 403 / trang trắng, nên ẩn hẳn đi thay
// vì để họ thấy một bảng quản trị y hệt admin rồi bấm đâu cũng bị chặn.
// LƯU Ý: đây chỉ là lớp hiển thị cho gọn — chốt chặn thật nằm ở backend
// (requireAdmin), ẩn menu KHÔNG phải là biện pháp bảo mật.
const navigation = [
  // "Tổng quan" thay vì "Trang chủ": ngay phía trên đã có nút "Về trang chính"
  // (dẫn ra website cho khách), hai mục cùng nghĩa "trang chủ" đứng cạnh nhau
  // rất dễ bấm nhầm. Trang này thực chất là bảng số liệu tổng hợp (doanh thu,
  // biểu đồ, hoạt động gần đây) nên "Tổng quan" mô tả đúng nội dung hơn.
  { name: "Tổng quan", href: "/admin", icon: BarChart3 },
  {
    name: "Nội dung & Lịch chiếu",
    items: [
      { name: "Danh sách phim", href: "/admin/movies", icon: Film },
      { name: "Quản lý rạp chiếu", href: "/admin/cinemas", icon: Building2 },
      { name: "Quản lý phòng chiếu", href: "/admin/rooms", icon: LayoutGrid, adminOnly: true },
      { name: "Quản lý suất chiếu", href: "/admin/showtimes", icon: Clock },
      { name: "🤖 Tự động tạo lịch chiếu", href: "/admin/auto-generate-showtimes", icon: Sparkles, adminOnly: true },
    ],
  },
  {
    name: "Khuyến mãi",
    items: [
      { name: "Mã giảm giá", href: "/admin/vouchers", icon: Tag, adminOnly: true },
      { name: "Điểm thưởng", href: "/admin/points", icon: Gift, adminOnly: true },
    ],
  },
  {
    name: "Người dùng & Tương tác",
    items: [
      { name: "Người dùng", href: "/admin/users", icon: Users, adminOnly: true },
      { name: "Quản lý đặt vé", href: "/admin/bookings", icon: Ticket },
      // Sổ hoàn tiền: quản lý chi nhánh XEM được (sổ của rạp mình) và đề nghị
      // hoàn, nhưng nút Duyệt chỉ hiện với admin — nên KHÔNG đặt adminOnly,
      // ẩn hẳn mục này sẽ khiến chi nhánh không theo dõi được tiền của khách.
      { name: "Sổ hoàn tiền", href: "/admin/refunds", icon: Wallet },
      // Kho bắp nước tính RIÊNG từng rạp nên quản lý chi nhánh cũng vào được
      // (họ đứng quầy, họ biết còn bao nhiêu hàng) — không đặt adminOnly.
      { name: "Bắp nước & kho", href: "/admin/combos", icon: Popcorn },
      // Đánh giá gắn với phim (dùng chung cả chuỗi), không gắn với rạp → chỉ admin
      { name: "Kiểm duyệt đánh giá", href: "/admin/reviews", icon: MessageSquareText, adminOnly: true },
    ],
  },
  { name: "Báo cáo thống kê", href: "/admin/reports", icon: BarChart3 },
  // Thống kê chatbot là dữ liệu toàn hệ thống, không tách được theo rạp → chỉ admin
  { name: "Xu hướng Chatbot AI", href: "/admin/chatbot", icon: Bot, adminOnly: true },
  { name: "Cài đặt hệ thống", href: "/admin/settings", icon: Settings, adminOnly: true },
]

export function AdminSidebar() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [hiddenItems, setHiddenItems] = useState<string[]>([])
  const pathname = usePathname()
  const { user } = useAuth()
  const isAdmin = Boolean(user?.is_admin)

  const refreshHidden = useCallback(() => setHiddenItems(getHiddenMenuItems()), [])

  useEffect(() => {
    refreshHidden()
    return onMenuPrefsChanged(refreshHidden)
  }, [refreshHidden])

  // Lọc 2 lớp: (1) theo VAI TRÒ — quản lý chi nhánh không thấy mục chỉ dành
  // cho admin; (2) theo tuỳ chọn ẩn/hiện mà admin tự đặt trong Cài đặt.
  const allowed = (item: any) => (item.adminOnly ? isAdmin : true)
  const visibleNavigation = navigation
    .filter(allowed)
    .map((item: any) =>
      item.items
        ? { ...item, items: item.items.filter((sub: any) => allowed(sub) && !hiddenItems.includes(sub.href)) }
        : item
    )
    .filter((item: any) => (item.items ? item.items.length > 0 : !hiddenItems.includes(item.href)))

  return (
    <>
      {/* Mobile menu button */}
      <div className="lg:hidden fixed top-4 left-4 z-50">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="bg-background border border-border"
          aria-label={isMobileMenuOpen ? "Đóng menu" : "Mở menu"}
        >
          {isMobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
        </Button>
      </div>

      {/* Sidebar */}
      <div
        className={cn(
          "fixed inset-y-0 left-0 z-40 w-64 bg-card border-r border-border transform transition-transform duration-200 ease-in-out lg:translate-x-0 lg:sticky lg:top-0 lg:h-screen lg:overflow-y-auto",
          isMobileMenuOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center gap-3 p-6 border-b border-border">
            <div className="relative bg-[#0d1521] rounded-lg p-1 ring-1 ring-white/10 shadow-md shadow-black/30">
              <Image src="/logo-icon.png" alt="CinemaGold" width={28} height={28} className="h-7 w-7 object-contain" />
            </div>
            <div>
              <h1 className="text-lg font-bold bg-gradient-to-r from-amber-600 via-yellow-600 to-amber-600 bg-clip-text text-transparent">
                CinemaGold
              </h1>
              <p className="text-xs text-amber-600 font-semibold">{isAdmin ? "Bảng Quản Trị" : "Quản lý chi nhánh"}</p>
              {/* Quản lý phải thấy rõ mình phụ trách rạp nào — nếu không, bảng
                  quản trị trông y hệt của admin. */}
              {!isAdmin && user?.cinema_name && (
                <p className="text-[11px] text-muted-foreground leading-tight">{user.cinema_name}</p>
              )}
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-4 space-y-2">
            <Button variant="ghost" size="sm" asChild className="w-full justify-start mb-4">
              <Link href="/">
                <Home className="h-4 w-4 mr-2" />
                Về trang chính
              </Link>
            </Button>

            {visibleNavigation.map((item: any) => {
              // If the item is a group with sub-items, render the group label and sublinks
              if ((item as any).items) {
                return (
                  <div key={item.name} className="space-y-1">
                    <div className="px-3 text-xs text-muted-foreground font-semibold">{item.name}</div>
                    <div className="space-y-1">
                      {(item as any).items.map((sub: any) => {
                        const isActive = pathname === sub.href
                        return (
                          <Button
                            key={sub.name}
                            variant={isActive ? "default" : "ghost"}
                            size="sm"
                            asChild
                            className="w-full justify-start pl-6"
                          >
                            <Link href={sub.href} onClick={() => setIsMobileMenuOpen(false)}>
                              {sub.icon && <sub.icon className="h-4 w-4 mr-2" />}
                              {sub.name}
                            </Link>
                          </Button>
                        )
                      })}
                    </div>
                  </div>
                )
              }

              const isActive = pathname === (item as any).href
              return (
                <Button
                  key={item.name}
                  variant={isActive ? "default" : "ghost"}
                  size="sm"
                  asChild
                  className="w-full justify-start"
                >
                  <Link href={(item as any).href} onClick={() => setIsMobileMenuOpen(false)}>
                    {item.icon && <item.icon className="h-4 w-4 mr-2" />}
                    {item.name}
                  </Link>
                </Button>
              )
            })}
          </nav>
        </div>
      </div>

      {/* Mobile overlay */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={() => setIsMobileMenuOpen(false)} />
      )}
    </>
  )
}
