const { pool } = require("../config/database")

class Voucher {
  /**
   * Kiểm tra mã giảm giá có dùng được không cho user + số tiền đơn hàng cụ
   * thể, và tính số tiền được giảm — KHÔNG ghi redemption ở đây (chỉ xem
   * trước). Dùng redeem() ngay khi vé được tạo thật để tránh 2 request song
   * song cùng "xem trước" rồi cùng đặt vé vượt usage_limit.
   * @returns {Promise<{ valid: boolean, reason?: string, voucher?: object, discountAmount?: number }>}
   */
  static async validate(code, userId, orderAmount) {
    if (!code) return { valid: false, reason: "Vui lòng nhập mã giảm giá" }

    const [rows] = await pool.query(
      "SELECT * FROM vouchers WHERE code = ? AND is_active = 1",
      [String(code).trim().toUpperCase()],
    )
    const voucher = rows[0]
    if (!voucher) return { valid: false, reason: "Mã giảm giá không tồn tại hoặc đã bị vô hiệu hoá" }

    // Voucher cá nhân (sinh ra khi đổi điểm thưởng, xem points.service.js) —
    // chỉ đúng chủ tài khoản được gán mới dùng được, người khác dù biết mã
    // cũng không đặt vé được với mã này.
    if (voucher.assigned_user_id != null && voucher.assigned_user_id !== userId) {
      return { valid: false, reason: "Mã giảm giá này thuộc về tài khoản khác" }
    }

    const now = new Date()
    if (now < new Date(voucher.valid_from) || now > new Date(voucher.valid_until)) {
      return { valid: false, reason: "Mã giảm giá đã hết hạn hoặc chưa có hiệu lực" }
    }
    if (voucher.usage_limit != null && voucher.used_count >= voucher.usage_limit) {
      return { valid: false, reason: "Mã giảm giá đã hết lượt sử dụng" }
    }
    if (Number(orderAmount) < Number(voucher.min_order_amount)) {
      return {
        valid: false,
        reason: `Đơn hàng phải từ ${Number(voucher.min_order_amount).toLocaleString("vi-VN")}đ trở lên để dùng mã này`,
      }
    }

    // Voucher sinh nhật: chỉ dùng được trong ĐÚNG THÁNG sinh nhật của user
    // (không cần đúng ngày — cho khoảng thời gian thoải mái hơn, giống nhiều
    // chương trình thành viên thực tế dùng "tháng sinh nhật" thay vì đúng 1
    // ngày). Bắt buộc user đã khai ngày sinh trong hồ sơ trước.
    if (voucher.is_birthday_voucher) {
      const [[userRow]] = await pool.query("SELECT date_of_birth FROM users WHERE id = ?", [userId])
      if (!userRow?.date_of_birth) {
        return { valid: false, reason: "Bạn cần cập nhật ngày sinh trong hồ sơ để dùng mã ưu đãi sinh nhật này" }
      }
      const dob = new Date(userRow.date_of_birth)
      if (dob.getMonth() !== now.getMonth()) {
        return { valid: false, reason: "Mã này chỉ áp dụng trong tháng sinh nhật của bạn" }
      }
    }

    if (voucher.per_user_limit != null) {
      // Voucher sinh nhật chỉ đếm lượt dùng TRONG NĂM HIỆN TẠI — để mỗi năm
      // tới tháng sinh nhật lại được dùng lại 1 lần mới, không bị khoá vĩnh
      // viễn sau lần dùng đầu tiên như voucher thường (lượt dùng tính cả đời).
      const yearScope = voucher.is_birthday_voucher ? "AND YEAR(created_at) = YEAR(NOW())" : ""
      const [[{ cnt }]] = await pool.query(
        `SELECT COUNT(*) AS cnt FROM voucher_redemptions WHERE voucher_id = ? AND user_id = ? ${yearScope}`,
        [voucher.id, userId],
      )
      if (cnt >= voucher.per_user_limit) {
        return {
          valid: false,
          reason: voucher.is_birthday_voucher
            ? "Bạn đã dùng ưu đãi sinh nhật này trong năm nay rồi, hẹn năm sau nhé!"
            : "Bạn đã dùng hết lượt cho mã giảm giá này",
        }
      }
    }

    let discountAmount =
      voucher.discount_type === "percent"
        ? (Number(orderAmount) * Number(voucher.discount_value)) / 100
        : Number(voucher.discount_value)
    if (voucher.max_discount_amount != null) {
      discountAmount = Math.min(discountAmount, Number(voucher.max_discount_amount))
    }
    discountAmount = Math.min(discountAmount, Number(orderAmount))

    return { valid: true, voucher, discountAmount: Math.round(discountAmount) }
  }

