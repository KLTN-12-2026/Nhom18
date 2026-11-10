import { apiFetch } from "./client"

export interface CreatePaymentPayload {
  showtime_id: number
  seats: string[]
  combo_items: Array<{ combo_id: number; quantity: number }>
  payment_method: "vnpay" | "momo" | "mock"
  seat_types?: Record<string, string>
  voucher_code?: string
}

export interface PaymentResponse {
  success: boolean
  ticket_id?: number
  payment_url?: string
  qr_code_url?: string
  payment_method?: string
  message?: string
  error?: string
  reason?: string
  details?: string
}

export async function createPayment(payload: CreatePaymentPayload): Promise<PaymentResponse> {
  return apiFetch("/api/payment/create", { method: "POST", body: JSON.stringify(payload) })
}

export async function getPaymentStatus(ticketId: number | string): Promise<{
  ticket_id: number | string
  payment_status: string
  booking_status: string
  paid_at: string | null
  transaction: any | null
}> {
  return apiFetch(`/api/payment/status/${ticketId}`)
}

/**
 * Xác nhận thanh toán VNPay bằng bộ tham số trên Return URL.
 *
 * Sau khi trả tiền, VNPay chuyển trình duyệt về kèm đầy đủ tham số vnp_* CÓ
 * CHỮ KÝ. Máy chủ kiểm tra chữ ký rồi mới xác nhận vé, nên an toàn ngang IPN.
 *
 * Cần đường này vì IPN (VNPay gọi thẳng vào máy chủ) chỉ chạy được khi máy chủ
 * có địa chỉ công khai. Chạy ở máy cá nhân qua đường hầm thì đường hầm chết là
 * IPN không bao giờ tới, khách trả tiền xong mà vé vẫn treo.
 */
export async function confirmVNPayReturn(params: Record<string, string>): Promise<{
  rspCode?: string
  message?: string
  ticketId?: number | null
  daThanhToan?: boolean
  error?: string
}> {
  return apiFetch("/api/payment/vnpay/confirm-return", {
    method: "POST",
    body: JSON.stringify(params),
  })
}
