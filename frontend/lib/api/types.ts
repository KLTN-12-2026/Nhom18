export interface Movie {
  /** Vị trí trong banner trang chủ (1 = đầu tiên); null = không nổi bật. Nguồn: movies.featured_order */
  featured_order?: number | null
  id: number
  title: string
  genre: string
  rating: string
  duration: number
  poster_url: string
  trailer_url?: string
  description: string
  /** Ngày khởi chiếu TẠI RẠP — điều khiển trạng thái phim và lịch chiếu, không phải năm sản xuất */
  release_date: string
  /** Năm phát hành gốc để hiển thị; null = dùng năm của release_date. Nguồn: movies.original_year */
  original_year?: number | null
  status?: "NOW_SHOWING" | "COMING_SOON" | "UPCOMING" | "ENDED"
  popularity_score?: number
  total_bookings?: number
  director?: string
  cast?: string
  studio?: string
  language?: string
  average_rating?: number
  rating_count?: number
}

export interface Cinema {
  id: number
  name: string
  location: string
}

export interface Showtime {
  id: number
  movie_id: number
  cinema_id: number
  show_date: string
  show_time: string
  price: number
  total_seats: number
  available_seats: number
  room_name?: string
  /** standard | vip | imax | 4dx — quyết định phụ phí giá vé theo loại phòng. */
  room_type?: string
  /** Ghế NGƯỜI KHÁC đang giữ — hiện đỏ, không chọn được. */
  locked_seats?: string[]
  /** Ghế CHÍNH BẠN đang giữ — hiện như đã chọn, vẫn bỏ chọn được. */
  my_locked_seats?: string[]
  movie?: Movie
  cinema?: Cinema
}

export interface User {
  id: number
  email: string
  first_name: string
  last_name: string
  phone?: string
  role: "user" | "cinema_manager" | "admin"
  is_admin: boolean
  is_cinema_manager: boolean
  can_access_admin: boolean
  can_manage_users: boolean
}

export interface Booking {
  id: number
  user_id: number
  showtime_id: number
  seats: string[]
  total_amount: number
  booking_status: string
  payment_status: string
  booking_reference: string
  created_at: string
  showtime?: Showtime
}

export type SeatTier = "standard" | "vip" | "premium"

export interface Seat {
  id: string
  row: string
  number: number
  status: "available" | "occupied" | "selected" | "selecting"
  price: number
  /** Hạng ghế do SERVER quyết định (xem seat_layout của API suất chiếu). */
  tier?: SeatTier
}

/** Sơ đồ ghế + bảng giá từng hạng, do backend trả về trong /api/showtimes/:id. */
export interface SeatLayout {
  rows: string[]
  seatsPerRow: number
  rowTiers: Record<string, SeatTier>
  tierPricing: Record<SeatTier, { label: string; description: string; price: number }>
}

/** Loại vé hợp lệ cho đúng bộ phim đang đặt (đã lọc theo giới hạn độ tuổi). */
export interface TicketTypeOption {
  key: "adult" | "student" | "child" | "senior"
  label: string
  priceModifier: number
  allowed: boolean
  reason?: string
}

export interface TicketTypesInfo {
  minAge: number
  types: TicketTypeOption[]
}
