import { apiFetch } from "./client"

export interface Combo {
  id: number
  name: string
  description: string | null
  category: "popcorn" | "drink" | "combo" | "snack"
  price: number
  image_url: string | null
  is_available: boolean
  /** Chỉ có khi hỏi theo rạp — số suất rạp đó còn, dùng để chặn chọn quá hàng */
  ton_kho?: number
}

/**
 * @param cinemaId truyền vào thì CHỈ trả món rạp đó còn hàng (kho tính riêng
 *   từng chi nhánh — xem bảng combo_inventory). Bỏ trống = danh mục cả chuỗi.
 */
export async function getCombos(cinemaId?: number | string): Promise<Combo[]> {
  const duongDan = cinemaId ? `/api/combos?cinemaId=${cinemaId}` : "/api/combos"
  const data = await apiFetch<{ combos: Combo[] }>(duongDan, { auth: false })
  return Array.isArray(data.combos) ? data.combos : []
}
