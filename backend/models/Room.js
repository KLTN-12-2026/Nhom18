const { pool } = require("../config/database")

class Room {
  /**
   * Create a new room
   */
  static async create(roomData) {
    const { cinema_id, room_name, total_seats, room_type, features, is_active } = roomData

    try {
      const [result] = await pool.execute(
        `INSERT INTO rooms (cinema_id, room_name, total_seats, room_type, features, is_active, created_at) 
         VALUES (?, ?, ?, ?, ?, ?, NOW())`,
        [
          cinema_id,
          room_name,
          total_seats || 100,
          room_type || 'standard',
          features ? JSON.stringify(features) : null,
          is_active !== undefined ? is_active : true
        ]
      )

      return result.insertId
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') {
        throw new Error(`Phòng ${room_name} đã tồn tại trong rạp này`)
      }
      throw error
    }
  }

  /**
   * Get all rooms — KỂ CẢ phòng đã ngừng hoạt động.
   *
   * Trước đây có `WHERE r.is_active = TRUE`, mà GET /api/rooms lại là nguồn dữ
   * liệu DUY NHẤT của trang quản lý phòng chiếu. Hậu quả: admin tắt 1 phòng
   * (hoặc bấm xoá — vốn là xoá mềm) thì phòng đó BIẾN MẤT khỏi đúng màn hình
   * duy nhất có thể bật lại, tức là thao tác "ngừng hoạt động" không thể hoàn
   * tác dù hộp thoại có ghi "Bạn có thể bật lại bất cứ lúc nào". Ngoài ra ô
   * thống kê "Đang hoạt động" luôn bằng tổng số phòng vì danh sách đã lọc sẵn.
   * Endpoint này chỉ được trang admin dùng (đã kiểm tra toàn frontend), nên
   * trả về tất cả là đúng — trang tự hiển thị trạng thái từng phòng.
   */
  static async findAll() {
    const [rows] = await pool.execute(`
      SELECT r.*, c.name as cinema_name, c.location as cinema_location
      FROM rooms r
      LEFT JOIN cinemas c ON r.cinema_id = c.id
      ORDER BY c.name, r.room_name
    `)
    
    return rows.map(row => ({
      ...row,
      features: row.features ? JSON.parse(row.features) : []
    }))
  }

  /**
   * Get room by ID
   */
  static async findById(id) {
    const [rows] = await pool.execute(
      `SELECT r.*, c.name as cinema_name, c.location as cinema_location
       FROM rooms r
       LEFT JOIN cinemas c ON r.cinema_id = c.id
       WHERE r.id = ?`,
      [id]
    )

    if (rows.length === 0) return null

    const room = rows[0]
    return {
      ...room,
      features: room.features ? JSON.parse(room.features) : []
    }
  }

  /**
   * Get all rooms for a specific cinema
   */
  static async findByCinema(cinemaId) {
    const [rows] = await pool.execute(
      `SELECT * FROM rooms 
       WHERE cinema_id = ? AND is_active = TRUE
       ORDER BY room_name`,
      [cinemaId]
    )

    return rows.map(row => ({
      ...row,
      features: row.features ? JSON.parse(row.features) : []
    }))
  }

  /**
   * Get rooms by type
   */
  static async findByType(roomType) {
    const [rows] = await pool.execute(
      `SELECT r.*, c.name as cinema_name, c.location as cinema_location
       FROM rooms r
       LEFT JOIN cinemas c ON r.cinema_id = c.id
       WHERE r.room_type = ? AND r.is_active = TRUE
       ORDER BY c.name, r.room_name`,
      [roomType]
    )

    return rows.map(row => ({
      ...row,
      features: row.features ? JSON.parse(row.features) : []
    }))
  }

  /**
   * Update room
   */
  static async update(id, roomData) {
    const { room_name, total_seats, room_type, features, is_active } = roomData

    const updates = []
    const values = []

    if (room_name !== undefined) {
      updates.push('room_name = ?')
      values.push(room_name)
    }
    if (total_seats !== undefined) {
      updates.push('total_seats = ?')
      values.push(total_seats)
    }
    if (room_type !== undefined) {
      updates.push('room_type = ?')
      values.push(room_type)
    }
    if (features !== undefined) {
      updates.push('features = ?')
      values.push(JSON.stringify(features))
    }
    if (is_active !== undefined) {
      updates.push('is_active = ?')
      values.push(is_active)
    }

    if (updates.length === 0) {
      return false
    }

    values.push(id)

    const [result] = await pool.execute(
      `UPDATE rooms SET ${updates.join(', ')} WHERE id = ?`,
      values
    )

    return result.affectedRows > 0
  }

  /**
   * Delete (soft delete) room
   */
  static async delete(id) {
    const [result] = await pool.execute(
      'UPDATE rooms SET is_active = FALSE WHERE id = ?',
      [id]
    )
    return result.affectedRows > 0
  }

  /**
   * Hard delete room
   */
  static async hardDelete(id) {
    const [result] = await pool.execute('DELETE FROM rooms WHERE id = ?', [id])
    return result.affectedRows > 0
  }

  /**
   * Check if room is available for a specific time slot
   */
  static async isAvailable(roomId, showDate, showTime, excludeShowtimeId = null) {
    let query = `
      SELECT COUNT(*) as count 
      FROM showtimes 
      WHERE room_id = ? 
        AND show_date = ? 
        AND show_time = ?
    `
    const params = [roomId, showDate, showTime]

    if (excludeShowtimeId) {
      query += ' AND id != ?'
      params.push(excludeShowtimeId)
    }

    const [rows] = await pool.execute(query, params)
    return rows[0].count === 0
  }

  /**
   * Get room schedule for a specific date
   */
  static async getSchedule(roomId, date) {
    const [rows] = await pool.execute(
      `SELECT s.*, m.title as movie_title, m.duration, m.poster_url
       FROM showtimes s
       LEFT JOIN movies m ON s.movie_id = m.id
       WHERE s.room_id = ? AND s.show_date = ?
       ORDER BY s.show_time`,
      [roomId, date]
    )
    return rows
  }

  /**
   * Get available rooms for a cinema at a specific date/time
   */
  static async getAvailableRooms(cinemaId, showDate, showTime) {
    const [rows] = await pool.execute(
      `SELECT r.* 
       FROM rooms r
       WHERE r.cinema_id = ? 
         AND r.is_active = TRUE
         AND r.id NOT IN (
           SELECT room_id 
           FROM showtimes 
           WHERE show_date = ? 
             AND show_time = ?
             AND room_id IS NOT NULL
         )
       ORDER BY r.room_name`,
      [cinemaId, showDate, showTime]
    )

    return rows.map(row => ({
      ...row,
      features: row.features ? JSON.parse(row.features) : []
    }))
  }

  /**
   * Get room statistics
   */
  static async getStatistics(roomId, startDate, endDate) {
    const [rows] = await pool.execute(
      `SELECT 
         COUNT(s.id) as total_showtimes,
         SUM(s.total_seats - s.available_seats) as total_tickets_sold,
         SUM(s.total_seats) as total_capacity,
         ROUND(SUM(s.total_seats - s.available_seats) * 100.0 / SUM(s.total_seats), 2) as occupancy_rate
       FROM showtimes s
       WHERE s.room_id = ?
         AND s.show_date BETWEEN ? AND ?`,
      [roomId, startDate, endDate]
    )

    return rows[0]
  }
}

module.exports = Room
