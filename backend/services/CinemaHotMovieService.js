/**
 * CinemaHotMovieService
 * 
 * Tính toán độ "hot" của phim theo từng rạp chiếu
 * Dựa trên:
 * - Số vé đã bán trong rạp đó
 * - Rating của phim (có thể mở rộng thành rating riêng theo rạp)
 * - Tỷ lệ lấp đầy ghế trong rạp
 * - Xu hướng bán vé gần đây
 * 
 * Công thức tính điểm hot:
 * hot_score = (tickets_sold * 2) + (rating * 10) + (occupancy_rate * 1.5) + (recent_trend * 3)
 */

const { pool } = require('../config/database');
const CinemaStatsService = require('./CinemaStatsService');

class CinemaHotMovieService {
  /**
   * Tính điểm hot cho tất cả phim trong một rạp
   * @param {number} cinemaId - ID của rạp
   * @param {Object} options - Tùy chọn tính toán
   * @returns {Array} Danh sách phim với điểm hot, sắp xếp từ cao đến thấp
   */
  static async calculateHotScoreForCinema(cinemaId, options = {}) {
    const {
      daysBack = 30, // Số ngày để tính thống kê
      recentDays = 7  // Số ngày gần đây để tính xu hướng
    } = options;

    // Lấy các phim đang chiếu trong rạp
    const activeMovies = await CinemaStatsService.getActiveMoviesInCinema(cinemaId);

    if (activeMovies.length === 0) {
      return [];
    }

    const hotMovies = [];

    for (const movie of activeMovies) {
      const hotScore = await this.calculateMovieHotScore(
        cinemaId, 
        movie.id, 
        { daysBack, recentDays }
      );

      hotMovies.push({
        cinema_id: cinemaId,
        movie_id: movie.id,
        title: movie.title,
        poster_url: movie.poster_url,
        genre: movie.genre,
        ...hotScore
      });
    }

    // Sắp xếp theo điểm hot giảm dần
    hotMovies.sort((a, b) => b.hot_score - a.hot_score);

    return hotMovies;
  }

  /**
   * Tính điểm hot cho một phim cụ thể trong rạp
   * @param {number} cinemaId - ID của rạp
   * @param {number} movieId - ID của phim
   * @param {Object} options - Tùy chọn tính toán
   * @returns {Object} Chi tiết điểm hot
   */
  static async calculateMovieHotScore(cinemaId, movieId, options = {}) {
    const { daysBack = 30, recentDays = 7 } = options;

    // 1. Số vé đã bán (30 ngày gần nhất)
    const dateFrom = new Date();
    dateFrom.setDate(dateFrom.getDate() - daysBack);
    
    const ticketStats = await CinemaStatsService.getTicketStatsByCinema(
      cinemaId, 
      { dateFrom: dateFrom.toISOString().split('T')[0] }
    );
    const movieTickets = ticketStats.find(stat => stat.movie_id === movieId);
    const ticketsSold = movieTickets?.tickets_sold || 0;

    // 2. Rating của phim
    const ratingInfo = await CinemaStatsService.getMovieRatingInCinema(cinemaId, movieId);
    const rating = ratingInfo?.rating || 0;

    // 3. Tỷ lệ lấp đầy ghế
    const occupancyStats = await CinemaStatsService.getOccupancyRateByCinema(cinemaId, movieId);
    const occupancyRate = occupancyStats[0]?.avg_occupancy_rate || 0;

    // 4. Xu hướng gần đây (7 ngày)
    const recentDateFrom = new Date();
    recentDateFrom.setDate(recentDateFrom.getDate() - recentDays);
    
    const recentTicketStats = await CinemaStatsService.getTicketStatsByCinema(
      cinemaId,
      { dateFrom: recentDateFrom.toISOString().split('T')[0] }
    );
    const recentMovieTickets = recentTicketStats.find(stat => stat.movie_id === movieId);
    const recentTicketsSold = recentMovieTickets?.tickets_sold || 0;

    // Tính xu hướng (số vé bán gần đây / số ngày gần đây)
    const recentTrend = recentTicketsSold / recentDays;

    // 5. Tính điểm hot tổng hợp
    // Công thức: (tickets * 2) + (rating * 10) + (occupancy * 1.5) + (trend * 3)
    const ticketScore = ticketsSold * 2;
    const ratingScore = rating * 10;
    const occupancyScore = occupancyRate * 1.5;
    const trendScore = recentTrend * 3;

    const hotScore = ticketScore + ratingScore + occupancyScore + trendScore;

    return {
      hot_score: Math.round(hotScore * 100) / 100,
      tickets_sold: ticketsSold,
      rating: rating,
      occupancy_rate: Math.round(occupancyRate * 100) / 100,
      recent_trend: Math.round(recentTrend * 100) / 100,
      breakdown: {
        ticket_score: Math.round(ticketScore * 100) / 100,
        rating_score: Math.round(ratingScore * 100) / 100,
        occupancy_score: Math.round(occupancyScore * 100) / 100,
        trend_score: Math.round(trendScore * 100) / 100
      }
    };
  }

