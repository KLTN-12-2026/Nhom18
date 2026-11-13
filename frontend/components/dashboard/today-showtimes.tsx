"use client"

import { useCallback, useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Clock, RefreshCw, TrendingUp, AlertCircle, CheckCircle2 } from "lucide-react"
import { getShowtimesByDate } from "@/lib/api/showtimes"

interface ShowtimeRow {
  id: number
  movie_title: string
  cinema_name: string
  room_name: string
  room_type: string
  show_time: string
  total_seats: number
  available_seats: number
  booked: number
  occupancy: number
}

interface TodayShowtimesProps {
  selectedCinemaId?: string
}

function OccupancyBar({ pct }: { pct: number }) {
  const color =
    pct >= 70 ? "bg-green-500" :
    pct >= 40 ? "bg-amber-500" :
    pct >= 10 ? "bg-orange-400" : "bg-muted"
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <span className={`text-xs font-semibold tabular-nums w-8 shrink-0 text-right ${
        pct >= 70 ? "text-green-600" : pct >= 40 ? "text-amber-600" : pct >= 10 ? "text-orange-500" : "text-muted-foreground"
      }`}>
        {pct}%
      </span>
    </div>
  )
}

export function TodayShowtimes({ selectedCinemaId = "all" }: TodayShowtimesProps) {
  const [rows, setRows] = useState<ShowtimeRow[]>([])
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [avgOccupancy, setAvgOccupancy] = useState(0)

  const fetchData = useCallback(async () => {
    try {
      const now = new Date()
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`

      const rawShowtimes = await getShowtimesByDate(today, selectedCinemaId)
      const showtimes: ShowtimeRow[] = rawShowtimes.map((s: any) => {
        const booked = (s.total_seats || 0) - (s.available_seats || 0)
        const occ = s.total_seats > 0 ? Math.round((booked / s.total_seats) * 100) : 0
        return {
          id: s.id,
          movie_title: s.movie_title || "—",
          cinema_name: s.cinema_name || s.location || "—",
          room_name: s.room_name || "",
          room_type: s.room_type || "standard",
          show_time: (s.show_time || "").slice(0, 5),
          total_seats: s.total_seats || 0,
          available_seats: s.available_seats || 0,
          booked,
          occupancy: occ,
        }
      })

      // Sắp xếp: đang chiếu gần nhất + tỷ lệ cao xuống thấp
      const nowStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`
      showtimes.sort((a, b) => {
        const aSoon = a.show_time >= nowStr
        const bSoon = b.show_time >= nowStr
        if (aSoon !== bSoon) return aSoon ? -1 : 1
        return b.occupancy - a.occupancy
      })

      setRows(showtimes)
      setLastUpdated(new Date())
      if (showtimes.length > 0) {
        const avg = Math.round(showtimes.reduce((s, r) => s + r.occupancy, 0) / showtimes.length)
        setAvgOccupancy(avg)
      }
    } catch (err) {
      // Giữ dữ liệu cũ nhưng vẫn log — xem chú thích ở app/admin/page.tsx
      console.error("Tải suất chiếu hôm nay thất bại:", err)
    } finally {
      setLoading(false)
    }
  }, [selectedCinemaId])

  useEffect(() => {
    setLoading(true)
    fetchData()
    const id = setInterval(fetchData, 2 * 60 * 1000) // 2 phút
    return () => clearInterval(id)
  }, [fetchData])

  const roomTypeBadge = (t: string) => {
    const map: Record<string, string> = {
      imax: "bg-blue-100 text-blue-700",
      "4dx": "bg-purple-100 text-purple-700",
      vip: "bg-amber-100 text-amber-700",
    }
    const key = t?.toLowerCase()
    return map[key] ? (
      <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold uppercase ${map[key]}`}>{t}</span>
    ) : null
  }

  const nowStr = (() => {
    const n = new Date()
    return `${String(n.getHours()).padStart(2, "0")}:${String(n.getMinutes()).padStart(2, "0")}`
  })()

  const upcoming = rows.filter(r => r.show_time >= nowStr)
  const past = rows.filter(r => r.show_time < nowStr)

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-3 shrink-0">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="h-5 w-5 text-primary" />
              Suất chiếu hôm nay
            </CardTitle>
            <CardDescription className="mt-0.5">
              {lastUpdated
                ? `${rows.length} suất • TB lấp đầy ${avgOccupancy}% • ${lastUpdated.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}`
                : "Đang tải..."}
            </CardDescription>
          </div>
          {loading
            ? <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />
            : (
              <div className="flex items-center gap-1.5">
                {avgOccupancy >= 60
                  ? <CheckCircle2 className="h-4 w-4 text-green-500" />
                  : avgOccupancy >= 30
                  ? <TrendingUp className="h-4 w-4 text-amber-500" />
                  : <AlertCircle className="h-4 w-4 text-muted-foreground" />
                }
                <span className={`text-sm font-semibold ${
                  avgOccupancy >= 60 ? "text-green-600" : avgOccupancy >= 30 ? "text-amber-600" : "text-muted-foreground"
                }`}>{avgOccupancy}%</span>
              </div>
            )
          }
        </div>
      </CardHeader>

      <CardContent className="flex-1 overflow-y-auto min-h-0 space-y-1 pb-3">
        {loading && rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
            <RefreshCw className="h-6 w-6 animate-spin mb-2" />
            <p className="text-sm">Đang tải lịch chiếu...</p>
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
            <Clock className="h-10 w-10 mb-2 opacity-30" />
            <p className="text-sm font-medium">Chưa có suất chiếu hôm nay</p>
            <p className="text-xs mt-1">Hãy tạo lịch chiếu mới</p>
          </div>
        ) : (
          <>
            {/* Suất sắp chiếu */}
            {upcoming.length > 0 && (
              <>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide px-1 pt-1 pb-0.5">
                  Sắp chiếu / đang chiếu ({upcoming.length})
                </p>
                {upcoming.map((row) => (
                  <ShowtimeItem key={row.id} row={row} roomTypeBadge={roomTypeBadge} />
                ))}
              </>
            )}
            {/* Suất đã chiếu */}
            {past.length > 0 && (
              <>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide px-1 pt-2 pb-0.5 opacity-60">
                  Đã chiếu ({past.length})
                </p>
                {past.map((row) => (
                  <ShowtimeItem key={row.id} row={row} roomTypeBadge={roomTypeBadge} isPast />
                ))}
              </>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}

function ShowtimeItem({
  row, roomTypeBadge, isPast = false
}: {
  row: ShowtimeRow
  roomTypeBadge: (t: string) => React.ReactNode
  isPast?: boolean
}) {
  return (
    <div className={`px-3 py-2 rounded-lg border flex gap-3 items-center transition-colors ${
      isPast ? "opacity-50 bg-muted/20" : "bg-muted/30 hover:bg-muted/50"
    }`}>
      {/* Giờ chiếu */}
      <div className="shrink-0 text-center min-w-[38px]">
        <p className={`text-sm font-bold tabular-nums leading-none ${isPast ? "text-muted-foreground" : "text-primary"}`}>
          {row.show_time}
        </p>
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <p className="text-xs font-medium leading-tight truncate">{row.movie_title}</p>
          {roomTypeBadge(row.room_type)}
        </div>
        <p className="text-[10px] text-muted-foreground truncate">
          {row.cinema_name}{row.room_name ? ` • ${row.room_name}` : ""}
        </p>
        <OccupancyBar pct={row.occupancy} />
      </div>

      {/* Seats */}
      <div className="shrink-0 text-right">
        <p className="text-xs font-semibold tabular-nums">{row.booked}/{row.total_seats}</p>
        <p className="text-[9px] text-muted-foreground">ghế</p>
      </div>
    </div>
  )
}
