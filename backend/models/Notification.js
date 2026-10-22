const { pool } = require("../config/database")

class Notification {
  static async create({ userId, type, title, message, data = null }) {
    const [result] = await pool.execute(
      "INSERT INTO notifications (user_id, type, title, message, data, created_at) VALUES (?, ?, ?, ?, ?, NOW())",
      [userId, type, title, message, data ? JSON.stringify(data) : null],
    )
    return result.insertId
  }

  static async findByUser(userId, { limit = 20 } = {}) {
    const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100)
    const [rows] = await pool.query(
      "SELECT id, type, title, message, data, is_read, created_at FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ?",
      [userId, safeLimit],
    )
    // Cột `data` là kiểu JSON — driver mysql2 đã tự parse sẵn thành object khi
    // đọc (KHÔNG trả về chuỗi), nên không cần (và không được) JSON.parse lại ở
    // đây — gọi JSON.parse trên 1 object có sẵn sẽ ném lỗi "[object Object] is
    // not valid JSON" vì JS tự gọi toString() trước khi parse.
    return rows
  }

  static async countUnread(userId) {
    const [[{ cnt }]] = await pool.query(
      "SELECT COUNT(*) as cnt FROM notifications WHERE user_id = ? AND is_read = 0",
      [userId],
    )
    return cnt
  }

  static async markRead(id, userId) {
    const [result] = await pool.execute(
      "UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?",
      [id, userId],
    )
    return result.affectedRows > 0
  }

  static async markAllRead(userId) {
    await pool.execute("UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0", [userId])
  }

  /** Đã từng gửi loại thông báo này cho user chưa (dùng để tránh gửi trùng —
   * vd không nhắc "cập nhật ngày sinh" nhiều lần, không chúc mừng sinh nhật 2
   * lần trong cùng 1 năm). withinDays=null nghĩa là kiểm tra suốt lịch sử. */
  static async existsForUser(userId, type, { withinDays = null } = {}) {
    const timeClause = withinDays != null ? "AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)" : ""
    const params = withinDays != null ? [userId, type, withinDays] : [userId, type]
    const [[{ cnt }]] = await pool.query(
      `SELECT COUNT(*) as cnt FROM notifications WHERE user_id = ? AND type = ? ${timeClause}`,
      params,
    )
    return cnt > 0
  }
}

module.exports = Notification