  /**
   * Ghi nhận 1 lượt dùng mã (tăng used_count + tạo redemption) TRONG CÙNG
   * transaction với việc tạo vé — gọi bằng connection đã có (không tự mở
   * connection riêng) để nếu tạo vé thất bại thì lượt dùng cũng được rollback
   * theo, tránh trường hợp mã bị "trừ lượt" oan dù vé chưa hề được tạo.
   *
   * UPDATE có điều kiện `used_count < usage_limit` (không phải `+1` vô điều
   * kiện) — validate() ở trên chỉ "xem trước", 2 request đặt vé song song
   * cùng qua được validate() rồi cùng redeem() có thể làm used_count vượt
   * usage_limit nếu tăng vô điều kiện. UPDATE có WHERE là thao tác atomic ở
   * tầng MySQL, request nào tới sau khi đã hết lượt sẽ có affectedRows = 0,
   * ném lỗi để rollback toàn bộ transaction (vé không được tạo, không bị trừ
   * lượt oan) thay vì âm thầm cho vượt hạn mức.
   */
  /**
   * Trả lại lượt dùng mã khi vé bị huỷ — gọi TRONG transaction huỷ vé.
   * Lượt dùng bị trừ ngay lúc TẠO ĐƠN (trước khi trả tiền), nên nếu không
   * trả lại thì khách thanh toán thất bại/bỏ ngang (job tự huỷ sau 20 phút)
   * hoặc huỷ vé sẽ mất mã vĩnh viễn — mã sinh nhật chỉ 1 lần/năm, mã đổi từ
   * điểm thì mất luôn số điểm đã bỏ ra.
   */
  /**
   * @returns {Promise<{ soMa: number, daTraLai: Array }>} mô tả TỪNG mã vừa được
   *   trả lại (code, giá trị, hạn dùng), để nơi gọi báo cho khách biết mã nào
   *   dùng lại được. Không có thông tin này thì khách chỉ thấy vé bị huỷ và
   *   tưởng mất luôn mã — nghiêm trọng với voucher bồi thường, vì nó bằng
   *   nguyên giá vé.
   */
  static async releaseForTicket(connection, ticketId) {
    const [rows] = await connection.execute(
      `SELECT r.id, r.voucher_id, r.discount_amount,
              v.code, v.discount_type, v.discount_value, v.valid_until, v.assigned_user_id
         FROM voucher_redemptions r JOIN vouchers v ON v.id = r.voucher_id
        WHERE r.ticket_id = ?`,
      [ticketId],
    )
    for (const r of rows) {
      await connection.execute(
        "UPDATE vouchers SET used_count = GREATEST(used_count - 1, 0) WHERE id = ?",
        [r.voucher_id],
      )
      await connection.execute("DELETE FROM voucher_redemptions WHERE id = ?", [r.id])
    }

    return {
      soMa: rows.length,
      daTraLai: rows.map((r) => ({
        voucherId: r.voucher_id,
        code: r.code,
        giaTriDaGiam: Number(r.discount_amount),
        hanDung: r.valid_until,
        // Mã gán riêng = tiền của chính khách đó (bồi thường / đổi điểm), khác
        // hẳn mã khuyến mãi chung ai cũng dùng được.
        laMaCaNhan: r.assigned_user_id != null,
      })),
    }
  }

