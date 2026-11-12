"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import Link from "next/link"
import { AdminSidebar } from "@/components/admin-sidebar"
import { AdminStats } from "@/components/admin-stats"
import { RevenueChart } from "@/components/revenue-chart"
import { TopMoviesChart } from "@/components/dashboard/top-movies-chart"
import { CinemasRevenueChart } from "@/components/dashboard/cinemas-revenue-chart"
import { CinemaSelector } from "@/components/dashboard/cinema-selector"
import { TodayShowtimes } from "@/components/dashboard/today-showtimes"
import { ChatbotControl } from "@/components/dashboard/chatbot-control"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { LoadingSpinner } from "@/components/loading-spinner"
import { useRequireAdmin } from "@/hooks/use-require-admin"
import { useCinemaScope } from "@/hooks/use-cinema-scope"
import { formatVND } from "@/lib/utils"
import { useHiddenItems } from "@/lib/admin-menu-prefs"
import { getDashboardStats, type DashboardStats } from "@/lib/api/admin/dashboard"
import { getShowtimesByDate } from "@/lib/api/showtimes"
import {
  TrendingUp, Film, Clock, MapPin, Ticket, AlertTriangle, Target,
  BarChart3, Sparkles, RefreshCw, CheckCircle2, AlertCircle, Loader2,
} from "lucide-react"

// ─── Types ─────────────────────────────────────
interface Booking {
  reference?: string
  booking_reference?: string
  status?: string
  booking_status?: string
  amount?: number
  total_amount?: number
  movie?: string
  movie_title?: string
  cinema?: string
  cinema_name?: string
  show_date?: string
  show_time?: string
  created_at?: string
}