  /**
   * Phân loại phim theo mức độ hot
   * @param {number} hotScore - Điểm hot
   * @returns {string} Cấp độ hot
   */
  static getHotLevel(hotScore) {
    if (hotScore >= 150) return 'VERY_HOT';
    if (hotScore >= 100) return 'HOT';
    if (hotScore >= 50) return 'WARM';
    if (hotScore >= 20) return 'COOL';
    return 'COLD';
  }

  /**
   * Tính số suất chiếu đề xuất dựa trên điểm hot
   * @param {number} hotScore - Điểm hot
   * @param {number} totalSlotsAvailable - Tổng số slot có thể phân bổ
   * @returns {Object} Số suất chiếu và phân bổ khung giờ
   */
  static calculateShowtimeAllocation(hotScore, totalSlotsAvailable = 100) {
    const hotLevel = this.getHotLevel(hotScore);

    switch (hotLevel) {
      case 'VERY_HOT':
        return {
          showtimes_per_week: Math.floor(totalSlotsAvailable * 0.25), // 25% slot
          prime_time_ratio: 0.7,   // 70% khung giờ vàng
          good_time_ratio: 0.25,   // 25% khung giờ tốt
          regular_time_ratio: 0.05 // 5% khung giờ thường
        };
      
      case 'HOT':
        return {
          showtimes_per_week: Math.floor(totalSlotsAvailable * 0.20), // 20% slot
          prime_time_ratio: 0.5,
          good_time_ratio: 0.35,
          regular_time_ratio: 0.15
        };
      
      case 'WARM':
        return {
          showtimes_per_week: Math.floor(totalSlotsAvailable * 0.15), // 15% slot
          prime_time_ratio: 0.3,
          good_time_ratio: 0.4,
          regular_time_ratio: 0.3
        };
      
      case 'COOL':
        return {
          showtimes_per_week: Math.floor(totalSlotsAvailable * 0.10), // 10% slot
          prime_time_ratio: 0.15,
          good_time_ratio: 0.35,
          regular_time_ratio: 0.5
        };
      
      case 'COLD':
      default:
        return {
          showtimes_per_week: Math.floor(totalSlotsAvailable * 0.05), // 5% slot
          prime_time_ratio: 0.05,
          good_time_ratio: 0.15,
          regular_time_ratio: 0.6,
          off_peak_ratio: 0.2
        };
    }
  }

  /**
   * Lấy danh sách phim hot cho tất cả rạp
   * @returns {Object} Danh sách phim hot theo từng rạp
   */
  static async getAllCinemasHotMovies() {
    // Lấy tất cả các rạp
    const [cinemas] = await pool.execute('SELECT id, name FROM cinemas ORDER BY name');

    const result = {};

    for (const cinema of cinemas) {
      const hotMovies = await this.calculateHotScoreForCinema(cinema.id);
      result[cinema.id] = {
        cinema_name: cinema.name,
        hot_movies: hotMovies
      };
    }

    return result;
  }

  /**
   * So sánh độ hot của một phim giữa các rạp
   * @param {number} movieId - ID của phim
   * @returns {Array} So sánh độ hot giữa các rạp
   */
  static async compareMovieHotAcrossCinemas(movieId) {
    const [cinemas] = await pool.execute('SELECT id, name FROM cinemas ORDER BY name');

    const comparison = [];

    for (const cinema of cinemas) {
      const hotScore = await this.calculateMovieHotScore(cinema.id, movieId);
      
      comparison.push({
        cinema_id: cinema.id,
        cinema_name: cinema.name,
        ...hotScore,
        hot_level: this.getHotLevel(hotScore.hot_score)
      });
    }

    // Sắp xếp theo điểm hot giảm dần
    comparison.sort((a, b) => b.hot_score - a.hot_score);

    return comparison;
  }
}

module.exports = CinemaHotMovieService;
