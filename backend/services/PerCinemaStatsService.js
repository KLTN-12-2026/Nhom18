/**
 * PerCinemaStatsService
 * 
 * Tính toán thống kê theo TỪNG RẠP (không dùng chung toàn hệ thống)
 * 
 * Features:
 * - Số vé bán theo phim trong từng rạp
 * - Rating trung bình của phim trong từng rạp
 * - Độ hot (popularity score) theo từng rạp
 * - Không trộn lẫn dữ liệu giữa các rạp
 * 
 * Formula per cinema:
 * - Popularity Score = (Tickets × 2) + (Avg Rating × 20) + (Recent Bookings × 3)
 */

const { pool } = require('../config/database');

class PerCinemaStatsService {
  
  /**
   * Lấy thống kê phim theo TỪNG RẠP
   * @param {number} cinemaId - ID của rạp
   * @param {Date} fromDate - Tính từ ngày (default: 30 ngày trước)
   * @returns {Array} - Danh sách phim với thống kê theo rạp
   */
  async getCinemaMovieStats(cinemaId, fromDate = null) {
    if (!fromDate) {
      fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - 30); // 30 ngày trước
    }

    const connection = await pool.getConnection();
    
    try {
      const [stats] = await connection.query(`
        SELECT 
          m.id as movie_id,
          m.title,
          m.genre,
          m.status,
          m.duration,
          m.poster_url,
          
          -- THỐNG KÊ RIÊNG CHO RẠP NÀY
          COUNT(DISTINCT t.id) as tickets_sold_in_cinema,
          COUNT(DISTINCT s.id) as showtimes_in_cinema,
          
          -- RATING RIÊNG TRONG RẠP (từ user đã xem phim ở rạp này)
          AVG(r.rating) as cinema_avg_rating,
          COUNT(DISTINCT r.id) as cinema_rating_count,
          
          -- SỐ VÉ GẦN ĐÂY (7 ngày)
          COUNT(DISTINCT CASE 
            WHEN t.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) 
            THEN t.id 
          END) as recent_tickets,
          
          -- DOANH THU TRONG RẠP
          SUM(CASE 
            WHEN t.id IS NOT NULL THEN s.price 
            ELSE 0 
          END) as cinema_revenue,
          
          -- NGÀY CHIẾU GẦN NHẤT
          MAX(s.show_date) as last_showtime_date
          
        FROM movies m
        
        -- Chỉ lấy showtimes của RẠP NÀY
        LEFT JOIN showtimes s ON m.id = s.movie_id 
          AND s.cinema_id = ?
          AND s.show_date >= ?
        
        -- Chỉ lấy tickets của RẠP NÀY
        LEFT JOIN tickets t ON s.id = t.showtime_id
        
        -- Chỉ lấy ratings của users đã xem ở RẠP NÀY
        LEFT JOIN movie_ratings r ON m.id = r.movie_id 
          AND r.user_id IN (
            SELECT DISTINCT t2.user_id 
            FROM tickets t2
            JOIN showtimes s2 ON t2.showtime_id = s2.id
            WHERE s2.cinema_id = ?
          )
        
        WHERE m.status IN ('NOW_SHOWING', 'COMING_SOON')
        
        GROUP BY m.id, m.title, m.genre, m.status, m.duration, m.poster_url
        
        HAVING showtimes_in_cinema > 0 OR m.status = 'COMING_SOON'
        
        ORDER BY tickets_sold_in_cinema DESC, cinema_avg_rating DESC
      `, [cinemaId, fromDate, cinemaId]);

      return stats;
      
    } finally {
      connection.release();
    }
  }

  /**
   * Tính độ HOT của phim trong TỪNG RẠP
   * @param {number} cinemaId - ID của rạp
   * @returns {Array} - Movies với popularity_score theo rạp
   */
  async calculateCinemaPopularity(cinemaId) {
    const stats = await this.getCinemaMovieStats(cinemaId);
    
    return stats.map(movie => {
      // CÔNG THỨC TÍNH ĐỘ HOT THEO RẠP
      const ticketScore = (movie.tickets_sold_in_cinema || 0) * 2;
      const ratingScore = (movie.cinema_avg_rating || 0) * 20;
      const recentScore = (movie.recent_tickets || 0) * 3;
      
      const popularityScore = ticketScore + ratingScore + recentScore;
      
      // Phân loại theo tier
      let tier = 'LOW';
      if (popularityScore >= 100) tier = 'HIGH';
      else if (popularityScore >= 50) tier = 'MEDIUM';
      
      return {
        ...movie,
        cinema_popularity_score: Math.round(popularityScore * 100) / 100,
        cinema_tier: tier,
        breakdown: {
          from_tickets: ticketScore,
          from_rating: Math.round(ratingScore * 100) / 100,
          from_recent: recentScore,
        }
      };
    });
  }

  /**
   * Lấy top phim HOT nhất trong từng rạp
   * @param {number} cinemaId - ID của rạp
   * @param {number} limit - Số lượng phim (default: 10)
   */
  async getTopMoviesInCinema(cinemaId, limit = 10) {
    const movies = await this.calculateCinemaPopularity(cinemaId);
    
    return movies
      .sort((a, b) => b.cinema_popularity_score - a.cinema_popularity_score)
      .slice(0, limit);
  }

  /**
   * Lấy thống kê cho TẤT CẢ các rạp
   * @returns {Object} - { cinemaId: [movies with stats] }
   */
  async getAllCinemasStats() {
    const connection = await pool.getConnection();
    
    try {
      // Lấy danh sách tất cả rạp
      const [cinemas] = await connection.query(`
        SELECT id, name, location
        FROM cinemas
        ORDER BY id
      `);

      const result = {};
      
      for (const cinema of cinemas) {
        const movies = await this.calculateCinemaPopularity(cinema.id);
        result[cinema.id] = {
          cinema_info: {
            id: cinema.id,
            name: cinema.name,
            location: cinema.location
          },
          movies: movies,
          total_movies: movies.length,
          avg_popularity: movies.length > 0 
            ? movies.reduce((sum, m) => sum + m.cinema_popularity_score, 0) / movies.length
            : 0
        };
      }

      return result;
      
    } finally {
      connection.release();
    }
  }

  /**
   * So sánh phim giữa các rạp
   * @param {number} movieId - ID của phim
   * @returns {Array} - Thống kê phim ở từng rạp
   */
  async compareMovieAcrossCinemas(movieId) {
    const connection = await pool.getConnection();
    
    try {
      const [cinemas] = await connection.query(`
        SELECT id, name FROM cinemas ORDER BY id
      `);

      const comparison = [];
      
      for (const cinema of cinemas) {
        const movies = await this.calculateCinemaPopularity(cinema.id);
        const movieStats = movies.find(m => m.movie_id === movieId);
        
        if (movieStats) {
          comparison.push({
            cinema_id: cinema.id,
            cinema_name: cinema.name,
            ...movieStats
          });
        }
      }

      return comparison;
      
    } finally {
      connection.release();
    }
  }

  /**
   * Log thống kê (for debugging)
   */
  log(message, level = 'INFO') {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [PerCinemaStats] [${level}] ${message}`);
  }
}

module.exports = new PerCinemaStatsService();
