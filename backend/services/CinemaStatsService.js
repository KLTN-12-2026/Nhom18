/**
 * CinemaStatsService
 * 
 * Thống kê riêng biệt cho từng rạp chiếu:
 * - Số vé đã bán theo phim trong rạp
 * - Điểm rating của phim trong rạp (nếu có)
 * - Tổng doanh thu theo phim trong rạp
 * - Tỷ lệ lấp đầy ghế theo phim trong rạp
 * 
 * Không sử dụng dữ liệu chung toàn hệ thống
 */

const { pool } = require('../config/database');

class CinemaStatsService {
  /**
   * Lấy thống kê số vé đã bán theo từng phim trong một rạp cụ thể
   * @param {number} cinemaId - ID của rạp
   * @param {Object} options - Tùy chọn lọc (dateFrom, dateTo)
   * @returns {Array} Danh sách phim với số vé bán trong rạp đó
   */
  static async getTicketStatsByCinema(cinemaId, options = {}) {
    const { dateFrom, dateTo } = options;
    
    let dateCondition = '';
    const params = [cinemaId];
    
    if (dateFrom) {
      dateCondition += ' AND t.created_at >= ?';
      params.push(dateFrom);
    }
    
    if (dateTo) {
      dateCondition += ' AND t.created_at <= ?';
      params.push(dateTo);
    }

    const query = `
      SELECT 
        m.id as movie_id,
        m.title,
        m.poster_url,
        m.genre,
        m.rating as global_rating,
        COUNT(t.id) as tickets_sold,
        SUM(t.total_amount) as total_revenue,
        SUM(JSON_LENGTH(t.seats)) as total_seats_sold
      FROM tickets t
      INNER JOIN showtimes s ON t.showtime_id = s.id
      INNER JOIN movies m ON s.movie_id = m.id
      WHERE s.cinema_id = ?
        AND t.booking_status = 'confirmed'
        AND t.payment_status = 'paid'
        ${dateCondition}
      GROUP BY m.id, m.title, m.poster_url, m.genre, m.rating
      ORDER BY tickets_sold DESC
    `;

    const [rows] = await pool.execute(query, params);
    return rows;
  }

  /**
   * Lấy rating trung bình của phim trong một rạp cụ thể
   * (Nếu có bảng ratings riêng với cinema_id)
   * Hiện tại sử dụng rating từ bảng movies, nhưng có thể mở rộng
   * 
   * @param {number} cinemaId - ID của rạp
   * @param {number} movieId - ID của phim
   * @returns {Object} Rating info
   */
  static async getMovieRatingInCinema(cinemaId, movieId) {
    // Điểm đánh giá trung bình (1–5) chung của phim. KHÔNG dùng m.rating: cột
    // đó là NHÃN TUỔI ("T13", "T18", "K"), nhân 10 ra NaN làm hot_score = null.
    const query = `
      SELECT
        m.id as movie_id,
        m.title,
        COALESCE(m.average_rating, 0) as rating
      FROM movies m
      WHERE m.id = ?
    `;

    const [rows] = await pool.execute(query, [movieId]);
    return rows[0] || null;
  }

  /**
   * Lấy tỷ lệ lấp đầy ghế trung bình của phim trong một rạp
   * @param {number} cinemaId - ID của rạp
   * @param {number} movieId - ID của phim (optional)
   * @returns {Array} Thống kê tỷ lệ lấp đầy
   */
  static async getOccupancyRateByCinema(cinemaId, movieId = null) {
    let movieCondition = '';
    const params = [cinemaId];
    
    if (movieId) {
      movieCondition = ' AND s.movie_id = ?';
      params.push(movieId);
    }

    const query = `
      SELECT 
        m.id as movie_id,
        m.title,
        COUNT(DISTINCT s.id) as total_showtimes,
        AVG((s.total_seats - s.available_seats) / s.total_seats * 100) as avg_occupancy_rate,
        SUM(s.total_seats - s.available_seats) as total_seats_booked,
        SUM(s.total_seats) as total_seats_available
      FROM showtimes s
      INNER JOIN movies m ON s.movie_id = m.id
      WHERE s.cinema_id = ?
        ${movieCondition}
        AND s.show_date >= CURDATE()
      GROUP BY m.id, m.title
      ORDER BY avg_occupancy_rate DESC
    `;

    const [rows] = await pool.execute(query, params);
    return rows;
  }

