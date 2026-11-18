"use client"

export const dynamic = "force-dynamic"

import React, { useEffect, useState, useCallback } from "react"
import { AdminSidebar } from "@/components/admin-sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Switch } from "@/components/ui/switch"
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion"
import {
  Clock, Plus, Edit, Trash2, Search, RefreshCw, Film, CalendarDays,
  Ticket, BarChart3, XCircle, CheckCircle, Filter, Building2, X, History, AlertTriangle, RotateCcw,
} from "lucide-react"
import { format, startOfWeek, endOfWeek } from "date-fns"
import { vi } from "date-fns/locale"
import { formatVND } from "@/lib/utils"
import { getMovies } from "@/lib/api/movies"
import { getCinemas } from "@/lib/api/cinemas"
import {
  listShowtimesAdmin, createShowtimeAdmin, updateShowtimeAdmin, deleteShowtimeAdmin,
} from "@/lib/api/admin/showtimes"
import { useRequireAdmin } from "@/hooks/use-require-admin"
import { ShowtimeIncidentDialog, ShowtimeIncidentHistory } from "@/components/admin/showtime-incident"
import { BulkIncidentDialog } from "@/components/admin/bulk-incident"
import { ShowtimeTimeline } from "@/components/admin/showtime-timeline"
import { listRoomsAdmin, type AdminRoom } from "@/lib/api/admin/rooms"
import { useAuth } from "@/lib/auth"
import { khoiPhucSuat } from "@/lib/api/admin/refunds"

interface Showtime {
  id: number
  movie_id: number
  cinema_id: number
  movie_title: string
  cinema_name: string
  show_date: string
  show_time: string
  tickets_sold: number
  total_seats: number
  price: number
  is_full: boolean
  /** Phục vụ chế độ xem dòng thời gian — mỗi phòng một hàng */
  room_id?: number | null
  room_name?: string | null
  room_type?: string | null
  /** Thời lượng phim (phút) — quyết định độ rộng khối trên dòng thời gian */
  duration?: number | null
  /** CANCELLED = đã huỷ vì sự cố (xem Báo sự cố) */
  status?: "ACTIVE" | "CANCELLED"
}

interface MovieOption { id: number; title: string }
interface CinemaOption { id: number; name: string; location?: string }

const EMPTY_FORM = { movie_id: "", cinema_id: "", show_date: "", show_time: "", price: "90000", total_seats: "100" }

const todayStr = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

