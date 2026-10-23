const { pool } = require("../config/database")
const { withTransaction } = require("../utils/db")
const ComboInventory = require("./ComboInventory")

/**
 * YÊU CẦU TỪ CHI NHÁNH GỬI VỀ ADMIN (bảng `branch_requests`, migration 46).
 *
 * Nguyên tắc vận hành: việc gấp thì quản lý chi nhánh **tự xử lý trước** (huỷ
 * suất chiếu, hoàn tiền cho khách, tắt món đã hết), rồi gửi yêu cầu này để
 * admin nắm và xử lý phần thuộc thẩm quyền chuỗi (cấp thêm hàng, duyệt chi
 * phí). Chờ admin duyệt mới được làm thì khách đã về mất rồi.
 *
 * Bốn loại: bo_sung_hang (xin thêm hàng) · bao_het_hang (báo đã hết) ·
 * su_co (sự cố tại rạp, đã tự xử lý) · khac.
 */
const LOAI = {
  bo_sung_hang: "Xin bổ sung hàng",
  bao_het_hang: "Báo hết hàng",
  su_co: "Sự cố tại rạp",
  khac: "Việc khác",
}
const MUC_DO = { thap: "Thấp", binh_thuong: "Bình thường", khan: "Khẩn" }

class BranchRequest {
  static get LOAI() { return LOAI }
  static get MUC_DO() { return MUC_DO }

  static async tao({ cinemaId, nguoiGui, loai, comboId = null, soLuong = null, tieuDe, noiDung = null, mucDo = "binh_thuong" }) {
    if (!LOAI[loai]) throw Object.assign(new Error("Loại yêu cầu không hợp lệ"), { status: 400 })
    if (!MUC_DO[mucDo]) mucDo = "binh_thuong"
    if (!String(tieuDe || "").trim()) throw Object.assign(new Error("Thiếu tiêu đề yêu cầu"), { status: 400 })
    if (loai === "bo_sung_hang" && (!comboId || !soLuong || soLuong <= 0)) {
      throw Object.assign(new Error("Yêu cầu bổ sung hàng phải chọn món và số lượng"), { status: 400 })
    }

    const [kq] = await pool.query(
      `INSERT INTO branch_requests (cinema_id, nguoi_gui, loai, combo_id, so_luong, tieu_de, noi_dung, muc_do)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [cinemaId, nguoiGui || null, loai, comboId || null,
       soLuong ? parseInt(soLuong) : null, String(tieuDe).trim().slice(0, 200), noiDung || null, mucDo],
    )
    return kq.insertId
  }

  /** @param {{cinemaId?: number|null, trangThai?: string, limit?: number}} loc */
  static async danhSach({ cinemaId = null, trangThai = null, limit = 50 } = {}) {
    const dieuKien = []
    const tham = []
    if (cinemaId) { dieuKien.push("r.cinema_id = ?"); tham.push(cinemaId) }
    if (trangThai) { dieuKien.push("r.trang_thai = ?"); tham.push(trangThai) }
    tham.push(Math.min(Number(limit) || 50, 200))

    const [rows] = await pool.query(
      `SELECT r.*, c.name AS cinema_name, m.name AS combo_name, m.category AS combo_category,
              COALESCE(ug.full_name, ug.username, ug.email) AS nguoi_gui_ten,
              COALESCE(ux.full_name, ux.username, ux.email) AS nguoi_xu_ly_ten
       FROM branch_requests r
       JOIN cinemas c ON c.id = r.cinema_id
       LEFT JOIN combos m ON m.id = r.combo_id
       LEFT JOIN users ug ON ug.id = r.nguoi_gui
       LEFT JOIN users ux ON ux.id = r.nguoi_xu_ly
       ${dieuKien.length ? "WHERE " + dieuKien.join(" AND ") : ""}
       ORDER BY r.trang_thai = 'moi' DESC, FIELD(r.muc_do, 'khan', 'binh_thuong', 'thap'), r.created_at DESC
       LIMIT ?`,
      tham,
    )
    return rows.map((r) => ({ ...r, loai_nhan: LOAI[r.loai] || r.loai, muc_do_nhan: MUC_DO[r.muc_do] || r.muc_do }))
  }

  static async timTheoId(id) {
    const [[r]] = await pool.query("SELECT * FROM branch_requests WHERE id = ?", [id])
    return r || null
  }

  /** Số yêu cầu chưa xử lý — hiện trên thẻ Tổng quan của admin. */
  static async demChoXuLy(cinemaId = null) {
    const [[r]] = await pool.query(
      `SELECT COUNT(*) AS n, SUM(muc_do = 'khan') AS khan FROM branch_requests
       WHERE trang_thai = 'moi' ${cinemaId ? "AND cinema_id = ?" : ""}`,
      cinemaId ? [cinemaId] : [],
    )
    return { cho_xu_ly: Number(r.n) || 0, khan: Number(r.khan) || 0 }
  }

  /**
   * Admin xử lý yêu cầu. DUYỆT một yêu cầu bổ sung hàng thì **cộng thẳng vào
   * kho của rạp đó** trong cùng transaction — duyệt xong mà kho không đổi thì
   * quản lý chi nhánh vẫn phải gọi điện hỏi lại, tính năng thành hình thức.
   * @param {'da_duyet'|'tu_choi'|'da_xem'} trangThai
   */
  static async xuLy(id, { trangThai, phanHoi = null, nguoiXuLy }) {
    if (!["da_duyet", "tu_choi", "da_xem"].includes(trangThai)) {
      throw Object.assign(new Error("Trạng thái xử lý không hợp lệ"), { status: 400 })
    }
    return withTransaction(async (connection) => {
      const [[yc]] = await connection.execute("SELECT * FROM branch_requests WHERE id = ? FOR UPDATE", [id])
      if (!yc) throw Object.assign(new Error("Không tìm thấy yêu cầu"), { status: 404 })
      if (yc.trang_thai !== "moi") {
        throw Object.assign(new Error("Yêu cầu này đã được xử lý trước đó"), { status: 409 })
      }

      let daCongKho = 0
      if (trangThai === "da_duyet" && yc.loai === "bo_sung_hang" && yc.combo_id && yc.so_luong > 0) {
        await ComboInventory.congThem(connection, yc.cinema_id, yc.combo_id, yc.so_luong)
        daCongKho = yc.so_luong
      }

      await connection.execute(
        `UPDATE branch_requests SET trang_thai = ?, phan_hoi = ?, nguoi_xu_ly = ?, xu_ly_luc = NOW() WHERE id = ?`,
        [trangThai, phanHoi || null, nguoiXuLy || null, id],
      )
      return { ...yc, trang_thai: trangThai, da_cong_kho: daCongKho }
    })
  }
}

module.exports = BranchRequest