  /**
   * Lấy thống kê tổng quan của một rạp
   * @param {number} cinemaId - ID của rạp
   * @returns {Object} Thống kê tổng quan
   */
  static async getCinemaOverview(cinemaId) {
    // Tổng số vé đã bán
    const [ticketStats] = await pool.execute(`
      SELECT 
        COUNT(t.id) as total_tickets,
        SUM(t.total_amount) as total_revenue,
        COUNT(DISTINCT s.movie_id) as movies_showing
      FROM tickets t
      INNER JOIN showtimes s ON t.showtime_id = s.id
      WHERE s.cinema_id = ?
        AND t.booking_status = 'confirmed'
        AND t.payment_status = 'paid'
    `, [cinemaId]);

    // Số lượng phòng chiếu
    const [roomStats] = await pool.execute(`
      SELECT 
        COUNT(*) as total_rooms,
        SUM(total_seats) as total_capacity
      FROM rooms
      WHERE cinema_id = ? AND is_active = TRUE
    `, [cinemaId]);

    // Số suất chiếu sắp tới
    const [showtimeStats] = await pool.execute(`
      SELECT 
        COUNT(*) as upcoming_showtimes
      FROM showtimes
      WHERE cinema_id = ?
        AND show_date >= CURDATE()
    `, [cinemaId]);

    return {
      tickets: ticketStats[0],
      rooms: roomStats[0],
      showtimes: showtimeStats[0]
    };
  }

  /**
   * Lấy danh sách phim đang chiếu trong rạp
   * @param {number} cinemaId - ID của rạp
   * @returns {Array} Danh sách phim
   */
  static async getActiveMoviesInCinema(cinemaId) {
    // Lấy tất cả phim đang chiếu và sắp chiếu
    // Bao gồm cả phim chưa có suất chiếu nào
    const query = `
      SELECT 
        m.id,
        m.title,
        m.poster_url,
        m.genre,
        m.rating,
        m.duration,
        m.status,
        COALESCE(showtime_count.total, 0) as total_showtimes
      FROM movies m
      LEFT JOIN (
        SELECT movie_id, COUNT(*) as total
        FROM showtimes
        WHERE cinema_id = ? AND show_date >= CURDATE()
        GROUP BY movie_id
      ) showtime_count ON m.id = showtime_count.movie_id
      WHERE m.status IN ('NOW_SHOWING', 'COMING_SOON')
        AND (
          m.release_date IS NULL 
          OR m.release_date <= CURDATE() + INTERVAL 14 DAY
        )
      ORDER BY 
        CASE m.status 
          WHEN 'NOW_SHOWING' THEN 1 
          WHEN 'COMING_SOON' THEN 2 
        END,
        m.release_date DESC,
        m.rating DESC
    `;

    const [rows] = await pool.execute(query, [cinemaId]);
    return rows;
  }

  /**
   * Lấy thống kê chi tiết của một phim trong rạp cụ thể
   * @param {number} cinemaId - ID của rạp
   * @param {number} movieId - ID của phim
   * @returns {Object} Thống kê chi tiết
   */
  static async getMovieDetailStatsInCinema(cinemaId, movieId) {
    // Vé đã bán
    const ticketStats = await this.getTicketStatsByCinema(cinemaId);
    const movieTickets = ticketStats.find(stat => stat.movie_id === movieId);

    // Tỷ lệ lấp đầy
    const occupancyStats = await this.getOccupancyRateByCinema(cinemaId, movieId);
    const movieOccupancy = occupancyStats[0] || {};

    // Rating
    const ratingInfo = await this.getMovieRatingInCinema(cinemaId, movieId);

    // Suất chiếu sắp tới
    const [upcomingShowtimes] = await pool.execute(`
      SELECT 
        COUNT(*) as upcoming_showtimes,
        MIN(show_date) as next_show_date
      FROM showtimes
      WHERE cinema_id = ? AND movie_id = ?
        AND show_date >= CURDATE()
    `, [cinemaId, movieId]);

    return {
      cinema_id: cinemaId,
      movie_id: movieId,
      tickets_sold: movieTickets?.tickets_sold || 0,
      total_revenue: movieTickets?.total_revenue || 0,
      rating: ratingInfo?.rating || 0,
      occupancy_rate: movieOccupancy?.avg_occupancy_rate || 0,
      total_showtimes: movieOccupancy?.total_showtimes || 0,
      upcoming_showtimes: upcomingShowtimes[0]?.upcoming_showtimes || 0,
      next_show_date: upcomingShowtimes[0]?.next_show_date || null
    };
  }

