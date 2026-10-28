"use client"

export const dynamic = "force-dynamic"

import { useState, useEffect, useMemo } from "react"
import Image from "next/image"
import Link from "next/link"
import { Header } from "@/components/header"
import { DateSelector } from "@/components/date-selector"
import { CinemaSelector } from "@/components/cinema-selector"
import { ShowtimeGrid } from "@/components/showtime-grid"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ArrowLeft, Clock, Calendar } from "lucide-react"
import { getMovieById } from "@/lib/api/movies"
import { getShowtimesByMovie } from "@/lib/api/showtimes"
import { type Movie, type Cinema } from "@/lib/api/types"

interface ApiShowtime {
  id: number
  movie_id: number
  cinema_id: number
  show_date: string
  show_time: string
  price: number
  total_seats: number
  available_seats: number
  cinema_name?: string
  location?: string
}

interface ShowtimesPageProps {
  params: {
    id: string
  }
}

export default function ShowtimesPage({ params }: ShowtimesPageProps) {
  const movieId = Number.parseInt(params.id)
  const [movie, setMovie] = useState<Movie | null>(null)
  const [showtimes, setShowtimes] = useState<ApiShowtime[]>([])
  // Khởi tạo với chuỗi rỗng để tránh hydration mismatch, set đúng trong useEffect
  const [selectedDate, setSelectedDate] = useState("")
  const [selectedCinema, setSelectedCinema] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  // Set ngày hôm nay ở client-side để tránh hydration mismatch
  useEffect(() => {
    if (!selectedDate) {
      const d = new Date()
      setSelectedDate(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const load = async () => {
      try {
        const [movie, showtimes] = await Promise.all([
          getMovieById(movieId),
          getShowtimesByMovie(movieId).catch(() => []),
        ])

        if (!movie) {
          console.error("Failed to load movie", movieId)
          setLoading(false)
          return
        }

        setMovie(movie)
        setShowtimes(showtimes as ApiShowtime[])
      } catch (err) {
        console.error("Load error:", err)
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [movieId])

  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return `${hours}h ${mins}m`
  }

  // Suy ra danh sách rạp trực tiếp từ các suất chiếu của phim này — trước đây
  // truyền cứng cinemas={[]} nên "Chọn rạp" chỉ có mỗi nút "Tất cả rạp", các
  // rạp thật không bao giờ hiện ra được.
  const cinemas: Cinema[] = useMemo(() => {
    const seen = new Map<number, Cinema>()
    for (const s of showtimes) {
      if (!seen.has(s.cinema_id)) {
        seen.set(s.cinema_id, { id: s.cinema_id, name: s.cinema_name || `Rạp #${s.cinema_id}`, location: s.location || "" })
      }
    }
    return Array.from(seen.values())
  }, [showtimes])
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main>
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Back Button */}
          <Button variant="ghost" asChild className="mb-6">
            <Link href={`/movie/${movieId}`}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Quay lại chi tiết phim
            </Link>
          </Button>

          {loading ? (
            <div>Đang tải...</div>
          ) : !movie ? (
            <div>Phim không tồn tại.</div>
          ) : (
            <>
              {/* Movie Header */}
              <div className="flex flex-col lg:flex-row gap-8 mb-8">
                <div className="relative w-32 h-48 shrink-0 mx-auto lg:mx-0">
                  <Image
                    src={(movie.poster_url as string) || "/placeholder.svg"}
                    alt={movie.title}
                    fill
                    className="object-cover rounded-lg"
                  />
                </div>

                <div className="flex-1 text-center lg:text-left">
                  <h1 className="text-3xl lg:text-4xl font-bold text-foreground mb-4">{movie.title}</h1>

                  <div className="flex flex-wrap items-center justify-center lg:justify-start gap-4 text-muted-foreground mb-4">
                    <span className="flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      {formatDuration(movie.duration)}
                    </span>
                    <span className="flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      {movie.original_year ?? new Date(movie.release_date).getFullYear()}
                    </span>
                    <Badge variant="secondary">{movie.rating}</Badge>
                    <span>{movie.genre}</span>
                  </div>

                  <p className="text-muted-foreground leading-relaxed max-w-2xl">{movie.description}</p>
                </div>
              </div>

              {/* Date Selection */}
              <div className="border-b border-border mb-8">
                <h2 className="text-2xl font-bold text-foreground mb-4">Chọn ngày</h2>
                <DateSelector selectedDate={selectedDate} onDateChange={setSelectedDate} />
              </div>

              {/* Cinema Selection */}
              <div className="mb-8">
                <CinemaSelector cinemas={cinemas} selectedCinema={selectedCinema} onCinemaChange={setSelectedCinema} />
              </div>

              {/* Showtimes Grid */}
              <div>
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-2xl font-bold text-foreground">Suất chiếu khả dụng</h2>
                  <div className="text-sm text-muted-foreground" suppressHydrationWarning>
                    {(() => {
                      if (!selectedDate) return ""
                      const WD = ["Chủ nhật","Thứ hai","Thứ ba","Thứ tư","Thứ năm","Thứ sáu","Thứ bảy"]
                      const [y,m,d] = selectedDate.split("-").map(Number)
                      const dt = new Date(y, m-1, d)
                      return `${WD[dt.getDay()]}, ${d} tháng ${m} năm ${y}`
                    })()}
                  </div>
                </div>

                <ShowtimeGrid showtimes={showtimes} selectedDate={selectedDate} selectedCinema={selectedCinema} />
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  )
}
