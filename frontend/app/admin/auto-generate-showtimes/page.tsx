"use client"

import { useState, useEffect } from "react"
import { AdminSidebar } from "@/components/admin-sidebar"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Clock,
  TrendingUp,
  TrendingDown,
  Minus,
  Film,
  Play,
  Eye,
  CheckCircle,
  AlertCircle,
  CalendarDays,
  RefreshCw,
  Trash2,
  BarChart3,
  Building2,
  Ticket,
  Calculator,
  DollarSign,
} from "lucide-react"
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  BarChart, Cell, LabelList,
} from "recharts"
import { format, addDays, startOfWeek } from "date-fns"
import { vi } from "date-fns/locale"
import {
  getGenerationStats, previewGeneration, generateWeeklyShowtimes, deleteWeekShowtimes,
  getTrendingMovies, boostMovieShowtimes,
  type GenerationPreviewData, type GenerationResult, type GenerationStats, type TrendingMovie,
  type BoostResult, type BoostScheduleItem,
} from "@/lib/api/admin/auto-generate"
import { useRequireAdmin } from "@/hooks/use-require-admin"
import { ShowtimeWeekCalendar } from "@/components/admin/showtime-week-calendar"
import { ShowtimeMovieCoverageCard } from "@/components/admin/showtime-movie-coverage-card"
import { formatVND } from "@/lib/utils"

const STATUS_BADGE: Record<string, string> = {
  NOW_SHOWING: "bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30",
  COMING_SOON: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
  ENDED: "bg-gray-500/15 text-gray-600 dark:text-gray-400 border-gray-500/30",
}

const STATUS_LABEL: Record<string, string> = {
  NOW_SHOWING: "Đang chiếu",
  COMING_SOON: "Sắp chiếu",
  ENDED: "Ngừng chiếu",
}