  /**
   * Ghi nhận lại lượt dùng mã khi vé đã huỷ được KHÔI PHỤC (tiền về muộn, ghế
   * vẫn trống — xem Ticket.markPaid). Khách đã trả đúng số tiền đã giảm, nên
   * ghi nhận vô điều kiện, không chặn theo usage_limit.
   */
  static async restoreForTicket(connection, ticketId) {
    const [[t]] = await connection.execute(
      `SELECT t.user_id, t.discount_amount, v.id AS voucher_id
       FROM tickets t JOIN vouchers v ON v.code = t.voucher_code
       WHERE t.id = ? AND NOT EXISTS (SELECT 1 FROM voucher_redemptions r WHERE r.ticket_id = t.id)`,
      [ticketId],
    )
    if (!t) return false
    await connection.execute("UPDATE vouchers SET used_count = used_count + 1 WHERE id = ?", [t.voucher_id])
    await connection.execute(
      "INSERT INTO voucher_redemptions (voucher_id, user_id, ticket_id, discount_amount, created_at) VALUES (?, ?, ?, ?, NOW())",
      [t.voucher_id, t.user_id, ticketId, t.discount_amount],
    )
    return true
  }

  static async redeem(connection, { voucherId, userId, ticketId, discountAmount }) {
    const [result] = await connection.execute(
      "UPDATE vouchers SET used_count = used_count + 1 WHERE id = ? AND (usage_limit IS NULL OR used_count < usage_limit)",
      [voucherId],
    )
    if (result.affectedRows === 0) {
      throw Object.assign(new Error("VOUCHER_LIMIT_EXCEEDED"), { code: "VOUCHER_LIMIT_EXCEEDED" })
    }
    await connection.execute(
      "INSERT INTO voucher_redemptions (voucher_id, user_id, ticket_id, discount_amount, created_at) VALUES (?, ?, ?, ?, NOW())",
      [voucherId, userId, ticketId, discountAmount],
    )
  }

  static async findAll() {
    const [rows] = await pool.query("SELECT * FROM vouchers ORDER BY created_at DESC")
    return rows
  }

  static async create(data) {
    const [result] = await pool.query(
      `INSERT INTO vouchers
       (code, description, discount_type, discount_value, max_discount_amount, min_order_amount,
        usage_limit, per_user_limit, valid_from, valid_until, is_active, is_birthday_voucher)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        String(data.code).trim().toUpperCase(),
        data.description,
        data.discount_type,
        data.discount_value,
        data.max_discount_amount ?? null,
        data.min_order_amount ?? 0,
        data.usage_limit ?? null,
        data.per_user_limit ?? 1,
        data.valid_from,
        data.valid_until,
        data.is_active === false ? 0 : 1,
        data.is_birthday_voucher ? 1 : 0,
      ],
    )
    return result.insertId
  }

  static async update(id, data) {
    const fields = []
    const params = []
    const settable = [
      "description", "discount_type", "discount_value", "max_discount_amount",
      "min_order_amount", "usage_limit", "per_user_limit", "valid_from", "valid_until", "is_active",
      "is_birthday_voucher",
    ]
    const booleanKeys = ["is_active", "is_birthday_voucher"]
    for (const key of settable) {
      if (data[key] !== undefined) {
        fields.push(`${key} = ?`)
        params.push(booleanKeys.includes(key) ? (data[key] ? 1 : 0) : data[key])
      }
    }
    if (!fields.length) return false
    params.push(id)
    const [result] = await pool.query(`UPDATE vouchers SET ${fields.join(", ")} WHERE id = ?`, params)
    return result.affectedRows > 0
  }

  static async delete(id) {
    const [result] = await pool.query("DELETE FROM vouchers WHERE id = ?", [id])
    return result.affectedRows > 0
  }
}

module.exports = Voucher
