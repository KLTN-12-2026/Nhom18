const { pool } = require("../config/database")

// Rạp bị admin "tạm đóng" (cinemas.status = 'INACTIVE') KHÔNG được xuất hiện
// trong bất kỳ danh sách suất chiếu nào mà NGƯỜI DÙNG duyệt/đặt vé (theo
// phim, theo ngày, "đang chiếu hôm nay"...) — nếu không, khách vẫn thấy và
// đặt được vé bình thường dù rạp đã đóng, vô hiệu hoá hoàn toàn tính năng
// tạm đóng rạp của admin. CHỈ áp dụng cho các hàm PHỤC VỤ NGƯỜI DÙNG DUYỆT
// (findByMovie/findByDate/findTodayLive/search/findNextAvailableByDate) —
// KHÔNG áp dụng cho findAll()/getAllWithBookingStats() (trang quản lý admin
// cần thấy TẤT CẢ, kể cả suất chiếu ở rạp đã đóng, để còn quản lý/xoá) và
// KHÔNG áp dụng cho findById() (dùng để tra cứu vé ĐÃ ĐẶT trước khi rạp đóng
// — ẩn đi sẽ khiến khách không xem lại được vé cũ của mình).
const ACTIVE_CINEMA_FILTER = "(c.status IS NULL OR c.status != 'INACTIVE')"

// Suất bị HUỶ VÌ SỰ CỐ (showtimes.status = 'CANCELLED', xem migration 44 và
// showtimeIncident.service.js) cũng phải biến mất khỏi mọi danh sách khách
// duyệt — cùng phạm vi áp dụng với ACTIVE_CINEMA_FILTER ở trên (findById vẫn
// trả về để khách xem lại vé đã được hoàn tiền của mình).
const ACTIVE_SHOWTIME_FILTER = "s.status = 'ACTIVE'"
const ACTIVE_FILTER = `${ACTIVE_CINEMA_FILTER} AND ${ACTIVE_SHOWTIME_FILTER}`
/** Bộ lọc trên cho truy vấn con dùng bí danh khác (vd s2/c2). */
const activeFilterFor = (sAlias, cAlias) =>
  `(${cAlias}.status IS NULL OR ${cAlias}.status != 'INACTIVE') AND ${sAlias}.status = 'ACTIVE'`

class Showtime {
  static async create(showtimeData) {
    const { movie_id, cinema_id, room_id, show_date, show_time, price, total_seats } = showtimeData

    const [result] = await pool.execute(
      "INSERT INTO showtimes (movie_id, cinema_id, room_id, show_date, show_time, price, total_seats, available_seats, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())",
      [movie_id, cinema_id, room_id || null, show_date, show_time, price, total_seats, total_seats],
    )

    return result.insertId
  }

  static async findAll() {
    // Use LEFT JOIN so a showtime row is returned even if related movie/cinema/room rows are missing
    const [rows] = await pool.execute(`
        SELECT s.*,
          DATE_FORMAT(s.show_date, '%Y-%m-%d') as show_date,
          TIME_FORMAT(s.show_time, '%H:%i:%s') as show_time,
             m.title as movie_title, m.poster_url, m.duration,
             c.name as cinema_name, c.location,
             r.room_name, r.room_type, r.features as room_features
      FROM showtimes s 
      LEFT JOIN movies m ON s.movie_id = m.id 
      LEFT JOIN cinemas c ON s.cinema_id = c.id 
      LEFT JOIN rooms r ON s.room_id = r.id
      ORDER BY s.show_date, s.show_time
    `)
    return rows.map(row => ({
      ...row,
      room_features: row.room_features ? JSON.parse(row.room_features) : []
    }))
  }

  static async findById(id) {
    // LEFT JOIN to avoid losing the showtime row if movie, cinema or room is missing
    const [rows] = await pool.execute(
      `
        SELECT s.*,
          DATE_FORMAT(s.show_date, '%Y-%m-%d') as show_date,
          TIME_FORMAT(s.show_time, '%H:%i:%s') as show_time,
             m.title as movie_title, m.poster_url, m.duration,
             m.genre, m.rating, m.description, m.release_date, m.status as movie_status,
             m.director, m.cast as movie_cast, m.studio, m.language,
             c.name as cinema_name, c.location, c.status as cinema_status,
             r.room_name, r.room_type, r.total_seats as room_capacity, r.features as room_features
      FROM showtimes s
      LEFT JOIN movies m ON s.movie_id = m.id
      LEFT JOIN cinemas c ON s.cinema_id = c.id
      LEFT JOIN rooms r ON s.room_id = r.id
      WHERE s.id = ?
    `,
      [id],
    )
    if (rows.length === 0) return null
    
    const showtime = rows[0]
    return {
      ...showtime,
      room_features: showtime.room_features ? JSON.parse(showtime.room_features) : []
    }
  }

