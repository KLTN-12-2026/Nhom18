const { pool } = require("../config/database")

// Sau MAX_ATTEMPTS lần nhập sai, mã bị khoá — bắt buộc xin mã mới (gửi lại
// qua upsert() sẽ reset attempts về 0). Chặn brute-force mã 6 số kể cả khi
// request đến từ nhiều IP khác nhau (rate-limit theo IP không đủ một mình).
const MAX_ATTEMPTS = 5

class RegistrationCode {
  static async upsert(email, code, expiresAt) {
    await pool.execute(
      `INSERT INTO registration_codes (email, code, expires_at, attempts) VALUES (?, ?, ?, 0)
       ON DUPLICATE KEY UPDATE code = VALUES(code), expires_at = VALUES(expires_at), attempts = 0`,
      [email, code, expiresAt],
    )
  }

  /**
   * @returns {Promise<{ valid: boolean, reason?: 'NOT_FOUND'|'LOCKED'|'EXPIRED'|'WRONG_CODE' }>}
   */
  static async verify(email, code) {
    const [rows] = await pool.execute(
      "SELECT code, expires_at, attempts FROM registration_codes WHERE email = ?",
      [email],
    )
    const row = rows[0]
    if (!row) return { valid: false, reason: "NOT_FOUND" }

    if (row.attempts >= MAX_ATTEMPTS) {
      return { valid: false, reason: "LOCKED" }
    }

    if (new Date() > new Date(row.expires_at)) {
      return { valid: false, reason: "EXPIRED" }
    }

    if (row.code !== code) {
      await pool.execute(
        "UPDATE registration_codes SET attempts = attempts + 1 WHERE email = ?",
        [email],
      )
      return { valid: false, reason: "WRONG_CODE" }
    }

    return { valid: true }
  }

  static async deleteByEmail(email) {
    await pool.execute("DELETE FROM registration_codes WHERE email = ?", [email])
  }
}

module.exports = RegistrationCode
