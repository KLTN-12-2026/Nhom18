import { apiFetch } from "./client"

export interface SeatHold {
  /** Mốc hết hạn TUYỆT ĐỐI (ISO) do server cấp — đồng hồ đếm ngược bám theo mốc này. */
  expiresAt: string
  holdMinutes: number
  seats: string[]
}

/**
 * Giữ ghế thật sự trong lúc khách điền thông tin thanh toán.
 *
 * Trước đây giao diện hứa "ghế được giữ 15 phút" ngay từ bước chọn ghế, nhưng
 * KHÔNG có chỗ nào gọi API này — ghế chỉ bị khoá vào đúng lúc bấm "Thanh toán".
 * Nghĩa là suốt lúc khách chọn ghế và điền thông tin, người khác vẫn đặt được
 * đúng ghế đó, và cả hai chỉ biết khi một bên thanh toán trước.
 *
 * Backend yêu cầu định danh (đăng nhập hoặc x-session-id) để biết ai đang giữ.
 */
export async function holdSeats(showtimeId: number, seats: string[]): Promise<SeatHold> {
  const data = await apiFetch<{ expiresAt: string; holdMinutes: number; seats: string[] }>(
    "/api/seat-locks/lock",
    { method: "POST", body: JSON.stringify({ showtime_id: showtimeId, seats }) },
  )
  return { expiresAt: data.expiresAt, holdMinutes: data.holdMinutes, seats: data.seats }
}

/**
 * Nhả ghế khi khách chủ động rời bước thanh toán — trả ghế lại cho người khác
 * ngay thay vì chờ hết 15 phút.
 */
export async function releaseSeats(showtimeId: number, seats: string[]): Promise<void> {
  await apiFetch("/api/seat-locks/unlock", {
    method: "POST",
    body: JSON.stringify({ showtime_id: showtimeId, seats }),
  }).catch(() => {
    // Nhả ghế là thao tác "cố gắng hết sức": nếu lỗi thì khoá vẫn tự hết hạn
    // sau 15 phút, không nên chặn điều hướng của người dùng vì việc này.
  })
}
