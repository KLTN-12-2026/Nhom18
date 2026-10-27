import { apiFetch } from "../client"

/**
 * SỔ HOÀN TIỀN (migration 49).
 *
 * Phân vai ở backend, giao diện chỉ phản ánh lại:
 *   - Nhân viên / quản lý chi nhánh: XEM (chỉ rạp mình) và ĐỀ NGHỊ
 *   - Quản trị viên: DUYỆT / TỪ CHỐI — người tạo ra lý do hoàn tiền không
 *     được là người phê duyệt khoản tiền đó
 */

export type KenhHoan = "cong_thanh_toan" | "voucher" | "diem_thuong" | "tien_mat"
export type TrangThaiHoan =
  | "cho_duyet"
  | "da_duyet"
  | "dang_gui_cong"
  | "thanh_cong"
  | "that_bai"
  | "tu_choi"
export type NguonHoan = "su_co" | "khach_huy" | "admin"

export interface RefundRow {
  id: number
  ticket_id: number
  cinema_id: number | null
  so_tien: number
  kenh: KenhHoan
  kenh_nhan: string
  trang_thai: TrangThaiHoan
  trang_thai_nhan: string
  ly_do: string
  nguon: NguonHoan
  nguon_nhan: string
  /** 1 = hệ thống tự duyệt theo quy tắc, không phải người bấm */
  tu_dong_duyet: 0 | 1
  phuong_thuc_goc: "vnpay" | "momo" | "zalopay" | "cash" | "mock" | null
  ma_giao_dich_goc: string | null
  ma_giao_dich_hoan: string | null
  /** Mã phản hồi của cổng thanh toán, "00" = thành công */
  ma_phan_hoi: string | null
  voucher_id: number | null
  voucher_code: string | null
  ghi_chu: string | null
  duyet_luc: string | null
  created_at: string
  booking_reference: string
  user_id: number
  ten_khach: string
  email: string
  cinema_name: string | null
  movie_title: string | null
  show_date: string | null
  show_time: string | null
  nguoi_de_nghi_ten: string | null
  nguoi_duyet_ten: string | null
}

export interface ThongKeHoan {
  cho_duyet: { so_luong: number; tong_tien: number }
  da_duyet: { so_luong: number; tong_tien: number }
  dang_gui_cong: { so_luong: number; tong_tien: number }
  thanh_cong: { so_luong: number; tong_tien: number }
  that_bai: { so_luong: number; tong_tien: number }
  tu_choi: { so_luong: number; tong_tien: number }
}

export const NHAN_KENH: Record<KenhHoan, string> = {
  cong_thanh_toan: "Hoàn về cổng thanh toán",
  voucher: "Voucher bồi thường",
  diem_thuong: "Cộng điểm thưởng",
  tien_mat: "Chi tiền mặt tại quầy",
}

export const MO_TA_KENH: Record<KenhHoan, string> = {
  cong_thanh_toan: "Gửi lệnh hoàn sang VNPay. Tiền về thẻ khách sau 3–7 ngày làm việc.",
  voucher: "Phát mã giảm giá đúng số tiền, gán riêng khách đó, dùng ngay cho lần đặt sau.",
  diem_thuong: "Quy đổi thành điểm thưởng theo tỉ lệ 1.000đ = 1 điểm.",
  tien_mat: "Thu ngân chi tại quầy, sau đó bấm xác nhận đã chi.",
}

export async function getRefunds(params: { cinemaId?: number | string; trangThai?: TrangThaiHoan } = {}) {
  const q = new URLSearchParams()
  if (params.cinemaId) q.set("cinemaId", String(params.cinemaId))
  if (params.trangThai) q.set("trangThai", params.trangThai)
  const res = await apiFetch<{ success: boolean; data: { items: RefundRow[]; thongKe: ThongKeHoan } }>(
    `/api/admin/refunds${q.toString() ? "?" + q.toString() : ""}`,
  )
  return res.data
}

export async function deNghiHoanTien(input: { ticketId: number; lyDo: string; kenh?: KenhHoan }) {
  const res = await apiFetch<{ success: boolean; data: any }>("/api/admin/refunds", {
    method: "POST",
    body: JSON.stringify(input),
  })
  return res.data
}

/** Chỉ quản trị viên. Duyệt xong hệ thống thực hiện luôn theo kênh đã chọn. */
export async function duyetHoanTien(
  id: number,
  input: {
    kenh?: KenhHoan
    ghiChu?: string
    /** Bỏ qua bước tra cứu giao dịch trước khi gửi lệnh hoàn — dùng khi cổng
     *  trả mã 94 ("đang xử lý"), vì mã đó không nói giao dịch có vấn đề. */
    boQuaTraCuu?: boolean
  } = {},
) {
  const res = await apiFetch<{ success: boolean; data: any }>(`/api/admin/refunds/${id}/duyet`, {
    method: "PUT",
    body: JSON.stringify(input),
  })
  return res.data
}

export async function tuChoiHoanTien(id: number, lyDo: string) {
  const res = await apiFetch<{ success: boolean; data: any }>(`/api/admin/refunds/${id}/tu-choi`, {
    method: "PUT",
    body: JSON.stringify({ lyDo }),
  })
  return res.data
}

export async function xacNhanDaChi(id: number, ghiChu?: string) {
  const res = await apiFetch<{ success: boolean; data: any }>(`/api/admin/refunds/${id}/da-chi`, {
    method: "PUT",
    body: JSON.stringify({ ghiChu }),
  })
  return res.data
}

/** Tra cứu giao dịch ở cổng thanh toán — CHỈ ĐỌC, không đụng tới tiền. */
export async function traCuuCong(id: number) {
  const res = await apiFetch<{
    success: boolean
    data: {
      ok: boolean
      maPhanHoi: string | null
      moTa: string
      chuKyHopLe: boolean | null
      trangThaiGiaoDich: string | null
      soTien: number | null
      phanHoi: Record<string, any>
    }
  }>(`/api/admin/refunds/${id}/tra-cuu-cong`)
  return res.data
}

/** Khôi phục suất chiếu đã huỷ — chỉ quản trị viên. */
export async function khoiPhucSuat(showtimeId: number, input: { lyDo?: string; preview?: boolean } = {}) {
  const res = await apiFetch<{
    success: boolean
    data: {
      preview: boolean
      showtime: { id: number; movie_title: string; cinema_name: string; room_name: string; show_date: string; show_time: string }
      khach_cu: number
      lenh_hoan: number
      lenh_hoan_da_xong: number
      tien_da_hoan: number
    }
  }>(`/api/admin/showtimes/${showtimeId}/restore`, {
    method: "POST",
    body: JSON.stringify(input),
  })
  return res.data
}
