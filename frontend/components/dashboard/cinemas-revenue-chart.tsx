"use client"

import React, { useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList,
} from "recharts"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { DollarSign, AlertCircle, RefreshCw, Table2, BarChart3, Building2 } from "lucide-react"
import { formatVND } from "@/lib/utils"
import { getCinemasSummary } from "@/lib/api/admin/cinema-stats"
import { ApiError } from "@/lib/api/client"

interface CinemasRevenueChartProps {
  daysBack?: number
  selectedCinemaId?: string
}

interface RevenueChartDatum {
  id: number
  name: string
  fullName: string
  revenue: number
  tickets: number
  occupancy: number
  isSelected: boolean
}

// Một hue duy nhất (amber — cùng tông đã dùng cho "doanh thu" ở RevenueChart/
// TopMoviesChart trên cùng dashboard) vì đây là so sánh ĐỘ LỚN (doanh thu) giữa
// vài rạp, không phải phân biệt danh tính nhiều chuỗi dữ liệu — bậc màu càng
// đậm càng cao, không dùng "cầu vồng" nhiều màu ngẫu nhiên như trước (mỗi màu
// không mang ý nghĩa gì, chỉ để phân biệt cột). Khi có 1 rạp đang được chọn ở
// bộ lọc trang (selectedCinemaId), chuyển sang chế độ "emphasis": rạp được
// chọn giữ màu nhấn, các rạp còn lại chuyển xám mờ làm nền.
const SEQUENTIAL_AMBER = ["#b45309", "#d97706", "#f59e0b", "#fbbf24", "#fcd34d"]
const EMPHASIS_ACCENT = "#f59e0b"
const EMPHASIS_MUTED = "#78716c" // stone-500 — xám trung tính, không phải hue thứ 2

