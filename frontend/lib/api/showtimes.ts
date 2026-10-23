import { apiFetch } from "./client"
import type { Showtime } from "@/lib/api/types"

/** Single showtime with nested movie/cinema detail, used by the booking flow. */
export async function getShowtimeById(showtimeId: number | string): Promise<any> {
  // GỬI KÈM token (auth mặc định = true). Route dùng optionalAuth nên khách
  // chưa đăng nhập vẫn xem được, nhưng khi có token thì máy chủ mới biết khoá
  // ghế nào là của CHÍNH người này (my_locked_seats) để không tô đỏ nhầm.
  const data = await apiFetch<{ showtime: any }>(`/api/showtimes/${showtimeId}`, {
    cache: "no-store",
  })
  return data.showtime ?? null
}

export async function getShowtimesByMovie(movieId: number | string): Promise<Showtime[]> {
  const data = await apiFetch<{ showtimes: Showtime[] }>(`/api/movies/${movieId}/showtimes`, {
    auth: false,
    ttl: 60,
  })
  return Array.isArray(data.showtimes) ? data.showtimes : []
}

// The today/live endpoint returns a flat, denormalized shape (movie_title,
// poster_url, cinema_name... at the top level) — distinct from the joined
// Showtime type used elsewhere, so it's intentionally untyped here.
/** Generic showtime listing by date, optionally scoped to a cinema (used by admin dashboard widgets). */
export async function getShowtimesByDate(date: string, cinemaId?: string | null): Promise<any[]> {
  const qs = cinemaId && cinemaId !== "all" ? `&cinemaId=${cinemaId}` : ""
  const data = await apiFetch<{ showtimes: any[] }>(`/api/showtimes?date=${date}${qs}`, { cache: "no-store" })
  return Array.isArray(data.showtimes) ? data.showtimes : []
}

export async function getTodayLiveShowtimes(limit = 8): Promise<any[]> {
  const data = await apiFetch<{ showtimes: any[] }>(`/api/showtimes/today/live?limit=${limit}`, {
    auth: false,
    cache: "no-store",
  })
  return Array.isArray(data.showtimes) ? data.showtimes : []
}
