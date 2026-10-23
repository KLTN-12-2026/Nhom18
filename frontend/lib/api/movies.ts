import { apiFetch } from "./client"
import type { Movie } from "@/lib/api/types"

export async function getMovies(): Promise<Movie[]> {
  const data = await apiFetch<{ movies: Movie[] }>("/api/movies", { auth: false, ttl: 180 })
  return Array.isArray(data.movies) ? data.movies : []
}

/** Returns null instead of throwing on 404 so callers can render notFound(). */
export async function getMovieById(id: number | string): Promise<Movie | null> {
  try {
    const data = await apiFetch<{ movie: Movie }>(`/api/movies/${id}`, { auth: false, ttl: 300 })
    return data.movie ?? null
  } catch {
    return null
  }
}

/**
 * There is no /api/movies/recommended route on the backend (never implemented —
 * confirmed no matching controller/route). The old frontend code called it anyway,
 * which always 400'd ("ID phim không hợp lệ", since it fell through to the
 * /api/movies/:id route) and silently fell back to this same sort. Skipping the
 * dead call outright removes that always-failing request.
 */
export async function getRecommendedMovies(): Promise<Movie[]> {
  const movies = await getMovies()
  return [...movies]
    .sort((a, b) => Number(b.average_rating || 0) - Number(a.average_rating || 0))
    .slice(0, 6)
}
