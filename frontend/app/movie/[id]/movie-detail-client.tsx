"use client"

import { useState, useEffect, useCallback } from "react"
import { notFound } from "next/navigation"
import Image from "next/image"
import Link from "next/link"
import { motion } from "framer-motion"
import { Header } from "@/components/header"
import { Breadcrumb } from "@/components/breadcrumb"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { StarRating } from "@/components/star-rating"
import { RatingSummary } from "@/components/rating-summary"
import { MovieReviews } from "@/components/movie-reviews"
import { SimilarMovies } from "@/components/similar-movies"
import { TrailerButton } from "@/components/trailer-button-lazy"
import { FavoriteButton } from "@/components/favorite-button"
import { MovieStatusBadge } from "@/components/movie-status-badge"
import { useHiddenItems } from "@/lib/admin-menu-prefs"
import { getMovieById } from "@/lib/api/movies"
import { getShowtimesByMovie } from "@/lib/api/showtimes"
import { Clock, Calendar, MapPin, Film, User, Clapperboard, Globe, Star, Ticket } from "lucide-react"

export function MovieDetailClient({ movieId }: { movieId: number }) {
  const [movie, setMovie] = useState<any>(null)
  const [showtimes, setShowtimes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const hiddenItems = useHiddenItems()
  const showFavorites = !hiddenItems.includes("feature:favorites")
  const showSimilarMovies = !hiddenItems.includes("movie:similar-movies")

  useEffect(() => {
    fetchData()
  }, [movieId])

  const fetchData = useCallback(async () => {
    try {
      const [movieData, showtimesData] = await Promise.all([
        getMovieById(movieId),
        getShowtimesByMovie(movieId),
      ])

      if (!movieData) return notFound()

      setMovie(movieData)
      setShowtimes(showtimesData)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [movieId])

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="flex items-center justify-center h-96">
          <div className="text-muted-foreground">Đang tải...</div>
        </div>
      </div>
    )
  }

  if (!movie) return notFound()

  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return `${hours}h ${mins}m`
  }

  const genres: string[] = (movie.genre || "")
    .split(",")
    .map((g: string) => g.trim())
    .filter(Boolean)

  const backdropSrc = movie.banner_url || movie.poster_url || "/placeholder.svg"

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main>
        {/* Hero Section with cinematic backdrop */}
        <section className="relative overflow-hidden">
          {/* Blurred backdrop */}
          <div className="absolute inset-0 -z-10">
            <Image
              src={backdropSrc}
              alt=""
              fill
              className="object-cover scale-110 blur-2xl opacity-30"
              priority
            />
            <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-background/85 to-background" />
            <div className="absolute inset-0 bg-gradient-to-r from-background via-background/60 to-transparent" />
          </div>

          <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-20 relative">
            <Breadcrumb
              items={[
                { label: "Phim", href: "/movies", icon: <Film className="h-4 w-4" /> },
                { label: movie.title }
              ]}
            />

            <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-12 items-start mt-2">
              {/* Movie Poster */}
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className="relative aspect-[3/4] max-w-md mx-auto lg:mx-0 w-full"
              >
                <div className="absolute -inset-3 bg-primary/20 blur-2xl rounded-2xl" />
                <Image
                  src={movie.poster_url || "/placeholder.svg"}
                  alt={movie.title}
                  fill
                  className="object-cover rounded-xl shadow-2xl ring-1 ring-white/10 relative"
                  priority
                />
                <div className="absolute top-3 left-3 z-10">
                  <MovieStatusBadge status={movie.status || "NOW_SHOWING"} />
                </div>
                {movie.average_rating > 0 && (
                  <div className="absolute top-3 right-3 z-10 flex items-center gap-1 bg-black/70 backdrop-blur-sm rounded-full px-2.5 py-1 text-white">
                    <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                    <span className="text-xs font-semibold">{Number(movie.average_rating).toFixed(1)}</span>
                  </div>
                )}
              </motion.div>

              {/* Movie Details */}
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.1 }}
                className="space-y-6"
              >
                <div>
                  <h1 className="text-4xl lg:text-5xl font-bold text-foreground mb-4 text-balance tracking-tight">{movie.title}</h1>

                  <div className="flex flex-wrap items-center gap-4 text-muted-foreground mb-4">
                    <span className="flex items-center gap-2">
                      <Clock className="h-5 w-5" />
                      {formatDuration(movie.duration)}
                    </span>
                    <span className="flex items-center gap-2">
                      <Calendar className="h-5 w-5" />
                      {movie.original_year ?? new Date(movie.release_date).getFullYear()}
                    </span>
                    <Badge variant="secondary" className="font-semibold">{movie.rating}</Badge>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {genres.map((g) => (
                      <Badge key={g} variant="outline" className="border-primary/40 text-primary/90 bg-primary/5">
                        {g}
                      </Badge>
                    ))}
                  </div>
                </div>

                <p className="text-lg text-muted-foreground leading-relaxed">{movie.description}</p>

                {/* Tổng hợp điểm đánh giá — điểm trung bình, tổng lượt chấm và
                    phân bố theo sao. Đặt TRƯỚC ô chấm điểm của chính khách:
                    người ta muốn biết phim được đánh giá thế nào trước, rồi mới
                    quyết định có chấm hay không. */}
                <div className="space-y-3">
                  <h3 className="text-lg font-semibold text-foreground">Đánh giá từ người xem</h3>
                  <RatingSummary
                    movieId={movie.id}
                    initialAverage={Number(movie.average_rating) || 0}
                    initialCount={Number(movie.rating_count) || 0}
                  />
                </div>

                <div className="space-y-3">
                  <h3 className="text-lg font-semibold text-foreground">Đánh giá của bạn</h3>
                  <StarRating
                    movieId={movie.id}
                    initialRating={movie.average_rating || 0}
                    ratingCount={movie.rating_count || 0}
                    size="lg"
                    interactive={true}
                    showCount={true}
                  />
                </div>

                <div className="flex flex-wrap gap-3">
                  <Button size="lg" className="shadow-lg shadow-primary/20" asChild>
                    <Link href={`/movie/${movie.id}/showtimes`}>
                      <Ticket className="h-4 w-4 mr-2" /> Đặt vé
                    </Link>
                  </Button>
                  {movie.trailer_url && (
                    <TrailerButton
                      trailerUrl={movie.trailer_url}
                      movieTitle={movie.title}
                      variant="hero"
                      className=""
                    />
                  )}
                  {showFavorites && <FavoriteButton movieId={movie.id} />}
                </div>
              </motion.div>
            </div>

            {/* Movie Information Section */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.2 }}
              className="mt-12"
            >
              <Card className="border-border/60 bg-card/60 backdrop-blur-sm">
                <CardContent className="p-6">
                  <h3 className="text-xl font-semibold mb-6">Thông tin phim</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {[
                      { icon: User, label: "Director", value: movie.director },
                      { icon: Clapperboard, label: "Cast", value: movie.cast },
                      { icon: Film, label: "Studio", value: movie.studio },
                      { icon: Globe, label: "Language", value: movie.language || "Việt Nam" },
                    ].map(({ icon: Icon, label, value }) => (
                      <div key={label} className="space-y-2">
                        <div className="flex items-center gap-2">
                          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                            <Icon className="h-4 w-4 text-primary" />
                          </div>
                          <span className="text-sm text-muted-foreground">{label}</span>
                        </div>
                        <p className="font-medium pl-10">{value || "N/A"}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </div>
        </section>

        {/* Showtimes Preview */}
        <section className="py-12 border-t border-border">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-2xl font-bold text-foreground">Suất chiếu hôm nay</h2>
              <Button variant="outline" asChild>
                <Link href={`/movie/${movie.id}/showtimes`}>Xem tất cả suất chiếu</Link>
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {(() => {
                // Get today's date in YYYY-MM-DD format
                const today = new Date()
                const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

                // Filter showtimes for today only
                const todayShowtimes = showtimes.filter(showtime => {
                  const showDate = showtime.show_date.split('T')[0] // Get YYYY-MM-DD part
                  return showDate === todayStr
                })

                if (todayShowtimes.length === 0) {
                  return (
                    <div className="col-span-full text-center py-12">
                      <p className="text-muted-foreground text-lg mb-4">
                        Không có suất chiếu hôm nay
                      </p>
                      <Button variant="outline" asChild>
                        <Link href={`/movie/${movie.id}/showtimes`}>
                          Xem lịch chiếu tuần tới
                        </Link>
                      </Button>
                    </div>
                  )
                }

                // Suất đã qua bị đẩy xuống cuối danh sách
                const sorted = [...todayShowtimes].sort((a, b) => {
                  const [ah, am] = (a.show_time || '00:00').split(':').map(Number)
                  const [bh, bm] = (b.show_time || '00:00').split(':').map(Number)
                  const aAt = new Date(today.getFullYear(), today.getMonth(), today.getDate(), ah, am)
                  const bAt = new Date(today.getFullYear(), today.getMonth(), today.getDate(), bh, bm)
                  const aPast = aAt < today
                  const bPast = bAt < today
                  if (aPast !== bPast) return aPast ? 1 : -1
                  return aAt.getTime() - bAt.getTime()
                })

                return sorted.slice(0, 6).map((showtime) => {
                  // Kiểm tra suất chiếu đã qua chưa
                  const [sh, sm] = (showtime.show_time || '00:00').split(':').map(Number)
                  const showAt = new Date(today.getFullYear(), today.getMonth(), today.getDate(), sh, sm)
                  const isPast = showAt < today

                  return (
                    <Card key={showtime.id} className={`transition-colors ${isPast ? "opacity-50" : "hover:border-primary/50"}`}>
                      <CardContent className="p-6">
                        <div className="flex items-center gap-2 mb-3">
                          <MapPin className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium text-foreground">{showtime.cinema?.name || showtime.cinema_name}</span>
                        </div>
                        <p className="text-sm text-muted-foreground mb-1">{showtime.cinema?.location || showtime.location}</p>
                        {showtime.room_name && (
                          <p className="text-xs text-muted-foreground mb-3">
                            <Film className="h-3 w-3 inline mr-1" />
                            {showtime.room_name}
                            {showtime.room_type && (
                              <Badge variant="secondary" className="ml-2 text-xs">
                                {showtime.room_type === 'standard' ? 'Phòng thường' :
                                 showtime.room_type === 'vip' ? 'VIP' :
                                 showtime.room_type === 'imax' ? 'IMAX' : showtime.room_type}
                              </Badge>
                            )}
                          </p>
                        )}

                        <div className="flex items-center justify-between">
                          <div>
                            <p className={`text-lg font-semibold ${isPast ? "text-muted-foreground" : "text-foreground"}`}>{showtime.show_time.slice(0,5)}</p>
                            <p className="text-sm text-muted-foreground">{showtime.price.toLocaleString('vi-VN', { style: 'currency', currency: 'VND' })}</p>
                          </div>
                          {isPast ? (
                            <Button size="sm" disabled variant="outline" className="text-xs">Đã qua</Button>
                          ) : (
                            <Button size="sm" asChild>
                              <Link href={`/booking/${showtime.id}`}>Chọn ghế</Link>
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  )
                })
              })()}
            </div>
          </div>
        </section>

        {/* Reviews Section */}
        <section className="max-w-7xl mx-auto px-4 py-12 border-t border-border">
          <MovieReviews movieId={movieId} />
        </section>

        {/* Similar Movies Section */}
        {showSimilarMovies && (
          <section className="max-w-7xl mx-auto px-4 py-12 border-t border-border">
            <SimilarMovies genre={movie.genre} currentMovieId={movie.id} />
          </section>
        )}
      </main>
    </div>
  )
}
