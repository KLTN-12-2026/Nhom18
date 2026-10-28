const { pool } = require("../config/database")
const bcrypt = require("bcryptjs")
const crypto = require("crypto")

// Sau MAX_RESET_ATTEMPTS lần nhập sai, mã đặt lại mật khẩu bị khoá — bắt buộc
// xin mã mới (saveResetCode reset lại về 0). Cùng nguyên tắc chống brute-force
// đã áp dụng cho RegistrationCode (models/RegistrationCode.js) — mã 6 số có
// 1 triệu khả năng, chỉ dựa vào rate-limit theo IP (authLimiter) là không đủ
// vì kẻ tấn công có thể rải request qua nhiều IP/proxy khác nhau.
const MAX_RESET_ATTEMPTS = 5

class User {
  static async create(userData) {
    const { username, full_name = null, email, password, role = "user", phone = null, date_of_birth = null } = userData
    const hashedPassword = await bcrypt.hash(password, 12)

    const [result] = await pool.execute(
      "INSERT INTO users (username, full_name, email, phone, date_of_birth, password, role, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())",
      [username, full_name, email, phone, date_of_birth, hashedPassword, role],
    )

    return result.insertId
  }

  static async findByEmail(email) {
    const [rows] = await pool.execute("SELECT * FROM users WHERE email = ?", [email])
    return rows[0]
  }

  static async findById(id) {
    const [rows] = await pool.execute(
      // cinema_id PHẢI có trong danh sách cột: verifyToken gán nguyên kết quả
      // này vào req.user, và toàn bộ phân quyền theo chi nhánh của vai trò
      // cinema_manager đọc req.user.cinema_id. Thiếu cột ở đây thì mọi quản lý
      // đều bị coi như "chưa gán rạp" và bị chặn hết.
      "SELECT id, username, full_name, email, phone, date_of_birth, role, cinema_id, is_blocked, google_id, token_version, created_at FROM users WHERE id = ?",
      [id],
    )
    return rows[0]
  }

  // Tăng token_version lên 1 — mọi JWT cũ (nhúng token_version cũ) lập tức bị
  // verifyToken/optionalAuth coi là không hợp lệ, kể cả khi chưa hết hạn 7
  // ngày. Dùng khi logout (thu hồi phiên hiện tại) và đổi mật khẩu (thu hồi
  // TẤT CẢ phiên cũ — quan trọng nếu người dùng đổi mật khẩu vì nghi ngờ bị lộ).
  static async incrementTokenVersion(userId) {
    await pool.execute("UPDATE users SET token_version = token_version + 1 WHERE id = ?", [userId])
  }

  // Dùng nội bộ khi cần verify password/google_id (vd đổi mật khẩu) — KHÔNG trả thẳng ra response
  static async findByIdWithSecrets(id) {
    const [rows] = await pool.execute(
      "SELECT id, username, full_name, email, role, is_blocked, password, google_id, created_at FROM users WHERE id = ?",
      [id],
    )
    return rows[0]
  }

  static async findAll({ page = 1, limit = 50 } = {}) {
    const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200)
    const safePage = Math.max(Number(page) || 1, 1)
    const offset = (safePage - 1) * safeLimit

