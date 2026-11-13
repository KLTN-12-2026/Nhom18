"use client"

export const dynamic = "force-dynamic"

import { useState, useEffect, useCallback } from "react"
import { AdminSidebar } from "@/components/admin-sidebar"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Bot, ThumbsUp, ThumbsDown, Sparkles, MessageCircle, RefreshCw, Loader2, AlertTriangle, HelpCircle, TrendingUp, TrendingDown, Minus } from "lucide-react"
import { useRequireAdmin } from "@/hooks/use-require-admin"
import { getChatbotAnalytics, resetMarkovChain, type ChatbotAnalytics, type ChatbotTrendPeriodMetrics } from "@/lib/api/admin/chatbot"
import { toast } from "sonner"

const INTENT_LABELS: Record<string, string> = {
  greeting: "Chào hỏi",
  mood: "Theo tâm trạng",
  schedule: "Lịch chiếu",
  pricing: "Giá vé/combo",
  room_pricing: "Giá theo phòng",
  cinema_info: "Rạp chiếu",
  booking: "Đặt vé / tra vé",
  personalized: "Gợi ý cá nhân hoá",
  movie_info: "Thông tin phim",
  faq: "Hỏi đáp chính sách",
  default: "Không rõ ý định",
  unknown: "Chưa xác định",
}

const SENTIMENT_LABELS: Record<string, { label: string; className: string }> = {
  positive: { label: "Tích cực", className: "bg-green-500" },
  neutral: { label: "Trung lập", className: "bg-gray-400" },
  negative: { label: "Tiêu cực", className: "bg-red-500" },
  unknown: { label: "Chưa xác định", className: "bg-gray-300" },
}

