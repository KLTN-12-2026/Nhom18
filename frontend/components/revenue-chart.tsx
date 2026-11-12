"use client"

import { useCallback, useEffect, useState } from "react"
import {
  ComposedChart, Bar, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { TrendingUp, TrendingDown, RefreshCw, DollarSign } from "lucide-react"
import { formatVND } from "@/lib/utils"
import { getReportsDaily } from "@/lib/api/admin/reports"

interface RevenueChartProps {
  selectedCinemaId?: string
  daysBack?: number
}

interface DayData {
  date: string
  fullDate: string
  revenue: number
  tickets: number
}

function fmtMoney(v: number) {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`
  return String(v)
}

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  return (
    <div className="bg-background/95 backdrop-blur-sm border rounded-xl shadow-xl p-3 text-sm">
      <p className="font-semibold mb-2 text-foreground">{d?.fullDate}</p>
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-500 inline-block" />
            Doanh thu
          </span>
          <span className="font-semibold text-amber-600">
            {formatVND(d?.revenue)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="h-2.5 w-2.5 rounded-full bg-blue-500 inline-block" />
            Vé bán
          </span>
          <span className="font-semibold text-blue-600">{d?.tickets ?? 0} vé</span>
        </div>
      </div>
    </div>
  )
}

export function RevenueChart({ selectedCinemaId = "all", daysBack = 14 }: RevenueChartProps) {
  const [data, setData] = useState<DayData[]>([])
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const fetchData = useCallback(async () => {
    try {
      const toDate = new Date()
      const fromDate = new Date(Date.now() - daysBack * 24 * 3600 * 1000)
      const pad = (n: number) => String(n).padStart(2, "0")
      const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

      const data = await getReportsDaily(`${fmt(fromDate)} 00:00:00`, `${fmt(toDate)} 23:59:59`, selectedCinemaId)
      const rows: DayData[] = data.map((item: any) => ({
        date: new Date(item.day).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" }),
        fullDate: new Date(item.day).toLocaleDateString("vi-VN", { weekday: "short", day: "2-digit", month: "2-digit" }),
        revenue: Number(item.revenue || 0),
        tickets: Number(item.tickets || 0),
      }))
      setData(rows)
      setLastUpdated(new Date())
    } catch {
      // keep previous data on error
    } finally {
      setLoading(false)
    }
  }, [selectedCinemaId, daysBack])

  useEffect(() => {
    setLoading(true)
    fetchData()
    const id = setInterval(fetchData, 5 * 60 * 1000) // 5 phút
    return () => clearInterval(id)
  }, [fetchData])

  const totalRevenue = data.reduce((s, d) => s + d.revenue, 0)
  const totalTickets = data.reduce((s, d) => s + d.tickets, 0)
  const avgRevenue = data.length ? totalRevenue / data.length : 0

  const half = Math.floor(data.length / 2)
  const firstHalf = data.slice(0, half).reduce((s, d) => s + d.revenue, 0)
  const secondHalf = data.slice(half).reduce((s, d) => s + d.revenue, 0)
  const trend = firstHalf > 0 ? ((secondHalf - firstHalf) / firstHalf) * 100 : 0
  const trendUp = trend >= 0

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <DollarSign className="h-5 w-5 text-amber-500" />
              Doanh thu {daysBack} ngày gần nhất
            </CardTitle>
            <CardDescription className="mt-0.5">
              {lastUpdated ? `Cập nhật ${lastUpdated.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}` : "Đang tải..."}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {!loading && data.length > 0 && (
              <Badge variant={trendUp ? "default" : "destructive"} className="flex items-center gap-1 text-xs">
                {trendUp ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {trendUp ? "+" : ""}{trend.toFixed(1)}%
              </Badge>
            )}
            {loading && <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />}
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {loading && data.length === 0 ? (
          <div className="h-[280px] flex items-center justify-center">
            <div className="flex flex-col items-center gap-3 text-muted-foreground">
              <RefreshCw className="h-8 w-8 animate-spin" />
              <p className="text-sm">Đang tải dữ liệu...</p>
            </div>
          </div>
        ) : data.length === 0 ? (
          <div className="h-[280px] flex items-center justify-center text-muted-foreground text-sm">
            Chưa có dữ liệu doanh thu
          </div>
        ) : (
          <>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted/60" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                    tickLine={false} axisLine={false}
                  />
                  <YAxis
                    yAxisId="rev"
                    orientation="left"
                    tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                    tickLine={false} axisLine={false}
                    tickFormatter={fmtMoney}
                    width={45}
                  />
                  <YAxis
                    yAxisId="tkt"
                    orientation="right"
                    tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                    tickLine={false} axisLine={false}
                    width={30}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend
                    iconType="circle" iconSize={8}
                    formatter={(v) => v === "revenue" ? "Doanh thu" : "Vé bán"}
                    wrapperStyle={{ fontSize: 12 }}
                  />
                  <Bar
                    yAxisId="tkt" dataKey="tickets" name="tickets"
                    fill="#3b82f6" opacity={0.65} radius={[3, 3, 0, 0]} maxBarSize={20}
                  />
                  <Area
                    yAxisId="rev" type="monotone" dataKey="revenue" name="revenue"
                    stroke="#f59e0b" strokeWidth={2.5}
                    fillOpacity={1} fill="url(#revenueGrad)"
                    dot={false} activeDot={{ r: 4, strokeWidth: 0 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {/* Summary stats */}
            <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t">
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Tổng doanh thu</p>
                <p className="text-lg font-bold text-amber-500 mt-0.5">
                  {(totalRevenue / 1_000_000).toFixed(1)}M
                </p>
                <p className="text-[10px] text-muted-foreground">VNĐ</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground">TB / ngày</p>
                <p className="text-lg font-bold text-orange-500 mt-0.5">
                  {(avgRevenue / 1_000_000).toFixed(2)}M
                </p>
                <p className="text-[10px] text-muted-foreground">VNĐ</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Tổng vé</p>
                <p className="text-lg font-bold text-blue-500 mt-0.5">
                  {totalTickets.toLocaleString("vi-VN")}
                </p>
                <p className="text-[10px] text-muted-foreground">vé</p>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