  /**
   * Lấy thống kê tổng hợp của tất cả các rạp (cho dashboard)
   * @param {Object} options - Tùy chọn (daysBack)
   * @returns {Array} Danh sách rạp với thống kê
   */
  static async getAllCinemasSummary(options = {}) {
    const { daysBack = 30 } = options;

    // QUAN TRỌNG: trước đây JOIN trực tiếp rooms VÀ showtimes/tickets cùng lúc
    // từ cinemas (2 nhánh "nhiều" độc lập, không liên hệ với nhau) khiến kết
    // quả bị "fan-out" — mỗi vé bị đếm lặp lại 1 lần cho MỖI PHÒNG của rạp đó
    // (rạp có 4 phòng thì SUM(t.total_amount) tính mỗi vé x4 lần). Đây chính
    // là lý do doanh thu hiển thị sai (thường bị nhân lên gấp mấy lần thực tế,
    // hoặc lệch hẳn nếu số phòng/số vé đổi khác nhau giữa các rạp) và
    // occupancy_rate luôn ra ~0% (mẫu số SUM(r.total_seats) cũng bị nhân theo
    // fan-out, phồng lên hàng trăm nghìn so với sức chứa thật). Tách thành các
    // subquery ĐỘC LẬP theo cinema_id — không còn JOIN 2 bảng "nhiều" chung 1
    // tầng — mỗi con số tính đúng 1 lần, đúng cách các model khác trong dự án
    // đã làm (vd Cinema.getAllWithStats(), Ticket.getOperationalCounts()).
    // occupancy_rate cũng đổi sang đúng ý nghĩa "tỉ lệ ghế đã bán / tổng ghế
    // của các suất chiếu trong kỳ" (dựa trên showtimes.total_seats/available_seats,
    // giống công thức đã dùng ở KPI "Tỷ lệ lấp đầy hôm nay" trên dashboard admin)
    // thay vì so vé bán với sức chứa PHÒNG (vốn không phản ánh đúng vì 1 phòng
    // chiếu nhiều suất trong kỳ).
    const query = `
      SELECT
        c.id as cinema_id,
        c.name as cinema_name,
        c.location,
        (SELECT COUNT(*) FROM rooms r WHERE r.cinema_id = c.id AND r.is_active = 1) as total_rooms,
        (SELECT COALESCE(SUM(r.total_seats), 0) FROM rooms r WHERE r.cinema_id = c.id AND r.is_active = 1) as total_capacity,
        (SELECT COUNT(*) FROM showtimes s
           WHERE s.cinema_id = c.id AND s.show_date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)) as total_showtimes,
        (SELECT COUNT(DISTINCT s.movie_id) FROM showtimes s
           WHERE s.cinema_id = c.id AND s.show_date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)) as movies_showing,
        (SELECT COUNT(*) FROM tickets t JOIN showtimes s ON t.showtime_id = s.id
           WHERE s.cinema_id = c.id AND t.booking_status = 'confirmed' AND t.payment_status = 'paid'
             AND t.created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)) as tickets_sold,
        (SELECT COALESCE(SUM(t.total_amount), 0) FROM tickets t JOIN showtimes s ON t.showtime_id = s.id
           WHERE s.cinema_id = c.id AND t.booking_status = 'confirmed' AND t.payment_status = 'paid'
             AND t.created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)) as total_revenue,
        (SELECT ROUND(SUM(s.total_seats - s.available_seats) * 100.0 / NULLIF(SUM(s.total_seats), 0), 2)
           FROM showtimes s
           WHERE s.cinema_id = c.id AND s.show_date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)) as occupancy_rate
      FROM cinemas c
      WHERE c.status = 'ACTIVE' OR c.status IS NULL
      ORDER BY total_revenue DESC
    `;

    const [cinemas] = await pool.execute(query, [daysBack, daysBack, daysBack, daysBack, daysBack]);

    return cinemas;
  }

  /**
   * Lấy top phim theo từng rạp (cho dashboard)
   * @param {number} topN - Số phim top cần lấy
   * @param {number} daysBack - Số ngày tính từ hiện tại
   * @returns {Object} Top phim theo từng rạp
   */
  static async getTopMoviesByAllCinemas(topN = 5, daysBack = 30) {
    const query = `
      SELECT 
        c.id as cinema_id,
        c.name as cinema_name,
        m.id as movie_id,
        m.title as movie_title,
        m.poster_url,
        COUNT(DISTINCT t.id) as tickets_sold,
        COALESCE(SUM(t.total_amount), 0) as revenue
      FROM cinemas c
      INNER JOIN showtimes s ON s.cinema_id = c.id
      INNER JOIN movies m ON s.movie_id = m.id
      LEFT JOIN tickets t ON t.showtime_id = s.id
        AND t.booking_status = 'confirmed'
        AND t.payment_status = 'paid'
        AND t.created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
      WHERE c.status = 'ACTIVE'
        AND s.show_date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
      GROUP BY c.id, c.name, m.id, m.title, m.poster_url
      -- Chỉ phim THỰC SỰ bán được vé mới vào bảng xếp hạng — trước đây LEFT
      -- JOIN kéo cả phim 0 vé vào để lấp cho đủ topN, trông như phim "top".
      HAVING tickets_sold > 0
      ORDER BY c.id, tickets_sold DESC, revenue DESC
    `;

    const [rows] = await pool.execute(query, [daysBack, daysBack]);
    
    // Nhóm theo rạp và lấy top N
    const result = {};
    rows.forEach(row => {
      if (!result[row.cinema_id]) {
        result[row.cinema_id] = {
          cinema_id: row.cinema_id,
          cinema_name: row.cinema_name,
          top_movies: []
        };
      }
      
      if (result[row.cinema_id].top_movies.length < topN) {
        result[row.cinema_id].top_movies.push({
          movie_id: row.movie_id,
          title: row.movie_title,
          poster_url: row.poster_url,
          tickets_sold: row.tickets_sold,
          revenue: parseFloat(row.revenue)
        });
      }
    });

    return Object.values(result);
  }
}

module.exports = CinemaStatsService;