function StatTile({ icon: Icon, label, value, sub }: { icon: any; label: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-amber-500/10 text-amber-600 flex items-center justify-center shrink-0">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-xl font-bold leading-tight">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
          {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  )
}

/** Thanh ngang tỉ lệ đơn giản — đủ dùng cho phân bố ý định/sắc thái, không cần thư viện chart riêng. */
function BarRow({ label, count, total, colorClass = "bg-amber-500" }: { label: string; count: number; total: number; colorClass?: string }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground">{count} ({pct}%)</span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div className={`h-full ${colorClass} transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

/** So sánh 1 chỉ số giữa kỳ hiện tại và kỳ trước, hiển thị mũi tên tăng/giảm.
 * `higherIsBetter=false` dùng cho tỉ lệ "không trả lời được" — giảm là tốt. */
function TrendChangeBadge({
  current,
  previous,
  higherIsBetter = true,
}: {
  current: number | null
  previous: number | null
  higherIsBetter?: boolean
}) {
  if (current == null || previous == null) {
    return <span className="text-xs text-muted-foreground">Chưa đủ dữ liệu so sánh</span>
  }
  const diff = current - previous
  if (Math.abs(diff) < 0.005) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Minus className="h-3 w-3" /> Không đổi
      </span>
    )
  }
  const isUp = diff > 0
  const isGood = isUp === higherIsBetter
  const colorClass = isGood ? "text-green-600" : "text-red-500"
  const Icon = isUp ? TrendingUp : TrendingDown
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${colorClass}`}>
      <Icon className="h-3 w-3" /> {isUp ? "+" : ""}
      {Math.round(diff * 100)} điểm % so với kỳ trước
    </span>
  )
}

function PeriodComparisonCard({
  title,
  current,
  previous,
}: {
  title: string
  current: ChatbotTrendPeriodMetrics
  previous: ChatbotTrendPeriodMetrics
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <p className="text-xs text-muted-foreground">Lượt chat</p>
          <p className="text-lg font-bold">{current.total}</p>
          <p className="text-[11px] text-muted-foreground">Kỳ trước: {previous.total}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Trả lời bởi AI (Gemini) so với Fallback</p>
          <p className="text-sm font-semibold">
            {current.aiRate != null ? `${Math.round(current.aiRate * 100)}% AI` : "—"}
            {current.aiRate != null && <span className="text-muted-foreground font-normal"> / {Math.round((1 - current.aiRate) * 100)}% fallback</span>}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {previous.aiRate != null ? `Kỳ trước: ${Math.round(previous.aiRate * 100)}% AI` : "Kỳ trước: chưa có dữ liệu"}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Tỉ lệ chưa hiểu được câu hỏi</p>
          <p className="text-sm font-semibold">
            {current.unansweredRate != null ? `${Math.round(current.unansweredRate * 100)}%` : "—"}
          </p>
          <TrendChangeBadge current={current.unansweredRate} previous={previous.unansweredRate} higherIsBetter={false} />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Tỉ lệ hài lòng (👍)</p>
          <p className="text-sm font-semibold">
            {current.satisfactionRate != null ? `${Math.round(current.satisfactionRate * 100)}%` : "—"}
          </p>
          <TrendChangeBadge current={current.satisfactionRate} previous={previous.satisfactionRate} higherIsBetter={true} />
        </div>
      </CardContent>
    </Card>
  )
}

/** Biểu đồ cột đơn giản (không cần thư viện chart) — số lượt chat mỗi ngày,
 * để thấy trực quan xu hướng dùng chatbot tăng/giảm theo thời gian. */
function DailyTrendChart({ rows }: { rows: ChatbotAnalytics["dailyTrend"] }) {
  const max = Math.max(1, ...rows.map((r) => r.total))
  return (
    <div className="flex items-end gap-1 h-32">
      {rows.map((row) => {
        const heightPct = Math.max(4, Math.round((row.total / max) * 100))
        const label = new Date(row.date + "T00:00:00").toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" })
        return (
          <div key={row.date} className="flex-1 flex flex-col items-center justify-end gap-1 min-w-0 group relative">
            <div
              className="w-full rounded-t bg-amber-500/70 group-hover:bg-amber-500 transition-colors"
              style={{ height: `${heightPct}%` }}
              title={`${label}: ${row.total} lượt (AI ${row.aiCount}, fallback ${row.fallbackCount}, chưa hiểu ${row.unansweredCount}, 👍${row.upvotes}/👎${row.downvotes})`}
            />
            {rows.length <= 31 && (
              <span className="text-[9px] text-muted-foreground rotate-0 whitespace-nowrap">{label}</span>
            )}
          </div>
        )
      })}
    </div>
  )
}

export default function ChatbotAnalyticsPage() {
  const { user, loading: authLoading, forbidden } = useRequireAdmin()
  const [days, setDays] = useState(30)
  const [data, setData] = useState<ChatbotAnalytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [resetting, setResetting] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const result = await getChatbotAnalytics(days)
      setData(result)
    } catch (e: any) {
      toast.error("Không thể tải dữ liệu chatbot", { description: e.message })
    } finally {
      setLoading(false)
    }
  }, [days])

  useEffect(() => {
    if (!authLoading && user?.can_access_admin) fetchData()
  }, [authLoading, user, fetchData])

  const handleResetMarkov = async () => {
    if (!confirm("Xoá toàn bộ dữ liệu \"học\" gợi ý ý định tiếp theo của chatbot? Hành động này không thể hoàn tác.")) return
    setResetting(true)
    try {
      await resetMarkovChain()
      toast.success("Đã reset dữ liệu học của chatbot")
    } catch (e: any) {
      toast.error("Không thể reset", { description: e.message })
    } finally {
      setResetting(false)
    }
  }

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="flex">
          <AdminSidebar />
          <main className="flex-1 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </main>
        </div>
      </div>
    )
  }
  if (forbidden) {
    return <div className="min-h-screen bg-background flex items-center justify-center text-muted-foreground">Không có quyền truy cập</div>
  }
  if (!user?.can_access_admin) return null

  const total = data?.summary.total || 0
  const feedbackTotal = data?.feedback.total || 0
  const satisfaction = feedbackTotal > 0 ? Math.round((data!.feedback.up / feedbackTotal) * 100) : null

  return (
    <div className="min-h-screen bg-background">
      <div className="flex">
        <AdminSidebar />
        <main className="flex-1 p-5 lg:p-7 space-y-6 max-w-6xl w-full mx-auto min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Bot className="h-6 w-6 text-amber-600" /> Xu hướng Chatbot AI
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Thống kê ẩn danh (không gắn với tài khoản cụ thể) từ các lượt hỏi-đáp thật của người dùng.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">7 ngày qua</SelectItem>
                  <SelectItem value="30">30 ngày qua</SelectItem>
                  <SelectItem value="90">90 ngày qua</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="icon" onClick={fetchData} disabled={loading} aria-label="Tải lại">
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              </Button>
            </div>
          </div>

          {loading && !data ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : !data || total === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                Chưa có dữ liệu hội thoại nào trong khoảng thời gian đã chọn.
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <StatTile icon={MessageCircle} label="Tổng lượt chat" value={String(total)} />
                <StatTile
                  icon={Sparkles}
                  label="AI trả lời"
                  value={`${Math.round((data.summary.aiCount / total) * 100)}%`}
                  sub={`${data.summary.aiCount}/${total} lượt`}
                />
                <StatTile
                  icon={Bot}
                  label="Fallback trả lời"
                  value={`${Math.round((data.summary.fallbackCount / total) * 100)}%`}
                  sub="Khi AI hết quota/lỗi"
                />
                <StatTile
                  icon={ThumbsUp}
                  label="Tỉ lệ hài lòng"
                  value={satisfaction != null ? `${satisfaction}%` : "Chưa có"}
                  sub={feedbackTotal > 0 ? `${data.feedback.up}👍 / ${data.feedback.down}👎` : "Chưa có phản hồi nào"}
                />
              </div>

              {data.dailyTrend.length > 0 && (
                <>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <PeriodComparisonCard
                      title="Hôm nay so với hôm qua"
                      current={data.trendComparison.today}
                      previous={data.trendComparison.yesterday}
                    />
                    <PeriodComparisonCard
                      title="7 ngày qua so với 7 ngày trước"
                      current={data.trendComparison.last7Days}
                      previous={data.trendComparison.prev7Days}
                    />
                  </div>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Xu hướng theo ngày</CardTitle>
                      <CardDescription>Số lượt chat mỗi ngày — di chuột vào cột để xem chi tiết AI/fallback/phản hồi</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <DailyTrendChart rows={data.dailyTrend} />
                    </CardContent>
                  </Card>
                </>
              )}

              <div className="grid lg:grid-cols-2 gap-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Phân bố ý định (intent)</CardTitle>
                    <CardDescription>Người dùng đang hỏi chatbot về điều gì nhiều nhất</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {data.intents.map((row) => (
                      <BarRow
                        key={row.intent}
                        label={INTENT_LABELS[row.intent] || row.intent}
                        count={row.count}
                        total={total}
                      />
                    ))}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Sắc thái người dùng</CardTitle>
                    <CardDescription>Cảm xúc trong câu hỏi (dựa trên phân tích từ khoá)</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {data.sentiments.map((row) => {
                      const meta = SENTIMENT_LABELS[row.sentiment] || SENTIMENT_LABELS.unknown
                      return <BarRow key={row.sentiment} label={meta.label} count={row.count} total={total} colorClass={meta.className} />
                    })}
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <ThumbsDown className="h-4 w-4 text-red-500" /> Câu trả lời bị đánh giá chưa hữu ích gần đây
                  </CardTitle>
                  <CardDescription>Xem lại để biết chatbot đang trả lời sai/thiếu ở đâu — trong {days} ngày qua</CardDescription>
                </CardHeader>
                <CardContent>
                  {data.recentDownvoted.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Chưa có câu trả lời nào bị đánh giá 👎 — tốt lắm!</p>
                  ) : (
                    <div className="space-y-3">
                      {data.recentDownvoted.map((row) => (
                        <div key={row.id} className="p-3 rounded-lg border bg-muted/30 text-sm space-y-1">
                          <p><span className="text-muted-foreground">Hỏi:</span> {row.message}</p>
                          <p className="line-clamp-2"><span className="text-muted-foreground">Trả lời:</span> {row.reply}</p>
                          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                            <span className="px-1.5 py-0.5 rounded bg-muted">{INTENT_LABELS[row.intent || "unknown"] || row.intent}</span>
                            <span>{row.ai_available ? "AI" : "Fallback"}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <HelpCircle className="h-4 w-4 text-amber-600" /> Câu hỏi chatbot chưa hiểu được gần đây
                  </CardTitle>
                  <CardDescription>
                    Fallback rơi về câu chào mặc định (không khớp bất kỳ quy tắc nào) — nguồn gợi ý trực tiếp để mở rộng FAQ/từ khoá tâm trạng — trong {days} ngày qua
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {data.recentUnanswered.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Chưa có câu hỏi nào bị bỏ ngỏ gần đây!</p>
                  ) : (
                    <div className="space-y-1.5">
                      {data.recentUnanswered.map((row) => (
                        <div key={row.id} className="p-2 rounded-lg border bg-muted/30 text-sm">
                          {row.message}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {user?.can_manage_users && (
                <Card className="border-dashed">
                  <CardContent className="p-4 flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-start gap-2 text-sm text-muted-foreground">
                      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                      <p>Reset dữ liệu Markov chain (gợi ý ý định tiếp theo) nếu nghi ngờ dữ liệu bị nhiễu. Không ảnh hưởng log hội thoại/feedback.</p>
                    </div>
                    <Button variant="destructive" size="sm" onClick={handleResetMarkov} disabled={resetting}>
                      {resetting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                      Reset dữ liệu học
                    </Button>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  )
}