// ─── Recent Bookings Card (tự fetch, 60s refresh) ─────────────
function RecentBookings({ selectedCinemaId }: { selectedCinemaId: string }) {
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetch_ = useCallback(async () => {
    try {
      const stats = await getDashboardStats(selectedCinemaId)
      setBookings(stats?.recentBookings || [])
      setLastUpdated(new Date())
    } catch (err) {
      // Giữ dữ liệu cũ trên màn hình (tránh nhấp nháy về 0), nhưng VẪN log —
      // nếu không, widget kẹt số liệu cũ vô thời hạn mà không ai biết vì sao.
      console.error("Tải số liệu tổng quan (đơn đặt gần đây) thất bại:", err)
    }
    finally { setLoading(false) }
  }, [selectedCinemaId])

  useEffect(() => {
    setLoading(true)
    fetch_()
    timerRef.current = setInterval(fetch_, 60_000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [fetch_])

  const statusIcon = (s: string) => {
    const st = (s || "").toLowerCase()
    if (st === "confirmed" || st === "paid") return <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
    if (st === "cancelled" || st === "failed") return <AlertCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />
    return <Loader2 className="h-3.5 w-3.5 text-yellow-500 shrink-0 animate-spin" />
  }

  const statusLabel: Record<string, string> = {
    confirmed: "Xác nhận", paid: "Đã TT", cancelled: "Đã hủy",
    pending: "Chờ TT", failed: "Thất bại",
  }

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-3 shrink-0">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="h-5 w-5 text-primary" />
            Đặt vé gần đây
          </CardTitle>
          <div className="flex items-center gap-2">
            {lastUpdated && (
              <span className="text-[10px] text-muted-foreground">
                {lastUpdated.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
            {loading
              ? <RefreshCw className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
              : <Badge variant="secondary" className="text-xs">{bookings.length} vé</Badge>
            }
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col min-h-0">
        {bookings.length === 0 && !loading ? (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground py-8">
            <TrendingUp className="h-10 w-10 mb-2 opacity-30" />
            <p className="text-sm">Chưa có đặt vé gần đây</p>
          </div>
        ) : (
          <>
            <div className="space-y-2 flex-1 overflow-y-auto min-h-0 pr-0.5">
              {bookings.slice(0, 8).map((b, idx) => {
                const ref = b.reference || b.booking_reference || "—"
                const movie = b.movie || b.movie_title || "—"
                const cinema = b.cinema || b.cinema_name || "—"
                const status = b.status || b.booking_status || "pending"
                const amount = b.amount || b.total_amount || 0
                const time = b.created_at
                  ? new Date(b.created_at).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })
                  : ""
                return (
                  <div key={idx}
                    className="flex items-start gap-2 px-3 py-2 rounded-lg border bg-muted/30 hover:bg-muted/60 transition-colors text-sm">
                    {statusIcon(status)}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium text-xs truncate">{movie}</p>
                        <span className="text-[10px] font-semibold text-amber-600 shrink-0">
                          {amount > 0 ? formatVND(amount) : "—"}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground">
                        <span className="flex items-center gap-0.5 truncate">
                          <MapPin className="h-2.5 w-2.5 shrink-0" />{cinema}
                        </span>
                        {time && (
                          <span className="flex items-center gap-0.5 shrink-0">
                            <Clock className="h-2.5 w-2.5" />{time}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center justify-between mt-0.5">
                        <span className="text-[9px] font-mono text-muted-foreground/70">{ref.slice(-8)}</span>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${
                          status === "confirmed" || status === "paid"
                            ? "bg-green-100 text-green-700"
                            : status === "cancelled" || status === "failed"
                            ? "bg-red-100 text-red-700"
                            : "bg-yellow-100 text-yellow-700"
                        }`}>
                          {statusLabel[status] || status}
                        </span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

          </>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Operational KPIs (tự fetch, 60s refresh) ──
function OperationalKPIs({ selectedCinemaId }: { selectedCinemaId: string }) {
  const [kpis, setKpis] = useState({
    pendingCount: 0, pendingRevenue: 0,
    occupancyAvg: 0, showtimesToday: 0,
    cancelledCount: 0,
  })
  const [loading, setLoading] = useState(true)

  const fetchKpis = useCallback(async () => {
    try {
      const now = new Date()
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`

      // Lịch chiếu hôm nay để tính occupancy
      const st = await getShowtimesByDate(today, selectedCinemaId)
      const occupied = st.filter((s: any) => s.total_seats > 0)
      const avgOcc = occupied.length
        ? Math.round(occupied.reduce((sum: number, s: any) => sum + ((s.total_seats - s.available_seats) / s.total_seats) * 100, 0) / occupied.length)
        : 0
      setKpis(prev => ({ ...prev, occupancyAvg: avgOcc, showtimesToday: st.length }))

      // Vé chờ thanh toán / đã hủy — tổng thật toàn hệ thống (không suy ra từ
      // mẫu recentBookings, vốn chỉ có 10 dòng và có thể không đại diện đúng).
      const stats = await getDashboardStats(selectedCinemaId)
      setKpis(prev => ({
        ...prev,
        pendingCount: stats?.pendingCount || 0,
        pendingRevenue: stats?.pendingRevenue || 0,
        cancelledCount: stats?.cancelledRecentCount || 0,
      }))
    } catch (err) {
      console.error("Tải số liệu vé chờ thanh toán / đã huỷ thất bại:", err)
    }
    finally { setLoading(false) }
  }, [selectedCinemaId])

  useEffect(() => {
    setLoading(true)
    fetchKpis()
    const id = setInterval(fetchKpis, 60_000)
    return () => clearInterval(id)
  }, [fetchKpis])

  const cards = [
    {
      label: "Tỷ lệ lấp đầy hôm nay",
      value: `${kpis.occupancyAvg}%`,
      sub: `${kpis.showtimesToday} suất chiếu`,
      icon: Target,
      color: kpis.occupancyAvg >= 60 ? "text-green-500" : kpis.occupancyAvg >= 30 ? "text-amber-500" : "text-muted-foreground",
      bg: kpis.occupancyAvg >= 60 ? "bg-green-50 dark:bg-green-950/30" : kpis.occupancyAvg >= 30 ? "bg-amber-50 dark:bg-amber-950/30" : "bg-muted/50",
    },
    {
      label: "Vé chờ thanh toán",
      value: kpis.pendingCount,
      sub: kpis.pendingRevenue > 0 ? `${formatVND(kpis.pendingRevenue)} đang chờ` : "Không có vé tồn",
      icon: Ticket,
      color: kpis.pendingCount > 0 ? "text-amber-500" : "text-muted-foreground",
      bg: kpis.pendingCount > 0 ? "bg-amber-50 dark:bg-amber-950/30" : "bg-muted/50",
    },
    {
      label: "Vé đã hủy (gần đây)",
      value: kpis.cancelledCount,
      sub: kpis.cancelledCount > 3 ? "⚠️ Tỷ lệ hủy cao" : "Bình thường",
      icon: AlertTriangle,
      color: kpis.cancelledCount > 3 ? "text-red-500" : "text-muted-foreground",
      bg: kpis.cancelledCount > 3 ? "bg-red-50 dark:bg-red-950/30" : "bg-muted/50",
    },
  ]

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {cards.map(({ label, value, sub, icon: Icon, color, bg }) => (
        <Card key={label} className={`${bg} border-none`}>
          <CardContent className="p-4 flex items-center gap-3">
            <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 bg-background shadow-sm`}>
              <Icon className={`h-5 w-5 ${color}`} />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground leading-none mb-0.5">{label}</p>
              <p className={`text-xl font-bold leading-none ${color}`}>
                {loading ? <span className="inline-block h-5 w-10 bg-muted animate-pulse rounded" /> : value}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{sub}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

// ─── Page ──────────────────────────────────────
export default function AdminDashboard() {
  const { user, loading, forbidden } = useRequireAdmin()
  const { canSeeAllCinemas, scopedFilterValue } = useCinemaScope()
  const [selectedCinemaId, setSelectedCinemaId] = useState(scopedFilterValue)
  const [now, setNow] = useState(new Date())
  const hiddenItems = useHiddenItems()
  const isHidden = (key: string) => hiddenItems.includes(key)

  // Đồng hồ thời gian thực
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="lg" text="Đang tải dashboard..." />
      </div>
    )
  }
  if (forbidden) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Không có quyền truy cập</div>
  }
  if (!user?.can_access_admin) return null

  return (
    <div className="min-h-screen bg-background">
      <div className="flex">
        <AdminSidebar />
        <main className="flex-1 p-5 lg:p-7 space-y-6 min-w-0">

          {/* ── HEADER ────────────────────────────────────── */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 bg-clip-text text-transparent">
                Bảng Quản Trị
              </h1>
              <p className="text-muted-foreground mt-0.5">
                Xin chào <span className="font-semibold text-foreground">{user.first_name}</span> —{" "}
                <span className="tabular-nums">
                  {now.toLocaleDateString("vi-VN", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" })}
                  {" "}
                  <span className="text-primary font-medium">
                    {now.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                  </span>
                </span>
              </p>
            </div>

            {/* Bộ lọc rạp */}
            <div className="shrink-0">
              <CinemaSelector
                selectedCinemaId={selectedCinemaId}
                onCinemaChange={setSelectedCinemaId}
              />
            </div>
          </div>

          {/* ── SECTION 1: KPI tổng quan (30s auto-refresh) ──────── */}
          {!isHidden("widget:admin-stats") && <AdminStats cinemaId={selectedCinemaId} />}

          {/* ── SECTION 2: KPI vận hành thực tế (60s refresh) ─── */}
          {!isHidden("widget:operational-kpis") && <OperationalKPIs selectedCinemaId={selectedCinemaId} />}


          {/* ── SECTION 3: Revenue + Suất chiếu hôm nay ─────────── */}
          {(!isHidden("widget:revenue-chart") || !isHidden("widget:today-showtimes")) && (
            <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
              {!isHidden("widget:revenue-chart") && (
                <div className="xl:col-span-3">
                  <RevenueChart selectedCinemaId={selectedCinemaId} daysBack={14} />
                </div>
              )}
              {!isHidden("widget:today-showtimes") && (
                <div className="xl:col-span-2 min-h-[420px]">
                  <TodayShowtimes selectedCinemaId={selectedCinemaId} />
                </div>
              )}
            </div>
          )}

          {/* ── SECTION 3b: Điều khiển trợ lý ảo ─────────────────── */}
          {/* Chọn nguồn trả lời của chatbot (Gemini / luật cứng), theo dõi số câu
              hỏi AI còn lại trong ngày và dán khoá Gemini mới khi khoá cũ hết
              hạn mức — trước đây phải sửa backend/.env rồi khởi động lại server. */}
          {canSeeAllCinemas && !isHidden("widget:chatbot-control") && <ChatbotControl />}

          {/* ── SECTION 4: Top Movies + Recent Bookings ──────────── */}
          {(!isHidden("widget:top-movies-chart") || !isHidden("widget:recent-bookings")) && (
            <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
              {!isHidden("widget:top-movies-chart") && (
                <div className="xl:col-span-3">
                  <TopMoviesChart cinemaId={selectedCinemaId} />
                </div>
              )}
              {!isHidden("widget:recent-bookings") && (
                <div className="xl:col-span-2 min-h-[420px]">
                  <RecentBookings selectedCinemaId={selectedCinemaId} />
                </div>
              )}
            </div>
          )}

          {/* ── SECTION 5: So sánh rạp ────────────────────────────── */}
          {/* Biểu đồ so sánh doanh thu GIỮA CÁC RẠP — chỉ có nghĩa với người xem
              được toàn chuỗi. API /all-cinemas/summary nay là route chỉ-admin nên
              với quản lý chi nhánh nó sẽ trả 403; ẩn hẳn thay vì để widget lỗi. */}
          {canSeeAllCinemas && !isHidden("widget:cinemas-revenue-chart") && (
            <CinemasRevenueChart selectedCinemaId={selectedCinemaId} />
          )}

          {/* ── QUICK NAV footer ─────────────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t">
            {[
              { href: "/admin/movies",                  icon: Film,      label: "Quản lý phim",       color: "from-purple-500 to-pink-500" },
              { href: "/admin/auto-generate-showtimes", icon: Sparkles,  label: "Tự động lịch chiếu", color: "from-amber-500 to-orange-500" },
              { href: "/admin/reports",                 icon: BarChart3, label: "Báo cáo thống kê",   color: "from-blue-500 to-cyan-500" },
            ].map(({ href, icon: Icon, label, color }) => (
              <Link key={href} href={href}>
                <div className="flex items-center gap-3 p-3 rounded-xl border hover:shadow-md hover:border-primary/50 transition-all cursor-pointer bg-muted/30 hover:bg-muted/60">
                  <div className={`h-9 w-9 rounded-lg bg-gradient-to-br ${color} flex items-center justify-center shrink-0`}>
                    <Icon className="h-4 w-4 text-white" />
                  </div>
                  <span className="text-sm font-medium truncate">{label}</span>
                </div>
              </Link>
            ))}
          </div>

        </main>
      </div>
    </div>
  )
}
