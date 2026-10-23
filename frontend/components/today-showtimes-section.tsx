"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Calendar, Clock, MapPin, Ticket } from "lucide-react"
import { getTodayLiveShowtimes } from "@/lib/api/showtimes"

interface Showtime {
  id: number
  movie_id: number
  movie_title: string
  poster_url: string
  show_date: string
  show_time: string
  cinema_name: string
  location: string
  price: number
  available_seats: number
  rating: string
  genre: string
  duration: number
}

// Lọc suất chiếu đã qua giờ — CHỈ áp dụng khi showtime thật sự thuộc HÔM NAY.
// Backend (Showtime.findTodayLive) có cơ chế fallback: nếu hôm nay hết suất,
// trả về suất của NGÀY GẦN NHẤT có suất thay vì mảng rỗng — nếu vẫn lọc theo
// giờ hiện tại trong trường hợp đó sẽ xoá nhầm suất hợp lệ của ngày khác.
const filterPastShowtimes = (list: Showtime[], isActuallyToday: boolean): Showtime[] => {
  if (!isActuallyToday) return list
  const now = new Date()
  const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:00`
  return list.filter((s) => s.show_time >= currentTime)
}

const getLocalToday = () => {
  const today = new Date()
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`
}

// Dedup: mỗi bộ phim chỉ hiện 1 lần (giữ suất chiếu sớm nhất còn lại)
const deduplicateByMovie = (list: Showtime[]): Showtime[] => {
  const seen = new Map<number, Showtime>()
  list.forEach((s) => {
    if (!seen.has(s.movie_id)) seen.set(s.movie_id, s)
  })
  return Array.from(seen.values())
}

