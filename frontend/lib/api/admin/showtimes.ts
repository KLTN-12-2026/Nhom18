import { apiFetch } from "../client"

export interface AdminShowtime {
  id: number
  movie_id: number
  cinema_id: number
  movie_title: string
  cinema_name: string
  show_date: string
  show_time: string
  tickets_sold: number
  total_seats: number
}

/**
 * Mặc định máy chủ chỉ trả suất từ 7 ngày trước trở đi (~240KB thay vì ~2MB).
 * Truyền `{ all: true }` khi người dùng bật "Hiện suất đã qua" để tra cứu lịch sử.
 */
export async function listShowtimesAdmin(opts: { all?: boolean } = {}): Promise<AdminShowtime[]> {
  const data = await apiFetch<{ showtimes: AdminShowtime[] }>(
    `/api/admin/showtimes${opts.all ? "?all=1" : ""}`,
  )
  return Array.isArray(data.showtimes) ? data.showtimes : []
}

export interface CreateShowtimeInput {
  movie_id: number
  cinema_id: number
  show_date: string
  show_time: string
  price: number
  total_seats: number
}

export async function createShowtimeAdmin(input: CreateShowtimeInput): Promise<{ id: number }> {
  return apiFetch("/api/admin/showtimes", { method: "POST", body: JSON.stringify(input) })
}

/**
 * If the showtime already has tickets sold, the backend only allows
 * updating `price` — date/time/seat changes are rejected to avoid
 * invalidating tickets customers already hold.
 */
export async function updateShowtimeAdmin(
  id: number | string,
  input: Partial<{ show_date: string; show_time: string; price: number; total_seats: number }>,
): Promise<void> {
  await apiFetch(`/api/admin/showtimes/${id}`, { method: "PUT", body: JSON.stringify(input) })
}

export async function deleteShowtimeAdmin(id: number | string): Promise<void> {
  await apiFetch(`/api/admin/showtimes/${id}`, { method: "DELETE" })
}

// ── Báo sự cố suất chiếu ──────────────────────────────────────────────
export type IncidentType = "cancelled" | "notice"
export type IncidentReason = "mat_dien" | "may_chieu" | "dieu_hoa" | "thoi_tiet" | "an_toan" | "khac"

export interface IncidentInput {
  type: IncidentType
  reason: IncidentReason
  message?: string
  delayMinutes?: number
  /** true = chỉ đếm số vé/khách bị ảnh hưởng, không làm gì */
  preview?: boolean
}

export interface IncidentResult {
  preview: boolean
  incident_id?: number
  showtime: { id: number; movie_title: string; cinema_name: string; room_name: string | null; show_date: string; show_time: string }
  affected_tickets: number
  paid_tickets: number
  affected_customers: number
  refund_total: number
  emails_sent?: number
  emails_failed?: number
}

export interface IncidentLog {
  id: number
  showtime_id: number
  incident_type: IncidentType
  reason: IncidentReason
  reason_label: string
  message: string | null
  delay_minutes: number | null
  affected_tickets: number
  emails_sent: number
  emails_failed: number
  created_at: string
  movie_title: string
  cinema_name: string
  room_name: string | null
  show_date: string
  show_time: string
  reported_by_name: string | null
}

export async function reportShowtimeIncident(id: number, input: IncidentInput): Promise<IncidentResult> {
  const res = await apiFetch<{ success: boolean; data: IncidentResult }>(`/api/admin/showtimes/${id}/incident`, {
    method: "POST",
    body: JSON.stringify(input),
  })
  return res.data
}

export async function listShowtimeIncidents(): Promise<IncidentLog[]> {
  const res = await apiFetch<{ success: boolean; data: IncidentLog[] }>("/api/admin/incidents")
  return res.data || []
}

// ── Sự cố DIỆN RỘNG (mất điện cả rạp, sửa chữa nhiều phòng) ───────────
export interface BulkIncidentInput {
  cinemaId?: number | string
  /** Bỏ trống = mọi phòng của rạp */
  roomIds?: number[]
  /** 'YYYY-MM-DD HH:mm' */
  tuLuc: string
  denLuc: string
  type: IncidentType
  reason: IncidentReason
  message?: string
  delayMinutes?: number
  preview?: boolean
}

export interface BulkIncidentResult {
  preview: boolean
  showtimes: {
    id: number
    movie_title: string
    room_name: string | null
    show_date: string
    show_time: string
    affected_tickets: number
    refund: number
  }[]
  total_showtimes: number
  total_tickets: number
  refund_total: number
  processed?: number
  failed?: { id: number; movie_title: string; show_time: string; error: string }[]
  emails_sent?: number
  emails_failed?: number
}

export async function reportBulkIncident(input: BulkIncidentInput): Promise<BulkIncidentResult> {
  const res = await apiFetch<{ success: boolean; data: BulkIncidentResult }>("/api/admin/incidents/bulk", {
    method: "POST",
    body: JSON.stringify(input),
  })
  return res.data
}
