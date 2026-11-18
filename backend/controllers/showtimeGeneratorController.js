/**
 * Showtime Generator Controller
 * Admin endpoints for automatic showtime generation
 */

const ShowtimeGeneratorService = require('../services/ShowtimeGeneratorService');
const { parseLocalDateString, formatLocalDateString } = require('../utils/dateUtils');

/**
 * Generate showtimes for upcoming week
 * POST /api/admin/showtimes/generate
 */
const generateWeeklyShowtimes = async (req, res) => {
  try {
    const { weekStart } = req.body;
    
    // Validate and parse date
    let startDate;
    if (weekStart) {
      startDate = parseLocalDateString(weekStart);
      if (isNaN(startDate.getTime())) {
        return res.status(400).json({
          success: false,
          message: 'Invalid date format. Use YYYY-MM-DD'
        });
      }
    } else {
      // Default to next Monday
      startDate = getNextMonday();
    }

    // Create generator instance and run
    const generator = new ShowtimeGeneratorService();
    const result = await generator.generateWeeklyShowtimes(startDate);

    // QUAN TRỌNG: result.schedule (= this.pendingInserts trong service) là
    // danh sách suất chiếu THẬT vừa ghi vào DB (không phải mô phỏng như bên
    // preview) — trước đây bị bỏ sót, không trả về cho frontend, khiến sau
    // khi bấm "Tạo Suất" admin KHÔNG có cách nào xem lại chính xác đã tạo
    // suất nào (giờ/phim/rạp/phòng cụ thể), chỉ thấy 4 con số tổng quan.
    // Format lại giống hệt previewGeneration() bên dưới để frontend dùng
    // chung 1 component hiển thị cho cả preview lẫn kết quả tạo thật.
    const movies = (result.movieSummary || [])
      .map(m => ({
        ...m,
        popularity_score: Math.round(m.popularity_score * 10) / 10,
        rooms_used_count: m.rooms_used.length,
        rooms_used: m.rooms_used.map(r => `${r.cinema_name} - ${r.name} (${r.room_type})`)
      }))
      .sort((a, b) => b.popularity_score - a.popularity_score);

    // id: chỉ đây (generate thật) mới có — preview (dry-run) không ghi DB nên
    // không có id thật. Frontend dùng id này để xoá TỪNG suất chiếu riêng lẻ
    // ngay trên lịch vừa tạo, thay vì phải xoá cả tuần rồi tạo lại từ đầu.
    const schedule = [...(result.schedule || [])]
      .sort((a, b) => (a.show_date + a.show_time).localeCompare(b.show_date + b.show_time))
      .map(s => ({
        id: s.id,
        movie_title: s.movie_title,
        cinema_name: s.cinema_name,
        room_name: s.room_name,
        room_type: s.room_type,
        show_date: s.show_date,
        show_time: s.show_time,
        price: s.price
      }));

    // Vừa tạo hàng loạt suất chiếu thật vào DB — phải làm mới cache danh sách,
    // nếu không admin bấm "tạo lịch tự động" xong vào xem trang lịch chiếu vẫn
    // thấy trống trong vài phút (preview/stats không cần vì không ghi DB).
    require("../middleware/cache").invalidateCache("showtimes");

    return res.json({
      success: true,
      message: `Generated ${result.generated} showtimes successfully`,
      data: { ...result, movies, schedule }
    });

  } catch (error) {
    console.error('Generate showtimes error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to generate showtimes'
    });
  }
};

/**
 * Preview generation without saving
 * POST /api/admin/showtimes/preview
 */
