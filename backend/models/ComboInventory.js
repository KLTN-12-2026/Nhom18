const { pool } = require("../config/database")

/**
 * Danh sách món cho KHÁCH được cache 5 phút (routes/combos.js). Tồn kho đổi mà
 * không xoá cache thì khách vẫn thấy món đã hết trong 5 phút nữa — hoặc ngược
 * lại, món vừa nhập hàng về vẫn bị ẩn. Mọi chỗ đổi tồn kho đều gọi hàm này.
 */
const xoaCacheMon = () => {
  try { require("../middleware/cache").invalidateCache("combos") } catch (_) {}
}

/**
 * KHO BẮP NƯỚC THEO TỪNG RẠP (bảng `combo_inventory`, xem migration 46).
 *
 * Danh mục món (`combos`) dùng chung cả chuỗi — tên, giá, hình là quyết định
 * cấp chuỗi. Còn "còn bao nhiêu hàng" là chuyện của từng chi nhánh, nên tồn
 * kho tách riêng theo cinema_id. Nhờ vậy rạp Hải Châu hết bắp không làm rạp
 * Sơn Trà mất món.
 */
class ComboInventory {
  /** Toàn bộ món kèm tồn kho của MỘT rạp — dùng cho trang quản lý bắp nước. */
  static async theoRap(cinemaId) {
    const [rows] = await pool.query(
      `SELECT m.id, m.name, m.description, m.price, m.category, m.image_url,
              m.is_available AS ban_toan_chuoi, m.cinema_id AS rap_rieng,
              COALESCE(i.ton_kho, 0) AS ton_kho,
              COALESCE(i.nguong_canh_bao, 20) AS nguong_canh_bao,
              COALESCE(i.tam_ngung, 0) AS tam_ngung,
              i.updated_at AS cap_nhat_luc,
              (COALESCE(i.ton_kho, 0) = 0 OR i.tam_ngung = 1 OR m.is_available = 0) AS het_hang,
              (COALESCE(i.ton_kho, 0) > 0 AND COALESCE(i.ton_kho, 0) <= COALESCE(i.nguong_canh_bao, 20)) AS sap_het
       FROM combos m
       LEFT JOIN combo_inventory i ON i.combo_id = m.id AND i.cinema_id = ?
       -- Menu của rạp = món chung cả chuỗi (cinema_id NULL) + món riêng rạp đó
       WHERE m.cinema_id IS NULL OR m.cinema_id = ?
       ORDER BY FIELD(m.category, 'combo', 'popcorn', 'drink', 'snack'), m.price`,
      [cinemaId, cinemaId],
    )
    return rows
  }

  /** Các món CÒN BÁN ĐƯỢC tại một rạp — dùng cho trang đặt vé của khách. */
  static async conBanTaiRap(cinemaId) {
    const [rows] = await pool.query(
      `SELECT m.id, m.name, m.description, m.price, m.category, m.image_url,
              m.is_available, i.ton_kho
       FROM combos m JOIN combo_inventory i ON i.combo_id = m.id AND i.cinema_id = ?
       WHERE m.is_available = 1 AND i.tam_ngung = 0 AND i.ton_kho > 0
         AND (m.cinema_id IS NULL OR m.cinema_id = ?)
       ORDER BY FIELD(m.category, 'combo', 'popcorn', 'drink', 'snack'), m.price`,
      [cinemaId, cinemaId],
    )
    return rows
  }

