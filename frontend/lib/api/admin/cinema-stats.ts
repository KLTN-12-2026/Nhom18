import { apiFetch } from "../client"

export interface CinemaSummary {
  cinema_id: number
  cinema_name: string
  location: string
  total_rooms: number
  total_capacity: number
  total_showtimes: number
  tickets_sold: number
  total_revenue: number
  movies_showing: number
  occupancy_rate: number | null
}

export interface CinemaTopMoviesEntry {
  cinema_id: number
  cinema_name: string
  top_movies: Array<{
    movie_id: number
    title: string
    poster_url: string | null
    tickets_sold: number
    revenue: number
  }>
}

export async function getCinemasSummary(daysBack = 30): Promise<CinemaSummary[]> {
  // cinema-stats.js routes now require verifyToken+requireStaff (bảo mật dữ
  // liệu doanh thu nội bộ) — trước đây gọi với auth:false (khi route còn công
  // khai), giờ route đã yêu cầu token nhưng request KHÔNG gửi kèm thì luôn bị
  // 401, khiến toàn bộ widget doanh thu/vé/lấp đầy ở dashboard admin âm thầm
  // hiện rỗng/0 mà không báo lỗi gì (apiFetch throw, component chỉ console.error).
  const data = await apiFetch<{ success: boolean; data: CinemaSummary[] }>(
    `/api/cinema-stats/all-cinemas/summary?daysBack=${daysBack}`,
  )
  return data.success && Array.isArray(data.data) ? data.data : []
}

export async function getCinemasTopMovies(topN = 3, daysBack = 30): Promise<CinemaTopMoviesEntry[]> {
  const data = await apiFetch<{ success: boolean; data: CinemaTopMoviesEntry[] }>(
    `/api/cinema-stats/all-cinemas/top-movies?topN=${topN}&daysBack=${daysBack}`,
  )
  return data.success && Array.isArray(data.data) ? data.data : []
}