const previewGeneration = async (req, res) => {
  try {
    const { weekStart } = req.body;
    
    let startDate;
    if (weekStart) {
      startDate = parseLocalDateString(weekStart);
      if (isNaN(startDate.getTime())) {
        return res.status(400).json({
          success: false,
          message: 'Invalid date format'
        });
      }
    } else {
      startDate = getNextMonday();
    }

    // Chạy đúng thuật toán tạo suất chiếu thật ở chế độ dry-run (không ghi DB) để
    // số liệu xem trước khớp 1:1 với những gì sẽ được tạo nếu bấm "Tạo Suất" —
    // bao gồm cả việc phân bổ theo SỐ PHÒNG phù hợp và giới hạn vật lý theo thời
    // lượng phim, vốn bị công thức ước lượng cũ (showtimesPerDay * 7) bỏ qua hoàn toàn.
    const generator = new ShowtimeGeneratorService();
    const result = await generator.generateWeeklyShowtimes(startDate, { dryRun: true });

    if (!result.success) {
      return res.json({ success: false, message: result.message });
    }

    const movies = result.movieSummary
      .map(m => ({
        ...m,
        popularity_score: Math.round(m.popularity_score * 10) / 10,
        rooms_used_count: m.rooms_used.length,
        rooms_used: m.rooms_used.map(r => `${r.cinema_name} - ${r.name} (${r.room_type})`)
      }))
      .sort((a, b) => b.popularity_score - a.popularity_score);

    // Lịch chiếu chi tiết từng suất, sắp theo ngày rồi giờ — dùng cho "Xem chi tiết".
    const schedule = [...result.schedule]
      .sort((a, b) => (a.show_date + a.show_time).localeCompare(b.show_date + b.show_time))
      .map(s => ({
        movie_title: s.movie_title,
        cinema_name: s.cinema_name,
        room_name: s.room_name,
        room_type: s.room_type,
        show_date: s.show_date,
        show_time: s.show_time,
        price: s.price
      }));

    return res.json({
      success: true,
      data: {
        week_start: formatLocalDateString(startDate),
        movies_count: movies.length,
        rooms_count: result.details.roomsAvailable,
        estimated_total_showtimes: result.generated,
        skipped_estimate: result.skipped,
        // Nguyên nhân PHỔ BIẾN NHẤT khiến skipped_estimate cao và nhiều phim
        // chỉ được rất ít/0 suất: tuần này ĐÃ CÓ SẴN suất chiếu (thường do đã
        // generate trước đó) chiếm gần hết phòng/khung giờ — không phải lỗi
        // thuật toán. Trả về số này để frontend giải thích rõ thay vì chỉ
        // hiện "hết phòng/giờ trống" chung chung, dễ khiến admin tưởng nhầm
        // là bug khi thực ra tuần đó chỉ cần chọn tuần khác hoặc xoá lịch cũ.
        existing_showtimes_in_week: result.details.existingShowtimesInWeek,
        movies,
        schedule
      }
    });

  } catch (error) {
    console.error('Preview generation error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to preview'
    });
  }
};

/**
 * Get generation statistics
 * GET /api/admin/showtimes/stats
 */