  /**
   * TRỪ KHO khi khách đặt combo — gọi TRONG transaction tạo vé, bằng chính
   * connection đó, để nếu bước tạo vé sau đó hỏng thì kho cũng được hoàn.
   *
   * `UPDATE ... WHERE ton_kho >= ?` là thao tác nguyên tử ở tầng MySQL: hai
   * khách cùng mua suất bắp cuối cùng thì chỉ một người thành công, người kia
   * nhận affectedRows = 0. Kiểm tra trước rồi mới trừ (check-then-act) sẽ có
   * khe hở cho hai giao dịch cùng lọt qua.
   * @throws {Error} code COMBO_OUT_OF_STOCK, kèm .tenMon để báo đúng món nào hết
   */
  static async tru(connection, cinemaId, comboItems = []) {
    for (const item of comboItems) {
      const comboId = item.combo_id ?? item.id
      const soLuong = Number(item.quantity ?? item.so_luong ?? 1)
      if (!comboId || soLuong <= 0) continue

      const [kq] = await connection.execute(
        `UPDATE combo_inventory SET ton_kho = ton_kho - ?
         WHERE cinema_id = ? AND combo_id = ? AND tam_ngung = 0 AND ton_kho >= ?`,
        [soLuong, cinemaId, comboId, soLuong],
      )
      if (kq.affectedRows === 0) {
        const [[mon]] = await connection.execute("SELECT name FROM combos WHERE id = ?", [comboId])
        throw Object.assign(new Error("COMBO_OUT_OF_STOCK"), {
          code: "COMBO_OUT_OF_STOCK",
          tenMon: mon?.name || `Món #${comboId}`,
        })
      }
    }
    // Khách vừa mua có thể làm món hết sạch → làm mới danh sách khách thấy
    if (comboItems.length) xoaCacheMon()
  }

  /** Hoàn kho khi vé bị huỷ — gọi trong transaction huỷ vé. */
  static async hoanLai(connection, cinemaId, comboItems = []) {
    for (const item of comboItems) {
      const comboId = item.combo_id ?? item.id
      const soLuong = Number(item.quantity ?? item.so_luong ?? 1)
      if (!comboId || soLuong <= 0) continue
      await connection.execute(
        "UPDATE combo_inventory SET ton_kho = ton_kho + ? WHERE cinema_id = ? AND combo_id = ?",
        [soLuong, cinemaId, comboId],
      )
    }
    if (comboItems.length) xoaCacheMon()
  }

  /**
   * Quản lý chi nhánh chỉnh tồn kho thật tại quầy (nhập hàng về, hàng hỏng,
   * kiểm kê lệch). Không cho đặt số âm.
   */
  static async datTonKho(cinemaId, comboId, { tonKho, nguongCanhBao, tamNgung }) {
    const dat = []
    const tham = []
    if (tonKho != null) { dat.push("ton_kho = ?"); tham.push(Math.max(0, parseInt(tonKho) || 0)) }
    if (nguongCanhBao != null) { dat.push("nguong_canh_bao = ?"); tham.push(Math.max(0, parseInt(nguongCanhBao) || 0)) }
    if (tamNgung != null) { dat.push("tam_ngung = ?"); tham.push(tamNgung ? 1 : 0) }
    if (!dat.length) return false

    // Rạp có thể chưa có dòng tồn kho cho món mới thêm sau migration → tạo trước.
    await pool.query(
      "INSERT IGNORE INTO combo_inventory (cinema_id, combo_id, ton_kho) VALUES (?, ?, 0)",
      [cinemaId, comboId],
    )
    tham.push(cinemaId, comboId)
    const [kq] = await pool.query(
      `UPDATE combo_inventory SET ${dat.join(", ")} WHERE cinema_id = ? AND combo_id = ?`,
      tham,
    )
    xoaCacheMon()
    return kq.affectedRows > 0
  }

  /** Cộng thêm hàng — dùng khi admin duyệt yêu cầu bổ sung của chi nhánh. */
  static async congThem(connection, cinemaId, comboId, soLuong) {
    const db = connection || pool
    await db.query(
      "INSERT IGNORE INTO combo_inventory (cinema_id, combo_id, ton_kho) VALUES (?, ?, 0)",
      [cinemaId, comboId],
    )
    await db.query(
      "UPDATE combo_inventory SET ton_kho = ton_kho + ? WHERE cinema_id = ? AND combo_id = ?",
      [Math.max(0, parseInt(soLuong) || 0), cinemaId, comboId],
    )
    xoaCacheMon()
  }

