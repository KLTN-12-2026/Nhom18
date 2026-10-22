const express = require("express")
const { nhanDienNeuCo } = require("../middleware/auth")
const {
	getShowtimeById,
	getShowtimesByDate,
	getTodayLiveShowtimes,
	getAllShowtimesDebug,
	getShowtimesByMovieDebug,
} = require("../controllers/showtimeController")
const { validateShowtimeId, validateMovieId } = require("../middleware/inputValidation")
const { cacheMiddleware } = require("../middleware/cache")

const router = express.Router()

// Live endpoint for homepage today section
router.get("/today/live", getTodayLiveShowtimes)

// Get showtimes by date (query param) - Cache 3 phút
router.get("/", cacheMiddleware(180), getShowtimesByDate)

// Debug routes (dev only) — safe to call locally
router.get("/debug/list", getAllShowtimesDebug)
router.get("/debug/movie/:movieId", validateMovieId, getShowtimesByMovieDebug)

// Get single showtime - NO caching: seat availability is real-time data
// nhanDienNeuCo: khong bat buoc dang nhap va KHONG BAO GIO chan (token het han
// van xem duoc), nhung NEU co token hop le thi biet nguoi
// hoi la ai — de tach khoa ghe cua CHINH ho ra khoi khoa cua nguoi khac.
router.get("/:id", nhanDienNeuCo, validateShowtimeId, getShowtimeById)

module.exports = router
