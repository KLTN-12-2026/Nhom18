// Phải khớp với backend/config/ticketPricing.config.js — chỉ dùng để XEM
// TRƯỚC giá trên UI, giá thật luôn do backend tính lại khi tạo vé.
export type TicketType = "adult" | "student" | "child" | "senior"

export const TICKET_TYPE_MODIFIERS: Record<TicketType, number> = {
  adult: 1.0,
  student: 0.85,
  child: 0.6,
  senior: 0.7,
}

// Chỉ dùng làm PHƯƠNG ÁN DỰ PHÒNG khi API chưa trả về danh sách loại vé —
// nhãn thật hiển thị trên giao diện lấy từ server (showtime.ticket_types) để
// không phải sửa 2 nơi mỗi lần đổi tên loại vé.
export const TICKET_TYPE_LABELS: Record<TicketType, string> = {
  adult: "Người lớn",
  student: "Học sinh - Sinh viên",
  child: "Trẻ em",
  senior: "Người cao tuổi",
}

export const TICKET_TYPE_OPTIONS: TicketType[] = ["adult", "student", "child", "senior"]

export function roundToThousand(n: number): number {
  return Math.round(n / 1000) * 1000
}