function fmtMoney(v: number) {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`
  return String(v)
}

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload as RevenueChartDatum
  return (
    <div className="bg-background/95 backdrop-blur-sm border rounded-xl shadow-xl p-3 text-sm">
      <p className="font-semibold mb-1.5 text-foreground">{d.fullName}</p>
      <div className="space-y-1">
        <p className="flex justify-between gap-4 text-muted-foreground">
          Doanh thu <span className="font-semibold text-amber-500">{formatVND(d.revenue)}</span>
        </p>
        <p className="flex justify-between gap-4 text-muted-foreground">
          Vé bán <span className="font-semibold text-foreground">{d.tickets.toLocaleString("vi-VN")} vé</span>
        </p>
        <p className="flex justify-between gap-4 text-muted-foreground">
          Lấp đầy <span className="font-semibold text-foreground">{d.occupancy.toFixed(1)}%</span>
        </p>
      </div>
    </div>
  )
}

export function CinemasRevenueChart({ daysBack = 30, selectedCinemaId }: CinemasRevenueChartProps) {
  const [data, setData] = useState<RevenueChartDatum[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<"chart" | "table">("chart")
  // Trước đây lỗi fetch chỉ console.error rồi im lặng hiện "Tổng: 0đ" như thể
  // không có doanh thu thật — không phân biệt được với "thật sự 0đ" và không
  // ai biết vì sao (401 hết hạn token, mất mạng, lỗi server...). Hiện rõ lỗi +
  // nút thử lại để admin tự biết cần đăng nhập lại hay chỉ là mạng chập chờn.
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      setError(null)
      try {
        const result = await getCinemasSummary(daysBack)
        const chartData: RevenueChartDatum[] = result.map((cinema) => ({
          id: cinema.cinema_id,
          name: cinema.cinema_name.replace(/^(Rạp |Cinema )/i, ""),
          fullName: cinema.cinema_name,
          revenue: parseFloat(cinema.total_revenue.toString()),
          tickets: cinema.tickets_sold,
          // occupancy_rate có thể NULL khi rạp chưa có phòng/ghế nào
          occupancy: parseFloat((cinema.occupancy_rate ?? 0).toString()),
          isSelected: Boolean(selectedCinemaId && selectedCinemaId !== "all" && cinema.cinema_id.toString() === selectedCinemaId),
        }))
        setData(chartData)
      } catch (err) {
        console.error("Error fetching cinemas revenue:", err)
        const message = err instanceof ApiError
          ? (err.status === 401 ? "Phiên đăng nhập đã hết hạn — vui lòng đăng nhập lại." : err.message)
          : "Lỗi kết nối server."
        setError(message)
        setData([])
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [daysBack, selectedCinemaId, reloadKey])

  const totalRevenue = useMemo(() => data.reduce((s, d) => s + d.revenue, 0), [data])
  const hasSelection = Boolean(selectedCinemaId && selectedCinemaId !== "all")

  const barColor = (d: RevenueChartDatum, rank: number) => {
    if (hasSelection) return d.isSelected ? EMPHASIS_ACCENT : EMPHASIS_MUTED
    return SEQUENTIAL_AMBER[Math.min(rank, SEQUENTIAL_AMBER.length - 1)]
  }

  const headerBlock = (
    <CardHeader className="pb-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <DollarSign className="h-5 w-5 text-amber-500" />
            Doanh thu theo rạp
          </CardTitle>
          <CardDescription className="mt-0.5">
            {daysBack} ngày gần nhất{!loading && !error ? ` • Tổng ${formatVND(totalRevenue)}` : ""}
          </CardDescription>
        </div>
        {!loading && !error && data.length > 0 && (
          <div className="flex items-center gap-1 rounded-lg border p-0.5 shrink-0">
            <Button
              variant={view === "chart" ? "secondary" : "ghost"} size="sm" className="h-7 px-2"
              onClick={() => setView("chart")}
            >
              <BarChart3 className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant={view === "table" ? "secondary" : "ghost"} size="sm" className="h-7 px-2"
              onClick={() => setView("table")}
            >
              <Table2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>
    </CardHeader>
  )

  if (loading) {
    return (
      <Card>
        {headerBlock}
        <CardContent>
          <div className="h-[300px] flex items-center justify-center">
            <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        {headerBlock}
        <CardContent>
          <div className="h-[260px] flex flex-col items-center justify-center gap-3 text-center">
            <AlertCircle className="h-8 w-8 text-red-500" />
            <p className="text-sm font-medium text-red-600 dark:text-red-400">Không tải được dữ liệu doanh thu</p>
            <p className="text-xs text-muted-foreground max-w-xs">{error}</p>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setReloadKey((k) => k + 1)}>
              <RefreshCw className="h-3.5 w-3.5" /> Thử lại
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (data.length === 0) {
    return (
      <Card>
        {headerBlock}
        <CardContent>
          <div className="h-[220px] flex flex-col items-center justify-center gap-2 text-muted-foreground">
            <Building2 className="h-8 w-8 opacity-30" />
            <p className="text-sm">Chưa có rạp nào hoặc chưa có dữ liệu trong khoảng thời gian này</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      {headerBlock}
      <CardContent>
        {view === "table" ? (
          <div className="rounded-lg border overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Rạp</TableHead>
                  <TableHead className="text-right">Doanh thu</TableHead>
                  <TableHead className="text-right">Vé bán</TableHead>
                  <TableHead className="text-right">Lấp đầy</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((d) => (
                  <TableRow key={d.id} className={d.isSelected ? "bg-amber-500/5" : ""}>
                    <TableCell className="font-medium">{d.fullName}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{formatVND(d.revenue)}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{d.tickets.toLocaleString("vi-VN")}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{d.occupancy.toFixed(1)}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 24, right: 12, left: 0, bottom: 0 }} barCategoryGap="24%">
                <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted/60" />
                <XAxis
                  dataKey="name"
                  tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
                  tickLine={false} axisLine={false}
                />
                <YAxis
                  tickFormatter={fmtMoney}
                  tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                  tickLine={false} axisLine={false}
                  width={44}
                />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: "color-mix(in oklch, var(--muted) 30%, transparent)" }} />
                <Bar dataKey="revenue" radius={[4, 4, 0, 0]} maxBarSize={24}>
                  {data.map((entry, index) => (
                    <Cell key={entry.id} fill={barColor(entry, index)} />
                  ))}
                  <LabelList
                    dataKey="revenue"
                    position="top"
                    formatter={(v: number) => fmtMoney(v)}
                    style={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