  static async findByMovie(movieId) {
    const [rows] = await pool.execute(
      `
        SELECT s.*,
          DATE_FORMAT(s.show_date, '%Y-%m-%d') as show_date,
          TIME_FORMAT(s.show_time, '%H:%i:%s') as show_time,
             c.name as cinema_name, c.location,
             r.room_name, r.room_type, r.features as room_features
      FROM showtimes s
      LEFT JOIN cinemas c ON s.cinema_id = c.id
      LEFT JOIN rooms r ON s.room_id = r.id
      WHERE s.movie_id = ?
        AND s.show_date >= CURDATE()
        AND ${ACTIVE_FILTER}
      ORDER BY s.show_date, s.show_time
    `,
      [movieId],
    )
    return rows.map(row => ({
      ...row,
      room_features: row.room_features ? JSON.parse(row.room_features) : []
    }))
  }

  static async findByDate(date, cinemaId = null) {
    const cinemaFilter = cinemaId ? 'AND s.cinema_id = ?' : ''
    const params = cinemaId ? [date, cinemaId] : [date]
    
    const [rows] = await pool.execute(
      `
        SELECT s.*,
          DATE_FORMAT(s.show_date, '%Y-%m-%d') as show_date,
          TIME_FORMAT(s.show_time, '%H:%i:%s') as show_time,
          m.title as movie_title, m.poster_url, m.duration, m.genre, m.rating,
             c.name as cinema_name, c.location as cinema_location,
             r.room_name, r.room_type, r.features as room_features
      FROM showtimes s
      LEFT JOIN movies m ON s.movie_id = m.id
      LEFT JOIN cinemas c ON s.cinema_id = c.id
      LEFT JOIN rooms r ON s.room_id = r.id
      WHERE s.show_date = ? ${cinemaFilter}
        AND ${ACTIVE_FILTER}
      ORDER BY s.show_time, m.title
    `,
      params,
    )
    return rows.map(row => ({
      ...row,
      room_features: row.room_features ? JSON.parse(row.room_features) : []
    }))
  }

  static async search({ movieTitle, date, limit = 20 } = {}) {
    const params = []
    let where = `WHERE ${ACTIVE_FILTER}`
    if (movieTitle) { where += " AND m.title LIKE ?"; params.push(`%${movieTitle}%`) }
    if (date) { where += " AND s.show_date = ?"; params.push(date) }
    params.push(limit)

    const [rows] = await pool.query(
      `SELECT s.id, m.title, c.name AS cinema, s.show_date, s.show_time
       FROM showtimes s
       JOIN movies m ON s.movie_id = m.id
       JOIN cinemas c ON s.cinema_id = c.id
       ${where}
       ORDER BY s.show_date, s.show_time
       LIMIT ?`,
      params,
    )
    return rows
  }

  static async findNextAvailableByDate(date, cinemaId = null) {
    const nextDateFilter = cinemaId ? 'AND s.cinema_id = ?' : ''
    const nextDateParams = cinemaId ? [date, cinemaId] : [date]

    // PHẢI join cinemas + lọc rạp đang hoạt động ở đây — nếu không, có thể
    // chọn nhầm 1 ngày mà suất chiếu DUY NHẤT thuộc rạp đã tạm đóng, rồi gọi
    // findByDate() (đã lọc rạp đóng) cho ngày đó lại trả về RỖNG một cách
    // khó hiểu, dù thực ra còn ngày khác có suất chiếu ở rạp đang mở.
    const [nextRows] = await pool.execute(
      `
      SELECT MIN(s.show_date) as next_date
      FROM showtimes s
      LEFT JOIN cinemas c ON s.cinema_id = c.id
      WHERE s.show_date >= ? ${nextDateFilter} AND ${ACTIVE_FILTER}
    `,
      nextDateParams,
    )

    const nextDate = nextRows?.[0]?.next_date
    if (!nextDate) {
      return []
    }

    return this.findByDate(nextDate, cinemaId)
  }