/** Score >=100 = tier HIGH, >=30 = MEDIUM, còn lại = LOW — khớp POPULARITY_TIERS ở backend. */
function scoreTier(score: number | null | undefined) {
  const s = Number(score) || 0
  if (s >= 100) return { label: "Cao", className: "bg-purple-500/15 text-purple-700 dark:text-purple-400 border-purple-500/30" }
  if (s >= 30) return { label: "T.bình", className: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30" }
  return { label: "Thấp", className: "bg-slate-500/15 text-slate-600 dark:text-slate-400 border-slate-500/30" }
}

function TrendArrow({ current, previous }: { current: number; previous: number | undefined }) {
  if (previous == null) return null
  if (current > previous) return <TrendingUp className="inline h-3.5 w-3.5 text-green-600 ml-1" />
  if (current < previous) return <TrendingDown className="inline h-3.5 w-3.5 text-red-500 ml-1" />
  return <Minus className="inline h-3.5 w-3.5 text-muted-foreground ml-1" />
}

const ROOM_TYPE_LABEL: Record<string, string> = { standard: "Thường", vip: "VIP", imax: "IMAX", "4dx": "4DX" }

/** Danh sách suất đôn thêm: ngày, giờ, rạp, phòng, giá, và suất bị thay (nếu có). */
function BangSuatDon({ items }: { items: BoostScheduleItem[] }) {
  if (!items.length) return null
  return (
    <div className="mt-3 overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Ngày</TableHead>
            <TableHead>Giờ chiếu</TableHead>
            <TableHead>Rạp · Phòng</TableHead>
            <TableHead className="text-right">Giá vé</TableHead>
            <TableHead>Cách xếp</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((s, i) => (
            <TableRow key={`${s.id ?? "moi"}-${i}`}>
              <TableCell className="whitespace-nowrap">
                {format(new Date(`${s.show_date}T00:00:00`), "EEEE, dd/MM", { locale: vi })}
              </TableCell>
              <TableCell className="whitespace-nowrap font-medium">{s.show_time} – {s.end_time}</TableCell>
              <TableCell>
                {s.cinema_name}
                <span className="text-muted-foreground"> · {s.room_name} ({ROOM_TYPE_LABEL[s.room_type] || s.room_type}, {s.total_seats} ghế)</span>
              </TableCell>
              <TableCell className="text-right whitespace-nowrap">{formatVND(s.price)}</TableCell>
              <TableCell className="text-xs">
                {s.kind === "new" ? (
                  <Badge variant="outline" className="border-green-500/40 text-green-700 dark:text-green-400">Giờ trống</Badge>
                ) : (
                  <span>
                    <Badge variant="outline" className="border-orange-500/40 text-orange-700 dark:text-orange-400">Thay suất</Badge>{" "}
                    <span className="text-muted-foreground">
                      của "{s.replaced_movie_title}" (0 vé đã bán
                      {s.replaced_movie_recent_tickets === 0 ? ", phim không bán được vé nào 7 ngày qua" : ""}; ngày này phim đó còn {s.replaced_movie_remaining_that_day} suất)
                    </span>
                  </span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

export default function AutoGenerateShowtimesPage() {
  const { loading: authLoading, allowed, forbidden } = useRequireAdmin()
  const [loading, setLoading] = useState(false)
  const [previewData, setPreviewData] = useState<GenerationPreviewData | null>(null)
  const [generationResult, setGenerationResult] = useState<GenerationResult | null>(null)
  const [stats, setStats] = useState<GenerationStats | null>(null)
  const [weekStart, setWeekStart] = useState(() => {
    const nextMonday = startOfWeek(addDays(new Date(), 7), { weekStartsOn: 1 })
    return format(nextMonday, 'yyyy-MM-dd')
  })
  const [message, setMessage] = useState<{ type: "success" | "error", text: string } | null>(null)
  const [regenerating, setRegenerating] = useState(false)

  const [trending, setTrending] = useState<TrendingMovie[]>([])
  const [trendingLoading, setTrendingLoading] = useState(false)
  // Cửa sổ so sánh độ hot. Phim hot lên/xuống theo NGÀY nên 1 ngày bắt sóng
  // nhạy nhất; 3 ngày ổn định hơn, ít nhiễu vì một buổi bán bất thường.
  const [trendWindow, setTrendWindow] = useState<1 | 2 | 3>(1)
  const [boostingId, setBoostingId] = useState<number | null>(null)
  // Kế hoạch đôn suất đang chờ admin xác nhận, và kết quả sau khi đã đôn
  const [keHoach, setKeHoach] = useState<{ movieId: number; suggested: number; result: BoostResult } | null>(null)
  const [ketQuaDon, setKetQuaDon] = useState<BoostResult | null>(null)

  // Chỉ nạp thống kê ở đây. KHÔNG gọi loadTrending() — effect theo [trendWindow]
  // bên dưới đã tự chạy một lần lúc mount rồi; gọi ở cả hai chỗ khiến mỗi lần
  // mở trang bắn 2 request giống hệt nhau lên /showtimes/trending.
  useEffect(() => {
    loadStats()
  }, [])

  const loadStats = async () => {
    try {
      setStats(await getGenerationStats())
    } catch (error) {
      console.error("Failed to load stats:", error)
    }
  }

  // Đổi cửa sổ thì nạp lại ngay, không cần bấm nút
  useEffect(() => { loadTrending() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [trendWindow])

  const loadTrending = async () => {
    setTrendingLoading(true)
    try {
      setTrending(await getTrendingMovies(trendWindow))
    } catch (error) {
      console.error("Failed to load trending movies:", error)
    } finally {
      setTrendingLoading(false)
    }
  }

  // Bước 1: lấy KẾ HOẠCH (không ghi gì) để admin thấy suất sẽ nằm ở đâu, mấy
  // giờ, có thay suất của phim nào không — rồi mới quyết định.
  const handleBoost = async (movie: TrendingMovie) => {
    setBoostingId(movie.id)
    setMessage(null)
    setKetQuaDon(null)
    try {
      const plan = await boostMovieShowtimes(movie.id, movie.suggested_additional_showtimes, true)
      if (!plan.success) {
        setMessage({ type: "error", text: plan.message || "Không thể lập kế hoạch đôn suất" })
      } else if (!plan.inserted) {
        setMessage({
          type: "error",
          text: `Không xếp được suất nào cho "${plan.movie}": mọi phòng đã kín giờ trong 7 ngày tới và không còn suất nào đủ điều kiện nhường (chưa bán vé, còn ≥ 3 giờ, của phim kém hút khách hơn và vừa đủ thời lượng).`,
        })
      } else {
        setKeHoach({ movieId: movie.id, suggested: movie.suggested_additional_showtimes, result: plan })
      }
    } catch (error: any) {
      setMessage({ type: "error", text: error?.message || "Lỗi kết nối server" })
    } finally {
      setBoostingId(null)
    }
  }

  // Bước 2: admin đã xem kế hoạch và bấm xác nhận → ghi thật.
  const handleConfirmBoost = async () => {
    if (!keHoach) return
    setBoostingId(keHoach.movieId)
    try {
      const result = await boostMovieShowtimes(keHoach.movieId, keHoach.suggested)
      setKeHoach(null)
      if (result.success && result.inserted) {
        setKetQuaDon(result)
        setMessage({
          type: "success",
          text: `✅ Đã thêm ${result.inserted} suất chiếu cho "${result.movie}"` +
            (result.replaced ? ` (${result.replaced} suất thay cho phim ế, ${result.insertedNew} suất chèn vào giờ trống)` : "") +
            (result.notInserted ? `. ${result.notInserted} suất không xếp được.` : "."),
        })
        loadStats()
        loadTrending()
      } else {
        setMessage({ type: "error", text: result.message || "Không xếp được suất nào — lịch vừa thay đổi, hãy bấm lại để lập kế hoạch mới." })
      }
    } catch (error: any) {
      setMessage({ type: "error", text: error?.message || "Lỗi kết nối server" })
    } finally {
      setBoostingId(null)
    }
  }

  const handlePreview = async () => {
    setLoading(true)
    setMessage(null)
    setGenerationResult(null)

    try {
      const data = await previewGeneration(weekStart)
      if (data.success && data.data) {
        setPreviewData(data.data)
        setMessage({
          type: "success",
          text: `Xem trước thành công! Dự kiến ${data.data.estimated_total_showtimes} suất chiếu cho ${data.data.movies_count} phim.`
        })
      } else {
        setMessage({ type: "error", text: data.message || "Không thể tạo preview" })
      }
    } catch (error: any) {
      setMessage({ type: "error", text: error?.message || "Lỗi kết nối server" })
    } finally {
      setLoading(false)
    }
  }

  const handleGenerate = async () => {
    if (!confirm(`Xác nhận TẠO THẬT ${previewData?.estimated_total_showtimes ?? ""} suất chiếu cho tuần ${weekStart}? Thao tác này sẽ lưu vào database, khách có thể đặt vé ngay sau khi tạo.`)) return

    setLoading(true)
    setMessage(null)

    try {
      const data = await generateWeeklyShowtimes(weekStart)
      if (data.success && data.data) {
        setGenerationResult(data.data)
        setMessage({
          type: "success",
          text: `✅ Đã tạo ${data.data.generated} suất chiếu thành công! (${data.data.skipped} bị bỏ qua, ${data.data.errors} lỗi)`
        })
        setPreviewData(null)
        loadStats()
      } else {
        setMessage({ type: "error", text: data.message || "Không thể tạo suất chiếu" })
      }
    } catch (error: any) {
      setMessage({ type: "error", text: error?.message || "Lỗi kết nối server" })
    } finally {
      setLoading(false)
    }
  }

  const handleRegenerate = async () => {
    if (!confirm(`Thao tác này sẽ XOÁ toàn bộ suất chiếu CHƯA BÁN VÉ của tuần ${weekStart}, sau đó tạo lại từ đầu. Suất chiếu đã có người đặt vé sẽ được giữ nguyên, không bị xoá. Tiếp tục?`)) return
    setRegenerating(true)
    setMessage(null)
    try {
      const delResult = await deleteWeekShowtimes(weekStart)
      if (!delResult.success) {
        setMessage({ type: "error", text: delResult.message || "Không thể xoá suất cũ" })
        return
      }
      const genResult = await generateWeeklyShowtimes(weekStart)
      if (genResult.success && genResult.data) {
        setGenerationResult(genResult.data)
        setPreviewData(null)
        setMessage({
          type: "success",
          text: `✅ Đã xoá ${delResult.deleted_count ?? 0} suất cũ và tạo lại ${genResult.data.generated} suất chiếu mới!`
        })
        loadStats()
      } else {
        setMessage({ type: "error", text: genResult.message || "Đã xoá suất cũ nhưng không thể tạo lại — hãy thử bấm \"Tạo Suất\" thủ công." })
      }
    } catch (error: any) {
      setMessage({ type: "error", text: error?.message || "Lỗi kết nối server" })
    } finally {
      setRegenerating(false)
    }
  }

  const handleDeleteWeek = async () => {
    if (!confirm(`Xoá toàn bộ suất chiếu CHƯA BÁN VÉ của tuần bắt đầu ${weekStart}? Suất đã có người đặt vé sẽ được giữ nguyên.`)) return

    setLoading(true)
    setMessage(null)

    try {
      const data = await deleteWeekShowtimes(weekStart)
      if (data.success) {
        setMessage({ type: "success", text: `✅ Đã xóa ${data.deleted_count} suất chiếu` })
        setGenerationResult(null)
        setPreviewData(null)
        loadStats()
      } else {
        setMessage({ type: "error", text: data.message || "Không thể xóa" })
      }
    } catch (error: any) {
      setMessage({ type: "error", text: error?.message || "Lỗi kết nối server" })
    } finally {
      setLoading(false)
    }
  }

  // Sau khi admin xoá 1 suất riêng lẻ ngay trên lịch — cập nhật số liệu tổng
  // (generated/estimated_total_showtimes) để không lệch với thực tế còn lại.
  const handleShowtimeDeleted = () => {
    setGenerationResult((prev) => prev ? { ...prev, generated: prev.generated - 1 } : prev)
    loadStats()
  }

  if (authLoading) {
    return <div className="min-h-screen bg-background flex items-center justify-center"><p className="text-muted-foreground">Loading...</p></div>
  }
  if (forbidden) {
    return <div className="min-h-screen bg-background flex items-center justify-center text-muted-foreground">Không có quyền truy cập</div>
  }
  if (!allowed) return null

  // Nguồn dữ liệu đang được xem: ưu tiên kết quả THẬT vừa tạo, không thì mô phỏng.
  const activeData = generationResult ?? previewData
  const isPreviewMode = !generationResult

  return (
    <div className="min-h-screen bg-background">
      <div className="flex">
        <AdminSidebar />
        <main className="flex-1 p-6 lg:p-8 min-w-0">
          <div className="mb-6">
            <h1 className="text-3xl font-bold mb-2 flex items-center gap-2">
              <CalendarDays className="h-8 w-8 text-primary" />
              Tự động tạo lịch chiếu
            </h1>
            <p className="text-muted-foreground">
              Xem trước, tạo hàng loạt và tinh chỉnh từng suất chiếu ngay trên lịch trực quan
            </p>
          </div>

          {message && (
            <Alert className={`mb-6 ${message.type === "success" ? "border-green-500 bg-green-500/10" : "border-red-500 bg-red-500/10"}`}>
              {message.type === "success" ? <CheckCircle className="h-5 w-5 text-green-600" /> : <AlertCircle className="h-5 w-5 text-red-600" />}
              <AlertTitle className={message.type === "success" ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}>
                {message.type === "success" ? "Thành công" : "Lỗi"}
              </AlertTitle>
              <AlertDescription className={message.type === "success" ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}>
                {message.text}
              </AlertDescription>
            </Alert>
          )}

          {/* Trending */}
          <Card className="mb-6 border-orange-300">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-orange-700 dark:text-orange-400">
                <TrendingUp className="h-5 w-5" /> 🔥 Phim đang lên trend
              </CardTitle>
              <CardDescription>
                Phim đang tăng nhiệt hoặc đang kín suất trong {trendWindow} ngày gần đây — chỉ gợi ý, bạn tự quyết định phim nào cần đôn thêm suất.
              </CardDescription>

              {/* Chọn độ dài cửa sổ so sánh. Độ hot của phim thay đổi theo NGÀY,
                  nên cửa sổ ngắn phản ứng nhanh hơn với cơn sốt đang diễn ra;
                  cửa sổ dài ổn định hơn, ít bị nhiễu bởi một buổi bán bất thường. */}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground">So sánh theo:</span>
                {([1, 2, 3] as const).map((d) => (
                  <Button
                    key={d}
                    size="sm"
                    variant={trendWindow === d ? "default" : "outline"}
                    className="h-7 px-3 text-xs"
                    onClick={() => setTrendWindow(d)}
                  >
                    {d} ngày
                  </Button>
                ))}
                <span className="text-xs text-muted-foreground">
                  {trendWindow === 1 && "nhạy nhất — bắt sóng phim đang hot ngay hôm nay"}
                  {trendWindow === 2 && "cân bằng giữa nhạy và ổn định"}
                  {trendWindow === 3 && "ổn định nhất — ít nhiễu, phản ứng chậm hơn"}
                </span>
              </div>

              <div className="mt-2 rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground leading-relaxed">
                <strong className="text-foreground">Phim hiện ở đây khi đạt MỘT trong hai tín hiệu:</strong>
                <br />
                <strong className="text-foreground">📈 Đà tăng</strong> (chỉ phim mới ra rạp ≤ 21 ngày): có ít nhất{" "}
                <strong>{trendWindow} vé xác nhận</strong> trong {trendWindow} ngày gần nhất và lượng vé đó{" "}
                <strong>tăng ít nhất 50%</strong> so với {trendWindow} ngày trước đó nữa.
                <br />
                <strong className="text-foreground">🎟️ Lấp đầy</strong> (mọi phim đang chiếu, kể cả phim cũ chiếu lại):
                có <strong>≥ 2 suất đã bán ≥ 85% ghế</strong> (tính cả suất sắp chiếu tới hết ngày +{trendWindow}),
                hoặc các suất đã chiếu trong {trendWindow} ngày qua <strong>lấp đầy trung bình ≥ 70%</strong> (cần ≥ 3 suất).
                Chỉ tính vé đã thanh toán.
                <br />
                Gợi ý đôn thêm tối đa <strong>6 suất/lần</strong>, lấy số lớn hơn giữa hai tín hiệu. Danh sách trống nghĩa là chưa phim nào đạt — không phải lỗi.
              </div>
            </CardHeader>
            <CardContent>
              {trendingLoading ? (
                <p className="text-sm text-muted-foreground">Đang tải...</p>
              ) : trending.filter((m) => m.is_trending).length === 0 ? (
                <p className="text-sm text-muted-foreground">{`Chưa có phim nào đạt tín hiệu đà tăng hoặc lấp đầy trong ${trendWindow} ngày gần đây — bình thường, không phải lỗi hệ thống. Thử đổi sang cửa sổ dài hơn để xem có phim nào lên chậm hơn không.`}</p>
              ) : (
                <div className="space-y-3">
                  {trending.filter((m) => m.is_trending).map((movie) => (
                    <div key={movie.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
                      <div>
                        <p className="font-medium">{movie.title}</p>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {movie.trend_reasons?.includes("momentum") && (
                            <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700 dark:bg-orange-950 dark:text-orange-300">📈 Đà tăng</span>
                          )}
                          {movie.trend_reasons?.includes("near_full") && (
                            <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-950 dark:text-red-300">🎟️ {movie.near_full_showtimes} suất gần kín</span>
                          )}
                          {movie.trend_reasons?.includes("high_occupancy") && (
                            <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-950 dark:text-red-300">🎟️ Lấp đầy TB {Math.round((movie.avg_occupancy || 0) * 100)}%</span>
                          )}
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {movie.recent_tickets} vé ({trendWindow} ngày gần nhất) so với {movie.prior_tickets} vé trước đó —
                          tăng <span className="font-semibold text-orange-600">×{movie.momentum}</span> · lấp đầy TB{" "}
                          {movie.finished_showtimes ? `${Math.round((movie.avg_occupancy || 0) * 100)}% (${movie.finished_showtimes} suất đã chiếu)` : "chưa có suất đã chiếu"}{" "}
                          · hiện có {movie.current_week_showtimes} suất/tuần
                        </p>
                      </div>
                      <Button size="sm" className="bg-orange-600 hover:bg-orange-700 gap-2" disabled={boostingId === movie.id} onClick={() => handleBoost(movie)}>
                        {boostingId === movie.id ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <TrendingUp className="h-3.5 w-3.5" />}
                        Đôn thêm {movie.suggested_additional_showtimes} suất
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {/* Kế hoạch chờ xác nhận — chưa ghi gì vào CSDL */}
              {keHoach && (
                <div className="mt-4 rounded-lg border border-orange-400 bg-orange-50/60 p-4 dark:bg-orange-950/20">
                  <p className="font-semibold text-orange-700 dark:text-orange-300">
                    Kế hoạch đôn {keHoach.result.inserted}/{keHoach.result.requested} suất cho "{keHoach.result.movie}" — chưa áp dụng
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Hệ thống ưu tiên chèn vào giờ trống. Nếu phòng đã kín giờ, sẽ <strong>thay</strong> suất của phim kém hút khách hơn —
                    chỉ những suất <strong>chưa bán vé nào</strong>, còn ≥ 3 giờ mới chiếu, không phải phim trên banner, và mỗi phim chỉ nhường tối đa 1 suất.
                  </p>
                  <BangSuatDon items={keHoach.result.schedule || []} />
                  {!!keHoach.result.notInserted && (
                    <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
                      {keHoach.result.notInserted} suất còn lại không tìm được chỗ phù hợp.
                    </p>
                  )}
                  <div className="mt-3 flex gap-2">
                    <Button size="sm" className="bg-orange-600 hover:bg-orange-700 gap-2" disabled={boostingId !== null} onClick={handleConfirmBoost}>
                      {boostingId !== null ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle className="h-3.5 w-3.5" />}
                      Xác nhận thêm {keHoach.result.inserted} suất
                    </Button>
                    <Button size="sm" variant="outline" disabled={boostingId !== null} onClick={() => setKeHoach(null)}>Huỷ</Button>
                  </div>
                </div>
              )}

              {/* Kết quả sau khi đã đôn — suất thật đã nằm trong lịch */}
              {ketQuaDon && (
                <div className="mt-4 rounded-lg border border-green-500/50 bg-green-50/60 p-4 dark:bg-green-950/20">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-green-700 dark:text-green-400">
                      Đã thêm {ketQuaDon.inserted} suất cho "{ketQuaDon.movie}" — khách đặt vé được ngay
                    </p>
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setKetQuaDon(null)}>Đóng</Button>
                  </div>
                  <BangSuatDon items={ketQuaDon.schedule || []} />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Chọn tuần + hành động */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Chọn tuần tạo suất</CardTitle>
              <CardDescription>Chọn ngày đầu tuần (nên là thứ 2), rồi bấm "Xem trước" trước khi xác nhận tạo thật</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col sm:flex-row gap-4 items-end">
                <div className="flex-1">
                  <Label htmlFor="weekStart">Ngày bắt đầu tuần</Label>
                  <Input id="weekStart" type="date" value={weekStart}
                    onChange={(e) => { setWeekStart(e.target.value); setPreviewData(null); setGenerationResult(null) }}
                    className="mt-1" />
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Button onClick={handlePreview} disabled={loading} variant="outline" size="lg">
                    {loading ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Eye className="mr-2 h-4 w-4" />}
                    1. Xem trước
                  </Button>
                  <Button onClick={handleGenerate} disabled={loading || !previewData} className="bg-green-600 hover:bg-green-700" size="lg">
                    {loading ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                    2. Xác nhận & Tạo suất
                  </Button>
                  <Button onClick={handleDeleteWeek} disabled={loading} variant="destructive" size="lg">
                    <Trash2 className="mr-2 h-4 w-4" /> Xoá tuần
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Tổng quan kết quả — số liệu tóm tắt trước khi đi vào chi tiết */}
          {activeData && (
            <Card className={`mb-6 ${generationResult ? "border-green-500 bg-green-500/5" : "border-blue-400 bg-blue-500/5"}`}>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  {generationResult ? <CheckCircle className="h-5 w-5 text-green-600" /> : <Eye className="h-5 w-5 text-blue-600" />}
                  {generationResult ? "Đã tạo thật — đang xem lịch đã lưu vào database" : "Đang xem MÔ PHỎNG — chưa lưu, bấm \"Xác nhận & Tạo suất\" để áp dụng thật"}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">{generationResult ? "Đã tạo" : "Dự kiến tạo"}</p>
                    <p className="text-2xl font-bold text-primary">{generationResult ? generationResult.generated : previewData?.estimated_total_showtimes}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Bỏ qua</p>
                    <p className="text-2xl font-bold text-orange-600">{generationResult ? generationResult.skipped : previewData?.skipped_estimate}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Số phim</p>
                    <p className="text-2xl font-bold">{generationResult ? generationResult.details.moviesProcessed : previewData?.movies_count}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Khoảng ngày</p>
                    <p className="text-sm font-semibold">
                      {generationResult ? `${generationResult.details.dateRange.from} → ${generationResult.details.dateRange.to}` : previewData?.week_start}
                    </p>
                  </div>
                </div>

                {!generationResult && previewData && previewData.skipped_estimate > 0 && (
                  <Alert className="mt-4 border-orange-500 bg-orange-500/10">
                    <AlertCircle className="h-5 w-5 text-orange-600" />
                    <AlertTitle className="text-orange-700 dark:text-orange-400">Thiếu phòng/giờ chiếu</AlertTitle>
                    <AlertDescription className="text-orange-700 dark:text-orange-400">
                      Có {previewData.skipped_estimate} suất chiếu mong muốn nhưng không tìm được khung giờ trống phù hợp.
                      {previewData.existing_showtimes_in_week > 0 && (
                        <>
                          {" "}Nhiều khả năng do tuần này đã có sẵn <strong>{previewData.existing_showtimes_in_week}</strong> suất chiếu, chiếm gần hết phòng/khung giờ.
                          Chọn tuần khác chưa có suất, hoặc xoá suất chưa bán và tạo lại toàn bộ:
                          <div className="mt-3">
                            <Button size="sm" variant="outline" className="gap-2 border-orange-400 text-orange-700 dark:text-orange-400" onClick={handleRegenerate} disabled={regenerating || loading}>
                              {regenerating ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                              Xoá suất chưa bán & Tạo lại toàn bộ
                            </Button>
                          </div>
                        </>
                      )}
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>
          )}

          {activeData ? (
            <>
              {/* Lịch tuần trực quan — LUÔN HIỆN, không còn ẩn trong dialog */}
              <Card className="mb-6">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><CalendarDays className="h-5 w-5" /> Lịch chiếu theo ngày</CardTitle>
                  <CardDescription>
                    {isPreviewMode
                      ? "Mô phỏng — chưa lưu database, không xoá được từng suất (xoá cả tuần bằng nút bên trên nếu cần làm lại)."
                      : "Dữ liệu thật đã lưu database — bấm biểu tượng thùng rác trên từng suất để xoá riêng suất đó (chỉ áp dụng cho suất chưa bán vé)."}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ShowtimeWeekCalendar
                    schedule={activeData.schedule}
                    isPreview={isPreviewMode}
                    onDeleted={handleShowtimeDeleted}
                  />
                </CardContent>
              </Card>

              {/* Thẻ tóm tắt từng phim — thay bảng 12 cột cũ */}
              <Card className="mb-6">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><Film className="h-5 w-5" /> Phân bổ theo phim ({activeData.movies.length})</CardTitle>
                  <CardDescription>Thanh xanh/cam/đỏ cho biết ngay phim nào đã đủ suất cả tuần, phim nào còn thiếu.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                    {activeData.movies
                      .slice()
                      .sort((a, b) => b.popularity_score - a.popularity_score)
                      .map((movie) => (
                        <ShowtimeMovieCoverageCard key={movie.id} movie={movie} />
                      ))}
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (
            <Card className="mb-6 border-dashed border-2">
              <CardContent className="flex flex-col items-center justify-center py-16">
                <CalendarDays className="h-16 w-16 text-muted-foreground mb-4" />
                <h3 className="text-xl font-semibold mb-2">Chưa có dữ liệu để hiển thị</h3>
                <p className="text-muted-foreground text-center max-w-md">
                  Bấm "1. Xem trước" ở trên để xem lịch chiếu dự kiến theo độ phổ biến trước khi xác nhận tạo thật.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Thống kê & lịch sử */}
          <Tabs defaultValue="stats" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-4">
              <TabsTrigger value="stats" className="flex items-center gap-2"><BarChart3 className="h-4 w-4" /> Thống kê</TabsTrigger>
              <TabsTrigger value="history" className="flex items-center gap-2"><Clock className="h-4 w-4" /> Lịch sử</TabsTrigger>
            </TabsList>

            <TabsContent value="stats">
              {stats && (
                <div className="grid gap-6">
                  <div>
                    <h3 className="text-base font-semibold mb-3">Tuần hiện tại</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <Card className="border-primary/30 bg-primary/5">
                        <CardContent className="pt-5 flex items-center gap-3">
                          <div className="rounded-full bg-primary/15 p-2.5"><Ticket className="h-5 w-5 text-primary" /></div>
                          <div>
                            <p className="text-xs text-muted-foreground">Tổng suất</p>
                            <p className="text-2xl font-bold text-primary">{stats.current_week.total_showtimes}</p>
                          </div>
                        </CardContent>
                      </Card>
                      <Card className="border-purple-400/30 bg-purple-500/5">
                        <CardContent className="pt-5 flex items-center gap-3">
                          <div className="rounded-full bg-purple-500/15 p-2.5"><Film className="h-5 w-5 text-purple-600 dark:text-purple-400" /></div>
                          <div>
                            <p className="text-xs text-muted-foreground">Phim</p>
                            <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">{stats.current_week.unique_movies}</p>
                          </div>
                        </CardContent>
                      </Card>
                      <Card className="border-blue-400/30 bg-blue-500/5">
                        <CardContent className="pt-5 flex items-center gap-3">
                          <div className="rounded-full bg-blue-500/15 p-2.5"><Building2 className="h-5 w-5 text-blue-600 dark:text-blue-400" /></div>
                          <div>
                            <p className="text-xs text-muted-foreground">Rạp</p>
                            <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{stats.current_week.unique_cinemas}</p>
                          </div>
                        </CardContent>
                      </Card>
                      <Card className="border-amber-400/30 bg-amber-500/5">
                        <CardContent className="pt-5 flex items-center gap-3">
                          <div className="rounded-full bg-amber-500/15 p-2.5"><CalendarDays className="h-5 w-5 text-amber-600 dark:text-amber-400" /></div>
                          <div>
                            <p className="text-xs text-muted-foreground">Khoảng</p>
                            <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">{stats.current_week.first_date} → {stats.current_week.last_date}</p>
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  </div>

                  <Card>
                    <CardHeader>
                      <CardTitle>Top 10 phim nhiều suất nhất</CardTitle>
                      <CardDescription>Thống kê suất chiếu ĐÃ TẠO trong tuần hiện tại (không phải dự đoán).</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="h-64 mb-4">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            data={stats.top_movies.slice(0, 10).map((m) => ({ name: m.title.length > 16 ? m.title.slice(0, 15) + "…" : m.title, fullName: m.title, suat: m.showtime_count }))}
                            layout="vertical"
                            margin={{ left: 8, right: 24, top: 4, bottom: 4 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" horizontal={false} className="opacity-30" />
                            <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                            <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11 }} />
                            <Tooltip
                              formatter={(value: number) => [`${value} suất`, "Suất chiếu"]}
                              labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName ?? ""}
                            />
                            <Bar dataKey="suat" radius={[0, 4, 4, 0]}>
                              {stats.top_movies.slice(0, 10).map((_, i) => (
                                <Cell key={i} fill={i === 0 ? "#f59e0b" : i === 1 ? "#a78bfa" : i === 2 ? "#fb923c" : "#60a5fa"} />
                              ))}
                              <LabelList dataKey="suat" position="right" style={{ fontSize: 11, fill: "currentColor" }} />
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-10">#</TableHead>
                            <TableHead>Phim</TableHead>
                            <TableHead>Trạng thái</TableHead>
                            <TableHead className="text-right">Suất chiếu</TableHead>
                            <TableHead className="text-right">Score</TableHead>
                            <TableHead className="text-right">Vé bán</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {stats.top_movies.slice(0, 10).map((movie, idx) => {
                            const tier = scoreTier(movie.popularity_score)
                            const medal = idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : idx + 1
                            return (
                              <TableRow key={idx} className={idx < 3 ? "bg-amber-500/5" : ""}>
                                <TableCell className="text-center">{medal}</TableCell>
                                <TableCell className="font-medium">{movie.title}</TableCell>
                                <TableCell>
                                  <Badge variant="outline" className={STATUS_BADGE[movie.status] ?? ""}>
                                    {STATUS_LABEL[movie.status] ?? movie.status}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-right font-bold">{movie.showtime_count}</TableCell>
                                <TableCell className="text-right">
                                  <Badge variant="outline" className={tier.className}>
                                    {movie.popularity_score != null ? Number(movie.popularity_score).toFixed(0) : 'N/A'} · {tier.label}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-right">{movie.total_bookings || 0}</TableCell>
                              </TableRow>
                            )
                          })}
                        </TableBody>
                      </Table>
                      <p className="mt-3 text-xs text-muted-foreground">
                        <strong>Score</strong> (0-100): điểm độ phổ biến dùng để xếp phòng/khung giờ đẹp khi tạo lịch — pha trộn giữa dữ liệu thật của phim
                        (vé đã bán, đánh giá, yêu thích) và điểm nền theo thể loại/TMDb khi phim còn ít dữ liệu (phim mới). Score cao hơn → được ưu tiên suất giờ vàng và nhiều phòng hơn.
                        Xem công thức chi tiết trong khung "📚 Hướng dẫn nhanh" bên dưới.
                      </p>
                    </CardContent>
                  </Card>
                </div>
              )}
            </TabsContent>

            <TabsContent value="history">
              {stats && (() => {
                // API trả về tuần MỚI NHẤT trước — đảo lại để biểu đồ đọc trái→phải
                // theo thời gian (cũ→mới), trực quan hơn cho xu hướng.
                const chronological = [...stats.weekly_history].reverse()
                const chartData = chronological.map((w) => ({
                  label: format(new Date(w.week_start), 'dd/MM', { locale: vi }),
                  suat: w.showtime_count,
                  doanhThu: Math.round((w.revenue || 0) / 1000000 * 10) / 10, // triệu đồng
                }))
                return (
                  <div className="space-y-6">
                    <Card>
                      <CardHeader>
                        <CardTitle>Xu hướng 4 tuần gần nhất</CardTitle>
                        <CardDescription>
                          Cột xanh = số suất chiếu đã tạo, đường cam = doanh thu vé <strong>ĐÃ THANH TOÁN THẬT</strong> (triệu đồng) — không phải doanh thu tiềm năng,
                          nên 1 tuần nhiều suất chiếu vẫn có thể có đường doanh thu thấp nếu chưa có khách đặt vé cho tuần đó.
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="h-72">
                          <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart data={chartData} margin={{ left: 0, right: 8, top: 8, bottom: 4 }}>
                              <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                              <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                              <YAxis yAxisId="left" tick={{ fontSize: 11 }} allowDecimals={false} label={{ value: "Suất chiếu", angle: -90, position: "insideLeft", fontSize: 11 }} />
                              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} label={{ value: "Triệu đồng", angle: 90, position: "insideRight", fontSize: 11 }} />
                              <Tooltip formatter={(value: number, name: string) => name === "doanhThu" ? [`${value}M đ`, "Doanh thu"] : [value, "Suất chiếu"]} />
                              <Legend formatter={(v) => (v === "doanhThu" ? "Doanh thu (triệu đ)" : "Suất chiếu")} />
                              <Bar yAxisId="left" dataKey="suat" fill="#60a5fa" radius={[4, 4, 0, 0]} barSize={28} />
                              <Line yAxisId="right" type="monotone" dataKey="doanhThu" stroke="#f97316" strokeWidth={2.5} dot={{ r: 4 }} />
                            </ComposedChart>
                          </ResponsiveContainer>
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle>Chi tiết theo tuần</CardTitle>
                        <CardDescription>Mũi tên so sánh với tuần liền trước (▲ tăng / ▼ giảm / — không đổi). Tuần mới nhất được tô sáng.</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Tuần</TableHead>
                              <TableHead className="text-right">Suất chiếu</TableHead>
                              <TableHead className="text-right">Phim</TableHead>
                              <TableHead className="text-right">Rạp</TableHead>
                              <TableHead className="text-right">Doanh thu (vé đã bán)</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {stats.weekly_history.map((week, idx) => {
                              const prev = stats.weekly_history[idx + 1] // dòng dưới = tuần trước đó (API trả mới nhất trước)
                              return (
                                <TableRow key={idx} className={idx === 0 ? "bg-primary/5" : ""}>
                                  <TableCell className="font-medium">
                                    {format(new Date(week.week_start), 'dd/MM', { locale: vi })} - {format(new Date(week.week_end), 'dd/MM/yyyy', { locale: vi })}
                                    {idx === 0 && <Badge className="ml-2 bg-primary/15 text-primary border-primary/30" variant="outline">Mới nhất</Badge>}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    {week.showtime_count}
                                    <TrendArrow current={week.showtime_count} previous={prev?.showtime_count} />
                                  </TableCell>
                                  <TableCell className="text-right">{week.movie_count}</TableCell>
                                  <TableCell className="text-right">{week.cinema_count}</TableCell>
                                  <TableCell className="text-right font-semibold">
                                    {week.revenue ? `${(week.revenue / 1000000).toFixed(1)}M` : '0'}
                                    <TrendArrow current={week.revenue || 0} previous={prev?.revenue} />
                                  </TableCell>
                                </TableRow>
                              )
                            })}
                          </TableBody>
                        </Table>
                      </CardContent>
                    </Card>
                  </div>
                )
              })()}
            </TabsContent>
          </Tabs>

          <Card className="mt-6 bg-blue-500/5 border-blue-300">
            <CardHeader><CardTitle className="text-blue-700 dark:text-blue-400 text-base">📚 Hướng dẫn nhanh</CardTitle></CardHeader>
            <CardContent className="text-sm text-blue-800 dark:text-blue-300 space-y-1.5">
              <p><strong>1.</strong> Chọn ngày đầu tuần (thứ 2) → bấm <strong>"Xem trước"</strong> để mô phỏng, chưa lưu gì cả.</p>
              <p><strong>2.</strong> Kiểm tra lịch trực quan theo ngày/rạp và thẻ từng phim bên dưới — thanh tiến trình cam/đỏ nghĩa là phim đó đang thiếu suất.</p>
              <p><strong>3.</strong> Ưng ý thì bấm <strong>"Xác nhận & Tạo suất"</strong> để lưu thật vào database.</p>
              <p><strong>4.</strong> Sau khi tạo, có thể xoá riêng từng suất không ưng ý ngay trên lịch (biểu tượng thùng rác) mà không cần xoá lại cả tuần.</p>
              <p><strong>5.</strong> Hệ thống <strong>tự động tăng suất chiếu vào Thứ 6/7/Chủ nhật</strong> (mở cửa sớm hơn, đóng muộn hơn, nhiều suất/phòng hơn ngày thường) — bạn không cần tự tay thêm, cứ xem trước là thấy ngay cuối tuần luôn nhiều hơn ngày thường trên lịch.</p>
              <p><strong>6.</strong> Mục "🔥 Phim đang lên trend" ở trên chỉ hiện phim khi có tín hiệu thật — vé tăng đột biến hoặc suất chiếu đang kín ghế (xem điều kiện chi tiết ngay trong thẻ đó) — trống là bình thường, không phải lỗi.</p>
            </CardContent>
          </Card>

          <Card className="mt-6 bg-slate-500/5 border-slate-300">
            <CardHeader>
              <CardTitle className="text-slate-700 dark:text-slate-300 text-base flex items-center gap-2">
                <Calculator className="h-4 w-4" /> Công thức hệ thống đang dùng
              </CardTitle>
              <CardDescription>Các công thức thật trong code — dùng để tra cứu khi cần giải thích cho người khác vì sao 1 phim/1 suất chiếu lại ra số đó.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div>
                <p className="font-semibold flex items-center gap-1.5 mb-1"><Film className="h-4 w-4 text-purple-500" /> Điểm phổ biến (Score)</p>
                <p className="text-muted-foreground font-mono text-xs bg-muted/60 rounded px-2 py-1.5 mb-1">
                  Score = Điểm_nội_bộ × trọng_số_thật + Điểm_nền × (1 − trọng_số_thật)
                </p>
                <p className="text-muted-foreground text-xs">
                  Điểm nội bộ = 60% vé bán + 30% đánh giá + 10% lượt yêu thích (dữ liệu THẬT của phim). Điểm nền lấy từ thể loại/TMDb, dùng khi phim còn ít dữ liệu (mới ra rạp).
                  Trọng số thật tăng dần khi phim có càng nhiều vé/đánh giá/yêu thích (công thức "cold start" giảm dần ảnh hưởng điểm nền), nên phim mới không bị lép vế trước phim cũ đã có dữ liệu.
                </p>
              </div>
              <div>
                <p className="font-semibold flex items-center gap-1.5 mb-1"><Ticket className="h-4 w-4 text-primary" /> Số suất chiếu / phòng / ngày theo tier</p>
                <div className="grid grid-cols-3 gap-2 mb-1">
                  <div className="rounded bg-purple-500/10 border border-purple-500/20 px-2 py-1.5 text-center">
                    <p className="text-xs font-semibold text-purple-700 dark:text-purple-400">Cao (Score ≥ 100)</p>
                    <p className="text-xs text-muted-foreground">4-6 suất/phòng</p>
                  </div>
                  <div className="rounded bg-blue-500/10 border border-blue-500/20 px-2 py-1.5 text-center">
                    <p className="text-xs font-semibold text-blue-700 dark:text-blue-400">T.bình (30-99)</p>
                    <p className="text-xs text-muted-foreground">3-5 suất/phòng</p>
                  </div>
                  <div className="rounded bg-slate-500/10 border border-slate-500/20 px-2 py-1.5 text-center">
                    <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">Thấp (&lt; 30)</p>
                    <p className="text-xs text-muted-foreground">2-4 suất/phòng</p>
                  </div>
                </div>
                <p className="text-muted-foreground text-xs">Vị trí cụ thể trong khoảng MIN-MAX được nội suy theo score càng cao càng gần MAX. Phim càng lâu tuần (2-3 tuần: còn 85%, từ tuần 4: còn 70%) sẽ giảm dần số suất theo thời gian.</p>
              </div>
              <div>
                <p className="font-semibold flex items-center gap-1.5 mb-1"><CalendarDays className="h-4 w-4 text-orange-500" /> Tăng suất cuối tuần (Thứ 6/7/CN)</p>
                <p className="text-muted-foreground font-mono text-xs bg-muted/60 rounded px-2 py-1.5 mb-1">
                  Suất cuối tuần = MAX( Suất_ngày_thường + 1 , LÀM TRÒN LÊN(Suất_ngày_thường × 1.3) )
                </p>
                <p className="text-muted-foreground text-xs">Đảm bảo mọi phim đều tăng ít nhất +1 suất/phòng cuối tuần (không bị mất tác dụng do làm tròn xuống với phim có ít suất). Giờ mở cửa cũng sớm hơn 45 phút, đóng cửa muộn hơn 45 phút so với ngày thường.</p>
              </div>
              <div>
                <p className="font-semibold flex items-center gap-1.5 mb-1"><DollarSign className="h-4 w-4 text-green-600" /> Giá vé</p>
                <p className="text-muted-foreground font-mono text-xs bg-muted/60 rounded px-2 py-1.5 mb-1">
                  Giá = 80.000đ × hệ_số_giờ_chiếu × hệ_số_loại_phòng × (1.1 nếu cuối tuần)
                </p>
                <p className="text-muted-foreground text-xs">
                  Hệ số giờ: 18h-23h ×1.3 (giờ vàng), 15h-18h ×1.15 (giờ trung bình), còn lại ×0.85 (giờ thấp điểm).
                  Hệ số phòng: Standard ×1, VIP ×1.5, IMAX ×1.8, 4DX ×2. Kết quả làm tròn tới nghìn đồng gần nhất.
                </p>
              </div>
              <div>
                <p className="font-semibold flex items-center gap-1.5 mb-1"><TrendingUp className="h-4 w-4 text-orange-600" /> Phim đang lên trend</p>
                {/* Công thức phải bám theo cửa sổ đang chọn ở thẻ trên, không
                    được ghim cứng số 3 — nếu không, chọn "1 ngày" mà phần giải
                    thích vẫn ghi "3 ngày" thì chính tài liệu trên màn hình đang
                    mâu thuẫn với con số ngay bên cạnh. */}
                <p className="text-muted-foreground font-mono text-xs bg-muted/60 rounded px-2 py-1.5 mb-1">
                  Độ tăng nhiệt = Vé_{trendWindow}_ngày_gần_nhất ÷ MAX(Vé_{trendWindow}_ngày_trước_đó, 1)
                </p>
                <p className="text-muted-foreground text-xs">
                  Tín hiệu đà tăng: vé {trendWindow} ngày gần nhất ≥ {trendWindow} VÀ độ tăng nhiệt ≥ 1.5 (tăng ≥50%) VÀ phim mới ra rạp ≤21 ngày.
                  Gợi ý = MIN(6, MAX(1, LÀM TRÒN((độ tăng nhiệt − 1) × 4))).
                  Ngưỡng số vé co giãn theo cửa sổ để giữ nguyên mật độ ~1 vé/ngày.
                </p>
                <p className="text-muted-foreground font-mono text-xs bg-muted/60 rounded px-2 py-1.5 my-1">
                  Lấp đầy của 1 suất = Ghế_đã_thanh_toán ÷ Tổng_ghế_phòng
                </p>
                <p className="text-muted-foreground text-xs">
                  Tín hiệu lấp đầy (không giới hạn tuổi phim): ≥ 2 suất lấp đầy ≥ 85% → gợi ý = số suất gần kín;
                  hoặc lấp đầy TB các suất đã chiếu ≥ 70% (≥ 3 suất) → gợi ý = LÀM TRÒN LÊN(suất_tuần × (TB ÷ 70% − 1)).
                  Cả hai đều trong khoảng 1–6. Gợi ý cuối = số lớn hơn giữa tín hiệu đà tăng và lấp đầy.
                </p>
              </div>
            </CardContent>
          </Card>
        </main>
      </div>
    </div>
  )
}
