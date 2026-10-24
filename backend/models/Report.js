const { pool } = require("../config/database")
const { parseLocalDateString, formatLocalDateString } = require("../utils/dateUtils")

class Report {
  static async getSummary(from, to, cinemaId = null) {
    const cinemaFilter = cinemaId ? "AND s.cinema_id = ?" : ""
    const cinemaParams = cinemaId ? [cinemaId] : []

    const [[{ revenue }]] = await pool.query(
      `SELECT COALESCE(SUM(t.total_amount),0) AS revenue
       FROM tickets t
       JOIN showtimes s ON t.showtime_id = s.id
       WHERE t.payment_status = 'paid' AND COALESCE(t.paid_at, t.created_at) BETWEEN ? AND ? ${cinemaFilter}`,
      [from, to, ...cinemaParams],
    )

    const [[{ tickets }]] = await pool.query(
      `SELECT COUNT(*) AS tickets
       FROM tickets t
       JOIN showtimes s ON t.showtime_id = s.id
       WHERE t.payment_status = 'paid' AND COALESCE(t.paid_at, t.created_at) BETWEEN ? AND ? ${cinemaFilter}`,
      [from, to, ...cinemaParams],
    )

    const [[{ new_users }]] = await pool.query(
      `SELECT COUNT(*) AS new_users FROM users WHERE created_at BETWEEN ? AND ?`,
      [from, to],
    )

    const [[{ showtimes }]] = await pool.query(
      `SELECT COUNT(*) AS showtimes FROM showtimes
       WHERE CONCAT(show_date,' ',show_time) BETWEEN ? AND ? ${cinemaId ? "AND cinema_id = ?" : ""}`,
      cinemaId ? [from, to, cinemaId] : [from, to],
    )

    return { revenue, tickets, new_users, showtimes }
  }

  // 1 điều PHẢI xử lý (điều thứ 2 dưới đây — điều "thứ 1" cũ về CONVERT_TZ đã
  // BỊ THÁO BỎ, xem giải thích chi tiết ở Ticket.getDashboardStats(): kiểm
  // chứng trực tiếp trên DB thật cho thấy MySQL server chạy time_zone=SYSTEM
  // với hệ điều hành đặt sẵn giờ VN, nên paid_at/created_at đã LÀ giờ VN sẵn,
  // không phải UTC — CONVERT_TZ '+00:00'→'+07:00' cộng dư thêm 7 tiếng, đẩy
  // sai ngày cho mọi giao dịch từ ~17h VN trở đi mỗi ngày):
  //   2. Query GROUP BY chỉ trả về NHỮNG NGÀY THỰC SỰ CÓ giao dịch — nếu để
  //      nguyên, chọn "90 ngày qua" mà chỉ có 9 ngày có giao dịch thì biểu đồ
  //      chỉ vẽ đúng 9 điểm dữ liệu, bị trục thời gian coi là CÁCH ĐỀU NHAU
  //      (Recharts categorical axis) dù khoảng cách thời gian thật giữa các
  //      điểm rất khác nhau — biến dạng hoàn toàn hình dạng xu hướng thật.
  //      Đồng thời các số liệu "trung bình/ngày" tính trên daily.length cũng
  //      bị thổi phồng do chia cho số ngày có giao dịch thay vì cả khoảng
  //      ngày đã chọn. Zero-fill đủ ngày trong [from, to] (giới hạn 366 ngày
  //      để tránh payload khổng lồ nếu admin chọn khoảng ngày tuỳ ý quá dài).
  static async getDailyRevenue(from, to, cinemaId = null) {
    const cinemaFilter = cinemaId ? "AND s.cinema_id = ?" : ""
    const cinemaParams = cinemaId ? [cinemaId] : []

    const [rows] = await pool.query(
      `SELECT DATE(COALESCE(t.paid_at, t.created_at)) AS day,
              SUM(t.total_amount) AS revenue,
              COUNT(*) AS tickets
       FROM tickets t
       JOIN showtimes s ON t.showtime_id = s.id
       WHERE t.payment_status = 'paid' AND COALESCE(t.paid_at, t.created_at) BETWEEN ? AND ? ${cinemaFilter}
       GROUP BY day
       ORDER BY day ASC`,
      [from, to, ...cinemaParams],
    )

    const byDate = new Map(rows.map((r) => [r.day, r]))
    const startDate = parseLocalDateString(String(from).slice(0, 10))
    const endDate = parseLocalDateString(String(to).slice(0, 10))
    const MAX_DAYS = 366
    const result = []
    const cursor = new Date(startDate)
    for (let i = 0; i < MAX_DAYS && cursor <= endDate; i++) {
      const key = formatLocalDateString(cursor)
      const existing = byDate.get(key)
      result.push({
        day: key,
        revenue: existing ? Number(existing.revenue) : 0,
        tickets: existing ? Number(existing.tickets) : 0,
      })
      cursor.setDate(cursor.getDate() + 1)
    }
    return result
  }

