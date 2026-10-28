"use client"
export const dynamic = "force-dynamic"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import Image from "next/image"
import { useSearchParams } from "next/navigation"
import { Header } from "@/components/header"
import { DateSelector } from "@/components/date-selector"
import { Badge } from "@/components/ui/badge"
import { Clock, MapPin, Film } from "lucide-react"
import { formatVND } from "@/lib/utils"
import { getMovies } from "@/lib/api/movies"
import { getCinemas } from "@/lib/api/cinemas"
import { getShowtimesByMovie } from "@/lib/api/showtimes"

// ─── helpers ──────────────────────────────────
const getLocalToday = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

function fmtTime(t: string) {
  return (t || "").slice(0, 5)
}

function fmtDuration(mins: number) {
  return `${Math.floor(mins / 60)}h ${mins % 60}m`
}

// Màu nút theo số ghế còn
function slotClass(available: number, total: number, disabled: boolean) {
  if (disabled) return "border-border text-muted-foreground bg-muted/40 cursor-not-allowed opacity-60"
  const pct = total > 0 ? available / total : 1
  if (pct < 0.1) return "border-red-500 text-red-500 hover:bg-red-500 hover:text-white"
  if (pct < 0.3) return "border-orange-400 text-orange-500 hover:bg-orange-400 hover:text-white"
  return "border-primary text-primary hover:bg-primary hover:text-primary-foreground"
}

// Suất chiếu đã qua giờ chưa (chỉ áp dụng khi đang xem ngày hôm nay)
function isPastShowtime(showDate: string, showTime: string) {
  const today = getLocalToday()
  if (showDate !== today) return false
  const now = new Date()
  const [h, m] = (showTime || "00:00").split(":").map(Number)
  const showAt = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m)
  return showAt < now
}