const getGenerationStats = async (req, res) => {
  try {
    const { pool } = require('../config/database');
    const connection = await pool.getConnection();

    try {
      // Get showtime counts by week
      // QUAN TRỌNG: `%W` trong DATE_FORMAT là TÊN THỨ TRONG TUẦN (Monday,
      // Tuesday...), KHÔNG PHẢI số thứ tự tuần — trước đây dùng nhầm '%Y-%W'
      // khiến "tuần" hiển thị ra "2026-Wednesday", "2026-Monday"... và GROUP
      // BY theo TÊN THỨ thay vì theo tuần thật, gộp lẫn lộn "mọi thứ Hai
      // trong 4 tuần qua" thành 1 dòng — hoàn toàn sai ý nghĩa "4 tuần gần
      // nhất". Dùng YEARWEEK(show_date, 3) (chuẩn ISO, tuần bắt đầu từ Thứ
      // 2) làm khoá gộp thật, kèm MIN/MAX show_date để hiển thị khoảng ngày
      // dễ đọc thay vì mã tuần khó hiểu.
      const [weeklyStats] = await connection.query(`
        SELECT
          YEARWEEK(show_date, 3) as week_key,
          MIN(show_date) as week_start,
          MAX(show_date) as week_end,
          COUNT(*) as showtime_count,
          COUNT(DISTINCT movie_id) as movie_count,
          COUNT(DISTINCT cinema_id) as cinema_count,
          SUM(price * (total_seats - available_seats)) as revenue
        FROM showtimes
        WHERE show_date >= DATE_SUB(CURDATE(), INTERVAL 4 WEEK)
        GROUP BY week_key
        ORDER BY week_key DESC
      `);

      // "Tuần hiện tại" PHẢI dùng YEARWEEK(..., 3) giống weekly_history ở trên.
      // YEARWEEK() không tham số tính tuần từ CHỦ NHẬT: hôm Thứ Sáu 11/09 nó
      // gộp Chủ Nhật 06/09 của tuần trước vào và bỏ mất Chủ Nhật 13/09.
      const [currentWeek] = await connection.query(`
        SELECT
          COUNT(*) as total_showtimes,
          COUNT(DISTINCT movie_id) as unique_movies,
          COUNT(DISTINCT cinema_id) as unique_cinemas,
          MIN(show_date) as first_date,
          MAX(show_date) as last_date
        FROM showtimes
        WHERE YEARWEEK(show_date, 3) = YEARWEEK(CURDATE(), 3)
      `);

      // Số suất và số vé ĐÃ THANH TOÁN của CÙNG tuần hiện tại, theo từng phim.
      // Trước đây cột vé đếm vé của mọi thời điểm, lệch phạm vi với cột suất.
      const [movieShowtimeCounts] = await connection.query(`
        SELECT
          m.id,
          m.title,
          COUNT(s.id) as showtime_count,
          m.status,
          (
            SELECT COUNT(t.id) FROM tickets t
            JOIN showtimes s2 ON t.showtime_id = s2.id
            WHERE s2.movie_id = m.id AND t.booking_status = 'confirmed'
              AND t.payment_status = 'paid'
              AND YEARWEEK(s2.show_date, 3) = YEARWEEK(CURDATE(), 3)
          ) as total_bookings
        FROM movies m
        LEFT JOIN showtimes s ON m.id = s.movie_id
          AND YEARWEEK(s.show_date, 3) = YEARWEEK(CURDATE(), 3)
        WHERE m.status IN ('NOW_SHOWING', 'COMING_SOON')
        GROUP BY m.id, m.title, m.status
        ORDER BY showtime_count DESC
        LIMIT 20
      `);

      // QUAN TRỌNG: cột movies.popularity_score trong DB gần như LUÔN LÀ 0
      // (không được cập nhật/bảo trì) — hoàn toàn KHÁC với điểm phổ biến
      // THẬT dùng để phân bổ suất chiếu (tính theo công thức pha trộn vé/
      // rating/yêu thích trong ShowtimeGeneratorService, xem tab "Preview").
      // Nếu tiếp tục lấy m.popularity_score, cột "Score" ở đây sẽ LUÔN hiện
      // 0.0 cho mọi phim — trông như dữ liệu giả dù đây là cột thật trong DB
      // (chỉ là cột đó chưa từng được ai cập nhật). Tính lại điểm THẬT bằng
      // đúng thuật toán đã dùng ở Preview, đảm bảo khớp 1:1 với những gì
      // admin đã thấy khi xem trước/tạo suất.
      const generator = new ShowtimeGeneratorService();
      const scoredMovies = await generator.fetchEligibleMovies(new Date());
      const scoreById = new Map(scoredMovies.map((m) => [m.id, m]));

      const movieStats = movieShowtimeCounts.map((row) => {
        const scored = scoreById.get(row.id);
        return {
          title: row.title,
          showtime_count: row.showtime_count,
          status: row.status,
          popularity_score: scored ? Math.round(scored.popularity_score * 10) / 10 : 0,
          total_bookings: row.total_bookings,
        };
      }).sort((a, b) => b.showtime_count - a.showtime_count);

      return res.json({
        success: true,
        data: {
          current_week: currentWeek[0],
          weekly_history: weeklyStats,
          top_movies: movieStats
        }
      });

    } finally {
      connection.release();
    }

  } catch (error) {
    console.error('Get stats error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get statistics'
    });
  }
};