export default function AdminShowtimes() {
  const { loading: authLoading, allowed, forbidden } = useRequireAdmin()
  const { user } = useAuth()
  const laAdmin = !!user?.can_manage_users
  const [showtimes, setShowtimes] = useState<Showtime[]>([])
  const [movies, setMovies] = useState<MovieOption[]>([])
  const [cinemas, setCinemas] = useState<CinemaOption[]>([])
  const [loading, setLoading] = useState(true)

  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [dateFilter, setDateFilter] = useState("all")
  // Lọc theo NGÀY CỤ THỂ (chọn hẳn 1 ngày/tháng/năm) — độc lập với 3 lựa
  // chọn nhanh "Mọi thời gian/Hôm nay/Từ hôm nay" ở trên, có giá trị thì ưu
  // tiên hơn (ghi đè dateFilter) vì đây là ý định lọc CỤ THỂ hơn hẳn.
  const [exactDate, setExactDate] = useState("")
  const [cinemaFilter, setCinemaFilter] = useState("all")
  const [movieFilter, setMovieFilter] = useState("all")
  // Mặc định ẨN suất đã qua — danh sách có thể lên tới hàng nghìn suất chiếu
  // lịch sử, hầu như không ai cần xem lại mỗi lần vào trang. Bật nút này lên
  // khi thực sự cần tra cứu suất cũ, thay vì luôn tải/hiện cả list khổng lồ.
  const [showPast, setShowPast] = useState(false)

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Showtime | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Showtime | null>(null)
  const [incidentTarget, setIncidentTarget] = useState<Showtime | null>(null)
  const [incidentRefresh, setIncidentRefresh] = useState(0)
  // Khôi phục suất đã huỷ (migration 49) — quyền ghi đè, chỉ quản trị viên
  // Chế độ hiển thị lịch. Mặc định DÒNG THỜI GIAN: người xếp lịch cần thấy
  // khoảng trống của từng phòng, bảng chữ không cho thấy điều đó.
  const [cheDoXem, setCheDoXem] = useState<"timeline" | "bang">("timeline")
  // Dòng thời gian xem MỘT ngày một lúc. Đổ cả tuần lên cùng một trục giờ
  // thì các khối chồng lên nhau và mất hết ý nghĩa.
  const [ngayXem, setNgayXem] = useState<string>(todayStr())
  const [restoreTarget, setRestoreTarget] = useState<Showtime | null>(null)
  const [restorePreview, setRestorePreview] = useState<any>(null)
  const [restoring, setRestoring] = useState(false)

  // Xem trước khi mở hộp thoại khôi phục: gọi cùng endpoint với preview=true
  // nên KHÔNG ghi gì, chỉ đếm khách cũ và tình trạng các lệnh hoàn tiền.
  useEffect(() => {
    if (!restoreTarget) { setRestorePreview(null); return }
    let huy = false
    khoiPhucSuat(restoreTarget.id, { preview: true })
      .then((d) => { if (!huy) setRestorePreview(d) })
      .catch(() => { if (!huy) setRestorePreview(null) })
    return () => { huy = true }
  }, [restoreTarget])
  // Sự cố diện rộng (mất điện cả rạp, sửa chữa nhiều phòng)
  const [moHangLoat, setMoHangLoat] = useState(false)
  const [rooms, setRooms] = useState<AdminRoom[]>([])
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [alert, setAlert] = useState<{ type: "success" | "error"; text: string } | null>(null)

  const showAlert = (type: "success" | "error", text: string) => {
    setAlert({ type, text })
    setTimeout(() => setAlert(null), 4000)
  }

  const fetchShowtimes = useCallback(async () => {
    setLoading(true)
    const hasToken = typeof window !== "undefined" && (sessionStorage.getItem("auth_token") || localStorage.getItem("auth_token"))
    if (!hasToken) { setLoading(false); return }
    try {
      // Chỉ tải cả lịch sử khi người dùng thật sự cần xem suất đã qua.
      const data = await listShowtimesAdmin({ all: showPast })
      setShowtimes(
        data.map((s: any) => ({
          id: s.id,
          movie_id: s.movie_id,
          cinema_id: s.cinema_id,
          movie_title: s.movie_title || s.title || "-",
          cinema_name: s.cinema_name || s.cinema || "-",
          show_date: s.show_date,
          show_time: s.show_time,
          tickets_sold: s.tickets_sold || 0,
          total_seats: s.total_seats || 0,
          price: s.price || 0,
          is_full: (s.tickets_sold || 0) >= (s.total_seats || 1),
          // PHẢI chép các trường này sang: hàm map tạo object MỚI, trường nào
          // không liệt kê ở đây là mất. Thiếu room_name thì dòng thời gian gom
          // hết mọi suất vào một hàng "Chưa gán phòng"; thiếu status thì suất
          // đã huỷ vì sự cố lại hiện là "Còn vé".
          room_id: s.room_id ?? null,
          room_name: s.room_name ?? null,
          room_type: s.room_type ?? null,
          duration: s.duration ?? null,
          status: s.status ?? "ACTIVE",
        })),
      )
    } catch (err) {
      console.error("Tải danh sách suất chiếu thất bại:", err)
      showAlert("error", "Không thể tải suất chiếu")
    }
    finally { setLoading(false) }
  }, [showPast])

  const fetchOptions = useCallback(async () => {
    const [movies, cinemas] = await Promise.all([getMovies(), getCinemas()])
    setMovies(movies as any)
    setCinemas(cinemas as any)
    // Danh sách phòng cho hộp thoại sự cố diện rộng (chọn theo dãy phòng).
    // Quản lý chi nhánh gọi API này vẫn được vì nó công khai chỉ-đọc.
    listRoomsAdmin().then(setRooms).catch(() => setRooms([]))
  }, [])

  useEffect(() => {
    fetchShowtimes()
    fetchOptions()
  }, [fetchShowtimes, fetchOptions])

  const openAdd = () => { setEditing(null); setForm(EMPTY_FORM); setFormOpen(true) }
  const openEdit = (s: Showtime) => {
    setEditing(s)
    setForm({
      movie_id: "",
      cinema_id: "",
      show_date: s.show_date,
      show_time: s.show_time,
      price: String(s.price),
      total_seats: String(s.total_seats),
    })
    setFormOpen(true)
  }

  const handleSave = async () => {
    if (!form.show_date || !form.show_time) { showAlert("error", "Vui lòng chọn ngày và giờ chiếu"); return }
    if (!editing && (!form.movie_id || !form.cinema_id)) { showAlert("error", "Vui lòng chọn phim và rạp"); return }
    setSaving(true)
    try {
      if (editing) {
        await updateShowtimeAdmin(editing.id, {
          show_date: form.show_date, show_time: form.show_time,
          price: Number(form.price), total_seats: Number(form.total_seats),
        })
      } else {
        await createShowtimeAdmin({
          movie_id: Number(form.movie_id), cinema_id: Number(form.cinema_id),
          show_date: form.show_date, show_time: form.show_time,
          price: Number(form.price), total_seats: Number(form.total_seats),
        })
      }
      showAlert("success", editing ? "Đã cập nhật suất chiếu" : "Đã tạo suất chiếu mới")
      setFormOpen(false)
      fetchShowtimes()
    } catch (e: any) {
      showAlert("error", e.message || "Không thể lưu")
    } finally { setSaving(false) }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await deleteShowtimeAdmin(deleteTarget.id)
      showAlert("success", "Đã xoá suất chiếu")
      setDeleteTarget(null)
      fetchShowtimes()
    } catch (e: any) { showAlert("error", e.message || "Không thể xoá"); setDeleteTarget(null) }
  }

  const today = todayStr()
  const filtered = showtimes.filter((s) => {
    const matchSearch =
      s.movie_title.toLowerCase().includes(search.toLowerCase()) ||
      s.cinema_name.toLowerCase().includes(search.toLowerCase())
    const isPast = s.show_date < today
    // Nút "Hiện suất đã qua" điều khiển việc này — nhưng nếu admin đã chủ
    // đích chọn 1 NGÀY CỤ THỂ (kể cả ngày trong quá khứ) để tra cứu, luôn tôn
    // trọng lựa chọn đó, không ẩn đi chỉ vì nút đang tắt.
    const matchPast = showPast || !isPast || !!exactDate
    const matchStatus =
      statusFilter === "all" ? true
      : statusFilter === "upcoming" ? !isPast && !s.is_full
      : statusFilter === "full" ? s.is_full
      : true
    const matchDate = exactDate
      ? s.show_date === exactDate
      : dateFilter === "all" ? true
      : dateFilter === "today" ? s.show_date === today
      : dateFilter === "future" ? s.show_date >= today
      : true
    const matchCinema = cinemaFilter === "all" ? true : String(s.cinema_id) === cinemaFilter
    const matchMovie = movieFilter === "all" ? true : String(s.movie_id) === movieFilter
    return matchSearch && matchPast && matchStatus && matchDate && matchCinema && matchMovie
  })

  const total = showtimes.length
  const upcoming = showtimes.filter((s) => s.show_date >= today && !s.is_full).length
  const fullCount = showtimes.filter((s) => s.is_full).length
  const pastCount = showtimes.filter((s) => s.show_date < today).length

  // Nhóm theo TUẦN (Thứ 2 - CN) rồi theo RẠP bên trong — thay vì 1 bảng phẳng
  // hàng nghìn dòng, admin thấy ngay từng tuần/từng rạp, có thể mở/đóng riêng.
  const weekGroups = (() => {
    const byWeek = new Map<string, { start: string; end: string; items: Showtime[] }>()
    for (const s of filtered) {
      const d = new Date(s.show_date + "T00:00:00")
      const start = format(startOfWeek(d, { weekStartsOn: 1 }), "yyyy-MM-dd")
      const end = format(endOfWeek(d, { weekStartsOn: 1 }), "yyyy-MM-dd")
      if (!byWeek.has(start)) byWeek.set(start, { start, end, items: [] })
      byWeek.get(start)!.items.push(s)
    }
    return Array.from(byWeek.values())
      .sort((a, b) => a.start.localeCompare(b.start))
      .map((w) => {
        const byCinema = new Map<string, Showtime[]>()
        for (const s of w.items) {
          if (!byCinema.has(s.cinema_name)) byCinema.set(s.cinema_name, [])
          byCinema.get(s.cinema_name)!.push(s)
        }
        const cinemaGroups = Array.from(byCinema.entries())
          .map(([name, items]) => ({
            name,
            items: items.sort((a, b) => (a.show_date + a.show_time).localeCompare(b.show_date + b.show_time)),
          }))
          .sort((a, b) => a.name.localeCompare(b.name))
        return { ...w, cinemaGroups, count: w.items.length }
      })
  })()

  // ── Dữ liệu cho chế độ DÒNG THỜI GIAN (một ngày) ─────────────────────
  // Những ngày THỰC SỰ có suất, để thanh chọn ngày không hiện ngày trống.
  const cacNgayCoSuat = Array.from(new Set(filtered.map((s) => String(s.show_date).slice(0, 10)))).sort()

  // Ngày đang xem phải nằm trong danh sách: đổi bộ lọc xong mà ngày cũ không
  // còn suất nào thì nhảy về ngày gần nhất, thay vì hiện màn hình trống.
  const ngayHopLe = cacNgayCoSuat.includes(ngayXem)
    ? ngayXem
    : cacNgayCoSuat.find((d) => d >= todayStr()) ?? cacNgayCoSuat[cacNgayCoSuat.length - 1] ?? ngayXem

  const suatTrongNgay = filtered.filter((s) => String(s.show_date).slice(0, 10) === ngayHopLe)

  const nhomRapTrongNgay = (() => {
    const m = new Map<string, Showtime[]>()
    for (const s of suatTrongNgay) {
      if (!m.has(s.cinema_name)) m.set(s.cinema_name, [])
      m.get(s.cinema_name)!.push(s)
    }
    return Array.from(m.entries())
      .map(([name, items]) => ({ name, items }))
      .sort((a, b) => a.name.localeCompare(b.name, "vi"))
  })()

  const viTriNgay = cacNgayCoSuat.indexOf(ngayHopLe)
  const doiNgay = (buoc: number) => {
    const i = viTriNgay + buoc
    if (i >= 0 && i < cacNgayCoSuat.length) setNgayXem(cacNgayCoSuat[i])
  }

  // Tuần chứa hôm nay (hoặc tuần gần nhất) mặc định mở sẵn — còn lại đóng, để
  // không đổ hết hàng nghìn dòng ra màn hình ngay khi vào trang.
  const todayWeekStart = format(startOfWeek(new Date(today + "T00:00:00"), { weekStartsOn: 1 }), "yyyy-MM-dd")
  const defaultOpenWeek = weekGroups.find((w) => w.start === todayWeekStart)?.start ?? weekGroups[0]?.start

  const occupancyPct = (s: Showtime) =>
    s.total_seats > 0 ? Math.round((s.tickets_sold / s.total_seats) * 100) : 0

  const formatDate = (d: string) => {
    try { return new Date(d).toLocaleDateString("vi-VN", { weekday: "short", day: "2-digit", month: "2-digit" }) }
    catch { return d }
  }

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    )
  }
  if (forbidden) {
    return <div className="min-h-screen bg-background flex items-center justify-center text-muted-foreground">Không có quyền truy cập</div>
  }
  if (!allowed) return null

  return (
    <div className="min-h-screen bg-background">
      <div className="flex">
        <AdminSidebar />
        <main className="flex-1 p-6 lg:p-8 min-w-0">

          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold flex items-center gap-2">
                <Clock className="h-8 w-8 text-primary" /> Quản lý suất chiếu
              </h1>
              <p className="text-muted-foreground mt-1">Thêm, sửa, xoá và theo dõi suất chiếu</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={fetchShowtimes}><RefreshCw className="h-4 w-4 mr-1" /> Làm mới</Button>
              <Button variant="outline" size="sm" className="border-red-500/40 text-red-600 hover:text-red-700"
                onClick={() => setMoHangLoat(true)}>
                <AlertTriangle className="h-4 w-4 mr-1" /> Sự cố diện rộng
              </Button>
              <Button onClick={openAdd}><Plus className="h-4 w-4 mr-2" /> Thêm suất chiếu</Button>
            </div>
          </div>

          {alert && (
            <Alert className={`mb-4 ${alert.type === "success" ? "border-green-500 bg-green-500/10 text-green-700 dark:text-green-400" : "border-red-500 bg-red-500/10 text-red-700 dark:text-red-400"}`}>
              <AlertDescription>{alert.text}</AlertDescription>
            </Alert>
          )}

          {/* Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {[
              { label: "Tổng suất chiếu", value: total, icon: CalendarDays, color: "text-blue-500" },
              { label: "Sắp chiếu", value: upcoming, icon: CheckCircle, color: "text-green-500" },
              { label: "Đã qua", value: pastCount, icon: BarChart3, color: "text-gray-500" },
              { label: "Hết vé", value: fullCount, icon: XCircle, color: "text-red-500" },
            ].map((s) => (
              <Card key={s.label}>
                <CardContent className="p-4 flex items-center gap-3">
                  <div className={`p-2 rounded-lg bg-muted ${s.color}`}><s.icon className="h-5 w-5" /></div>
                  <div>
                    <p className="text-2xl font-bold">{s.value}</p>
                    <p className="text-xs text-muted-foreground">{s.label}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Filters */}
          <Card className="mb-4">
            <CardContent className="py-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative flex-1 min-w-[180px] max-w-xs">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Tìm phim, rạp..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
                </div>

                <div className="h-5 w-px bg-border hidden sm:block" />

                {/* Lọc theo ngày CỤ THỂ — trước đây chỉ có 3 lựa chọn mơ hồ
                    (Mọi thời gian/Hôm nay/Từ hôm nay), không có cách chọn
                    đúng 1 ngày/tháng/năm cụ thể như admin cần khi tra cứu
                    suất chiếu 1 ngày xa trong tương lai/quá khứ. */}
                <div className="flex items-center gap-1.5">
                  <Input
                    type="date"
                    value={exactDate}
                    onChange={(e) => setExactDate(e.target.value)}
                    className="w-[150px]"
                    aria-label="Lọc theo ngày cụ thể"
                  />
                  {exactDate && (
                    <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => setExactDate("")} aria-label="Bỏ lọc ngày cụ thể">
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>

                {/* 3 lựa chọn nhanh — chỉ có tác dụng khi CHƯA chọn ngày cụ
                    thể ở trên (ngày cụ thể luôn ưu tiên hơn). */}
                <Select value={dateFilter} onValueChange={setDateFilter} disabled={!!exactDate}>
                  <SelectTrigger className="w-40">
                    <CalendarDays className="h-3.5 w-3.5 mr-1.5 text-muted-foreground shrink-0" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Mọi thời gian</SelectItem>
                    <SelectItem value="today">Hôm nay</SelectItem>
                    <SelectItem value="future">Từ hôm nay</SelectItem>
                  </SelectContent>
                </Select>

                <div className="h-5 w-px bg-border hidden sm:block" />

                {/* Lọc theo RẠP cụ thể — trước đây hoàn toàn không có, muốn
                    xem riêng 1 rạp phải tự dò bằng mắt trong bảng. */}
                <Select value={cinemaFilter} onValueChange={setCinemaFilter}>
                  <SelectTrigger className="w-48">
                    <Building2 className="h-3.5 w-3.5 mr-1.5 text-muted-foreground shrink-0" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Mọi rạp</SelectItem>
                    {cinemas.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Lọc theo PHIM cụ thể — chính xác hơn ô tìm kiếm tự do (vd
                    tránh gõ sai/thiếu dấu không khớp được). */}
                <Select value={movieFilter} onValueChange={setMovieFilter}>
                  <SelectTrigger className="w-48">
                    <Film className="h-3.5 w-3.5 mr-1.5 text-muted-foreground shrink-0" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Mọi phim</SelectItem>
                    {movies.map((m) => (
                      <SelectItem key={m.id} value={String(m.id)}>{m.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-40">
                    <Filter className="h-3.5 w-3.5 mr-1.5 text-muted-foreground shrink-0" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Mọi trạng thái</SelectItem>
                    <SelectItem value="upcoming">Sắp chiếu</SelectItem>
                    <SelectItem value="full">Hết vé</SelectItem>
                  </SelectContent>
                </Select>

                {(search || exactDate || dateFilter !== "all" || cinemaFilter !== "all" || movieFilter !== "all" || statusFilter !== "all") && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground gap-1.5"
                    onClick={() => { setSearch(""); setExactDate(""); setDateFilter("all"); setCinemaFilter("all"); setMovieFilter("all"); setStatusFilter("all") }}
                  >
                    <X className="h-3.5 w-3.5" /> Xoá bộ lọc
                  </Button>
                )}

                <div className="h-5 w-px bg-border hidden sm:block ml-auto" />

                {/* Suất đã qua mặc định ẨN (danh sách có thể lên tới hàng
                    nghìn suất lịch sử) — bật lên khi cần tra cứu lại. */}
                <label className="flex items-center gap-2 text-sm shrink-0 cursor-pointer select-none">
                  <History className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-muted-foreground">Hiện suất đã qua</span>
                  <Switch checked={showPast} onCheckedChange={setShowPast} />
                  {!showPast && pastCount > 0 && (
                    <Badge variant="secondary" className="text-[10px]">{pastCount} đang ẩn</Badge>
                  )}
                </label>
              </div>
            </CardContent>
          </Card>

          {/* Danh sách — nhóm theo TUẦN rồi theo RẠP, thay vì 1 bảng phẳng
              hàng nghìn dòng. Mỗi tuần là 1 accordion có thể mở/đóng riêng,
              mặc định chỉ tuần chứa hôm nay (hoặc tuần gần nhất) được mở sẵn. */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <CardTitle className="text-base">Danh sách suất chiếu ({filtered.length})</CardTitle>
                {/* Hai cách nhìn cùng một dữ liệu: dòng thời gian để THẤY chỗ
                    trống, bảng để tra cứu và thao tác hàng loạt. */}
                <div className="flex items-center gap-1 rounded-md border p-0.5">
                  <Button
                    variant={cheDoXem === "timeline" ? "default" : "ghost"}
                    size="sm"
                    className="h-7 gap-1.5 px-2.5 text-xs"
                    onClick={() => setCheDoXem("timeline")}
                  >
                    <CalendarDays className="h-3.5 w-3.5" /> Dòng thời gian
                  </Button>
                  <Button
                    variant={cheDoXem === "bang" ? "default" : "ghost"}
                    size="sm"
                    className="h-7 gap-1.5 px-2.5 text-xs"
                    onClick={() => setCheDoXem("bang")}
                  >
                    <Film className="h-3.5 w-3.5" /> Bảng
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="text-center py-10 text-muted-foreground">Đang tải...</p>
              ) : cheDoXem === "timeline" ? (
                /* ── XEM THEO NGÀY ─────────────────────────────────────
                   Một ngày, một trục giờ. Mỗi rạp một khung, trong đó mỗi
                   phòng một hàng riêng. Đổ cả tuần lên cùng trục giờ thì các
                   khối chồng lên nhau và không đọc được gì. */
                <div className="space-y-5">
                  {cacNgayCoSuat.length === 0 ? (
                    <p className="py-10 text-center text-muted-foreground">Không có suất chiếu nào khớp bộ lọc</p>
                  ) : (
                    <>
                      {/* Thanh chọn ngày */}
                      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 p-2">
                        <Button
                          variant="outline" size="sm" className="h-8 px-2"
                          disabled={viTriNgay <= 0}
                          onClick={() => doiNgay(-1)}
                          title="Ngày có suất trước đó"
                        >
                          ‹
                        </Button>

                        <Select value={ngayHopLe} onValueChange={setNgayXem}>
                          <SelectTrigger className="h-8 w-[220px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {cacNgayCoSuat.map((d) => (
                              <SelectItem key={d} value={d}>
                                {format(new Date(d + "T00:00:00"), "EEEE dd/MM/yyyy", { locale: vi })}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        <Button
                          variant="outline" size="sm" className="h-8 px-2"
                          disabled={viTriNgay >= cacNgayCoSuat.length - 1}
                          onClick={() => doiNgay(1)}
                          title="Ngày có suất kế tiếp"
                        >
                          ›
                        </Button>

                        {ngayHopLe !== todayStr() && cacNgayCoSuat.includes(todayStr()) && (
                          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setNgayXem(todayStr())}>
                            Hôm nay
                          </Button>
                        )}

                        <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
                          <Badge variant="secondary">{suatTrongNgay.length} suất</Badge>
                          <span>{nhomRapTrongNgay.length} rạp</span>
                        </div>
                      </div>

                      {/* Mỗi rạp một khung, bên trong mỗi phòng một hàng */}
                      {nhomRapTrongNgay.map((rap) => (
                        <div key={rap.name} className="overflow-hidden rounded-lg border">
                          <div className="flex items-center gap-1.5 border-b bg-muted/50 px-3 py-2 text-sm font-semibold">
                            <Building2 className="h-3.5 w-3.5 shrink-0 text-primary" />
                            {rap.name}
                            <Badge variant="secondary" className="ml-auto text-[10px]">{rap.items.length} suất</Badge>
                          </div>
                          <div className="p-3">
                            <ShowtimeTimeline
                              showtimes={rap.items as any}
                              onChonSuat={(st) => {
                                const goc = rap.items.find((x: Showtime) => x.id === st.id)
                                if (goc) openEdit(goc)
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              ) : weekGroups.length === 0 ? (
                <p className="text-center py-10 text-muted-foreground">Không có suất chiếu nào khớp bộ lọc</p>
              ) : (
                <Accordion type="multiple" defaultValue={defaultOpenWeek ? [defaultOpenWeek] : []}>
                  {weekGroups.map((w) => {
                    const isCurrentWeek = w.start === todayWeekStart
                    return (
                      <AccordionItem key={w.start} value={w.start}>
                        <AccordionTrigger className="hover:no-underline">
                          <div className="flex items-center gap-3 flex-wrap">
                            <span className="font-semibold">
                              Tuần {format(new Date(w.start + "T00:00:00"), "dd/MM", { locale: vi })} - {format(new Date(w.end + "T00:00:00"), "dd/MM/yyyy", { locale: vi })}
                            </span>
                            {isCurrentWeek && <Badge className="bg-primary/15 text-primary border-primary/30" variant="outline">Tuần này</Badge>}
                            <Badge variant="secondary">{w.count} suất</Badge>
                            <span className="text-xs text-muted-foreground">{w.cinemaGroups.length} rạp</span>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent>
                          <div className="space-y-4">
                            {w.cinemaGroups.map((cg) => (
                              <div key={cg.name} className="rounded-lg border overflow-hidden">
                                <div className="flex items-center gap-1.5 bg-muted/50 px-3 py-2 text-sm font-semibold">
                                  <Building2 className="h-3.5 w-3.5 text-primary shrink-0" />
                                  {cg.name}
                                  <Badge variant="secondary" className="ml-auto text-[10px]">{cg.items.length} suất</Badge>
                                </div>
                                <div className="overflow-auto">
                                  <Table>
                                    <TableHeader>
                                      <TableRow>
                                        <TableHead className="w-12">ID</TableHead>
                                        <TableHead>Phim</TableHead>
                                        <TableHead>Ngày</TableHead>
                                        <TableHead>Giờ</TableHead>
                                        <TableHead>Giá vé</TableHead>
                                        <TableHead>Lấp đầy</TableHead>
                                        <TableHead className="text-center">Trạng thái</TableHead>
                                        <TableHead className="text-right">Thao tác</TableHead>
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {cg.items.map((s) => {
                                        const pct = occupancyPct(s)
                                        const isPast = s.show_date < today
                                        return (
                                          <TableRow key={s.id} className={isPast ? "opacity-60" : ""}>
                                            <TableCell className="font-mono text-xs text-muted-foreground">{s.id}</TableCell>
                                            <TableCell>
                                              <div className="flex items-center gap-2">
                                                <Film className="h-3 w-3 text-primary shrink-0" />
                                                <span className="font-medium text-sm">{s.movie_title}</span>
                                              </div>
                                            </TableCell>
                                            <TableCell className="text-sm font-medium">{formatDate(s.show_date)}</TableCell>
                                            <TableCell className="font-mono text-sm">{s.show_time?.slice(0, 5)}</TableCell>
                                            <TableCell className="text-sm">{formatVND(s.price)}</TableCell>
                                            <TableCell>
                                              <div className="space-y-1 min-w-[80px]">
                                                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                                                  <div
                                                    className={`h-full rounded-full transition-all ${pct >= 90 ? "bg-red-500" : pct >= 60 ? "bg-amber-500" : "bg-green-500"}`}
                                                    style={{ width: `${pct}%` }}
                                                  />
                                                </div>
                                                <p className="text-xs text-muted-foreground">{s.tickets_sold}/{s.total_seats} ({pct}%)</p>
                                              </div>
                                            </TableCell>
                                            <TableCell className="text-center">
                                              {s.status === "CANCELLED" ? <Badge variant="destructive">Đã huỷ (sự cố)</Badge>
                                                : isPast ? <Badge variant="secondary">Đã qua</Badge>
                                                : s.is_full ? <Badge variant="destructive">Hết vé</Badge>
                                                : <Badge className="bg-green-500 text-white">Còn vé</Badge>}
                                            </TableCell>
                                            <TableCell className="text-right">
                                              <div className="flex items-center justify-end gap-1">
                                                {!isPast && s.status !== "CANCELLED" && (
                                                  <Button variant="ghost" size="sm" className="text-amber-600 hover:text-amber-700" title="Báo sự cố" onClick={() => setIncidentTarget(s)}><AlertTriangle className="h-4 w-4" /></Button>
                                                )}
                                                {/* Khôi phục suất huỷ nhầm / sự cố khắc phục sớm — CHỈ admin
                                                    (backend chặn bằng requireAdmin). Người huỷ không được là
                                                    người khôi phục, nếu không thao tác khẩn cấp mất kiểm soát. */}
                                                {!isPast && s.status === "CANCELLED" && laAdmin && (
                                                  <Button variant="ghost" size="sm" className="text-emerald-600 hover:text-emerald-700" title="Khôi phục suất chiếu" onClick={() => setRestoreTarget(s)}><RotateCcw className="h-4 w-4" /></Button>
                                                )}
                                                <Button variant="ghost" size="sm" onClick={() => openEdit(s)}><Edit className="h-4 w-4" /></Button>
                                                <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-600" onClick={() => setDeleteTarget(s)}><Trash2 className="h-4 w-4" /></Button>
                                              </div>
                                            </TableCell>
                                          </TableRow>
                                        )
                                      })}
                                    </TableBody>
                                  </Table>
                                </div>
                              </div>
                            ))}
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    )
                  })}
                </Accordion>
              )}
            </CardContent>
          </Card>

          <ShowtimeIncidentHistory refreshKey={incidentRefresh} />
        </main>
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Chỉnh sửa suất chiếu" : "Thêm suất chiếu mới"}</DialogTitle>
            <DialogDescription>{editing ? `Cập nhật suất chiếu #${editing.id} — ${editing.movie_title}` : "Tạo suất chiếu thủ công"}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {!editing && (
              <>
                <div className="space-y-2">
                  <Label>Phim *</Label>
                  <Select value={form.movie_id} onValueChange={(v) => setForm((f) => ({ ...f, movie_id: v }))}>
                    <SelectTrigger><SelectValue placeholder="Chọn phim" /></SelectTrigger>
                    <SelectContent>
                      {movies.map((m) => <SelectItem key={m.id} value={String(m.id)}>{m.title}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Rạp *</Label>
                  <Select value={form.cinema_id} onValueChange={(v) => setForm((f) => ({ ...f, cinema_id: v }))}>
                    <SelectTrigger><SelectValue placeholder="Chọn rạp" /></SelectTrigger>
                    <SelectContent>
                      {cinemas.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}{c.location ? ` — ${c.location}` : ""}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Ngày chiếu *</Label>
                <Input type="date" value={form.show_date} min={today} onChange={(e) => setForm((f) => ({ ...f, show_date: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Giờ chiếu *</Label>
                <Input type="time" value={form.show_time} onChange={(e) => setForm((f) => ({ ...f, show_time: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Giá vé (VNĐ)</Label>
                <Input type="number" min={1000} step={1000} value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Tổng số ghế</Label>
                <Input type="number" min={1} value={form.total_seats} onChange={(e) => setForm((f) => ({ ...f, total_seats: e.target.value }))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)} disabled={saving}>Hủy</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Đang lưu..." : editing ? "Cập nhật" : "Tạo suất chiếu"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sự cố DIỆN RỘNG — chọn cả rạp hoặc nhiều phòng trong một khoảng giờ */}
      <BulkIncidentDialog
        open={moHangLoat}
        onClose={() => setMoHangLoat(false)}
        onDone={() => { fetchShowtimes(); setIncidentRefresh((n) => n + 1) }}
        cinemas={cinemas as any}
        rooms={rooms as any}
        cinemaIdMacDinh={(user as any)?.cinema_id ?? null}
        laAdmin={!!user?.can_manage_users}
      />

      {/* Báo sự cố — email + thông báo cho khách, tuỳ chọn huỷ suất và hoàn tiền */}
      <ShowtimeIncidentDialog
        showtime={incidentTarget}
        onClose={() => setIncidentTarget(null)}
        onDone={() => { fetchShowtimes(); setIncidentRefresh((n) => n + 1) }}
      />

      {/* KHÔI PHỤC SUẤT ĐÃ HUỶ — quyền ghi đè của quản trị viên (migration 49).
          Xem trước để biết có bao nhiêu khách cũ và lệnh hoàn đã chạy tới đâu
          TRƯỚC khi bấm, vì vé đã huỷ sẽ KHÔNG tự sống lại. */}
      <AlertDialog
        open={!!restoreTarget}
        onOpenChange={(o) => { if (!o) { setRestoreTarget(null); setRestorePreview(null) } }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Khôi phục suất chiếu đã huỷ</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm">
                <p>
                  Mở bán lại suất <strong>{restoreTarget?.movie_title}</strong> ngày {restoreTarget?.show_date} lúc{" "}
                  {restoreTarget?.show_time?.slice(0, 5)}?
                </p>
                {restorePreview && (
                  <div className="rounded border p-3 space-y-1 text-xs">
                    <div>Khách từng có vé ở suất này: <strong>{restorePreview.khach_cu}</strong></div>
                    <div>Lệnh hoàn tiền đã tạo: <strong>{restorePreview.lenh_hoan}</strong> (đã hoàn xong: {restorePreview.lenh_hoan_da_xong})</div>
                    <div>Tổng tiền đang hoàn: <strong>{restorePreview.tien_da_hoan?.toLocaleString("vi-VN")}đ</strong></div>
                  </div>
                )}
                <p className="text-amber-600">
                  Vé cũ <strong>không tự khôi phục</strong> — tiền có thể đã hoàn và ghế đã được nhả. Khách cũ sẽ nhận
                  thông báo mời đặt lại, ghế còn trống theo thứ tự đặt trước.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={restoring}>Huỷ</AlertDialogCancel>
            <AlertDialogAction
              disabled={restoring}
              onClick={async (e) => {
                e.preventDefault()
                if (!restoreTarget) return
                setRestoring(true)
                try {
                  await khoiPhucSuat(restoreTarget.id, { lyDo: "Sự cố đã khắc phục / huỷ nhầm" })
                  setRestoreTarget(null)
                  setRestorePreview(null)
                  fetchShowtimes()
                  setIncidentRefresh((n) => n + 1)
                  showAlert("success", "Đã khôi phục suất chiếu và mời khách cũ đặt lại.")
                } catch (err: any) {
                  showAlert("error", err?.message || "Không khôi phục được suất chiếu")
                } finally {
                  setRestoring(false)
                }
              }}
            >
              {restoring ? "Đang khôi phục..." : "Khôi phục"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xác nhận xoá suất chiếu</AlertDialogTitle>
            <AlertDialogDescription>
              Xoá suất chiếu <strong>{deleteTarget?.movie_title}</strong> ngày {deleteTarget?.show_date} lúc {deleteTarget?.show_time?.slice(0,5)}?
              Tất cả vé đã đặt liên quan sẽ bị ảnh hưởng.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction className="bg-red-500 hover:bg-red-600" onClick={handleDelete}>Xoá</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
