import { apiFetch } from "../client"

/**
 * Kho bắp nước theo TỪNG RẠP và yêu cầu chi nhánh gửi admin.
 *
 * Danh mục món dùng chung cả chuỗi (`/api/combos`), còn tồn kho tách riêng
 * từng chi nhánh — xem bảng `combo_inventory`, migration 46.
 */

export interface ComboStock {
  id: number
  name: string
  description: string | null
  price: number
  category: "popcorn" | "drink" | "combo" | "snack"
  image_url: string | null
  /** Món có đang được bán trên toàn chuỗi không (admin tắt ở danh mục) */
  ban_toan_chuoi: 0 | 1
  /** null = món chung cả chuỗi; có giá trị = món riêng của rạp đó */
  rap_rieng: number | null
  ton_kho: number
  nguong_canh_bao: number
  /** Quản lý chi nhánh tự tắt món tại rạp mình (máy hỏng, ngừng bán) */
  tam_ngung: 0 | 1
  het_hang: 0 | 1
  sap_het: 0 | 1
  cap_nhat_luc: string | null
}

export type LoaiYeuCau = "bo_sung_hang" | "bao_het_hang" | "su_co" | "khac"
export type MucDo = "thap" | "binh_thuong" | "khan"
export type TrangThaiYeuCau = "moi" | "da_duyet" | "tu_choi" | "da_xem"

export interface BranchRequest {
  id: number
  cinema_id: number
  cinema_name: string
  loai: LoaiYeuCau
  loai_nhan: string
  combo_id: number | null
  combo_name: string | null
  so_luong: number | null
  tieu_de: string
  noi_dung: string | null
  muc_do: MucDo
  muc_do_nhan: string
  trang_thai: TrangThaiYeuCau
  phan_hoi: string | null
  nguoi_gui_ten: string | null
  nguoi_xu_ly_ten: string | null
  created_at: string
  xu_ly_luc: string | null
}

export async function getComboInventory(cinemaId?: number | string): Promise<ComboStock[]> {
  const q = cinemaId ? `?cinemaId=${cinemaId}` : ""
  const res = await apiFetch<{ success: boolean; data: ComboStock[] }>(`/api/admin/combo-inventory${q}`)
  return res.data || []
}

export async function updateComboStock(
  comboId: number,
  input: { tonKho?: number; nguongCanhBao?: number; tamNgung?: boolean; cinemaId?: number | string },
): Promise<ComboStock[]> {
  const res = await apiFetch<{ success: boolean; data: ComboStock[] }>(`/api/admin/combo-inventory/${comboId}`, {
    method: "PUT",
    body: JSON.stringify(input),
  })
  return res.data || []
}

export async function getBranchRequests(params: { status?: TrangThaiYeuCau; cinemaId?: number | string } = {}): Promise<BranchRequest[]> {
  const q = new URLSearchParams()
  if (params.status) q.set("status", params.status)
  if (params.cinemaId) q.set("cinemaId", String(params.cinemaId))
  const res = await apiFetch<{ success: boolean; data: BranchRequest[] }>(
    `/api/admin/requests${q.toString() ? `?${q}` : ""}`,
  )
  return res.data || []
}

export async function createBranchRequest(input: {
  loai: LoaiYeuCau
  tieuDe: string
  noiDung?: string
  comboId?: number
  soLuong?: number
  mucDo?: MucDo
  cinemaId?: number | string
}): Promise<BranchRequest> {
  const res = await apiFetch<{ success: boolean; data: BranchRequest }>("/api/admin/requests", {
    method: "POST",
    body: JSON.stringify(input),
  })
  return res.data
}

/** Chỉ admin — duyệt yêu cầu bổ sung hàng sẽ CỘNG THẲNG vào kho của rạp đó. */
export async function resolveBranchRequest(
  id: number,
  input: { trangThai: "da_duyet" | "tu_choi" | "da_xem"; phanHoi?: string },
): Promise<{ da_cong_kho?: number }> {
  const res = await apiFetch<{ success: boolean; data: { da_cong_kho?: number } }>(`/api/admin/requests/${id}`, {
    method: "PUT",
    body: JSON.stringify(input),
  })
  return res.data
}

// ── Danh mục món (menu) — chỉ quản trị viên ───────────────────────────
export interface ComboInput {
  name: string
  description?: string
  price: number
  category: "popcorn" | "drink" | "combo" | "snack"
  image_url?: string
  /** Bỏ trống = bán ở MỌI rạp; có giá trị = món riêng của rạp đó (migration 47) */
  cinema_id?: number | null
  is_available?: boolean
}

// Dùng route /api/admin/combo-menu (không phải /api/combos): route này cho CẢ
// quản lý chi nhánh thao tác trên món RIÊNG của rạp mình, đồng thời tự ghi
// nhật ký và báo cho quản trị viên mỗi lần có thay đổi.
export async function createCombo(input: ComboInput): Promise<void> {
  await apiFetch("/api/admin/combo-menu", { method: "POST", body: JSON.stringify(input) })
}

export async function updateCombo(id: number, input: ComboInput): Promise<void> {
  await apiFetch(`/api/admin/combo-menu/${id}`, { method: "PUT", body: JSON.stringify(input) })
}

export async function deleteCombo(id: number): Promise<void> {
  await apiFetch(`/api/admin/combo-menu/${id}`, { method: "DELETE" })
}

// ── Nhật ký hoạt động chi nhánh ──────────────────────────────────────
export interface BranchActivity {
  id: number
  cinema_id: number
  cinema_name: string
  hanh_dong: string
  hanh_dong_nhan: string
  doi_tuong: string | null
  chi_tiet: Record<string, any> | null
  nguoi_thuc_hien: string | null
  created_at: string
}

export async function getBranchActivity(cinemaId?: number | string): Promise<BranchActivity[]> {
  const q = cinemaId ? `?cinemaId=${cinemaId}` : ""
  const res = await apiFetch<{ success: boolean; data: BranchActivity[] }>(`/api/admin/branch-activity${q}`)
  return res.data || []
}
