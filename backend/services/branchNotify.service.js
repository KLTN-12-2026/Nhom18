/**
 * THÔNG BÁO HAI CHIỀU GIỮA CHI NHÁNH VÀ ADMIN
 *
 * Quản lý chi nhánh xử lý việc gấp trước (huỷ suất, hoàn tiền, tắt món hết
 * hàng) rồi hệ thống tự báo cho admin — admin không phải ngồi canh, nhưng vẫn
 * nắm được mọi việc đã xảy ra ở từng rạp. Chiều ngược lại: admin xử lý xong
 * yêu cầu thì người gửi được báo ngay.
 *
 * Lỗi gửi thông báo KHÔNG được làm hỏng việc chính (huỷ suất, duyệt yêu cầu)
 * đã ghi nhận xong — nên mọi hàm ở đây tự nuốt lỗi và chỉ ghi log.
 */
const { pool } = require("../config/database")
const Notification = require("../models/Notification")

async function dsAdmin() {
  const [rows] = await pool.query("SELECT id FROM users WHERE role = 'admin' AND is_blocked = 0")
  return rows.map((r) => r.id)
}

async function guiChoAdmin({ type, title, message, data }) {
  try {
    const ids = await dsAdmin()
    await Promise.all(ids.map((userId) => Notification.create({ userId, type, title, message, data })))
    return ids.length
  } catch (e) {
    console.error("⚠️ Không gửi được thông báo cho admin:", e.message)
    return 0
  }
}

/** Chi nhánh gửi yêu cầu mới → báo mọi admin. */
async function baoYeuCauMoi(yeuCau) {
  const khan = yeuCau.muc_do === "khan"
  return guiChoAdmin({
    type: "branch_request",
    title: `${khan ? "🔴 KHẨN — " : ""}${yeuCau.cinema_name}: ${yeuCau.loai_nhan}`,
    message: yeuCau.tieu_de + (yeuCau.combo_name ? ` (${yeuCau.combo_name}${yeuCau.so_luong ? ` × ${yeuCau.so_luong}` : ""})` : ""),
    data: { requestId: yeuCau.id, cinemaId: yeuCau.cinema_id, loai: yeuCau.loai, mucDo: yeuCau.muc_do },
  })
}

/**
 * Có lệnh hoàn tiền CHỜ DUYỆT → báo mọi admin (migration 49).
 *
 * Không có bước này thì quy trình duyệt chỉ tồn tại trên giấy: admin phải tự
 * nhớ mở trang Sổ hoàn tiền mới biết có tiền của khách đang treo. Khách chờ,
 * không ai biết là đang chờ ai.
 *
 * Gộp nhiều vé thành MỘT thông báo: huỷ một suất 80 chỗ mà bắn 80 thông báo
 * thì admin tắt chuông, và lần sau có việc thật cũng không ai đọc.
 */
async function baoHoanTienChoDuyet({ soLenh, tongTien, lyDo, cinemaName, refundId = null }) {
  const nhieu = soLenh > 1
  return guiChoAdmin({
    type: "refund_pending",
    title: `💰 ${nhieu ? `${soLenh} lệnh hoàn tiền` : "Lệnh hoàn tiền"} chờ duyệt${cinemaName ? ` — ${cinemaName}` : ""}`,
    message: `${Number(tongTien).toLocaleString("vi-VN")}đ đang chờ quản trị viên duyệt. Lý do: ${lyDo}`,
    data: { refundId, soLenh, tongTien },
  })
}

/**
 * Lệnh hoàn qua cổng thanh toán THẤT BẠI → báo admin ngay.
 *
 * Đây là trường hợp nguy hiểm nhất trong toàn bộ luồng: vé đã huỷ, ghế đã nhả,
 * khách tưởng được hoàn tiền, nhưng tiền chưa hề đi. Không ai báo thì khoản đó
 * nằm im trong sổ tới khi khách gọi lên khiếu nại.
 */
async function baoHoanTienThatBai({ refundId, bookingReference, soTien, moTa }) {
  return guiChoAdmin({
    type: "refund_failed",
    title: `🔴 Hoàn tiền THẤT BẠI — vé ${bookingReference}`,
    message: `${Number(soTien).toLocaleString("vi-VN")}đ chưa trả được cho khách. ${moTa}. Cần xử lý tay.`,
    data: { refundId, bookingReference, soTien },
  })
}

/** Admin xử lý xong → báo lại người gửi. */
async function baoDaXuLy(yeuCau, { trangThai, phanHoi, daCongKho }) {
  if (!yeuCau.nguoi_gui) return false
  const nhan = { da_duyet: "đã được duyệt", tu_choi: "bị từ chối", da_xem: "đã được ghi nhận" }[trangThai]
  try {
    await Notification.create({
      userId: yeuCau.nguoi_gui,
      type: "branch_request_result",
      title: `Yêu cầu "${yeuCau.tieu_de}" ${nhan}`,
      message: [
        daCongKho ? `Đã cấp thêm ${daCongKho} suất vào kho của rạp.` : null,
        phanHoi ? `Phản hồi: ${phanHoi}` : null,
      ].filter(Boolean).join(" ") || "Quản trị viên đã xử lý yêu cầu của bạn.",
      data: { requestId: yeuCau.id, trangThai },
    })
    return true
  } catch (e) {
    console.error("⚠️ Không gửi được thông báo kết quả yêu cầu:", e.message)
    return false
  }
}

/**
 * Quản lý chi nhánh vừa báo sự cố suất chiếu → báo admin NGAY SAU KHI việc đã
 * xử lý xong (khách đã được hoàn tiền), đúng tinh thần "xử lý trước, báo sau".
 * Admin tự báo sự cố thì không cần tự gửi cho chính mình.
 */
