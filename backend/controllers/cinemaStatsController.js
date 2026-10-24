/**
 * CinemaStatsController
 * 
 * API endpoints để xem thống kê theo từng rạp
 */

const CinemaStatsService = require('../services/CinemaStatsService');
const CinemaHotMovieService = require('../services/CinemaHotMovieService');

class CinemaStatsController {
  /**
   * GET /api/cinema-stats/:cinemaId
   * Lấy thống kê tổng quát của một rạp
   */
  static async getCinemaOverview(req, res) {
    try {
      const { cinemaId } = req.params;
      
      const overview = await CinemaStatsService.getCinemaOverview(cinemaId);
      
      res.json({
        success: true,
        cinema_id: parseInt(cinemaId),
        data: overview
      });
    } catch (error) {
      console.error('Error getting cinema overview:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi khi lấy thống kê rạp'
      });
    }
  }

  /**
   * GET /api/cinema-stats/:cinemaId/tickets
   * Lấy thống kê vé bán theo phim trong rạp
   */
  static async getTicketStats(req, res) {
    try {
      const { cinemaId } = req.params;
      const { dateFrom, dateTo } = req.query;
      
      const stats = await CinemaStatsService.getTicketStatsByCinema(cinemaId, {
        dateFrom,
        dateTo
      });
      
      res.json({
        success: true,
        cinema_id: parseInt(cinemaId),
        data: stats
      });
    } catch (error) {
      console.error('Error getting ticket stats:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi khi lấy thống kê vé'
      });
    }
  }

  /**
   * GET /api/cinema-stats/:cinemaId/occupancy
   * Lấy tỷ lệ lấp đầy ghế theo phim
   */
  static async getOccupancyStats(req, res) {
    try {
      const { cinemaId } = req.params;
      const { movieId } = req.query;
      
      const stats = await CinemaStatsService.getOccupancyRateByCinema(
        cinemaId,
        movieId ? parseInt(movieId) : null
      );
      
      res.json({
        success: true,
        cinema_id: parseInt(cinemaId),
        data: stats
      });
    } catch (error) {
      console.error('Error getting occupancy stats:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi khi lấy thống kê lấp đầy'
      });
    }
  }

  /**
   * GET /api/cinema-stats/:cinemaId/movies
   * Lấy danh sách phim đang chiếu trong rạp
   */
  static async getActiveMovies(req, res) {
    try {
      const { cinemaId } = req.params;
      
      const movies = await CinemaStatsService.getActiveMoviesInCinema(cinemaId);
      
      res.json({
        success: true,
        cinema_id: parseInt(cinemaId),
        data: movies
      });
    } catch (error) {
      console.error('Error getting active movies:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi khi lấy danh sách phim'
      });
    }
  }

  /**
   * GET /api/cinema-stats/:cinemaId/movies/:movieId
   * Lấy thống kê chi tiết of một phim trong rạp
   */
  static async getMovieDetailStats(req, res) {
    try {
      const { cinemaId, movieId } = req.params;
      
      const stats = await CinemaStatsService.getMovieDetailStatsInCinema(
        parseInt(cinemaId),
        parseInt(movieId)
      );
      
      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      console.error('Error getting movie detail stats:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi khi lấy thống kê phim'
      });
    }
  }

  /**
   * GET /api/cinema-stats/:cinemaId/hot-movies
   * Lấy danh sách phim hot trong rạp (theo điểm hot)
   */
  static async getHotMovies(req, res) {
    try {
      const { cinemaId } = req.params;
      const { daysBack, recentDays } = req.query;
      
      const hotMovies = await CinemaHotMovieService.calculateHotScoreForCinema(
        parseInt(cinemaId),
        {
          daysBack: daysBack ? parseInt(daysBack) : 30,
          recentDays: recentDays ? parseInt(recentDays) : 7
        }
      );
      
      res.json({
        success: true,
        cinema_id: parseInt(cinemaId),
        data: hotMovies
      });
    } catch (error) {
      console.error('Error getting hot movies:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi khi lấy danh sách phim hot'
      });
    }
  }

  /**
   * GET /api/cinema-stats/all/hot-movies
   * Lấy danh sách phim hot của tất cả rạp
   */
  static async getAllCinemasHotMovies(req, res) {
    try {
      const hotMovies = await CinemaHotMovieService.getAllCinemasHotMovies();
      
      res.json({
        success: true,
        data: hotMovies
      });
    } catch (error) {
      console.error('Error getting all cinemas hot movies:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi khi lấy danh sách phim hot tất cả rạp'
      });
    }
  }

  /**
   * GET /api/cinema-stats/movies/:movieId/compare
   * So sánh độ hot của một phim giữa các rạp
   */
  static async compareMovieAcrossCinemas(req, res) {
    try {
      const { movieId } = req.params;
      
      const comparison = await CinemaHotMovieService.compareMovieHotAcrossCinemas(
        parseInt(movieId)
      );
      
      res.json({
        success: true,
        movie_id: parseInt(movieId),
        data: comparison
      });
    } catch (error) {
      console.error('Error comparing movie across cinemas:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi khi so sánh phim giữa các rạp'
      });
    }
  }

  /**
   * GET /api/cinema-stats/all-cinemas/summary
   * Lấy thống kê tổng hợp của tất cả rạp (cho dashboard)
   */
  static async getAllCinemasSummary(req, res) {
    try {
      const { daysBack } = req.query;
      
      const summary = await CinemaStatsService.getAllCinemasSummary({
        daysBack: daysBack ? parseInt(daysBack) : 30
      });
      
      res.json({
        success: true,
        data: summary
      });
    } catch (error) {
      console.error('Error getting all cinemas summary:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi khi lấy thống kê tất cả rạp'
      });
    }
  }

  /**
   * GET /api/cinema-stats/all-cinemas/top-movies
   * Lấy top phim theo từng rạp (cho dashboard)
   */
  static async getTopMoviesByAllCinemas(req, res) {
    try {
      const { topN, daysBack } = req.query;
      
      const topMovies = await CinemaStatsService.getTopMoviesByAllCinemas(
        topN ? parseInt(topN) : 5,
        daysBack ? parseInt(daysBack) : 30
      );
      
      res.json({
        success: true,
        data: topMovies
      });
    } catch (error) {
      console.error('Error getting top movies by all cinemas:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi khi lấy top phim theo rạp'
      });
    }
  }
}

module.exports = CinemaStatsController;