  static async findTodayLive(limit = 8) {
    const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(Number(limit), 1), 20) : 8

    // Rạp đã tạm đóng KHÔNG được tính vào "còn suất chiếu hôm nay" — nếu
    // không, widget "đang chiếu hôm nay" có thể chọn nhầm 1 ngày/phim mà suất
    // chiếu duy nhất thuộc rạp đã đóng, dẫn khách tới 1 suất không đặt được.
    const activeCinemaExists = (extraWhere) =>
      `EXISTS(SELECT 1 FROM showtimes s2 LEFT JOIN cinemas c2 ON s2.cinema_id = c2.id WHERE ${activeFilterFor("s2", "c2")} AND ${extraWhere})`

    // Prefer today if there are still upcoming showtimes; otherwise fall back to the next date
    const [targetRows] = await pool.query(`
      SELECT
        COALESCE(
          IF(
            ${activeCinemaExists("s2.show_date = CURDATE() AND s2.show_time > CURTIME()")},
            CURDATE(),
            NULL
          ),
          (SELECT MIN(s2.show_date) FROM showtimes s2 LEFT JOIN cinemas c2 ON s2.cinema_id = c2.id WHERE s2.show_date > CURDATE() AND ${activeFilterFor("s2", "c2")})
        ) as target_date,
        ${activeCinemaExists("s2.show_date = CURDATE() AND s2.show_time > CURTIME()")} as has_today_upcoming
    `)

    const targetDate = targetRows?.[0]?.target_date
    if (!targetDate) {
      return []
    }

    // Only filter by current time when the target date is today
    const isToday = Number(targetRows?.[0]?.has_today_upcoming) > 0
    // Inner subquery uses alias `s3`, outer query uses alias `s`
    const innerTimeCondition = isToday ? 'AND s3.show_time > CURTIME()' : ''
    const outerTimeCondition = isToday ? 'AND s.show_time > CURTIME()' : ''

    const [rows] = await pool.execute(
      `
      SELECT
        s.id,
        s.movie_id,
        DATE_FORMAT(s.show_date, '%Y-%m-%d') as show_date,
        TIME_FORMAT(s.show_time, '%H:%i') as show_time,
        s.price,
        s.available_seats,
        m.title as movie_title,
        m.poster_url,
        m.rating,
        m.genre,
        m.duration,
        c.name as cinema_name,
        c.location
      FROM showtimes s
      INNER JOIN (
        SELECT s3.movie_id, MIN(s3.show_time) as first_show_time
        FROM showtimes s3
        LEFT JOIN cinemas c3 ON s3.cinema_id = c3.id
        WHERE s3.show_date = ? ${innerTimeCondition}
          AND ${activeFilterFor("s3", "c3")}
        GROUP BY s3.movie_id
      ) t ON t.movie_id = s.movie_id AND t.first_show_time = s.show_time
      LEFT JOIN movies m ON s.movie_id = m.id
      LEFT JOIN cinemas c ON s.cinema_id = c.id
      WHERE s.show_date = ? ${outerTimeCondition} AND ${ACTIVE_FILTER}
      ORDER BY s.show_time ASC, COALESCE(m.popularity_score, 0) DESC
      LIMIT ${safeLimit}
    `,
      [targetDate, targetDate],
    )