    const [[{ total }]] = await pool.query("SELECT COUNT(*) as total FROM users")
    const [rows] = await pool.query(
      // JOIN lấy tên rạp để trang quản lý người dùng hiển thị được quản lý
      // thuộc chi nhánh nào — không có cột này thì admin nhìn danh sách không
      // phân biệt nổi 2 quản lý của 2 rạp khác nhau.
      `SELECT u.id, u.username, u.full_name, u.email, u.role, u.is_blocked, u.created_at,
              u.cinema_id, c.name AS cinema_name
       FROM users u
       LEFT JOIN cinemas c ON c.id = u.cinema_id
       ORDER BY u.created_at DESC LIMIT ? OFFSET ?`,
      [safeLimit, offset],
    )
    return { rows, total, page: safePage, limit: safeLimit }
  }

  static async getStats(today, sinceDate) {
    // today: 'YYYY-MM-DD', sinceDate: 'YYYY-MM-DD' (e.g., lastMonth)
    const [[{ totalUsers }]] = await pool.query('SELECT COUNT(*) as totalUsers FROM users')
    const [[{ newUsersToday }]] = await pool.query('SELECT COUNT(*) as newUsersToday FROM users WHERE DATE(created_at) = ?', [today])
    const [[{ newUsersThisMonth }]] = await pool.query('SELECT COUNT(*) as newUsersThisMonth FROM users WHERE DATE(created_at) >= ?', [sinceDate])
    return { totalUsers, newUsersToday, newUsersThisMonth }
  }

  /**
   * @param {number} id
   * @param {'user'|'cinema_manager'|'admin'} role
   * @param {number|null} cinemaId - rạp được gán; CHỈ có giá trị với vai trò
   *   cinema_manager. Luôn ghi đè (kể cả về NULL) trong cùng câu lệnh với role
   *   để không bao giờ tồn tại trạng thái nửa vời: đổi vai trò xong mà phạm vi
   *   rạp cũ vẫn còn.
   */
  static async updateRole(id, role, cinemaId = null) {
    const [result] = await pool.execute(
      "UPDATE users SET role = ?, cinema_id = ? WHERE id = ?",
      [role, cinemaId, id],
    )
    return result.affectedRows > 0
  }

  static async toggleBlock(id) {
    const [result] = await pool.execute("UPDATE users SET is_blocked = NOT is_blocked WHERE id = ?", [id])
    return result.affectedRows > 0
  }

  static async updateProfile(id, data) {
    const { username, email, full_name, phone, date_of_birth } = data
    const [result] = await pool.execute(
      "UPDATE users SET username = ?, email = ?, full_name = COALESCE(?, full_name), phone = COALESCE(?, phone), date_of_birth = COALESCE(?, date_of_birth) WHERE id = ?",
      [username, email, full_name ?? null, phone ?? null, date_of_birth ?? null, id]
    )
    return result.affectedRows > 0
  }

  static async updatePassword(id, newPassword) {
    const hashedPassword = await bcrypt.hash(newPassword, 12)
    const [result] = await pool.execute(
      "UPDATE users SET password = ? WHERE id = ?",
      [hashedPassword, id]
    )
    return result.affectedRows > 0
  }

  static async saveResetCode(userId, resetCode, resetToken, expiresAt) {
    const [result] = await pool.execute(
      "UPDATE users SET reset_code = ?, reset_token = ?, reset_expires = ?, reset_attempts = 0 WHERE id = ?",
      [resetCode, resetToken, expiresAt, userId]
    )
    return result.affectedRows > 0
  }

  static async verifyResetCode(userId, resetCode) {
    const [rows] = await pool.execute(
      "SELECT reset_code, reset_expires, reset_attempts FROM users WHERE id = ?",
      [userId]
    )

    if (rows.length === 0) return false

    const user = rows[0]
    if (!user.reset_code || !user.reset_expires) return false

    // Check if expired
    if (new Date() > new Date(user.reset_expires)) return false

    // Đã thử sai quá số lần cho phép — khoá mã, bắt buộc xin mã mới
    if (user.reset_attempts >= MAX_RESET_ATTEMPTS) return false

    // Check if code matches
    if (user.reset_code !== resetCode) {
      await pool.execute("UPDATE users SET reset_attempts = reset_attempts + 1 WHERE id = ?", [userId])
      return false
    }
    return true
  }

  static async clearResetCode(userId) {
    const [result] = await pool.execute(
      "UPDATE users SET reset_code = NULL, reset_token = NULL, reset_expires = NULL WHERE id = ?",
      [userId]
    )
    return result.affectedRows > 0
  }

  static async verifyPassword(plainPassword, hashedPassword) {
    return await bcrypt.compare(plainPassword, hashedPassword)
  }

  static async findByGoogleId(googleId) {
    const [rows] = await pool.execute("SELECT * FROM users WHERE google_id = ?", [googleId])
    return rows[0]
  }

  static async findOrCreateGoogleUser({ googleId, email, username, fullName, avatarUrl, verifiedEmail }) {
    // 1. Try find by Google ID
    let user = await User.findByGoogleId(googleId)
    if (user) {
      return User.findById(user.id)
    }

    // 2. Try find by email → link Google account to existing user
    user = await User.findByEmail(email)
    if (user) {
      // QUAN TRỌNG: chỉ tự động liên kết khi Google xác nhận email này ĐÃ
      // ĐƯỢC XÁC MINH (verified_email=true). Google cho phép 1 tài khoản có
      // các email phụ CHƯA xác minh — nếu không kiểm tra, kẻ tấn công chỉ cần
      // thêm email của nạn nhân làm email phụ (chưa cần xác minh) vào tài
      // khoản Google CỦA CHÍNH HỌ, rồi "Đăng nhập bằng Google" là được đăng
      // nhập thẳng vào tài khoản CinemaGold của nạn nhân — chiếm tài khoản
      // hoàn toàn không cần mật khẩu.
      if (!verifiedEmail) {
        const err = new Error("Email chưa được Google xác minh, không thể tự động liên kết tài khoản")
        err.code = "EMAIL_NOT_VERIFIED"
        throw err
      }
      await pool.execute(
        "UPDATE users SET google_id = ?, avatar_url = ?, full_name = COALESCE(full_name, ?) WHERE id = ?",
        [googleId, avatarUrl || null, fullName || null, user.id],
      )
      return User.findById(user.id)
    }

    // 3. Create new user (random unusable password for OAuth users)
    const randomPassword = crypto.randomBytes(32).toString("hex")
    const hashedPassword = await bcrypt.hash(randomPassword, 12)

    // Ensure unique username
    const base = (username || email.split("@")[0]).replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 40)
    let finalUsername = base
    let attempt = 0
    while (true) {
      const [existing] = await pool.execute("SELECT id FROM users WHERE username = ?", [finalUsername])
      if (existing.length === 0) break
      attempt++
      finalUsername = `${base}_${attempt}`
    }

    const [result] = await pool.execute(
      "INSERT INTO users (username, full_name, email, password, google_id, avatar_url, role, created_at) VALUES (?, ?, ?, ?, ?, ?, 'user', NOW())",
      [finalUsername, fullName || null, email, hashedPassword, googleId, avatarUrl || null]
    )

    return User.findById(result.insertId)
  }
}

module.exports = User