  /** Doanh thu/vé theo từng (ngày, phim) — dùng cho drill-down trong dialog "Xem chi tiết". */
  static async getDailyMovieBreakdown(from, to, cinemaId = null) {
    const cinemaFilter = cinemaId ? "AND s.cinema_id = ?" : ""
    const cinemaParams = cinemaId ? [cinemaId] : []

    const [rows] = await pool.query(
      `SELECT DATE(COALESCE(t.paid_at, t.created_at)) AS day,
              m.title,
              SUM(t.total_amount) AS revenue,
              COUNT(t.id) AS tickets
       FROM tickets t
       JOIN showtimes s ON t.showtime_id = s.id
       JOIN movies m ON s.movie_id = m.id
       WHERE t.payment_status = 'paid' AND COALESCE(t.paid_at, t.created_at) BETWEEN ? AND ? ${cinemaFilter}
       GROUP BY DATE(COALESCE(t.paid_at, t.created_at)), m.id, m.title
       ORDER BY day ASC, revenue DESC`,
      [from, to, ...cinemaParams],
    )
    return rows
  }

  static async getTopMovies(from, to, limit = 10, cinemaId = null) {
    const cinemaFilter = cinemaId ? "AND s.cinema_id = ?" : ""
    const cinemaParams = cinemaId ? [cinemaId] : []

    const [rows] = await pool.query(
      `SELECT m.id, m.title,
              SUM(t.total_amount) AS revenue,
              COUNT(t.id) AS tickets
       FROM tickets t
       JOIN showtimes s ON t.showtime_id = s.id
       JOIN movies m ON s.movie_id = m.id
       WHERE t.payment_status = 'paid'
         AND COALESCE(t.paid_at, t.created_at) BETWEEN ? AND ? ${cinemaFilter}
       GROUP BY m.id, m.title
       ORDER BY revenue DESC
       LIMIT ?`,
      [from, to, ...cinemaParams, limit],
    )
    return rows
  }

  static async getTicketsCsvRows(from, to, cinemaId = null) {
    const cinemaFilter = cinemaId ? "AND s.cinema_id = ?" : ""
    const cinemaParams = cinemaId ? [cinemaId] : []

    const [rows] = await pool.query(
      `SELECT t.booking_reference, u.username, u.email,
              m.title as movie, c.name as cinema,
              s.show_date, s.show_time,
              (SELECT GROUP_CONCAT(ts2.seat_code ORDER BY ts2.seat_code SEPARATOR ', ')
               FROM ticket_seats ts2 WHERE ts2.ticket_id = t.id) as seats,
              t.total_amount, t.combo_total,
              t.booking_status, t.payment_status,
              COALESCE(t.paid_at, t.created_at) as created_at
       FROM tickets t
       JOIN users u ON t.user_id = u.id
       JOIN showtimes s ON t.showtime_id = s.id
       JOIN movies m ON s.movie_id = m.id
       JOIN cinemas c ON s.cinema_id = c.id
       WHERE t.payment_status = 'paid' AND COALESCE(t.paid_at, t.created_at) BETWEEN ? AND ? ${cinemaFilter}
       ORDER BY COALESCE(t.paid_at, t.created_at) DESC`,
      [from, to, ...cinemaParams],
    )
    return rows
  }

