import { apiFetch } from "../client"

export interface RecentBooking {
  reference: string
  status: string
  payment_status: string
  amount: number
  created_at: string
  seats: string
  movie: string
  cinema: string
  show_date: string
  show_time: string
}

export interface DashboardStats {
  users: { total: number; today: number; monthChange: string }
  movies: { total: number; monthNew: number }
  tickets: { today: number; change: string }
  revenue: { today: number; change: string }
  /** Tổng thật toàn hệ thống (lọc theo rạp nếu có) — không suy ra từ recentBookings. */
  pendingCount: number
  pendingRevenue: number
  cancelledRecentCount: number
  recentBookings: RecentBooking[]
  /** Bắp nước: doanh thu 30 ngày, món bán chạy, cảnh báo tồn kho theo rạp */
  combo?: {
    revenue30d: number
    orders30d: number
    topItems: { combo_id: number; name: string; category: string; so_suat: number; doanh_thu: number }[]
    outOfStock: number
    lowStock: number
    alerts: { cinema_name: string; combo_name: string; ton_kho: number; tinh_trang: string }[]
  }
  /** Yêu cầu chi nhánh gửi lên đang chờ xử lý */
  branchRequests?: { cho_xu_ly: number; khan: number }
}

export async function getDashboardStats(cinemaId?: string | null): Promise<DashboardStats> {
  const qs = cinemaId && cinemaId !== "all" ? `?cinemaId=${cinemaId}` : ""
  const data = await apiFetch<{ stats: DashboardStats }>(`/api/admin/dashboard${qs}`, { cache: "no-store" })
  return data.stats
}