// Room type badge
function RoomBadge({ type }: { type?: string }) {
  if (!type || type === "standard") return null
  const map: Record<string, string> = {
    vip: "bg-amber-100 text-amber-700",
    imax: "bg-blue-100 text-blue-700",
    "4dx": "bg-purple-100 text-purple-700",
  }
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase ml-1 ${map[type.toLowerCase()] || "bg-muted text-muted-foreground"}`}>
      {type.toUpperCase()}
    </span>
  )
}

// ─── Main Page ─────────────────────────────────
export default function ShowtimesPage() {
  const searchParams = useSearchParams()
  // Cho phép deep-link tới 1 ngày cụ thể (vd chatbot trỏ "?date=2026-07-13")
  // thay vì luôn mặc định về hôm nay.
  const [selectedDate, setSelectedDate] = useState(() => searchParams.get("date") || getLocalToday())
  const [selectedCinemaId, setSelectedCinemaId] = useState<number | null>(null)
  const [cinemas, setCinemas] = useState<any[]>([])
  // Structure: { [movieId]: { movie, cinemas: { [cinemaId]: { cinema, rooms: { [roomKey]: { room, showtimes[] } } } } } }
  const [data, setData] = useState<Record<number, any>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [movies, cinemaList] = await Promise.all([getMovies(), getCinemas()])
      setCinemas(cinemaList)

      // Fetch showtimes for all movies in parallel
      const fetches = movies.map(async (m: any) => {
        const showtimes = await getShowtimesByMovie(m.id).catch(() => [])
        return { movie: m, showtimes }
      })
      const results = await Promise.all(fetches)

      // Find best available date
      const allDates = new Set<string>()
      results.forEach(({ showtimes }) =>
        showtimes.forEach((s: any) => { if (s.show_date) allDates.add(s.show_date.slice(0, 10)) })
      )
      const sortedDates = Array.from(allDates).sort()
      const effectiveDate = allDates.has(selectedDate) ? selectedDate : (sortedDates[0] || selectedDate)
      if (effectiveDate !== selectedDate) setSelectedDate(effectiveDate)

      // Build grouped structure
      const grouped: Record<number, any> = {}
      results.forEach(({ movie, showtimes }) => {
        const filtered = showtimes.filter((s: any) => {
          const dateMatch = s.show_date?.slice(0, 10) === effectiveDate
          const cinemaMatch = !selectedCinemaId || s.cinema_id === selectedCinemaId
          return dateMatch && cinemaMatch
        })
        if (!filtered.length) return

        if (!grouped[movie.id]) grouped[movie.id] = { movie, cinemas: {} }

        filtered.forEach((s: any) => {
          const cinema = cinemaList.find((c: any) => c.id === s.cinema_id) || {
            id: s.cinema_id, name: s.cinema_name || "Rạp", location: s.location || s.cinema_location || ""
          }
          if (!grouped[movie.id].cinemas[s.cinema_id]) {
            grouped[movie.id].cinemas[s.cinema_id] = { cinema, rooms: {} }
          }
          // Key by room_id or room_name to group slots per room
          const roomKey = s.room_id ? `room_${s.room_id}` : `noroom_${s.cinema_id}`
          if (!grouped[movie.id].cinemas[s.cinema_id].rooms[roomKey]) {
            grouped[movie.id].cinemas[s.cinema_id].rooms[roomKey] = {
              room: {
                id: s.room_id,
                name: s.room_name || "Phòng chiếu",
                type: s.room_type || "standard",
                features: s.room_features || [],
              },
              showtimes: [],
            }
          }
          grouped[movie.id].cinemas[s.cinema_id].rooms[roomKey].showtimes.push(s)
        })

        // Sort showtimes by time trong mỗi phòng — suất đã qua giờ bị đẩy xuống cuối
        Object.values(grouped[movie.id].cinemas).forEach((c: any) => {
          Object.values(c.rooms).forEach((r: any) => {
            r.showtimes.sort((a: any, b: any) => {
              const aPast = isPastShowtime(a.show_date?.slice(0, 10), a.show_time)
              const bPast = isPastShowtime(b.show_date?.slice(0, 10), b.show_time)
              if (aPast !== bPast) return aPast ? 1 : -1
              return a.show_time.localeCompare(b.show_time)
            })
          })
        })
      })

      // Phim mà toàn bộ suất chiếu hôm nay đã qua giờ thì bị đẩy xuống cuối danh sách
      const movieHasUpcoming = (entry: any) => {
        for (const c of Object.values(entry.cinemas) as any[]) {
          for (const r of Object.values(c.rooms) as any[]) {
            if (r.showtimes.some((s: any) => !isPastShowtime(s.show_date?.slice(0, 10), s.show_time))) return true
          }
        }
        return false
      }
      const ordered: Record<number, any> = {}
      Object.entries(grouped)
        .sort(([, a]: any, [, b]: any) => {
          const aUp = movieHasUpcoming(a)
          const bUp = movieHasUpcoming(b)
          return aUp === bUp ? 0 : aUp ? -1 : 1
        })
        .forEach(([id, entry]) => { ordered[Number(id)] = entry })

      setData(ordered)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [selectedDate, selectedCinemaId])

  useEffect(() => {
    load()
    // Tự tải lại định kỳ — nếu không, thứ tự "suất đã qua giờ" chỉ được tính
    // một lần lúc tải trang và không tự cập nhật khi thời gian trôi qua.
    const id = setInterval(load, 60_000)
    return () => clearInterval(id)
  }, [load])

  const movieEntries = Object.entries(data)

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold">Lịch chiếu phim</h1>
          <p className="text-muted-foreground mt-1">Chọn ngày và rạp để xem suất chiếu phù hợp</p>
        </div>

        {/* Date Selector */}
        <div className="border-b pb-5">
          <DateSelector selectedDate={selectedDate} onDateChange={setSelectedDate} />
        </div>

        {/* Cinema Filter */}
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm font-medium text-muted-foreground">Chọn rạp:</span>
          <button
            onClick={() => setSelectedCinemaId(null)}
            className={`text-sm px-3 py-1.5 rounded-full border transition ${!selectedCinemaId ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary"}`}
          >
            <MapPin className="h-3.5 w-3.5 inline mr-1" />
            Tất cả rạp
          </button>
          {cinemas.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedCinemaId(c.id === selectedCinemaId ? null : c.id)}
              className={`text-sm px-3 py-1.5 rounded-full border transition ${selectedCinemaId === c.id ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary"}`}
            >
              <MapPin className="h-3.5 w-3.5 inline mr-1" />
              {c.name}
            </button>
          ))}
        </div>

        {/* Content */}
        {loading ? (
          <div className="text-center py-16 text-muted-foreground">
            <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            Đang tải lịch chiếu...
          </div>
        ) : error ? (
          <div className="text-center py-16 text-destructive">⚠️ {error}</div>
        ) : movieEntries.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Film className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">Không có suất chiếu vào ngày này</p>
            <p className="text-sm mt-1">Thử chọn ngày khác hoặc rạp khác</p>
          </div>
        ) : (
          <div className="space-y-6">
            {movieEntries.map(([movieId, { movie, cinemas: cinemaSections }]) => (
              <MovieShowtimeCard
                key={movieId}
                movie={movie}
                cinemaSections={cinemaSections}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

// ─── Movie Card Component ──────────────────────
function MovieShowtimeCard({ movie, cinemaSections }: { movie: any; cinemaSections: Record<string, any> }) {
  return (
    <div className="bg-card border rounded-xl overflow-hidden">
      {/* Movie Info Header */}
      <div className="flex gap-4 p-4 border-b bg-muted/20">
        <div className="relative w-16 h-24 shrink-0 rounded-lg overflow-hidden">
          <Image
            src={movie.poster_url || "/placeholder.svg"}
            alt={movie.title}
            fill
            className="object-cover"
            onError={(e) => { (e.target as HTMLImageElement).src = "/placeholder.svg" }}
          />
        </div>
        <div className="flex-1 min-w-0">
          <Link href={`/movie/${movie.id}`} className="hover:text-primary transition">
            <h3 className="text-lg font-bold leading-tight">{movie.title}</h3>
          </Link>
          <div className="flex flex-wrap items-center gap-2 mt-1.5">
            <Badge variant="outline" className="text-xs">{movie.rating}</Badge>
            <span className="text-sm text-muted-foreground">{movie.genre}</span>
            <span className="flex items-center gap-1 text-sm text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              {fmtDuration(movie.duration || 0)}
            </span>
          </div>
          {movie.description && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{movie.description}</p>
          )}
        </div>
      </div>

      {/* Cinema Sections */}
      <div className="divide-y">
        {Object.entries(cinemaSections).map(([cinemaId, { cinema, rooms }]) => (
          <CinemaSection
            key={cinemaId}
            cinema={cinema}
            rooms={rooms}
          />
        ))}
      </div>
    </div>
  )
}

// ─── Cinema Section ────────────────────────────
function CinemaSection({ cinema, rooms }: { cinema: any; rooms: Record<string, any> }) {
  return (
    <div className="p-4">
      {/* Cinema Name */}
      <div className="flex items-start gap-2 mb-3">
        <MapPin className="h-4 w-4 text-primary shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold text-sm">{cinema.name}</p>
          {cinema.location && (
            <p className="text-xs text-muted-foreground mt-0.5">{cinema.location}</p>
          )}
        </div>
      </div>

      {/* Room Rows — như hình Galaxy Cinema */}
      <div className="space-y-2 ml-6">
        {Object.entries(rooms).map(([roomKey, { room, showtimes }]) => (
          <RoomRow key={roomKey} room={room} showtimes={showtimes} />
        ))}
      </div>
    </div>
  )
}

// ─── Room Row ──────────────────────────────────
function RoomRow({ room, showtimes }: { room: any; showtimes: any[] }) {
  if (!showtimes.length) return null

  // Lấy giá min-max để hiển thị gọn
  const prices = showtimes.map((s) => s.price).filter(Boolean)
  const minPrice = prices.length ? Math.min(...prices) : 0
  const maxPrice = prices.length ? Math.max(...prices) : 0
  const priceStr = minPrice === maxPrice
    ? formatVND(minPrice)
    : `${formatVND(minPrice)} – ${formatVND(maxPrice)}`

  return (
    <div className="flex items-start gap-3 py-2 border-b border-dashed border-border/50 last:border-0">
      {/* Room label */}
      <div className="w-44 shrink-0 pt-0.5">
        <div className="flex items-center flex-wrap gap-1">
          <span className="text-sm font-medium text-foreground">{room.name}</span>
          <RoomBadge type={room.type} />
        </div>
        <p className="text-[11px] text-muted-foreground mt-0.5">{priceStr}</p>
      </div>

      {/* Time slot buttons */}
      <div className="flex flex-wrap gap-1.5">
        {showtimes.map((s) => {
          const isFull = s.available_seats === 0
          const isPast = isPastShowtime(s.show_date?.slice(0, 10), s.show_time)
          const disabled = isFull || isPast
          const className = `px-3 py-1.5 rounded border text-sm font-medium transition-colors ${slotClass(s.available_seats, s.total_seats, disabled)}`

          return disabled ? (
            <button key={s.id} disabled className={className} title={isPast ? "Suất chiếu đã qua giờ" : "Hết chỗ"}>
              {fmtTime(s.show_time)}
            </button>
          ) : (
            <Link key={s.id} href={`/booking/${s.id}`}>
              <button
                className={className}
                title={`Còn ${s.available_seats}/${s.total_seats} ghế • ${formatVND(s.price)}`}
              >
                {fmtTime(s.show_time)}
              </button>
            </Link>
          )
        })}
      </div>

      {/* Seat availability indicator */}
      <div className="shrink-0 pt-1.5 ml-auto hidden sm:flex items-center gap-1 text-xs text-muted-foreground">
        <SeatMiniBar showtimes={showtimes} />
      </div>
    </div>
  )
}

// ─── Mini progress bar cho room ───────────────
function SeatMiniBar({ showtimes }: { showtimes: any[] }) {
  const totals = showtimes.reduce(
    (acc, s) => ({ avail: acc.avail + (s.available_seats || 0), total: acc.total + (s.total_seats || 0) }),
    { avail: 0, total: 0 }
  )
  if (!totals.total) return null
  const pct = Math.round((totals.avail / totals.total) * 100)
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-14 h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${pct > 50 ? "bg-green-500" : pct > 20 ? "bg-amber-500" : "bg-red-500"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span>{pct}%</span>
    </div>
  )
}
