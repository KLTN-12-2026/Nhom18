/**
 * Cinema Stats Routes
 * 
 * Routes để xem thống kê theo từng rạp
 */

const express = require('express');
const CinemaStatsController = require('../controllers/cinemaStatsController');
const { verifyToken, requireAdmin, requireStaff } = require('../middleware/auth');
const { requireOwnCinema } = require('../middleware/cinemaScope');

// Rạp mà URL đang nhắm tới (/api/cinema-stats/:cinemaId/...)
const cinemaIdParam = (req) => req.params.cinemaId;

const router = express.Router();

// TOÀN BỘ route trong file này trả về dữ liệu kinh doanh nội bộ (doanh thu,
// số vé bán, tỉ lệ lấp đầy...) — trước đây gần như mọi route KHÔNG có
// verifyToken/requireStaff nào cả (chỉ 3 route cuối có requireAdmin), nghĩa
// là bất kỳ ai kể cả chưa đăng nhập gọi thẳng API cũng lấy được doanh thu
// thật của từng rạp (chính là dữ liệu đổ vào biểu đồ "Doanh thu theo rạp" ở
// admin dashboard). Áp dụng chung 1 lớp xác thực cho CẢ router, giống đúng
// pattern đã dùng ở reports.js cho cùng loại dữ liệu báo cáo nội bộ.
router.use(verifyToken, requireStaff)

// Tổng hợp/so sánh NHIỀU RẠP — bản chất là dữ liệu toàn chuỗi, không thể cắt
// theo 1 chi nhánh, nên CHỈ ADMIN. Trước đây các route này ở mức requireStaff,
// nghĩa là quản lý chi nhánh xem được doanh thu và so sánh phim của CẢ 3 RẠP —
// đúng thứ mà phân quyền theo chi nhánh cần ngăn.
router.get('/all-cinemas/summary', requireAdmin, CinemaStatsController.getAllCinemasSummary);
router.get('/all-cinemas/top-movies', requireAdmin, CinemaStatsController.getTopMoviesByAllCinemas);
router.get('/all/hot-movies', requireAdmin, CinemaStatsController.getAllCinemasHotMovies);
router.get('/movies/:movieId/compare', requireAdmin, CinemaStatsController.compareMovieAcrossCinemas);

// Thống kê của MỘT rạp — quản lý chỉ được xem đúng rạp mình. Không chặn thì
// họ chỉ cần đổi số trên URL (/api/cinema-stats/2) là xem được rạp khác.
router.get('/:cinemaId', requireOwnCinema(cinemaIdParam), CinemaStatsController.getCinemaOverview);
router.get('/:cinemaId/movies', requireOwnCinema(cinemaIdParam), CinemaStatsController.getActiveMovies);
router.get('/:cinemaId/hot-movies', requireOwnCinema(cinemaIdParam), CinemaStatsController.getHotMovies);

// Chỉ admin (không phải cinema_manager) mới xem được — giữ nguyên mức hạn chế
// nghiêm ngặt hơn đã có từ trước cho đúng 3 route này.
router.get('/:cinemaId/tickets', requireAdmin, CinemaStatsController.getTicketStats);
router.get('/:cinemaId/occupancy', requireAdmin, CinemaStatsController.getOccupancyStats);
router.get('/:cinemaId/movies/:movieId', requireAdmin, CinemaStatsController.getMovieDetailStats);

module.exports = router;