async function baoSuCoChoAdmin({ incident, suat, nguoiBao, soVe, soTienHoan }) {
  if (nguoiBao?.role === "admin") return 0
  const huy = incident.loai === "cancelled"
  return guiChoAdmin({
    type: "branch_incident",
    title: `${suat.cinema_name}: ${huy ? "đã huỷ suất chiếu" : "thông báo thay đổi suất"} ${suat.movie_title}`,
    message: [
      `${suat.show_time} ngày ${suat.show_date}${suat.room_name ? ` · ${suat.room_name}` : ""}`,
      `Lý do: ${incident.lyDoNhan}.`,
      soVe ? `${soVe} vé bị ảnh hưởng${soTienHoan ? `, đã hoàn ${Number(soTienHoan).toLocaleString("vi-VN")}đ` : ""}.` : "Chưa có vé nào bị ảnh hưởng.",
      nguoiBao?.ten ? `Người xử lý: ${nguoiBao.ten}.` : null,
    ].filter(Boolean).join(" "),
    data: { showtimeId: suat.id, cinemaId: suat.cinema_id, incidentType: incident.loai },
  })
}

// Nhãn tiếng Việt cho từng hành động — dùng trong thông báo và nhật ký
const NHAN_HANH_DONG = {
  sua_ton_kho: "cập nhật tồn kho",
  tam_ngung_mon: "tạm ngưng bán món",
  mo_ban_mon: "mở bán lại món",
  them_mon: "thêm món vào menu",
  sua_mon: "sửa thông tin món",
  xoa_mon: "xoá món khỏi menu",
  bao_su_co: "báo sự cố suất chiếu",
  bao_su_co_hang_loat: "báo sự cố diện rộng",
  gui_yeu_cau: "gửi yêu cầu",
}

/**
 * GHI NHẬT KÝ + BÁO ADMIN cho mọi thay đổi do chi nhánh thực hiện.
 *
 * Nhiều việc ở chi nhánh KHÔNG cần admin duyệt (sửa tồn kho thật tại quầy,
 * tạm ngưng món hỏng, thêm món riêng của rạp) — bắt chờ duyệt thì quầy đứng
 * bánh. Nhưng admin vẫn phải NẮM ĐƯỢC: thông báo để biết ngay, nhật ký
 * (bảng branch_activity) để tra lại về sau khi cần đối chiếu.
 *
 * Admin tự thao tác thì chỉ ghi nhật ký, không tự gửi thông báo cho chính mình.
 */
async function ghiHoatDong({ cinemaId, userId, hanhDong, doiTuong = null, chiTiet = null, nguoiBao = null, chiGhiNhatKy = false }) {
  let tenRap = `Rạp #${cinemaId}`
  try {
    const [[r]] = await pool.query("SELECT name FROM cinemas WHERE id = ?", [cinemaId])
    if (r?.name) tenRap = r.name
    await pool.query(
      `INSERT INTO branch_activity (cinema_id, user_id, hanh_dong, doi_tuong, chi_tiet)
       VALUES (?, ?, ?, ?, ?)`,
      [cinemaId, userId || null, hanhDong, doiTuong, chiTiet ? JSON.stringify(chiTiet) : null],
    )
  } catch (e) {
    console.error("⚠️ Không ghi được nhật ký hoạt động chi nhánh:", e.message)
  }

  // chiGhiNhatKy: chỗ gọi đã tự gửi thông báo riêng (vd gửi yêu cầu) — chỉ cần
  // lưu vết, không gửi thêm lần nữa cho admin.
  if (chiGhiNhatKy || nguoiBao?.role === "admin") return 0
  const nhan = NHAN_HANH_DONG[hanhDong] || hanhDong
  return guiChoAdmin({
    type: "branch_activity",
    title: `${tenRap}: ${nhan}${doiTuong ? ` — ${doiTuong}` : ""}`,
    message: [
      moTaChiTiet(hanhDong, chiTiet),
      nguoiBao?.ten ? `Người thực hiện: ${nguoiBao.ten}.` : null,
    ].filter(Boolean).join(" ") || "Chi nhánh vừa cập nhật dữ liệu.",
    data: { cinemaId, hanhDong, doiTuong, ...chiTiet },
  })
}

/** Câu mô tả ngắn cho từng loại thay đổi — để admin đọc thông báo là hiểu ngay. */
function moTaChiTiet(hanhDong, ct) {
  if (!ct) return ""
  if (hanhDong === "sua_ton_kho") {
    const phan = []
    if (ct.tonKhoCu != null && ct.tonKhoMoi != null && ct.tonKhoCu !== ct.tonKhoMoi) {
      phan.push(`Tồn kho ${ct.tonKhoCu} → ${ct.tonKhoMoi}.`)
    }
    if (ct.nguongCu != null && ct.nguongMoi != null && ct.nguongCu !== ct.nguongMoi) {
      phan.push(`Ngưỡng cảnh báo ${ct.nguongCu} → ${ct.nguongMoi}.`)
    }
    return phan.join(" ")
  }
  if (hanhDong === "them_mon" || hanhDong === "sua_mon") {
    return `${ct.gia ? `Giá ${Number(ct.gia).toLocaleString("vi-VN")}đ. ` : ""}${ct.rapRieng ? "Món riêng của rạp này." : "Bán ở mọi rạp."}`
  }
  return ""
}

module.exports = {
  baoYeuCauMoi, baoDaXuLy, baoSuCoChoAdmin, ghiHoatDong, NHAN_HANH_DONG,
  baoHoanTienChoDuyet, baoHoanTienThatBai,
}
