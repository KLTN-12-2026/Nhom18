const { pool } = require("../config/database")

class Movie {
  // Các cột cho phép NULL trong bảng movies — form admin không gửi hết mọi
  // trường, nên phải quy undefined về null trước khi đưa xuống mysql2 (driver
  // NÉM LỖI với undefined: "Bind parameters must not contain undefined").
  static #orNull(v) {
    return v === undefined || v === "" ? null : v
  }

  static async create(movieData) {
    const { title, genre, rating, duration, poster_url, trailer_url, description, release_date, original_year, status, director, cast, studio, language } = movieData

    const [result] = await pool.execute(
      `INSERT INTO movies (
        title, genre, rating, duration, poster_url, trailer_url, description, release_date,
        original_year, status, director, cast, studio, language, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        title, genre, rating, duration,
        // Form "Thêm phim" ở admin chỉ gửi 9 trường (title/genre/rating/
        // duration/poster_url/trailer_url/description/release_date/status) —
        // 4 trường còn lại (director/cast/studio/language) không có trong form.
        // Trước đây truyền thẳng undefined xuống nên MỌI lần thêm phim đều lỗi
        // 500 "Bind parameters must not contain undefined" — tính năng thêm
        // phim hỏng hoàn toàn, không phải thỉnh thoảng.
        Movie.#orNull(poster_url), Movie.#orNull(trailer_url), Movie.#orNull(description),
        Movie.#orNull(release_date), Movie.#orNull(original_year), status || 'NOW_SHOWING',
        Movie.#orNull(director), Movie.#orNull(cast), Movie.#orNull(studio), Movie.#orNull(language),
      ],
    )

    return result.insertId
  }

  static async findAll(filters = {}) {
    let query = "SELECT * FROM movies"
    const params = []
    const conditions = []

    // Filter by status
    if (filters.status) {
      conditions.push("status = ?")
      params.push(filters.status)
    }

    // Filter by genre
    if (filters.genre) {
      conditions.push("genre = ?")
      params.push(filters.genre)
    }

    // Search by title
    if (filters.search) {
      conditions.push("(title LIKE ? OR description LIKE ?)")
      params.push(`%${filters.search}%`, `%${filters.search}%`)
    }

    if (conditions.length > 0) {
      query += " WHERE " + conditions.join(" AND ")
    }

    // Order by — whitelist column/direction since these come straight from
    // req.query on a public endpoint; never interpolate user input into SQL.
    const ORDERABLE_COLUMNS = new Set([
      "popularity_score", "title", "release_date", "average_rating", "created_at", "duration",
    ])
    const orderBy = ORDERABLE_COLUMNS.has(filters.orderBy) ? filters.orderBy : "popularity_score"
    const orderDir = filters.orderDir?.toUpperCase() === "ASC" ? "ASC" : "DESC"
    // Tiêu chí phụ cố định: nhiều phim bằng điểm (chưa bán vé nào) thì thứ tự
    // phải ổn định, không để MySQL trả ngẫu nhiên mỗi lần tải trang.
    query += ` ORDER BY ${orderBy} ${orderDir}, average_rating DESC, release_date DESC, id DESC`

    const [rows] = await pool.execute(query, params)
    return rows
  }

  static async searchBasic(query, limit = 10) {
    const [rows] = await pool.query(
      `SELECT id, title, poster_url, rating, duration FROM movies WHERE title LIKE ? ORDER BY title ASC LIMIT ?`,
      [`%${query}%`, limit],
    )
    return rows
  }

  static async findByStatus(status) {
    const [rows] = await pool.execute(
      `SELECT * FROM movies 
       WHERE status = ? 
       ORDER BY popularity_score DESC, release_date DESC`,
      [status]
    )
    return rows
  }

  static async findById(id) {
    const [rows] = await pool.execute(
      `SELECT m.*, 
        COALESCE(COUNT(DISTINCT t.id), 0) as booking_count,
        COALESCE(COUNT(DISTINCT r.id), 0) as review_count
       FROM movies m
       LEFT JOIN showtimes st ON m.id = st.movie_id
       LEFT JOIN tickets t ON st.id = t.showtime_id AND t.booking_status = 'confirmed'
       LEFT JOIN movie_reviews r ON m.id = r.movie_id
       WHERE m.id = ?
       GROUP BY m.id`,
      [id]
    )
    return rows[0]
  }

  /**
   * Cập nhật MỘT PHẦN — chỉ ghi đúng những cột CÓ MẶT trong movieData.
   *
   * Trước đây hàm này luôn ghi đè cả 13 cột bằng giá trị lấy từ payload, gây 2
   * lỗi nghiêm trọng cùng lúc:
   *  1. Form sửa phim ở admin không gửi director/cast/studio/language → 4 giá
   *     trị undefined → mysql2 ném lỗi → MỌI lần bấm "Lưu" đều 500. Tính năng
   *     sửa phim hỏng hoàn toàn.
   *  2. Nếu chỉ "vá" bằng cách đổi undefined thành null thì còn tệ hơn: mỗi lần
   *     sửa 1 phim (dù chỉ đổi mô tả) sẽ XOÁ TRẮNG đạo diễn/diễn viên/studio/
   *     ngôn ngữ của phim đó. Dữ liệu thật đang có: 28 phim có đạo diễn, 26 phim
   *     có diễn viên — tức là sửa vài phim là mất sạch, không khôi phục được.
   *
   * Dùng đúng mẫu cập nhật một phần đã có sẵn ở Voucher.update().
   */
  static async update(id, movieData) {
    const settable = [
      "title", "genre", "rating", "duration", "poster_url", "trailer_url",
      "description", "release_date", "original_year", "status", "director", "cast", "studio", "language",
    ]
    // Cột cho phép NULL: chuỗi rỗng từ form được hiểu là "xoá giá trị này".
    const nullable = new Set([
      "poster_url", "trailer_url", "description", "release_date", "original_year",
      "director", "cast", "studio", "language",
    ])

    const fields = []
    const params = []
    for (const key of settable) {
      if (movieData[key] === undefined) continue // không gửi = không đụng tới
      fields.push(`${key} = ?`)
      params.push(nullable.has(key) ? Movie.#orNull(movieData[key]) : movieData[key])
    }
    if (!fields.length) return false

    params.push(id)
    const [result] = await pool.execute(
      `UPDATE movies SET ${fields.join(", ")} WHERE id = ?`,
      params,
    )

    return result.affectedRows > 0
  }

  // Tính lại popularity_score + total_bookings TỪ DỮ LIỆU THẬT, cùng công thức
  // với chatbot (popularityJoinSql): vé×3 + lượt yêu thích×2 + điểm TB×số lượt
  // đánh giá. Công thức cũ lấy CAST(m.rating) — nhưng rating là NHÃN TUỔI
  // ("T13"), luôn ra 0 — và không ai gọi hàm này, nên 2 cột đứng yên ở số cũ
  // (40/41 phim = 0, 1 phim sót 2.00) trong khi trang chủ xếp "Phổ biến" theo đó.
  static async updatePopularityScore(id) {
    return Movie.recomputeAllPopularity(id)
  }

  /** @param {number|null} id - null = tính lại cho mọi phim */
  static async recomputeAllPopularity(id = null) {
    const [result] = await pool.execute(
      `UPDATE movies m
       LEFT JOIN (
         SELECT s.movie_id, COUNT(t.id) AS ticket_count
         FROM showtimes s JOIN tickets t ON t.showtime_id = s.id
         WHERE t.booking_status = 'confirmed'
         GROUP BY s.movie_id
       ) tc ON tc.movie_id = m.id
       LEFT JOIN (
         SELECT movie_id, COUNT(*) AS favorite_count FROM favorites GROUP BY movie_id
       ) fc ON fc.movie_id = m.id
       SET m.total_bookings = COALESCE(tc.ticket_count, 0),
           m.popularity_score = COALESCE(tc.ticket_count, 0) * 3
             + COALESCE(fc.favorite_count, 0) * 2
             + COALESCE(m.average_rating, 0) * COALESCE(m.rating_count, 0)
       ${id ? "WHERE m.id = ?" : ""}`,
      id ? [id] : [],
    )
    return result.changedRows
  }

  static async getPopularMovies(limit = 10) {
    const [rows] = await pool.query(
      `SELECT * FROM movies
       WHERE status = 'NOW_SHOWING'
       ORDER BY popularity_score DESC, rating DESC
       LIMIT ?`,
      [limit]
    )
    return rows
  }

  // showtimes.movie_id và tickets.showtime_id đều ON DELETE CASCADE — xoá cứng
  // 1 phim có vé đã bán sẽ xoá theo LUÔN toàn bộ lịch sử vé/doanh thu của phim
  // đó vĩnh viễn, không cách nào khôi phục. Dùng trước khi delete() để quyết
  // định chặn hay cho xoá (cùng nguyên tắc đã áp dụng cho Cinema.hasUsage).
  static async hasTicketHistory(id) {
    const [[{ ticketCount }]] = await pool.execute(
      `SELECT COUNT(*) as ticketCount FROM tickets t
       JOIN showtimes s ON t.showtime_id = s.id
       WHERE s.movie_id = ?`,
      [id],
    )
    return ticketCount > 0
  }

  static async delete(id) {
    const [result] = await pool.execute("DELETE FROM movies WHERE id = ?", [id])
    return result.affectedRows > 0
  }

  static async getStats(sinceDate) {
    // sinceDate: 'YYYY-MM-DD' - returns total movies and new movies since date
    const [[{ totalMovies }]] = await pool.query('SELECT COUNT(*) as totalMovies FROM movies')
    const [[{ newMoviesThisMonth }]] = await pool.query('SELECT COUNT(*) as newMoviesThisMonth FROM movies WHERE DATE(created_at) >= ?', [sinceDate])
    return { totalMovies, newMoviesThisMonth }
  }
}

module.exports = Movie