export function TodayShowtimesSection() {
  const [showtimes, setShowtimes] = useState<Showtime[]>([])
  const [loading, setLoading] = useState(true)
  const [currentTime, setCurrentTime] = useState(() => new Date())

  const fetchTodayShowtimes = useCallback(async () => {
    const todayKey = getLocalToday()
    const cacheKey = `today-live-showtimes:${todayKey}`
    const now = Date.now()

    try {
      const cachedRaw = sessionStorage.getItem(cacheKey)
      if (cachedRaw) {
        const cached = JSON.parse(cachedRaw)
        if (cached?.expiresAt > now && Array.isArray(cached?.showtimes)) {
          setShowtimes(cached.showtimes)
          setLoading(false)
        }
      }

      const liveShowtimes = await getTodayLiveShowtimes(30)
      setShowtimes(liveShowtimes)
      sessionStorage.setItem(
        cacheKey,
        JSON.stringify({ showtimes: liveShowtimes, expiresAt: now + 60 * 1000 }),
      )
    } catch (error) {
      console.error('Failed to fetch today showtimes:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchTodayShowtimes()
    // Refetch mỗi 60 giây để lấy suất chiếu mới
    const fetchInterval = setInterval(fetchTodayShowtimes, 60 * 1000)
    // Cập nhật giờ hiện tại mỗi phút để lọc suất đã qua
    const clockInterval = setInterval(() => setCurrentTime(new Date()), 60 * 1000)
    return () => {
      clearInterval(fetchInterval)
      clearInterval(clockInterval)
    }
  }, [fetchTodayShowtimes])

  if (loading) {
    return (
      <section className="py-12 bg-gradient-to-b from-primary/5 to-background">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 bg-primary/10 px-4 py-2 rounded-full mb-4">
              <Calendar className="h-5 w-5 text-primary" />
              <span className="font-semibold text-primary">Đang tải...</span>
            </div>
          </div>
        </div>
      </section>
    )
  }

  // QUAN TRỌNG: backend (Showtime.findTodayLive) có cơ chế fallback — nếu
  // HÔM NAY đã hết suất chiếu, trả về suất của NGÀY GẦN NHẤT có suất thay vì
  // mảng rỗng (để widget không biến mất hoàn toàn lúc cuối ngày). Trước đây
  // giao diện luôn ghi cứng "Hôm Nay"/"LIVE" bất kể backend có đang fallback
  // hay không — khiến suất chiếu của 1 ngày TRONG TƯƠNG LAI bị gắn nhãn sai
  // là "đang chiếu hôm nay", đánh lừa khách. So khớp show_date thật với ngày
  // hôm nay ở client để hiện đúng nhãn.
  const todayKey = getLocalToday()
  const isActuallyToday = showtimes.length > 0 && showtimes[0].show_date === todayKey

  // Lọc đã qua giờ (chỉ khi đúng là hôm nay) rồi dedup theo phim
  const displayShowtimes = deduplicateByMovie(filterPastShowtimes(showtimes, isActuallyToday))

  if (displayShowtimes.length === 0) {
    return null
  }

  const now = currentTime
  const timeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`
  const fallbackDateLabel = !isActuallyToday
    ? new Date(`${displayShowtimes[0].show_date}T00:00:00`).toLocaleDateString("vi-VN", {
        weekday: "long", day: "2-digit", month: "2-digit",
      })
    : null

  return (
    <section className="py-12 bg-gradient-to-b from-primary/5 to-background border-y border-border">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center mb-8">
          <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full mb-4 ${isActuallyToday ? "bg-primary/10 animate-pulse" : "bg-muted"}`}>
            <Calendar className="h-5 w-5 text-primary" />
            <span className="font-semibold text-primary">
              {isActuallyToday ? `HÔM NAY • ${timeStr}` : `SUẤT GẦN NHẤT • ${fallbackDateLabel}`}
            </span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-2">
            {isActuallyToday ? "🎬 Phim Đang Chiếu Hôm Nay" : "🎬 Phim Có Suất Chiếu Sắp Tới"}
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            {isActuallyToday
              ? `${displayShowtimes.length} bộ phim còn suất chiếu hôm nay — Đặt vé ngay!`
              : `Hôm nay không còn suất chiếu nào — đây là ${displayShowtimes.length} bộ phim có suất sớm nhất vào ${fallbackDateLabel}`}
          </p>
        </div>

        {/* Movies Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 mb-6">
          {displayShowtimes.map((showtime) => (
            <Card 
              key={`${showtime.movie_id}-${showtime.id}`} 
              className="group hover:shadow-xl transition-all duration-300 hover:scale-105 overflow-hidden border-2 hover:border-primary/50"
            >
              <CardContent className="p-0">
                <Link href={`/movie/${showtime.movie_id}`}>
                  {/* Movie Poster */}
                  <div className="relative aspect-[2/3] overflow-hidden">
                    <Image
                      src={showtime.poster_url || '/placeholder.svg'}
                      alt={showtime.movie_title}
                      fill
                      className="object-cover group-hover:scale-110 transition-transform duration-300"
                    />
                    {/* Live / Upcoming Indicator */}
                    <div className="absolute top-2 left-2">
                      {/* Không dùng "SẮP CHIẾU" cho nhánh dự phòng — ở rạp, nhãn đó nghĩa
                          là phim CHƯA ra mắt, trong khi các phim ở đây đang chiếu. */}
                      {isActuallyToday ? (
                        <Badge className="bg-red-500 text-white animate-pulse">LIVE</Badge>
                      ) : (
                        <Badge className="bg-amber-500 text-white">{showtime.show_date.slice(8, 10)}/{showtime.show_date.slice(5, 7)}</Badge>
                      )}
                    </div>
                    {/* Rating Badge */}
                    <div className="absolute top-2 right-2">
                      <Badge variant="secondary">{showtime.rating}</Badge>
                    </div>
                    {/* Hover Overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                      <div className="absolute bottom-0 left-0 right-0 p-3 space-y-2">
                        <div className="flex items-center gap-1 text-xs text-white">
                          <Clock className="h-3 w-3" />
                          <span>{showtime.show_time}</span>
                        </div>
                        <Button size="sm" className="w-full" asChild>
                          <Link href={`/movie/${showtime.movie_id}`}>
                            <Ticket className="h-3 w-3 mr-1" />
                            Đặt vé
                          </Link>
                        </Button>
                      </div>
                    </div>
                  </div>
                  {/* Movie Info */}
                  <div className="p-3">
                    <h3 className="font-semibold text-sm text-foreground line-clamp-2 min-h-[40px] group-hover:text-primary transition-colors">
                      {showtime.movie_title}
                    </h3>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mt-2">
                      <MapPin className="h-3 w-3" />
                      <span className="truncate">{showtime.cinema_name}</span>
                    </div>
                  </div>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* View All Button */}
        <div className="text-center">
          <Button variant="outline" size="lg" asChild>
            <Link href="#movies">
              Xem tất cả phim đang chiếu
            </Link>
          </Button>
        </div>
      </div>
    </section>
  )
}
