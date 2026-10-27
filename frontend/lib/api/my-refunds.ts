import { apiFetch } from "./client"

/**
 * Phần hoàn tiền và voucher cá nhân mà KHÁCH xem được.
 *
 * Sổ hoàn tiền (`/api/admin/refunds`) là dữ liệu nội bộ — có tên người duyệt,
 * phản hồi nguyên văn của cổng thanh toán. Hai endpoint dưới đây chỉ trả phần
 * khách cần biết về tiền của chính mình.
 */

export interface MyRefund {
  id: number
  so_tien: number
  kenh: "cong_thanh_toan" | "voucher" | "diem_thuong" | "tien_mat"
  kenh_nhan: string
  trang_thai: "cho_duyet" | "da_duyet" | "dang_gui_cong" | "thanh_cong" | "that_bai" | "tu_choi"
  trang_thai_nhan: string
  trang_thai_mo_ta: string | null
  ly_do: string
  /** Mã giao dịch hoàn do cổng thanh toán cấp — chỉ có sau khi cổng chấp nhận */
  ma_giao_dich_hoan: string | null
  /** Mã giao dịch THANH TOÁN gốc — luôn có, khách dùng để đối chiếu ngân hàng */
  ma_giao_dich_goc: string | null
  voucher_code: string | null
  voucher_han: string | null
  phuong_thuc_goc: string | null
  booking_reference: string
  movie_title: string | null
  cinema_name: string | null
  show_date: string | null
  show_time: string | null
  created_at: string
  duyet_luc: string | null
  ghi_chu_thoi_gian: string | null
  /** Khách còn đổi được cách nhận tiền khi khoản này chưa thực hiện xong */
  duoc_chon_lai: boolean
  kenh_khach_chon: "cong_thanh_toan" | "voucher" | null
  khach_chon_luc: string | null
}

export interface CauHinhHoanTien {
  /** Cổng thanh toán đang chạy ở môi trường thử nghiệm — không có tiền thật */
  la_thu_nghiem: boolean
  ghi_chu_thu_nghiem: string | null
}

export interface MyVoucher {
  id: number
  code: string
  description: string | null
  discount_type: "percent" | "fixed"
  discount_value: number
  min_order_amount: number
  valid_until: string
  /** Sinh ra từ một lệnh hoàn tiền — là tiền của khách, không phải khuyến mãi */
  la_boi_thuong: boolean
  con_dung_duoc: boolean
  trang_thai: string
}

export async function getMyRefunds(): Promise<{ refunds: MyRefund[]; cauHinh: CauHinhHoanTien }> {
  const data = await apiFetch<{ refunds: MyRefund[]; cauHinh: CauHinhHoanTien }>("/api/tickets/my-refunds")
  return {
    refunds: data.refunds || [],
    cauHinh: data.cauHinh || { la_thu_nghiem: false, ghi_chu_thu_nghiem: null },
  }
}

/**
 * Khách chọn nhận tiền hoàn bằng voucher (ngay) hay về phương thức gốc (chờ).
 * Chọn voucher khi khoản đã được duyệt thì hệ thống phát mã ngay lập tức.
 */
export async function chonKenhHoanTien(
  refundId: number,
  kenh: "voucher" | "cong_thanh_toan",
): Promise<{ daThucHien: boolean; voucherCode: string | null; message: string }> {
  return apiFetch(`/api/tickets/my-refunds/${refundId}/chon-kenh`, {
    method: "PUT",
    body: JSON.stringify({ kenh }),
  })
}

export async function getMyVouchers(): Promise<MyVoucher[]> {
  const data = await apiFetch<{ vouchers: MyVoucher[] }>("/api/vouchers/mine")
  return data.vouchers || []
}
