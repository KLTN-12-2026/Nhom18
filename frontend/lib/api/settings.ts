import { apiFetch } from "./client"

export interface PublicContact {
  site_name: string
  contact_email: string | null
  /** null = admin chưa nhập số tổng đài thật (còn là số giữ chỗ) → không hiển thị */
  support_phone: string | null
  /** Giới hạn ghế mỗi lượt đặt — do admin đặt, máy chủ cưỡng chế bằng chính số này. */
  max_seats_per_booking: number
}

/** Thông tin liên hệ từ trang Cài đặt của admin — dùng chung cho mọi trang. */
export async function getPublicContact(): Promise<PublicContact> {
  return apiFetch<PublicContact>("/api/settings/public", { auth: false, ttl: 300 })
}

/** Đổi "0905 123 456" thành "0905123456" cho liên kết tel: */
export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, "")}`
}
