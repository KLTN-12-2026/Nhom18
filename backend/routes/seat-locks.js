const express = require("express")
const router = express.Router()
const seatLockController = require("../controllers/seatLockController")
const { verifyToken, optionalAuth } = require("../middleware/auth")
const { seatLockLimiter } = require("../middleware/rateLimiter")

// optionalAuth là BẮT BUỘC ở đây (dù tên gọi là "optional"): các handler xác
// định "ai đang giữ ghế" bằng `req.user?.id`, mà nếu không có middleware nào
// giải mã token thì req.user LUÔN undefined. Dự án không dùng express-session
// nên req.sessionID cũng undefined — kết quả là mọi request giữ ghế của người
// dùng ĐÃ ĐĂNG NHẬP đều bị chặn ở bước kiểm tra định danh và trả về 400
// "Cần đăng nhập hoặc cung cấp x-session-id". Đó là lý do tính năng giữ ghế
// chưa từng dùng được từ giao diện.
// GIỮ GHẾ BẮT BUỘC ĐĂNG NHẬP (verifyToken). Trước đây dùng optionalAuth để
// khách vãng lai tự gửi x-session-id cũng giữ được ghế — nhưng khách vãng lai
// vốn KHÔNG thanh toán được (trang thanh toán bắt đăng nhập), nên việc đó
// không đem lại gì mà mở ra khe hở: đổi x-session-id liên tục là giữ được
// 10 ghế × 30 lần/phút × 15 phút, đủ làm kín cả suất chiếu mà không cần tài
// khoản. Rạp thật cũng chỉ giữ ghế cho người đã đăng nhập.
router.post("/lock", seatLockLimiter, verifyToken, seatLockController.lockSeats)

// Unlock seats
router.post("/unlock", seatLockLimiter, optionalAuth, seatLockController.unlockSeats)

// Get locked seats for a showtime (public - so users can see which seats are taken)
router.get("/:showtimeId/locked", seatLockController.getLockedSeats)

// Extend lock duration
router.post("/extend", seatLockLimiter, verifyToken, seatLockController.extendLock)

// Check seat availability — optionalAuth để bỏ qua lock của CHÍNH người hỏi
// (xem SeatLock.checkSeatsAvailable), tránh báo "ghế không còn trống" cho đúng
// ghế mà họ đang giữ.
router.post("/:showtimeId/check", optionalAuth, seatLockController.checkAvailability)

module.exports = router