  /**
   * Món hết hoặc sắp hết — cho thẻ cảnh báo ở trang Tổng quan.
   * cinemaId = null → xem cả chuỗi (admin); có giá trị → chỉ rạp đó (quản lý).
   */
  static async canhBao(cinemaId = null) {
    const [rows] = await pool.query(
      `SELECT i.cinema_id, c.name AS cinema_name, m.id AS combo_id, m.name AS combo_name,
              m.category, i.ton_kho, i.nguong_canh_bao, i.tam_ngung,
              CASE WHEN i.tam_ngung = 1 THEN 'tam_ngung'
                   WHEN i.ton_kho = 0 THEN 'het'
                   ELSE 'sap_het' END AS tinh_trang
       FROM combo_inventory i
       JOIN combos m ON m.id = i.combo_id
       JOIN cinemas c ON c.id = i.cinema_id
       WHERE m.is_available = 1
         AND (m.cinema_id IS NULL OR m.cinema_id = i.cinema_id)
         AND (i.tam_ngung = 1 OR i.ton_kho <= i.nguong_canh_bao)
         ${cinemaId ? "AND i.cinema_id = ?" : ""}
       ORDER BY (i.ton_kho = 0) DESC, i.ton_kho ASC`,
      cinemaId ? [cinemaId] : [],
    )
    return rows
  }

  /**
   * Doanh thu và số suất bắp nước đã bán trong N ngày — thẻ "Bắp nước" ở
   * trang Tổng quan. Đọc từ `tickets.combo_items` (JSON) của vé ĐÃ THANH TOÁN.
   */
  static async thongKeBanHang(cinemaId = null, soNgay = 30) {
    const [[tong]] = await pool.query(
      `SELECT COALESCE(SUM(t.combo_total), 0) AS doanh_thu, COUNT(*) AS so_don
       FROM tickets t JOIN showtimes s ON s.id = t.showtime_id
       WHERE t.payment_status = 'paid' AND t.booking_status = 'confirmed'
         AND t.combo_total > 0 AND t.created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
         ${cinemaId ? "AND s.cinema_id = ?" : ""}`,
      cinemaId ? [soNgay, cinemaId] : [soNgay],
    )

    // Mỗi vé lưu combo trong một mảng JSON, nên phải "trải" mảng ra mới cộng
    // được theo từng món (JSON_TABLE — MySQL 8).
    const [top] = await pool.query(
      `SELECT j.combo_id, m.name, m.category, SUM(j.quantity) AS so_suat,
              SUM(j.quantity * j.price) AS doanh_thu
       FROM tickets t
       JOIN showtimes s ON s.id = t.showtime_id
       JOIN JSON_TABLE(t.combo_items, '$[*]' COLUMNS (
              combo_id INT PATH '$.combo_id',
              quantity INT PATH '$.quantity',
              price DECIMAL(10,2) PATH '$.price'
            )) j ON TRUE
       JOIN combos m ON m.id = j.combo_id
       WHERE t.payment_status = 'paid' AND t.booking_status = 'confirmed'
         AND t.created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
         ${cinemaId ? "AND s.cinema_id = ?" : ""}
       GROUP BY j.combo_id, m.name, m.category
       ORDER BY so_suat DESC
       LIMIT 5`,
      cinemaId ? [soNgay, cinemaId] : [soNgay],
    )

    return {
      so_ngay: soNgay,
      doanh_thu: Number(tong.doanh_thu) || 0,
      so_don_co_combo: Number(tong.so_don) || 0,
      top_mon: top.map((r) => ({ ...r, so_suat: Number(r.so_suat), doanh_thu: Number(r.doanh_thu) })),
    }
  }

  /**
   * Món vừa được thêm vào danh mục → tạo dòng tồn kho tương ứng.
   * Món riêng của một rạp chỉ tạo cho rạp đó; món chung tạo cho mọi rạp.
   * Mặc định tồn kho 0 để quản lý chi nhánh nhập số thật khi hàng về —
   * đặt sẵn một con số ảo sẽ khiến khách đặt được món chưa hề có ở quầy.
   */
  static async khoiTaoChoMon(comboId, cinemaId = null, nguongCanhBao = 20) {
    await pool.query(
      `INSERT IGNORE INTO combo_inventory (cinema_id, combo_id, ton_kho, nguong_canh_bao)
       SELECT c.id, ?, 0, ? FROM cinemas c ${cinemaId ? 'WHERE c.id = ?' : ''}`,
      cinemaId ? [comboId, nguongCanhBao, cinemaId] : [comboId, nguongCanhBao],
    )
    xoaCacheMon()
  }
}

module.exports = ComboInventory
