/**
 * KIỂM TRA SỐ ĐIỆN THOẠI DI ĐỘNG VIỆT NAM
 *
 * Quy hoạch kho số sau đợt chuyển đổi 11 số → 10 số (2018): mọi thuê bao di
 * động đều có đúng 10 chữ số và bắt đầu bằng 03, 05, 07, 08 hoặc 09. Các đầu
 * số cũ 11 chữ số (0120, 0163, 0199…) đã bị thu hồi, nhập vào chỉ gây lỗi khi
 * rạp cần gọi cho khách.
 *
 * Chấp nhận cả cách viết quốc tế (+84 / 84) và các dấu phân cách thường gặp
 * khi người dùng chép từ danh bạ — chuẩn hoá về dạng 10 chữ số trước khi kiểm.
 */

/** Bỏ mọi khoảng trắng, dấu chấm, gạch ngang, ngoặc; đổi +84/84 về 0. */
export function chuanHoaSoDienThoai(raw: string): string {
  let s = String(raw || "").replace(/[\s.\-()]/g, "")
  if (s.startsWith("+84")) s = "0" + s.slice(3)
  else if (s.startsWith("84") && s.length > 9) s = "0" + s.slice(2)
  return s
}

const DAU_SO_HOP_LE = /^0(3|5|7|8|9)\d{8}$/

export interface KetQuaKiemTra {
  hopLe: boolean
  /** Dạng đã chuẩn hoá để lưu vào CSDL (10 chữ số, không dấu cách) */
  soChuan: string
  /** Lý do cụ thể, hiện ngay dưới ô nhập — không dùng câu chung chung */
  loi: string | null
}

export function kiemTraSoDienThoai(raw: string, batBuoc = false): KetQuaKiemTra {
  const s = chuanHoaSoDienThoai(raw)

  if (!s) {
    return batBuoc
      ? { hopLe: false, soChuan: "", loi: "Vui lòng nhập số điện thoại" }
      : { hopLe: true, soChuan: "", loi: null }
  }
  if (/[^\d]/.test(s)) {
    return { hopLe: false, soChuan: s, loi: "Số điện thoại chỉ gồm chữ số" }
  }
  if (!s.startsWith("0")) {
    return { hopLe: false, soChuan: s, loi: "Số điện thoại phải bắt đầu bằng 0 (hoặc +84)" }
  }
  // Đầu số 11 chữ số cũ — nói rõ vì sao sai, đừng để khách đoán.
  if (s.length === 11 && /^01/.test(s)) {
    return {
      hopLe: false,
      soChuan: s,
      loi: "Đầu số 11 chữ số đã bị thu hồi từ năm 2018. Vui lòng dùng số 10 chữ số.",
    }
  }
  if (s.length < 10) {
    return { hopLe: false, soChuan: s, loi: `Thiếu ${10 - s.length} chữ số — số di động phải đủ 10 chữ số` }
  }
  if (s.length > 10) {
    return { hopLe: false, soChuan: s, loi: `Thừa ${s.length - 10} chữ số — số di động chỉ có 10 chữ số` }
  }
  if (!DAU_SO_HOP_LE.test(s)) {
    return {
      hopLe: false,
      soChuan: s,
      loi: `Đầu số ${s.slice(0, 2)} không phải đầu số di động. Hợp lệ: 03, 05, 07, 08, 09.`,
    }
  }
  return { hopLe: true, soChuan: s, loi: null }
}

/** Hiển thị cho dễ đọc: 0905123456 → 0905 123 456 */
export function hienThiSoDienThoai(raw: string): string {
  const s = chuanHoaSoDienThoai(raw)
  if (!DAU_SO_HOP_LE.test(s)) return raw
  return `${s.slice(0, 4)} ${s.slice(4, 7)} ${s.slice(7)}`
}
