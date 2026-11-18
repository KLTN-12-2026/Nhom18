const { pool } = require("../config/database")

class SeatLock {
  /**
   * Thời gian GIỮ GHẾ (phút) — MỘT nguồn duy nhất cho toàn hệ thống.
   *
   * Trước đây mỗi nơi một con số: seatLockController khoá 10 phút,
   * paymentController khoá 15 phút, còn giao diện (trang chọn ghế, FAQ, hướng
   * dẫn đặt vé, hướng dẫn thanh toán) đều hứa 15 phút. Người dùng đọc một
   * đằng, hệ thống làm một nẻo. Đổi ở đây là đổi toàn bộ.
   */
  static HOLD_MINUTES = 15

  /**
   * Lock seats for a showtime (5 minute timeout by default)
   * @param {number} showtimeId 
   * @param {number|null} userId 
   * @param {string|null} sessionId 
   * @param {string[]} seats - Array of seat codes like ['H5', 'H6']
   * @param {number} timeoutMinutes - Lock duration in minutes (default: 5)
   * @returns {Promise<boolean>}
   */
  static async lockSeats(showtimeId, userId, sessionId, seats, timeoutMinutes = 5) {
    try {
      // Clean expired locks before attempting to lock
      await this.cleanupExpiredLocks()
      
      const seatsJson = JSON.stringify(seats)
      
      await pool.execute(
        'CALL lock_seats(?, ?, ?, ?, ?)',
        [showtimeId, userId, sessionId, seatsJson, timeoutMinutes]
      )
      
      return true
    } catch (error) {
      if (error.message.includes('already locked')) {
        throw new Error('SEATS_LOCKED')
      }
      throw error
    }
  }

  /**
   * Unlock seats for a showtime
   * @param {number} showtimeId 
   * @param {number|null} userId 
   * @param {string|null} sessionId 
   * @param {string[]} seats 
   * @returns {Promise<boolean>}
   */
  static async unlockSeats(showtimeId, userId, sessionId, seats) {
    const seatsJson = JSON.stringify(seats)
    
    await pool.execute(
      'CALL unlock_seats(?, ?, ?, ?)',
      [showtimeId, userId, sessionId, seatsJson]
    )
    
    return true
  }

  /**
   * Get all locked seats for a showtime
   * @param {number} showtimeId 
   * @returns {Promise<Array>}
   */
  static async getLockedSeats(showtimeId) {
    const [rows] = await pool.execute(
      'CALL get_locked_seats(?)',
      [showtimeId]
    )

    // MySQL stored procedure returns nested array
    return rows[0] || []
  }

  /**
   * Như getLockedSeats nhưng KÈM session_id, để biết khoá nào là của CHÍNH
   * người đang hỏi.
   *
   * Vì sao cần: sơ đồ ghế gộp mọi khoá thành "đã bị chiếm" (đỏ). Khi khách
   * bấm sang bước thanh toán rồi quay lại đổi ghế, chính ghế MÌNH đang giữ
   * cũng hiện đỏ và không bấm lại được — tưởng như người khác vừa cướp mất.
   * Procedure get_locked_seats không trả session_id nên không phân biệt được
   * chủ sở hữu cho khách chưa đăng nhập.
   */
  static async getLockedSeatsWithOwner(showtimeId) {
    await this.cleanupExpiredLocks()
    const [rows] = await pool.execute(
      `SELECT seat_code, user_id, session_id, expires_at,
              TIMESTAMPDIFF(SECOND, NOW(), expires_at) AS seconds_remaining
       FROM seat_locks
       WHERE showtime_id = ? AND expires_at > NOW()`,
      [showtimeId],
    )
    return rows
  }

