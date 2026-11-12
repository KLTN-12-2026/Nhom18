"use client"
export const dynamic = "force-dynamic"

import { Fragment, useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth"
import { useCinemaScope } from "@/hooks/use-cinema-scope"
import {
  ComposedChart, Bar, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, BarChart, Cell,
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  ArrowLeft, Download, Calendar, Building2, TrendingUp, TrendingDown,
  Ticket, Users, Film, DollarSign, RefreshCw, Trophy, BarChart3, FileText, Target, Eye, ChevronDown, ChevronRight,
} from "lucide-react"
import { formatVND } from "@/lib/utils"
import { getCinemas } from "@/lib/api/cinemas"
import {
  getReportsSummary, getReportsDaily, getReportsTopMovies, exportReportCsv, getReportDetail, getDailyMovieBreakdown,
  type ReportCsvType, type ReportDetailTable, type DailyMovieBreakdownRow,
} from "@/lib/api/admin/reports"

// ─── helpers ──────────────────────────────────
const fmtVND = formatVND
const fmtM = (v: number) => {
  if (v >= 1e9) return `${(v / 1e9).toFixed(1)}B`
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`
  if (v >= 1e3) return `${(v / 1e3).toFixed(0)}K`
  return String(v)
}
const fmtDate = (d: string) => new Date(d).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" })
const fmtDateFull = (d: string) => new Date(d).toLocaleDateString("vi-VN", { weekday: "short", day: "2-digit", month: "2-digit" })
const isoDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
const MOVIE_COLORS = ["#f59e0b", "#10b981", "#3b82f6", "#8b5cf6", "#ef4444", "#06b6d4", "#ec4899", "#84cc16"]

// ─── Tooltip ──────────────────────────────────
function RevenueTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  return (
    <div className="bg-background/95 backdrop-blur border rounded-xl shadow-xl p-3 text-sm">
      <p className="font-semibold mb-1.5">{fmtDateFull(d?.day)}</p>
      <p className="flex justify-between gap-4">
        <span className="text-muted-foreground flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-500 inline-block" />Doanh thu</span>
        <span className="font-semibold text-amber-600">{fmtVND(d?.revenue ?? 0)}</span>
      </p>
      <p className="flex justify-between gap-4">
        <span className="text-muted-foreground flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-500 inline-block" />Vé bán</span>
        <span className="font-semibold text-blue-600">{d?.tickets ?? 0} vé</span>
      </p>
    </div>
  )
}

function MovieTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  return (
    <div className="bg-background/95 border rounded-xl shadow-xl p-3 text-sm">
      <p className="font-semibold mb-1 line-clamp-2">{d?.fullTitle}</p>
      <p className="text-muted-foreground">Doanh thu: <span className="font-semibold text-amber-600">{fmtVND(d?.revenue ?? 0)}</span></p>
      <p className="text-muted-foreground">Vé bán: <span className="font-semibold text-blue-600">{d?.tickets} vé</span></p>
    </div>
  )
}

// ─── Page ──────────────────────────────────────
export default function ReportsPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()

  // Chỉ redirect khi hoàn toàn chưa đăng nhập; nếu đã đăng nhập nhưng
  // không đủ quyền, hiện thông báo "không có quyền" thay vì redirect
  // (tránh vòng lặp khó hiểu khi user đã đăng nhập nhưng bị đá về /login).
  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login")
    }
  }, [user, authLoading, router])

  const [hasToken, setHasToken] = useState(false)
  const [loading, setLoading] = useState(true)
  const [downloading, setDownloading] = useState<string | null>(null)

  // Filters
  const [from, setFrom] = useState(isoDate(new Date(Date.now() - 30 * 24 * 3600 * 1000)))
  const [to, setTo] = useState(isoDate(new Date()))
  const { canSeeAllCinemas, scopedFilterValue, cinemaName } = useCinemaScope()
  const [selectedCinemaId, setSelectedCinemaId] = useState(scopedFilterValue)
  const [cinemas, setCinemas] = useState<any[]>([])

  // Data
  const [summary, setSummary] = useState<any>(null)
  const [daily, setDaily] = useState<any[]>([])
  const [topMovies, setTopMovies] = useState<any[]>([])
  const [error, setError] = useState<string | null>(null)

  // Hồ sơ người dùng nạp bất đồng bộ, nên lần render đầu scopedFilterValue còn
  // là "all"; đồng bộ lại khi biết được rạp của quản lý, nếu không trang báo cáo
  // vẫn gọi API ở chế độ "tất cả rạp" (backend trả về đúng 1 rạp) mà nhãn trên
  // màn hình lại ghi khác.
  useEffect(() => {
    if (!canSeeAllCinemas && scopedFilterValue !== "all") setSelectedCinemaId(scopedFilterValue)
  }, [canSeeAllCinemas, scopedFilterValue])

  useEffect(() => {
    const t = sessionStorage.getItem("auth_token") || localStorage.getItem("auth_token")
    setHasToken(!!t)
    if (t) {
      getCinemas().then(setCinemas).catch(() => {})
    }
  }, [])

  const fetchAll = useCallback(async () => {
    if (!hasToken) return
    setLoading(true); setError(null)
    const fromTs = `${from} 00:00:00`
    const toTs = `${to} 23:59:59`
    try {
      const [s, dailyData, topData] = await Promise.all([
        getReportsSummary(fromTs, toTs, selectedCinemaId),
        getReportsDaily(fromTs, toTs, selectedCinemaId),
        getReportsTopMovies(fromTs, toTs, 10, selectedCinemaId),
      ])
      setSummary(s); setDaily(dailyData); setTopMovies(topData)
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }, [hasToken, from, to, selectedCinemaId])

  useEffect(() => { fetchAll() }, [fetchAll])

  // Theo dõi RIÊNG preset đang chọn (thay vì suy ra ngược từ from/to) — để
  // có thể tô sáng đúng nút 7/30/90 ngày đang active, và tự động bỏ tô sáng
  // khi người dùng tự sửa tay ô ngày (không còn khớp với preset nào nữa).
  const [activePreset, setActivePreset] = useState<number | null>(30)

  const setPreset = (days: number) => {
    setFrom(isoDate(new Date(Date.now() - days * 24 * 3600 * 1000)))
    setTo(isoDate(new Date()))
    setActivePreset(days)
  }

  const downloadCSV = async (type: ReportCsvType, label: string) => {
    if (!hasToken) return
    setDownloading(type)
    try {
      const blob = await exportReportCsv(type, `${from} 00:00:00`, `${to} 23:59:59`, selectedCinemaId)
      const a = document.createElement("a")
      a.href = URL.createObjectURL(blob)
      a.download = `${type}-${from}-den-${to}.csv`
      a.click()
      URL.revokeObjectURL(a.href)
    } catch (e: any) { alert("Lỗi tải CSV: " + e.message) }
    finally { setDownloading(null) }
  }

  const [detailType, setDetailType] = useState<ReportCsvType | null>(null)
  const [detailTable, setDetailTable] = useState<ReportDetailTable | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [dayBreakdown, setDayBreakdown] = useState<Record<string, DailyMovieBreakdownRow[]>>({})
  const [expandedDay, setExpandedDay] = useState<string | null>(null)

  const dateKey = (d: string | Date) => isoDate(new Date(d))

  const viewDetail = async (type: ReportCsvType) => {
    if (!hasToken) return
    setDetailType(type)
    setDetailLoading(true)
    setDetailTable(null)
    setExpandedDay(null)
    try {
      const fromTs = `${from} 00:00:00`
      const toTs = `${to} 23:59:59`
      if (type === "revenue-daily") {
        const [table, breakdown] = await Promise.all([
          getReportDetail(type, fromTs, toTs, selectedCinemaId),
          getDailyMovieBreakdown(fromTs, toTs, selectedCinemaId),
        ])
        const grouped: Record<string, DailyMovieBreakdownRow[]> = {}
        for (const row of breakdown) {
          const key = dateKey(row.day)
          if (!grouped[key]) grouped[key] = []
          grouped[key].push(row)
        }
        setDayBreakdown(grouped)
        setDetailTable(table)
      } else {
        const table = await getReportDetail(type, fromTs, toTs, selectedCinemaId)
        setDetailTable(table)
      }
    } catch (e: any) {
      alert("Lỗi tải chi tiết báo cáo: " + e.message)
      setDetailType(null)
    } finally {
      setDetailLoading(false)
    }
  }

  // Derived data
  // `daily` giờ đã được backend zero-fill đủ mọi ngày trong [from, to] (kể cả
  // ngày không có giao dịch) — dùng TRỰC TIẾP cho biểu đồ để trục thời gian
  // phản ánh đúng khoảng cách thật giữa các ngày. Nhưng bảng chi tiết "Doanh
  // thu theo ngày" bên dưới chỉ nên liệt kê những ngày THỰC SỰ có giao dịch
  // (đúng ý nghĩa nhãn "X ngày có giao dịch"), nếu không sẽ ngập trong hàng
  // toàn số 0 khi chọn khoảng ngày dài.
  const chartDaily = daily.map(d => ({
    day: d.day,
    revenue: Number(d.revenue || 0),
    tickets: Number(d.tickets || 0),
  }))
  const transactionDays = daily.filter(d => Number(d.tickets || 0) > 0)

  const chartMovies = topMovies.slice(0, 7).map(m => ({
    name: m.title.length > 20 ? m.title.slice(0, 20) + "…" : m.title,
    fullTitle: m.title,
    revenue: Number(m.revenue || 0),
    tickets: Number(m.tickets || 0),
  }))

  const maxRevDay = daily.length ? daily.reduce((a, b) => Number(a.revenue) > Number(b.revenue) ? a : b) : null
  const totalRevenue = summary?.revenue || 0
  const totalTickets = summary?.tickets || 0
  const avgPrice = totalTickets > 0 ? Math.round(totalRevenue / totalTickets) : 0

  // Trend: compare first half vs second half
  const halfLen = Math.floor(daily.length / 2)
  const firstHalf = daily.slice(0, halfLen).reduce((s, d) => s + Number(d.revenue), 0)
  const secondHalf = daily.slice(halfLen).reduce((s, d) => s + Number(d.revenue), 0)
  const trend = firstHalf > 0 ? ((secondHalf - firstHalf) / firstHalf * 100) : 0

  if (authLoading) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Đang kiểm tra quyền...</div>
  }
  if (!user?.can_access_admin) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Không có quyền truy cập</div>
  }

  return (
    // w-full bắt buộc đi cùng max-w-7xl mx-auto: trang này là flex item của layout gốc
    // (app/layout.tsx bọc {children} trong div flex flex-col) — khi flex item có margin
    // auto theo trục ngang mà không có width tường minh, flexbox "hấp thụ" margin auto
    // thay vì stretch, khiến div co lại theo kích thước nội dung (bảng/biểu đồ rộng bên
    // trong) thay vì lấp đầy viewport, gây tràn ngang trên mobile.
    <div className="min-h-screen bg-background p-5 lg:p-7 space-y-6 max-w-7xl w-full mx-auto min-w-0">

      {/* ── HEADER ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <Button variant="ghost" size="sm" onClick={() => router.push("/admin")} className="mb-2 gap-2">
            <ArrowLeft className="h-4 w-4" /> Quay lại Dashboard
          </Button>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-amber-500 via-orange-500 to-red-500 bg-clip-text text-transparent">
            Báo cáo & Thống kê
          </h1>
          <p className="text-muted-foreground mt-0.5">Phân tích doanh thu và hiệu suất kinh doanh theo thời gian thực</p>
        </div>
        <Button onClick={fetchAll} variant="outline" size="sm" disabled={loading} className="shrink-0 gap-2">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Làm mới
        </Button>
      </div>

      {/* ── FILTERS ── */}
      <Card>
        <CardContent className="py-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* Preset buttons */}
            <div className="flex gap-1.5">
              {[{label:"7 ngày",days:7},{label:"30 ngày",days:30},{label:"90 ngày",days:90}].map(p => (
                <button key={p.days} onClick={() => setPreset(p.days)}
                  className={`text-xs px-3 py-1.5 rounded-lg border transition font-medium ${
                    activePreset === p.days
                      ? "bg-primary text-primary-foreground border-primary shadow-sm"
                      : "hover:bg-muted"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="h-5 w-px bg-border" />
            {/* Custom date range */}
            <div className="flex flex-wrap items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
              <input type="date" value={from} onChange={e => { setFrom(e.target.value); setActivePreset(null) }}
                className="border rounded-lg px-3 py-1.5 text-sm bg-background focus:ring-2 focus:ring-primary outline-none w-[150px] max-w-full" />
              <span className="text-muted-foreground text-sm">→</span>
              <input type="date" value={to} onChange={e => { setTo(e.target.value); setActivePreset(null) }}
                className="border rounded-lg px-3 py-1.5 text-sm bg-background focus:ring-2 focus:ring-primary outline-none w-[150px] max-w-full" />
            </div>
            <div className="h-5 w-px bg-border" />
            {/* Cinema filter */}
            {/* Quản lý chi nhánh chỉ có đúng 1 rạp để xem — backend ép phạm vi
                theo tài khoản, nên bộ lọc nhiều lựa chọn ở đây chỉ gây hiểu nhầm. */}
            {canSeeAllCinemas ? (
              <Select value={selectedCinemaId} onValueChange={setSelectedCinemaId}>
                <SelectTrigger className="w-[200px] h-9">
                  <Building2 className="h-3.5 w-3.5 mr-1.5" />
                  <SelectValue placeholder="Tất cả rạp" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất cả rạp</SelectItem>
                  {cinemas.map(c => <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            ) : (
              <div className="flex items-center gap-1.5 h-9 px-3 rounded-lg border bg-muted/40 text-sm font-medium">
                <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                {cinemaName || "Chưa được gán rạp"}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {error && (
        <Card className="border-destructive/50 bg-destructive/10">
          <CardContent className="pt-4 text-destructive text-sm">⚠️ {error}</CardContent>
        </Card>
      )}

      {loading && (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <RefreshCw className="h-6 w-6 animate-spin mr-2" /> Đang tải báo cáo...
        </div>
      )}

      {!loading && summary && (
        <>
          {/* ── KPI CARDS ── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: "Tổng doanh thu", value: fmtVND(totalRevenue), sub: `TB ${fmtM(totalRevenue / Math.max(daily.length,1))}/ngày`, icon: DollarSign, color: "text-amber-500", bg: "bg-amber-50 dark:bg-amber-950/30" },
              { label: "Vé đã bán", value: totalTickets.toLocaleString("vi-VN"), sub: `${Math.round(totalTickets / Math.max(daily.length,1))} vé/ngày`, icon: Ticket, color: "text-blue-500", bg: "bg-blue-50 dark:bg-blue-950/30" },
              { label: "Giá vé trung bình", value: fmtVND(avgPrice), sub: "/ mỗi vé bán ra", icon: Target, color: "text-purple-500", bg: "bg-purple-50 dark:bg-purple-950/30" },
              { label: "Người dùng mới", value: (summary.new_users || 0).toLocaleString("vi-VN"), sub: "trong kỳ báo cáo", icon: Users, color: "text-green-500", bg: "bg-green-50 dark:bg-green-950/30" },
            ].map(({ label, value, sub, icon: Icon, color, bg }) => (
              <Card key={label} className={`${bg} border-none`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground truncate">{label}</p>
                      <p className={`text-xl font-bold ${color} mt-0.5 truncate`}>{value}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{sub}</p>
                    </div>
                    <Icon className={`h-5 w-5 ${color} opacity-70 shrink-0 mt-0.5`} />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* ── INSIGHT ROW ── */}
          {daily.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Card className="border-none bg-muted/40">
                <CardContent className="p-4 flex items-start justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">Ngày doanh thu cao nhất</p>
                    <p className="text-lg font-bold text-amber-600 mt-0.5">{fmtVND(Number(maxRevDay?.revenue || 0))}</p>
                    <p className="text-[10px] text-muted-foreground">{maxRevDay ? fmtDateFull(maxRevDay.day) : "—"}</p>
                  </div>
                  <TrendingUp className="h-8 w-8 text-amber-400 opacity-40" />
                </CardContent>
              </Card>
              <Card className="border-none bg-muted/40">
                <CardContent className="p-4 flex items-start justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">Xu hướng doanh thu</p>
                    <p className={`text-lg font-bold mt-0.5 ${trend >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {trend >= 0 ? "+" : ""}{trend.toFixed(1)}%
                    </p>
                    <p className="text-[10px] text-muted-foreground">nửa sau so với nửa đầu kỳ</p>
                  </div>
                  {trend >= 0
                    ? <TrendingUp className="h-8 w-8 text-green-400 opacity-40" />
                    : <TrendingDown className="h-8 w-8 text-red-400 opacity-40" />
                  }
                </CardContent>
              </Card>
              <Card className="border-none bg-muted/40">
                <CardContent className="p-4 flex items-start justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">Phim dẫn đầu doanh thu</p>
                    <p className="text-sm font-bold text-primary mt-0.5 line-clamp-1">{topMovies[0]?.title || "—"}</p>
                    <p className="text-[10px] text-muted-foreground">{topMovies[0] ? fmtVND(Number(topMovies[0].revenue)) : ""}</p>
                  </div>
                  <Trophy className="h-8 w-8 text-amber-400 opacity-40" />
                </CardContent>
              </Card>
            </div>
          )}

          {/* ── CHARTS ── */}
          <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
            {/* Revenue Trend Chart */}
            {/* min-w-0: bắt buộc để Recharts ResponsiveContainer không ép Grid item rộng hơn cột chứa nó trên mobile */}
            <Card className="xl:col-span-3 min-w-0">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <BarChart3 className="h-5 w-5 text-amber-500" />
                  Doanh thu theo ngày
                </CardTitle>
                <CardDescription>{daily.length} ngày • {fmtDate(from)} → {fmtDate(to)}</CardDescription>
              </CardHeader>
              <CardContent>
                {chartDaily.length > 0 ? (
                  <div className="h-[280px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={chartDaily} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.35} />
                            <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted/60" vertical={false} />
                        <XAxis dataKey="day" tickFormatter={fmtDate} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} />
                        <YAxis yAxisId="r" orientation="left" tickFormatter={fmtM} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} width={42} />
                        <YAxis yAxisId="t" orientation="right" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} width={28} />
                        <Tooltip content={<RevenueTooltip />} />
                        <Legend iconType="circle" iconSize={8} formatter={v => v === "revenue" ? "Doanh thu" : "Vé"} wrapperStyle={{ fontSize: 11 }} />
                        <Bar yAxisId="t" dataKey="tickets" name="tickets" fill="#3b82f6" opacity={0.65} radius={[3,3,0,0]} maxBarSize={16} />
                        <Area yAxisId="r" type="monotone" dataKey="revenue" name="revenue" stroke="#f59e0b" strokeWidth={2.5} fill="url(#revGrad)" dot={false} activeDot={{ r: 4 }} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="h-[280px] flex items-center justify-center text-muted-foreground text-sm">
                    Chưa có dữ liệu doanh thu trong kỳ này
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Top Movies Chart */}
            <Card className="xl:col-span-2 min-w-0">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Trophy className="h-5 w-5 text-amber-500" />
                  Top phim doanh thu
                </CardTitle>
                <CardDescription>Xếp hạng trong kỳ báo cáo</CardDescription>
              </CardHeader>
              <CardContent>
                {chartMovies.length > 0 ? (
                  <div className="h-[280px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartMovies} layout="vertical" margin={{ top: 0, right: 65, left: 4, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} className="stroke-muted/60" />
                        {/* domain có headroom (x1.2) để cột dài nhất không chạm sát mép phải —
                            nếu không, nhãn giá trị đặt bên phải cột (label position="right")
                            sẽ bị cắt mất ở đúng cột lớn nhất (thường là cột đáng chú ý nhất). */}
                        <XAxis type="number" domain={[0, (max: number) => Math.ceil(max * 1.2)]} tickFormatter={fmtM} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} width={90} />
                        <Tooltip content={<MovieTooltip />} cursor={{ fill: "color-mix(in oklch, var(--muted) 30%, transparent)" }} />
                        <Bar dataKey="revenue" radius={[0, 4, 4, 0]} maxBarSize={20}
                          label={{ position: "right", formatter: fmtM, fill: "var(--muted-foreground)", fontSize: 10 }}
                        >
                          {chartMovies.map((_, i) => <Cell key={i} fill={MOVIE_COLORS[i % MOVIE_COLORS.length]} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="h-[280px] flex items-center justify-center text-muted-foreground text-sm">
                    Chưa có dữ liệu phim
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* ── TABS: CHI TIẾT ── */}
          <Tabs defaultValue="daily" className="space-y-4">
            <TabsList>
              <TabsTrigger value="daily" className="gap-1.5"><BarChart3 className="h-3.5 w-3.5" />Theo ngày</TabsTrigger>
              <TabsTrigger value="movies" className="gap-1.5"><Film className="h-3.5 w-3.5" />Top phim</TabsTrigger>
            </TabsList>

            {/* Daily table */}
            <TabsContent value="daily">
              <Card>
                <CardHeader className="pb-3 flex-row flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <CardTitle className="text-base">Doanh thu theo ngày</CardTitle>
                    <CardDescription>{transactionDays.length} ngày có giao dịch / {daily.length} ngày trong kỳ</CardDescription>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button size="sm" variant="default" onClick={() => viewDetail("revenue-daily")} disabled={loading} className="gap-2">
                      <Eye className="h-3.5 w-3.5" /> Xem chi tiết
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => downloadCSV("revenue-daily", "Doanh thu theo ngày")} disabled={downloading === "revenue-daily" || loading}>
                      {downloading === "revenue-daily" ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="overflow-auto rounded-lg border w-full">
                    <table className="min-w-full divide-y divide-border text-sm">
                      <thead className="bg-muted/50">
                        <tr>
                          {["Ngày","Doanh thu","Số vé","Tỷ trọng","Doanh thu/vé"].map(h => (
                            <th key={h} className={`px-4 py-3 ${h==="Ngày"?"text-left":"text-right"} text-xs font-semibold text-muted-foreground uppercase tracking-wide`}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {[...transactionDays].reverse().map((d, i) => {
                          const rev = Number(d.revenue || 0)
                          const pct = totalRevenue > 0 ? (rev / totalRevenue * 100) : 0
                          return (
                            <tr key={i} className="hover:bg-muted/30 transition">
                              <td className="px-4 py-3 font-medium">{new Date(d.day).toLocaleDateString("vi-VN", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" })}</td>
                              <td className="px-4 py-3 text-right font-semibold text-amber-600">{fmtVND(rev)}</td>
                              <td className="px-4 py-3 text-right"><Badge variant="secondary">{d.tickets} vé</Badge></td>
                              <td className="px-4 py-3 text-right">
                                <div className="flex items-center justify-end gap-2">
                                  <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                                    <div className="h-full bg-amber-500 rounded-full" style={{ width: `${pct}%` }} />
                                  </div>
                                  <span className="text-xs w-8 text-right">{pct.toFixed(1)}%</span>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-right text-muted-foreground">
                                {d.tickets > 0 ? fmtVND(Math.round(rev / d.tickets)) : "—"}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Top movies table */}
            <TabsContent value="movies">
              <Card>
                <CardHeader className="pb-3 flex-row flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <CardTitle className="text-base">Top phim theo doanh thu</CardTitle>
                    <CardDescription>{topMovies.length} phim trong kỳ báo cáo</CardDescription>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button size="sm" variant="default" onClick={() => viewDetail("top-movies")} disabled={loading} className="gap-2">
                      <Eye className="h-3.5 w-3.5" /> Xem chi tiết
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => downloadCSV("top-movies", "Top phim doanh thu")} disabled={downloading === "top-movies" || loading}>
                      {downloading === "top-movies" ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="overflow-auto rounded-lg border w-full">
                    <table className="min-w-full divide-y divide-border text-sm">
                      <thead className="bg-muted/50">
                        <tr>
                          {["#","Tên phim","Doanh thu","Số vé","Giá TB/vé","Tỷ trọng"].map(h => (
                            <th key={h} className={`px-4 py-3 ${h==="#"||h==="Tên phim"?"text-left":"text-right"} text-xs font-semibold text-muted-foreground uppercase tracking-wide`}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {topMovies.map((m, idx) => {
                          const rev = Number(m.revenue || 0)
                          const pct = totalRevenue > 0 ? (rev / totalRevenue * 100) : 0
                          return (
                            <tr key={m.id || idx} className="hover:bg-muted/30 transition">
                              <td className="px-4 py-3">
                                <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${
                                  idx===0?"bg-amber-100 text-amber-700":idx===1?"bg-gray-100 text-gray-500":idx===2?"bg-orange-100 text-orange-600":"bg-muted text-muted-foreground"
                                }`}>{idx+1}</span>
                              </td>
                              <td className="px-4 py-3 font-medium max-w-[200px] truncate">{m.title}</td>
                              <td className="px-4 py-3 text-right font-semibold text-amber-600">{fmtVND(rev)}</td>
                              <td className="px-4 py-3 text-right"><Badge variant="secondary">{m.tickets} vé</Badge></td>
                              <td className="px-4 py-3 text-right text-muted-foreground">
                                {m.tickets > 0 ? fmtVND(Math.round(rev / m.tickets)) : "—"}
                              </td>
                              <td className="px-4 py-3 text-right">
                                <div className="flex items-center justify-end gap-2">
                                  <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                                    <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: MOVIE_COLORS[idx % MOVIE_COLORS.length] }} />
                                  </div>
                                  <span className="text-xs w-8 text-right">{pct.toFixed(1)}%</span>
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          {/* ── XUẤT FILE CSV ── */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <FileText className="h-5 w-5 text-primary" />
                Xuất báo cáo CSV
              </CardTitle>
              <CardDescription>
                Tải file CSV để kiểm tra chi tiết trong Excel — dữ liệu thực tế từ database, có hỗ trợ UTF-8 + tiếng Việt.
                Báo cáo "Doanh thu theo ngày" và "Top phim doanh thu" đã có nút Xem chi tiết/Tải CSV riêng ở 2 tab phía trên.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {([
                  {
                    type: "tickets", icon: Ticket, color: "text-blue-500",
                    title: "Chi tiết vé đặt",
                    desc: "Mã vé · KH · Phim · Rạp · Ghế · Tiền · Trạng thái",
                    badge: "Chi tiết"
                  },
                  {
                    type: "showtime-performance", icon: Target, color: "text-green-500",
                    title: "Hiệu suất suất chiếu",
                    desc: "Phim · Rạp · Phòng · Ghế đặt/Tổng · Tỷ lệ lấp đầy",
                    badge: "Vận hành"
                  },
                ] as Array<{ type: ReportCsvType; icon: typeof BarChart3; color: string; title: string; desc: string; badge: string }>).map(({ type, icon: Icon, color, title, desc, badge }) => (
                  <div key={type}
                    className="flex flex-col gap-3 p-4 rounded-xl border hover:border-primary/50 hover:shadow-sm transition bg-muted/30"
                  >
                    <div className="flex items-start justify-between">
                      <div className={`h-10 w-10 rounded-lg bg-background flex items-center justify-center shadow-sm`}>
                        <Icon className={`h-5 w-5 ${color}`} />
                      </div>
                      <Badge variant="outline" className="text-[10px]">{badge}</Badge>
                    </div>
                    <div>
                      <p className="font-semibold text-sm">{title}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">{desc}</p>
                    </div>
                    <div className="flex gap-2 mt-auto">
                      <Button
                        size="sm" variant="default"
                        onClick={() => viewDetail(type)}
                        disabled={loading}
                        className="flex-1 gap-2"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        Xem chi tiết
                      </Button>
                      <Button
                        size="sm" variant="outline"
                        onClick={() => downloadCSV(type, title)}
                        disabled={downloading === type || loading}
                        className="gap-2"
                      >
                        {downloading === type
                          ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                          : <Download className="h-3.5 w-3.5" />
                        }
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground mt-3 flex items-center gap-1">
                📋 "Xem chi tiết" hiện bảng ngay trong trang; "Tải CSV" xuất file UTF-8 mở được trực tiếp bằng Excel.
                Cả hai dùng cùng dữ liệu, lọc theo rạp và khoảng thời gian đang chọn.
              </p>
            </CardContent>
          </Card>
        </>
      )}

      {/* ── DIALOG XEM CHI TIẾT BÁO CÁO ── */}
      <Dialog open={!!detailType} onOpenChange={(open) => { if (!open) { setDetailType(null); setDetailTable(null) } }}>
        <DialogContent className="max-w-5xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              {detailTable?.label || "Đang tải..."}
            </DialogTitle>
            <DialogDescription>
              {fmtDate(from)} → {fmtDate(to)}
              {selectedCinemaId !== "all" && cinemas.find(c => c.id.toString() === selectedCinemaId)
                ? ` · ${cinemas.find(c => c.id.toString() === selectedCinemaId)?.name}`
                : " · Tất cả rạp"}
              {detailTable ? ` · ${detailTable.rows.length} dòng` : ""}
              {detailType === "revenue-daily" && detailTable ? " · Bấm vào 1 ngày để xem doanh thu theo từng phim" : ""}
            </DialogDescription>
          </DialogHeader>

          {detailLoading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <RefreshCw className="h-5 w-5 animate-spin mr-2" /> Đang tải dữ liệu...
            </div>
          ) : detailTable && detailTable.rows.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground text-sm">
              Không có dữ liệu trong khoảng thời gian này.
            </div>
          ) : detailTable ? (
            <div className="overflow-auto rounded-lg border flex-1 w-full">
              <Table>
                <TableHeader className="sticky top-0 bg-background">
                  <TableRow>
                    {detailType === "revenue-daily" && <TableHead className="w-6" />}
                    {detailTable.headers.map((h) => (
                      <TableHead key={h} className="whitespace-nowrap text-xs">{h}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detailTable.rows.map((row, i) => {
                    const key = detailType === "revenue-daily" ? dateKey(row[0] as string) : null
                    const movies = key ? dayBreakdown[key] : undefined
                    const isOpen = key !== null && expandedDay === key
                    return (
                      <Fragment key={i}>
                        <TableRow
                          className={key ? "cursor-pointer hover:bg-muted/40" : undefined}
                          onClick={key ? () => setExpandedDay(isOpen ? null : key) : undefined}
                        >
                          {detailType === "revenue-daily" && (
                            <TableCell className="w-6">
                              {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                            </TableCell>
                          )}
                          {row.map((cell, j) => (
                            <TableCell key={j} className="whitespace-nowrap text-xs">
                              {detailType === "revenue-daily" && j === 0 && cell
                                ? new Date(cell as string).toLocaleDateString("vi-VN", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" })
                                : (cell ?? "—")}
                            </TableCell>
                          ))}
                        </TableRow>
                        {isOpen && (
                          <TableRow>
                            <TableCell colSpan={detailTable.headers.length + 1} className="bg-muted/20 p-0">
                              {movies && movies.length > 0 ? (
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="text-muted-foreground">
                                      <th className="text-left font-medium py-1.5 pl-10">Phim</th>
                                      <th className="text-right font-medium py-1.5">Doanh thu</th>
                                      <th className="text-right font-medium py-1.5 pr-4">Số vé</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {movies.map((m, mi) => (
                                      <tr key={mi} className="border-t border-border/50">
                                        <td className="py-1.5 pl-10">{m.title}</td>
                                        <td className="py-1.5 text-right text-amber-600 font-medium">{fmtVND(Number(m.revenue))}</td>
                                        <td className="py-1.5 text-right pr-4">{m.tickets} vé</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              ) : (
                                <p className="text-xs text-muted-foreground py-2 pl-10">Không có dữ liệu theo phim cho ngày này.</p>
                              )}
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          ) : null}

          {detailTable && (
            <div className="flex justify-end pt-2 shrink-0">
              <Button
                size="sm" variant="outline" className="gap-2"
                onClick={() => detailType && downloadCSV(detailType, detailTable.label)}
                disabled={!!downloading}
              >
                <Download className="h-3.5 w-3.5" /> Tải CSV file này
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