    return rows
  }

  static async update(id, showtimeData) {
    const { movie_id, cinema_id, room_id, show_date, show_time, price, total_seats } = showtimeData

    const [result] = await pool.execute(
      "UPDATE showtimes SET movie_id = ?, cinema_id = ?, room_id = ?, show_date = ?, show_time = ?, price = ?, total_seats = ? WHERE id = ?",
      [movie_id, cinema_id, room_id || null, show_date, show_time, price, total_seats, id],
    )

    return result.affectedRows > 0
  }

  static async delete(id) {
    const [result] = await pool.execute("DELETE FROM showtimes WHERE id = ?", [id])
    return result.affectedRows > 0
  }

  static async hasTickets(id) {
    const [[{ count }]] = await pool.query("SELECT COUNT(*) as count FROM tickets WHERE showtime_id = ?", [id])
    return count > 0
  }

  /**
   * @param {number|null} cinemaId - giới hạn theo 1 rạp (dùng cho quản lý chi
   *   nhánh). null = toàn hệ thống (admin).
   */
  /**
   * @param {number|null} cinemaId
   * @param {{ from?: string, to?: string }} [khoang] - lọc theo khoảng ngày.
   *   Trang quản lý mặc định chỉ cần suất GẦN ĐÂY: lấy hết 4.700+ suất lịch sử
   *   khiến mỗi lần mở trang tải về ~2MB JSON, chậm thấy rõ. Muốn xem suất cũ
   *   thì truyền `from` lùi lại hoặc bỏ trống để lấy tất cả.
   */
  static async getAllWithBookingStats(cinemaId = null, khoang = {}) {
    // tickets_sold PHẢI là số GHẾ đã bán, không phải số VÉ (booking) — 1 vé có
    // thể gồm nhiều ghế (t.id đếm theo booking, không theo ghế). Trước đây
    // dùng COUNT(t.id) khiến 1 phòng 100 ghế với 30 lượt đặt x 3 ghế/lượt
    // (= 90 ghế, gần kín) hiện sai thành "30%" và badge "Còn vé" màu xanh,
    // che mất việc suất chiếu gần như đã hết ghế. available_seats/total_seats
    // đã được duy trì chính xác theo GHẾ xuyên suốt luồng đặt vé/huỷ vé, nên
    // suy ra trực tiếp từ đó thay vì đếm lại qua bảng tickets.
    const dieuKien = []
    const thamSo = []
    if (cinemaId) {
      dieuKien.push("s.cinema_id = ?")
      thamSo.push(cinemaId)
    }
    if (khoang.from) {
      dieuKien.push("s.show_date >= ?")
      thamSo.push(khoang.from)
    }
    if (khoang.to) {
      dieuKien.push("s.show_date <= ?")
      thamSo.push(khoang.to)
    }

    const [rows] = await pool.query(
      // room_id/room_name và m.duration phục vụ chế độ xem DÒNG THỜI GIAN ở
      // trang quản lý suất chiếu: mỗi phòng là một hàng, độ rộng khối vẽ theo
      // thời lượng phim thật. Thiếu hai trường này thì chỉ liệt kê được chữ.
      `SELECT s.id, s.movie_id, s.cinema_id, s.room_id,
              m.title as movie_title, m.duration,
              c.name as cinema_name, r.room_name, r.room_type,
              s.show_date, s.show_time, s.price,
              (s.total_seats - s.available_seats) as tickets_sold,
              s.total_seats, s.available_seats, s.status
       FROM showtimes s
       JOIN movies m ON s.movie_id = m.id
       JOIN cinemas c ON s.cinema_id = c.id
       LEFT JOIN rooms r ON r.id = s.room_id
       ${dieuKien.length ? "WHERE " + dieuKien.join(" AND ") : ""}
       ORDER BY s.show_date DESC, s.show_time DESC`,
      thamSo,
    )
    return rows
  }

  static async updateAvailableSeats(id, seatsToBook) {
    const [result] = await pool.execute(
      "UPDATE showtimes SET available_seats = available_seats - ? WHERE id = ? AND available_seats >= ?",
      [seatsToBook, id, seatsToBook],
    )
    return result.affectedRows > 0
  }

  /** Đặt thẳng available_seats — chỉ dùng khi chắc chắn suất chiếu CHƯA có vé nào (xem adminController.updateShowtime). */
  static async setAvailableSeats(id, seats) {
    const [result] = await pool.execute("UPDATE showtimes SET available_seats = ? WHERE id = ?", [seats, id])
    return result.affectedRows > 0
  }

  static async incrementAvailableSeats(id, seatsToFree) {
    const [result] = await pool.execute(
      "UPDATE showtimes SET available_seats = LEAST(total_seats, available_seats + ?) WHERE id = ?",
      [seatsToFree, id],
    )
    return result.affectedRows > 0
  }

  /**
   * Get all booked seat codes for a specific showtime.
   * Uses ticket_seats table (indexed) instead of JSON parsing.
   * @param {number} showtimeId
   * @returns {Promise<string[]>}
   */
  static async getBookedSeats(showtimeId) {
    try {
      const [rows] = await pool.execute(
        `SELECT ts.seat_code
         FROM ticket_seats ts
         JOIN tickets t ON ts.ticket_id = t.id
         WHERE ts.showtime_id = ?
           AND t.booking_status IN ('confirmed', 'pending')`,
        [showtimeId]
      )
      return rows.map((r) => r.seat_code)
    } catch (error) {
      console.error("Error getting booked seats:", error)
      return []
    }
  }
}

module.exports = Showtime