/**
 * Delete showtimes for a specific week (for cleanup/regeneration)
 * DELETE /api/admin/showtimes/week/:weekStart
 */
const deleteWeekShowtimes = async (req, res) => {
  try {
    const { weekStart } = req.params;
    const startDate = parseLocalDateString(weekStart);
    
    if (isNaN(startDate.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid date format'
      });
    }

    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 7);

    const { pool } = require('../config/database');
    const connection = await pool.getConnection();

    try {
      // Only delete future showtimes (prevent deleting past/booked showtimes)
      const [result] = await connection.query(`
        DELETE FROM showtimes
        WHERE show_date >= ?
          AND show_date < ?
          AND show_date >= CURDATE()
          AND available_seats = total_seats
      `, [
        formatLocalDateString(startDate),
        formatLocalDateString(endDate)
      ]);

      require("../middleware/cache").invalidateCache("showtimes");

      return res.json({
        success: true,
        message: `Deleted ${result.affectedRows} showtimes`,
        deleted_count: result.affectedRows
      });

    } finally {
      connection.release();
    }

  } catch (error) {
    console.error('Delete showtimes error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete showtimes'
    });
  }
};

/**
 * Get trending movies (recent ticket momentum) with suggested boost count
 * GET /api/admin/showtimes/trending
 */
const getTrendingMovies = async (req, res) => {
  try {
    // ?days=1|2|3 — cửa sổ so sánh. Độ hot của phim đổi theo ngày nên cho phép
    // xem nhanh cả 3 mốc: 1 ngày (nhạy nhất, bắt sóng hôm nay), 3 ngày (ổn định).
    const days = [1, 2, 3].includes(Number(req.query.days)) ? Number(req.query.days) : 3;
    const generator = new ShowtimeGeneratorService();
    const data = await generator.getTrendingSuggestions(days);
    return res.json({ success: true, data, windowDays: days });
  } catch (error) {
    console.error('Get trending movies error:', error);
    return res.status(500).json({ success: false, message: 'Failed to get trending movies' });
  }
};

/**
 * Add extra showtimes for a trending movie in the upcoming days
 * POST /api/admin/showtimes/boost/:movieId
 */
const boostMovieShowtimes = async (req, res) => {
  try {
    const { movieId } = req.params;
    const additionalShowtimes = Math.min(20, Math.max(1, parseInt(req.body.additionalShowtimes) || 1));
    // preview=true: chỉ trả kế hoạch (suất nào, mấy giờ, rạp/phòng nào, thay
    // suất của phim nào) để admin xem trước — không ghi gì vào CSDL.
    const xemTruoc = req.body.preview === true;

    const generator = new ShowtimeGeneratorService();
    const result = await generator.boostMovie(parseInt(movieId), additionalShowtimes, xemTruoc);

    if (!result.success) return res.status(400).json(result);
    if (!xemTruoc) require("../middleware/cache").invalidateCache("showtimes");
    return res.json(result);
  } catch (error) {
    console.error('Boost movie error:', error);
    return res.status(500).json({ success: false, message: 'Failed to boost movie showtimes' });
  }
};

/**
 * Utility: Get next Monday from today
 */
function getNextMonday() {
  const today = new Date();
  const dayOfWeek = today.getDay();
  const daysUntilMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek;
  
  const nextMonday = new Date(today);
  nextMonday.setDate(today.getDate() + daysUntilMonday);
  nextMonday.setHours(0, 0, 0, 0);
  
  return nextMonday;
}

module.exports = {
  generateWeeklyShowtimes,
  previewGeneration,
  getGenerationStats,
  deleteWeekShowtimes,
  getTrendingMovies,
  boostMovieShowtimes
};