  /**
   * Check if specific seats are available (not locked and not booked)
   * @param {number} showtimeId 
   * @param {string[]} seats 
   * @returns {Promise<{available: boolean, lockedSeats: string[], bookedSeats: string[]}>}
   */
  static async checkSeatsAvailable(showtimeId, seats, { ignoreUserId = null, ignoreSessionId = null } = {}) {
    // Clean expired locks first - aggressive cleanup
    await this.cleanupExpiredLocks()

    // Check for locked seats (only non-expired).
    //
    // BỎ QUA lock do CHÍNH người đang hỏi giữ (ignoreUserId/ignoreSessionId) —
    // trước đây hàm này không phân biệt chủ sở hữu, nên khách nào đã giữ ghế
    // qua POST /api/seat-locks/lock rồi mới bấm thanh toán sẽ bị CHÍNH LOCK CỦA
    // MÌNH chặn lại với thông báo "ghế không còn trống", dù ghế đó đang là của
    // họ. Stored procedure lock_seats vốn đã cho phép chủ sở hữu khoá lại ghế
    // của mình (idempotent), chỉ có tầng kiểm tra này là chưa khớp.
    // Điều kiện dưới đây sao đúng quy tắc sở hữu của lock_seats: khớp user_id
    // HOẶC session_id, và chỉ khi giá trị đó KHÁC NULL (2 khách vãng lai cùng
    // có user_id NULL không được coi là cùng một người).
    const placeholders = seats.map(() => '?').join(',')
    const ownerParams = []
    let ownerFilter = ''
    if (ignoreUserId != null) {
      ownerFilter += ' AND NOT (user_id IS NOT NULL AND user_id = ?)'
      ownerParams.push(ignoreUserId)
    }
    if (ignoreSessionId != null) {
      ownerFilter += ' AND NOT (session_id IS NOT NULL AND session_id = ?)'
      ownerParams.push(ignoreSessionId)
    }

    const [lockedRows] = await pool.execute(
      `SELECT seat_code FROM seat_locks
       WHERE showtime_id = ? AND seat_code IN (${placeholders}) AND expires_at > NOW()${ownerFilter}`,
      [showtimeId, ...seats, ...ownerParams]
    )
    
    // Check for booked seats using ticket_seats table (indexed, no JSON parsing)
    const [bookedRows] = await pool.execute(
      `SELECT ts.seat_code
       FROM ticket_seats ts
       JOIN tickets t ON ts.ticket_id = t.id
       WHERE ts.showtime_id = ?
         AND t.booking_status IN ('confirmed', 'pending')
         AND ts.seat_code IN (${placeholders})`,
      [showtimeId, ...seats]
    )
    
    const lockedSeats = lockedRows.map(row => row.seat_code)
    const bookedSeats = bookedRows.map(row => row.seat_code).filter(s => s)
    
    return {
      available: lockedSeats.length === 0 && bookedSeats.length === 0,
      lockedSeats,
      bookedSeats
    }
  }

  /**
   * Cleanup all expired seat locks
   * @returns {Promise<number>} Number of deleted rows
   */
  static async cleanupExpiredLocks() {
    try {
      const [result] = await pool.execute(
        'DELETE FROM seat_locks WHERE expires_at <= NOW()'
      )
      return result.affectedRows || 0
    } catch (error) {
      console.error('Error cleaning expired locks:', error)
      return 0
    }
  }

  /**
   * Release all locks for a specific user/session
   * @param {number|null} userId 
   * @param {string|null} sessionId 
   */
  static async releaseUserLocks(userId, sessionId) {
    if (userId) {
      await pool.execute(
        'DELETE FROM seat_locks WHERE user_id = ?',
        [userId]
      )
    }
    if (sessionId) {
      await pool.execute(
        'DELETE FROM seat_locks WHERE session_id = ?',
        [sessionId]
      )
    }
  }

  /**
   * Extend lock expiration for existing locks
   * @param {number} showtimeId 
   * @param {number|null} userId 
   * @param {string|null} sessionId 
   * @param {string[]} seats 
   * @param {number} additionalMinutes 
   */
  static async extendLock(showtimeId, userId, sessionId, seats, additionalMinutes = 5) {
    const placeholders = seats.map(() => '?').join(',')
    
    let query = `UPDATE seat_locks 
                 SET expires_at = DATE_ADD(expires_at, INTERVAL ? MINUTE)
                 WHERE showtime_id = ? AND seat_code IN (${placeholders})`
    const params = [additionalMinutes, showtimeId, ...seats]
    
    if (userId) {
      query += ' AND user_id = ?'
      params.push(userId)
    }
    if (sessionId) {
      query += ' AND session_id = ?'
      params.push(sessionId)
    }
    
    await pool.execute(query, params)
  }
}

module.exports = SeatLock
