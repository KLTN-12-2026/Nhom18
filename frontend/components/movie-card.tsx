"use client";

import { memo } from "react"
import Image from "next/image"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { TrailerButton } from "@/components/trailer-button-lazy"
import { StarRating } from "@/components/star-rating"
import { MovieStatusBadge } from "@/components/movie-status-badge"
import { FavoriteButton } from "@/components/favorite-button"
import { Clock, Calendar } from "lucide-react"
import { useHiddenItems } from "@/lib/admin-menu-prefs"
import type { Movie } from "@/lib/api/types"

interface MovieCardProps {
  movie: Movie
  /** Gọi lại khi trạng thái yêu thích của phim này đổi — trang cha (vd trang
   * Yêu thích) dùng để tự cập nhật danh sách ngay, không cần tải lại trang. */
  onFavoriteToggle?: (movieId: number, isFavorite: boolean) => void
}

const MovieCard = memo(function MovieCard({ movie, onFavoriteToggle }: MovieCardProps) {
  const hiddenItems = useHiddenItems()
  const showFavorites = !hiddenItems.includes("feature:favorites")
  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return `${hours}h ${mins}m`
  }

  const formatReleaseDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('vi-VN', { 
      day: '2-digit', 
      month: '2-digit', 
      year: 'numeric' 
    })
  }

  const movieStatus = movie.status || "NOW_SHOWING"
  const isComingSoon = movieStatus === 'COMING_SOON' || movieStatus === 'UPCOMING'
  // Phim ENDED không còn suất chiếu nào — trước đây không được coi trong
  // isComingSoon nên nút "Đặt vé" vẫn hiện như bình thường và cho bấm vào,
  // dẫn tới trang đặt vé không suất chiếu nào, gây nhầm lẫn cho người dùng.
  const isEnded = movieStatus === 'ENDED'
  const bookingDisabled = isComingSoon || isEnded

  return (
    <div className="transition-transform duration-200 hover:-translate-y-2">
      <Card className="group overflow-hidden bg-card border-border hover:border-primary/50 transition-all duration-300 hover:shadow-lg hover:shadow-primary/10">
      <div className="relative aspect-[3/4] overflow-hidden">
        <Image
          src={movie.poster_url || "/placeholder.svg"}
          alt={movie.title}
          fill
          className="object-cover transition-transform duration-300 group-hover:scale-105"
          loading="lazy"
          quality={75}
          sizes="(max-width: 640px) 100vw, (max-width: 768px) 50vw, (max-width: 1024px) 33vw, (max-width: 1280px) 25vw, 16vw"
          placeholder="blur"
          blurDataURL="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mN8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=="
        />
        {/* Status Badge - Top Left - Only show if status is set */}
        {movie.status && (
          <div className="absolute top-2 left-2 z-10">
            <MovieStatusBadge status={movieStatus as any} />
          </div>
        )}

        {/* Favorite Button - Top Right */}
        {showFavorites && (
          <div className="absolute top-2 right-2 z-10">
            <FavoriteButton
              movieId={movie.id}
              variant="icon"
              className="bg-black/40 hover:bg-black/60 text-white hover:text-red-400 rounded-full h-8 w-8"
              onToggle={(isFavorite) => onFavoriteToggle?.(movie.id, isFavorite)}
            />
          </div>
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        <div className="absolute bottom-4 left-4 right-4 space-y-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          <Button asChild className="w-full" disabled={bookingDisabled}>
            <Link href={bookingDisabled ? '#' : `/movie/${movie.id}`}>
              {isEnded ? 'Đã Ngừng Chiếu' : isComingSoon ? 'Sắp Mở Bán' : 'Đặt vé'}
            </Link>
          </Button>
          {movie.trailer_url && (
            <TrailerButton 
              trailerUrl={movie.trailer_url}
              movieTitle={movie.title}
              className="w-full"
            />
          )}
        </div>
      </div>

      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-2">
          <h3 className="font-semibold text-lg text-foreground line-clamp-1 group-hover:text-primary transition-colors">
            {movie.title}
          </h3>
          <Badge variant="secondary" className="ml-2 shrink-0">
            {movie.rating}
          </Badge>
        </div>

        <div className="flex items-center gap-4 text-sm text-muted-foreground mb-3">
          <span className="flex items-center gap-1">
            <Clock className="h-4 w-4" />
            {formatDuration(movie.duration)}
          </span>
          <span>{movie.genre}</span>
        </div>

        {/* Release Date - Only show for Coming Soon movies */}
        {isComingSoon && movie.release_date && (
          <div className="flex items-center gap-1 text-sm mb-3">
            <Calendar className="h-4 w-4 text-amber-500" />
            <span className="text-muted-foreground">Khởi chiếu: </span>
            <span className="font-medium text-foreground">
              {formatReleaseDate(movie.release_date)}
            </span>
          </div>
        )}

        <div className="mb-3">
          <StarRating
            movieId={movie.id}
            initialRating={movie.average_rating || 0}
            ratingCount={movie.rating_count || 0}
            size="sm"
            showCount={true}
          />
        </div>

        <p className="text-sm text-muted-foreground line-clamp-2 mb-4">{movie.description}</p>

        <div className="flex items-center justify-end">
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/movie/${movie.id}`} prefetch={true}>Xem chi tiết</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
    </div>
  )
})

export { MovieCard }