  // Cùng lớp lỗi (và cùng cách sửa) với getDailyRevenue() ở trên — đây là
  // nguồn dữ liệu RIÊNG cho CSV/"Xem chi tiết" (buildReportTable trong
  // reportController.js), tách biệt khỏi getDailyRevenue() dùng cho biểu đồ.
  // Sửa getDailyRevenue() mà quên sửa hàm này khiến CSV tải về vẫn thiếu
  // sạch những ngày không có giao dịch dù biểu đồ đã đúng — đúng lỗi người
  // dùng report lại ("báo cáo CSV 90 ngày chỉ có 9 dòng"). KHÔNG dùng
  // CONVERT_TZ (đã bỏ, xem giải thích ở Ticket.getDashboardStats()).
  static async getRevenueDailyCsvRows(from, to, cinemaId = null) {
    const cinemaFilter = cinemaId ? "AND s.cinema_id = ?" : ""
    const cinemaParams = cinemaId ? [cinemaId] : []

    const [rows] = await pool.query(
      `SELECT DATE(COALESCE(t.paid_at, t.created_at)) AS ngay,
              SUM(t.total_amount) AS doanh_thu,
              COUNT(t.id) AS so_ve,
              ROUND(AVG(t.total_amount), 0) AS gia_tb,
              SUM(t.combo_total) AS doanh_thu_combo
       FROM tickets t
       JOIN showtimes s ON t.showtime_id = s.id
       WHERE t.payment_status = 'paid'
         AND COALESCE(t.paid_at, t.created_at) BETWEEN ? AND ? ${cinemaFilter}
       GROUP BY ngay
       ORDER BY ngay ASC`,
      [from, to, ...cinemaParams],
    )

    const byDate = new Map(rows.map((r) => [r.ngay, r]))
    const startDate = parseLocalDateString(String(from).slice(0, 10))
    const endDate = parseLocalDateString(String(to).slice(0, 10))
    const MAX_DAYS = 366
    const result = []
    const cursor = new Date(startDate)
    for (let i = 0; i < MAX_DAYS && cursor <= endDate; i++) {
      const key = formatLocalDateString(cursor)
      const existing = byDate.get(key)
      result.push({
        ngay: key,
        doanh_thu: existing ? Number(existing.doanh_thu) : 0,
        so_ve: existing ? Number(existing.so_ve) : 0,
        gia_tb: existing ? Number(existing.gia_tb) : 0,
        doanh_thu_combo: existing ? Number(existing.doanh_thu_combo) : 0,
      })
      cursor.setDate(cursor.getDate() + 1)
    }
    return result
  }

  static async getTopMoviesCsvRows(from, to, cinemaId = null) {
    const cinemaFilter = cinemaId ? "AND s.cinema_id = ?" : ""
    const cinemaParams = cinemaId ? [cinemaId] : []
    // % phải chia theo cùng phạm vi rạp đang lọc, không phải tổng toàn hệ thống —
    // nên subquery tính tổng cũng cần áp cùng cinemaFilter/cinemaParams.
    const totalCinemaFilter = cinemaId ? "AND s2.cinema_id = ?" : ""

    const [rows] = await pool.query(
      `SELECT m.title,
              SUM(t.total_amount) AS doanh_thu,
              COUNT(t.id) AS so_ve,
              ROUND(AVG(t.total_amount), 0) AS gia_tb,
              ROUND(SUM(t.total_amount) * 100.0 / (
                SELECT SUM(t2.total_amount) FROM tickets t2
                JOIN showtimes s2 ON t2.showtime_id = s2.id
                WHERE t2.payment_status='paid' AND COALESCE(t2.paid_at,t2.created_at) BETWEEN ? AND ? ${totalCinemaFilter}
              ), 1) AS phan_tram
       FROM tickets t
       JOIN showtimes s ON t.showtime_id = s.id
       JOIN movies m ON s.movie_id = m.id
       WHERE t.payment_status = 'paid'
         AND COALESCE(t.paid_at, t.created_at) BETWEEN ? AND ? ${cinemaFilter}
       GROUP BY m.id, m.title
       ORDER BY doanh_thu DESC`,
      [from, to, ...cinemaParams, from, to, ...cinemaParams],
    )
    return rows
  }

  static async getShowtimePerformanceCsvRows(from, to, cinemaId = null) {
    const cinemaFilter = cinemaId ? "AND s.cinema_id = ?" : ""
    const cinemaParams = cinemaId ? [cinemaId] : []

    const [rows] = await pool.query(
      `SELECT m.title as phim,
              c.name as rap,
              r.room_name as phong,
              r.room_type as loai_phong,
              s.show_date as ngay,
              s.show_time as gio,
              s.total_seats as tong_ghe,
              (s.total_seats - s.available_seats) as da_dat,
              s.available_seats as con_trong,
              ROUND((s.total_seats - s.available_seats) * 100.0 / s.total_seats, 0) as ti_le_lap_day,
              s.price as gia_ve,
              (s.total_seats - s.available_seats) * s.price as doanh_thu_uoc_tinh
       FROM showtimes s
       JOIN movies m ON s.movie_id = m.id
       JOIN cinemas c ON s.cinema_id = c.id
       LEFT JOIN rooms r ON s.room_id = r.id
       WHERE s.show_date BETWEEN ? AND ? ${cinemaFilter}
       ORDER BY s.show_date, s.show_time`,
      [from.slice(0, 10), to.slice(0, 10), ...cinemaParams],
    )
    return rows
  }
}

module.exports = Report
