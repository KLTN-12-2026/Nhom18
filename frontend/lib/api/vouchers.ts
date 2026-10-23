import { apiFetch } from "./client"

export interface VoucherValidateResponse {
  valid: boolean
  code?: string
  description?: string
  discount_amount?: number
  error?: string
}

export async function validateVoucher(code: string, orderAmount: number): Promise<VoucherValidateResponse> {
  try {
    return await apiFetch<VoucherValidateResponse>("/api/vouchers/validate", {
      method: "POST",
      body: JSON.stringify({ code, orderAmount }),
    })
  } catch (e: any) {
    return { valid: false, error: e?.message || "Không thể kiểm tra mã giảm giá" }
  }
}

export interface Voucher {
  id: number
  code: string
  description: string
  discount_type: "percent" | "fixed"
  discount_value: number
  max_discount_amount: number | null
  min_order_amount: number
  usage_limit: number | null
  used_count: number
  per_user_limit: number | null
  valid_from: string
  valid_until: string
  is_active: boolean | number
  is_birthday_voucher?: boolean | number
}

export async function getAdminVouchers(): Promise<Voucher[]> {
  const data = await apiFetch<{ vouchers: Voucher[] }>("/api/vouchers")
  return data.vouchers
}

export async function createAdminVoucher(payload: Partial<Voucher>): Promise<{ success: boolean; id: number }> {
  return apiFetch("/api/vouchers", { method: "POST", body: JSON.stringify(payload) })
}

export async function updateAdminVoucher(id: number, payload: Partial<Voucher>): Promise<{ success: boolean }> {
  return apiFetch(`/api/vouchers/${id}`, { method: "PUT", body: JSON.stringify(payload) })
}

export async function deleteAdminVoucher(id: number): Promise<{ success: boolean }> {
  return apiFetch(`/api/vouchers/${id}`, { method: "DELETE" })
}

export interface ActiveBirthdayVoucher {
  code: string
  description: string
  discount_type: "percent" | "fixed"
  discount_value: number
  max_discount_amount: number | null
  min_order_amount: number
  valid_until: string
  discount_text: string
}

/** Trả về mã ưu đãi sinh nhật ĐANG BẬT (nếu có) — dùng cho banner sinh nhật để
 * luôn hiển thị đúng nội dung admin đang cấu hình, không hardcode. */
export async function getActiveBirthdayVoucher(): Promise<ActiveBirthdayVoucher | null> {
  const data = await apiFetch<{ voucher: ActiveBirthdayVoucher | null }>("/api/vouchers/active-birthday")
  return data.voucher || null
}
