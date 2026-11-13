import { apiFetch } from "../client"

export interface GenerationPreviewMovie {
  id: number
  title: string
  status: string
  popularity_score: number
  popularity_tier: string
  scoring_source: string
  ticket_count: number
  average_rating: number
  favorite_count: number
  weeks_since_release: number
  rooms_used: string[]
  rooms_used_count: number
  days_covered: number
  estimated_showtimes_per_day: number
  estimated_total_showtimes: number
  revenue_potential: number
}

export interface GenerationScheduleItem {
  // Chỉ có giá trị khi đây là lịch THẬT vừa tạo (generate), không có ở lịch
  // mô phỏng (preview/dry-run) vì chưa ghi DB — dùng để cho phép xoá riêng
  // từng suất chiếu ngay trên lưới lịch.
  id?: number
  movie_title: string
  cinema_name: string
  room_name: string
  room_type: string
  show_date: string
  show_time: string
  price: number
}

export interface GenerationPreviewData {
  week_start: string
  movies_count: number
  rooms_count: number
  estimated_total_showtimes: number
  skipped_estimate: number
  // Số suất chiếu ĐÃ CÓ SẴN trong tuần này trước khi chạy preview — nguyên
  // nhân phổ biến nhất khiến skipped_estimate cao (phòng/giờ đã bị suất cũ
  // chiếm), không phải lỗi thuật toán.
  existing_showtimes_in_week: number
  movies: GenerationPreviewMovie[]
  schedule: GenerationScheduleItem[]
}

export interface GenerationResult {
  success: boolean
  generated: number
  skipped: number
  errors: number
  duration: string
  details: {
    moviesProcessed: number
    roomsAvailable: number
    dateRange: { from: string; to: string }
    existingShowtimesInWeek: number
  }
  // Danh sách suất chiếu THẬT vừa được ghi vào DB (không phải mô phỏng) —
  // dùng để hiển thị "Xem chi tiết lịch chiếu đã tạo" ngay sau khi generate,
  // thay vì chỉ có 4 con số tổng quan không tra cứu lại được cụ thể.
  movies: GenerationPreviewMovie[]
  schedule: GenerationScheduleItem[]
}

export interface GenerationStats {
  current_week: {
    total_showtimes: number
    unique_movies: number
    unique_cinemas: number
    first_date: string
    last_date: string
  }
  weekly_history: Array<{
    week_key: number
    week_start: string
    week_end: string
    showtime_count: number
    movie_count: number
    cinema_count: number
    revenue: number
  }>
  top_movies: Array<{
    title: string
    showtime_count: number
    status: string
    popularity_score: number
    total_bookings: number
  }>
}

export async function getGenerationStats(): Promise<GenerationStats> {
  const data = await apiFetch<{ data: GenerationStats }>("/api/admin/showtimes/stats")
  return data.data
}

export async function previewGeneration(weekStart: string): Promise<{ success: boolean; data?: GenerationPreviewData; message?: string }> {
  return apiFetch("/api/admin/showtimes/preview", { method: "POST", body: JSON.stringify({ weekStart }) })
}

export async function generateWeeklyShowtimes(weekStart: string): Promise<{ success: boolean; data?: GenerationResult; message?: string }> {
  return apiFetch("/api/admin/showtimes/generate", { method: "POST", body: JSON.stringify({ weekStart }) })
}

export async function deleteWeekShowtimes(weekStart: string): Promise<{ success: boolean; deleted_count?: number; message?: string }> {
  return apiFetch(`/api/admin/showtimes/week/${weekStart}`, { method: "DELETE" })
}

export interface TrendingMovie {
  /** cửa sổ so sánh đã dùng cho con số này (1/2/3 ngày) */
  window_days?: number
  /** ngưỡng vé tối thiểu tương ứng cửa sổ đó */
  min_tickets_required?: number
  id: number
  title: string
  release_age_days: number
  recent_tickets: number
  prior_tickets: number
  momentum: number
  current_week_showtimes: number
  /** số suất trong cửa sổ đã bán ≥ 85% ghế (tính cả suất sắp chiếu) */
  near_full_showtimes?: number
  /** số suất đã chiếu trong cửa sổ — mẫu của avg_occupancy */
  finished_showtimes?: number
  /** tỉ lệ lấp đầy trung bình các suất đã chiếu, 0–1 */
  avg_occupancy?: number
  /** tín hiệu nào kích hoạt gợi ý */
  trend_reasons?: Array<"momentum" | "near_full" | "high_occupancy">
  is_trending: boolean
  suggested_additional_showtimes: number
}

/** @param windowDays cửa sổ so sánh: 1, 2 hoặc 3 ngày (mặc định 3) */
export async function getTrendingMovies(windowDays: 1 | 2 | 3 = 3): Promise<TrendingMovie[]> {
  const data = await apiFetch<{ success: boolean; data: TrendingMovie[] }>(
    `/api/admin/showtimes/trending?days=${windowDays}`,
  )
  return data.data
}

export interface BoostScheduleItem {
  /** id suất chiếu (null khi xem trước một suất MỚI chưa ghi vào CSDL) */
  id: number | null
  /** new = chèn vào giờ trống; replaced = thay suất chưa bán vé của phim khác */
  kind: "new" | "replaced"
  show_date: string
  show_time: string
  end_time: string
  cinema_name: string
  room_name: string
  room_type: string
  total_seats: number
  price: number
  replaced_movie_title: string | null
  replaced_movie_remaining_that_day: number | null
  replaced_movie_recent_tickets: number | null
}

export interface BoostResult {
  success: boolean
  preview?: boolean
  movie?: string
  requested?: number
  inserted?: number
  insertedNew?: number
  replaced?: number
  notInserted?: number
  schedule?: BoostScheduleItem[]
  message?: string
}

/** @param preview true = chỉ lấy kế hoạch để xem trước, không ghi gì */
export async function boostMovieShowtimes(movieId: number, additionalShowtimes: number, preview = false): Promise<BoostResult> {
  return apiFetch(`/api/admin/showtimes/boost/${movieId}`, {
    method: "POST",
    body: JSON.stringify({ additionalShowtimes, preview }),
  })
}
