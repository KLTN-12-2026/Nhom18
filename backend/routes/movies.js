const express = require("express")
const { 
  getAllMovies, 
  getMovieById, 
  getMoviesByStatus,
  getPopularMovies,
  createMovie, 
  updateMovie, 
  deleteMovie, 
  getMovieShowtimes 
} = require("../controllers/movieController")
const { verifyToken, requireAdmin } = require("../middleware/auth")
const { cacheMiddleware } = require("../middleware/cache")
const { validateMovieId, validateCreateMovie } = require("../middleware/inputValidation")

const router = express.Router()

// Public routes with caching - Extended cache times for better performance
router.get("/", cacheMiddleware(600), getAllMovies) // Cache 10 minutes (movies don't change often)
router.get("/popular", cacheMiddleware(600), getPopularMovies) // Cache 10 minutes
router.get("/status/:status", cacheMiddleware(600), getMoviesByStatus) // Cache 10 minutes
router.get("/:id", validateMovieId, cacheMiddleware(600), getMovieById) // Cache 10 minutes
router.get("/:id/showtimes", validateMovieId, cacheMiddleware(120), getMovieShowtimes) // Cache 2 minutes

// Staff routes (admin + cinema manager)
// Phim là DANH MỤC DÙNG CHUNG cho cả chuỗi: 1 bản ghi phim được cả 3 rạp xếp
// suất chiếu. Để ở requireStaff thì quản lý 1 chi nhánh sửa/xoá được phim đang
// chiếu ở 2 rạp còn lại — vượt xa phạm vi rạp họ quản lý. Quản lý vẫn ĐỌC được
// danh sách phim (route GET công khai) để xếp lịch cho rạp mình.
router.post("/", verifyToken, requireAdmin, validateCreateMovie, createMovie)
router.put("/:id", verifyToken, requireAdmin, validateMovieId, validateCreateMovie, updateMovie)
router.delete("/:id", verifyToken, requireAdmin, validateMovieId, deleteMovie)

module.exports = router
