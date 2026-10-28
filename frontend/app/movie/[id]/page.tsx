import type { Metadata } from "next"
import { getMovieById } from "@/lib/api/movies"
import { MovieDetailClient } from "./movie-detail-client"

interface MoviePageProps {
  params: { id: string }
}

export async function generateMetadata({ params }: MoviePageProps): Promise<Metadata> {
  const movie = await getMovieById(params.id)
  if (!movie) {
    return { title: "Không tìm thấy phim | CinemaGold" }
  }

  const description = movie.description
    ? movie.description.slice(0, 160)
    : `Đặt vé xem ${movie.title} tại CinemaGold.`

  return {
    title: `${movie.title} | CinemaGold`,
    description,
    openGraph: {
      title: movie.title,
      description,
      images: movie.poster_url ? [{ url: movie.poster_url }] : undefined,
      type: "video.movie",
    },
    twitter: {
      card: "summary_large_image",
      title: movie.title,
      description,
      images: movie.poster_url ? [movie.poster_url] : undefined,
    },
  }
}

export default function MoviePage({ params }: MoviePageProps) {
  const movieId = Number.parseInt(params.id)
  return <MovieDetailClient movieId={movieId} />
}
