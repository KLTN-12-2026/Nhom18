"use client"

import { useCallback, useEffect, useState } from "react"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { RefreshCw, Trophy } from "lucide-react"
import { formatVND } from "@/lib/utils"
import { getReportsTopMovies } from "@/lib/api/admin/reports"

interface TopMoviesChartProps {
  limit?: number
  cinemaId?: string
}

const COLORS = ["#f59e0b", "#10b981", "#3b82f6", "#8b5cf6", "#ef4444", "#06b6d4", "#ec4899", "#84cc16"]

function fmtM(v: number) {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`
  return String(v)
}

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  return (
    <div className="bg-background/95 backdrop-blur-sm border rounded-xl shadow-xl p-3 text-sm">
      <p className="font-semibold mb-1.5 text-foreground line-clamp-2">{d?.fullName}</p>
      <div className="space-y-1">
        <p className="flex justify-between gap-4 text-muted-foreground">
          Doanh thu <span className="font-semibold text-amber-500">{formatVND(d?.revenue)}</span>
        </p>
        <p className="flex justify-between gap-4 text-muted-foreground">
          Vé bán <span className="font-semibold text-blue-500">{Number(d?.tickets ?? 0).toLocaleString("vi-VN")} vé</span>
        </p>
      </div>
    </div>
  )
}

export function TopMoviesChart({ limit = 7, cinemaId }: TopMoviesChartProps) {
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const fetchData = useCallback(async () => {
    try {
      // Dùng ngày theo GIỜ ĐỊA PHƯƠNG, không phải toISOString() (quy về UTC).
      // Ở múi giờ VN (UTC+7), trước 7h sáng thì toISOString() còn đang trả về
      // NGÀY HÔM QUA — nên mốc "to" bị chốt ở 23:59:59 hôm qua và toàn bộ doanh
      // số bán được từ 0h đến 7h sáng nay bị loại khỏi biểu đồ. Cách tính ngày
      // địa phương này khớp với phần còn lại của dự án (reports, showtimes...).
      const localDate = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
      const to = localDate(new Date()) + " 23:59:59"
      const from = localDate(new Date(Date.now() - 30 * 24 * 3600 * 1000)) + " 00:00:00"

      const result = await getReportsTopMovies(from, to, limit, cinemaId)
      setData(
        result.map((item: any) => ({
          name: item.title.length > 22 ? item.title.slice(0, 22) + "…" : item.title,
          fullName: item.title,
          revenue: Number(item.revenue || 0),
          tickets: Number(item.tickets || 0),
        }))
      )
      setLastUpdated(new Date())
    } catch (err) {
      console.error("Tải biểu đồ phim bán chạy thất bại:", err)
    } finally {
      setLoading(false)
    }
  }, [limit, cinemaId])

  useEffect(() => {
    setLoading(true)
    fetchData()
    const id = setInterval(fetchData, 5 * 60 * 1000) // 5 phút
    return () => clearInterval(id)
  }, [fetchData])

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-3 shrink-0">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Trophy className="h-5 w-5 text-amber-500" />
              Top Phim Doanh Thu
            </CardTitle>
            <CardDescription className="mt-0.5">
              {lastUpdated
                ? `30 ngày qua • ${lastUpdated.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}`
                : "30 ngày qua"}
            </CardDescription>
          </div>
          {loading && <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />}
        </div>
      </CardHeader>

      <CardContent className="flex-1 min-h-0 pb-4">
        {loading && data.length === 0 ? (
          <div className="h-full flex items-center justify-center text-muted-foreground">
            <RefreshCw className="h-6 w-6 animate-spin" />
          </div>
        ) : data.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground py-8">
            <Trophy className="h-10 w-10 mb-2 opacity-30" />
            <p className="text-sm">Chưa có dữ liệu</p>
          </div>
        ) : (
          <div className="h-[340px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data}
                layout="vertical"
                margin={{ top: 0, right: 65, left: 4, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} className="stroke-muted/60" />
                {/* domain có headroom (x1.2) để cột dài nhất không chạm sát mép phải,
                    tránh nhãn giá trị (label position="right") bị cắt mất. */}
                <XAxis
                  type="number"
                  domain={[0, (max: number) => Math.ceil(max * 1.2)]}
                  tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                  tickLine={false} axisLine={false}
                  tickFormatter={fmtM}
                />
                <YAxis
                  type="category" dataKey="name"
                  tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                  tickLine={false} axisLine={false}
                  width={95}
                />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: "color-mix(in oklch, var(--muted) 30%, transparent)" }} />
                <Bar dataKey="revenue" radius={[0, 4, 4, 0]} maxBarSize={22}
                  label={{ position: "right", formatter: fmtM, fill: "var(--muted-foreground)", fontSize: 10 }}
                >
                  {data.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
