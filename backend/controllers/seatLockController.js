const SeatLock = require("../models/SeatLock")

/**
 * Gửi sự kiện ghế tới mọi người đang xem sơ đồ của suất chiếu đó.
 * Socket có thể chưa sẵn sàng (vd gọi trước khi server khởi động xong) —
 * nuốt lỗi vì client vẫn tự làm mới định kỳ, không được để hỏng lượt giữ ghế.
 */
function phatTinHieuGhe(showtimeId, suKien, duLieu) {
  try {
    const { getIO } = require("../socket")
    getIO().to(`showtime-${showtimeId}`).emit(suKien, { showtimeId: Number(showtimeId), ...duLieu })
  } catch (_) {}
}

/**
 * Lock seats when user selects them
 */
const lockSeats = async (req, res) => {
  try {
    const { showtime_id, seats } = req.body
    
    if (!showtime_id || !seats || !Array.isArray(seats) || seats.length === 0) {
      return res.status(400).json({ error: "Showtime ID and seats array are required" })
    }
    
    if (seats.length > 10) {
      return res.status(400).json({ error: "Cannot lock more than 10 seats at once" })
    }
    
    const userId = req.user?.id || null
    const sessionId = req.sessionID || req.headers['x-session-id'] || null

    // lock_seats (stored procedure) xác định "ai đang giữ ghế" dựa vào
    // userId HOẶC sessionId — nếu CẢ HAI đều null (khách chưa đăng nhập và
    // không gửi x-session-id, express-session cũng không cấu hình nên
    // req.sessionID luôn undefined), điều kiện so khớp chủ sở hữu trong SP
    // luôn sai, khiến MỌI lượt khoá ghế bị coi là "đã bị người khác giữ" và
    // rollback — kể cả ghế hoàn toàn trống. Chặn sớm ở đây thay vì để lọt
    // xuống SP, vì sửa logic bên trong stored procedure rủi ro cao hơn.
    if (!userId && !sessionId) {
      return res.status(400).json({ error: "Cần đăng nhập hoặc cung cấp x-session-id để giữ ghế" })
    }

    // First check if seats are available.
    // BỎ QUA lock của chính người đang gọi: stored procedure lock_seats vốn cho
    // phép chủ sở hữu khoá lại ghế của mình (idempotent), nhưng bước kiểm tra
    // này trước đây không xét chủ sở hữu nên chặn oan. Kịch bản thật: khách giữ
    // ghế A1,A2 rồi chọn thêm A3 và gọi lại với [A1,A2,A3] — chính 2 ghế mình
    // đang giữ khiến request bị trả 409 "ghế không còn trống", không thể mở
    // rộng lựa chọn. Cùng loại lỗi đã sửa ở ticketController/paymentController.
    const availability = await SeatLock.checkSeatsAvailable(showtime_id, seats, {
      ignoreUserId: userId,
      ignoreSessionId: sessionId,
    })
    
    if (!availability.available) {
      return res.status(409).json({ 
        error: "Some seats are not available",
        lockedSeats: availability.lockedSeats,
        bookedSeats: availability.bookedSeats
      })
    }
    
    await SeatLock.lockSeats(showtime_id, userId, sessionId, seats, SeatLock.HOLD_MINUTES)

    // Trả về MỐC HẾT HẠN TUYỆT ĐỐI, không chỉ số giây còn lại: đồng hồ đếm
    // ngược ở giao diện phải bám theo giờ server, nếu chỉ đưa "còn 900 giây"
    // thì mỗi lần người dùng tải lại trang là đồng hồ nhảy về đủ 15 phút
    // trong khi khoá thật vẫn đang chạy — hiển thị sai thời gian còn lại.
    const expiresAt = new Date(Date.now() + SeatLock.HOLD_MINUTES * 60 * 1000)
    // Báo NGAY cho những người đang mở sơ đồ ghế của suất này. Trước đây chỉ có
    // sự kiện "đang chọn ghế" (phát khi còn ở màn chọn ghế), nên khi một người
    // sang bước thanh toán thì người vào sau KHÔNG thấy ghế đã bị giữ.
    phatTinHieuGhe(showtime_id, "seats-locked", { seats, userId });

    res.json({
      message: "Seats locked successfully",
      holdMinutes: SeatLock.HOLD_MINUTES,
      expiresIn: SeatLock.HOLD_MINUTES * 60,
      expiresAt: expiresAt.toISOString(),
      seats,
    })
  } catch (error) {
    console.error("Lock seats error:", error)
    
    if (error.message === 'SEATS_LOCKED') {
      return res.status(409).json({ 
        error: "These seats are currently being selected by another user. Please choose different seats."
      })
    }
    
    res.status(500).json({ error: "Failed to lock seats" })
  }
}

/**
 * Unlock seats when user deselects or leaves
 */
const unlockSeats = async (req, res) => {
  try {
    const { showtime_id, seats } = req.body
    
    if (!showtime_id || !seats || !Array.isArray(seats)) {
      return res.status(400).json({ error: "Showtime ID and seats array are required" })
    }
    
    const userId = req.user?.id || null
    const sessionId = req.sessionID || req.headers['x-session-id'] || null

    if (!userId && !sessionId) {
      return res.status(400).json({ error: "Cần đăng nhập hoặc cung cấp x-session-id để nhả ghế" })
    }

    await SeatLock.unlockSeats(showtime_id, userId, sessionId, seats)
    phatTinHieuGhe(showtime_id, "seats-unlocked", { seats, userId })

    res.json({ message: "Seats unlocked successfully" })
  } catch (error) {
    console.error("Unlock seats error:", error)
    res.status(500).json({ error: "Failed to unlock seats" })
  }
}

/**
 * Get all locked seats for a showtime
 */
const getLockedSeats = async (req, res) => {
  try {
    const { showtimeId } = req.params
    
    if (!showtimeId) {
      return res.status(400).json({ error: "Showtime ID is required" })
    }
    
    const lockedSeats = await SeatLock.getLockedSeats(parseInt(showtimeId))
    
    // Return only seat codes (hide user info for privacy)
    const seatCodes = lockedSeats.map(lock => lock.seat_code)
    
    res.json({ 
      lockedSeats: seatCodes,
      count: seatCodes.length
    })
  } catch (error) {
    console.error("Get locked seats error:", error)
    res.status(500).json({ error: "Failed to get locked seats" })
  }
}

/**
 * Extend lock duration (when user is still on payment page)
 */
const extendLock = async (req, res) => {
  try {
    const { showtime_id, seats, additionalMinutes = 5 } = req.body
    
    if (!showtime_id || !seats || !Array.isArray(seats)) {
      return res.status(400).json({ error: "Showtime ID and seats array are required" })
    }
    
    const userId = req.user?.id || null
    const sessionId = req.sessionID || req.headers['x-session-id'] || null

    // Cùng lý do chặn ở lockSeats/unlockSeats: nếu cả userId và sessionId đều
    // null, UPDATE trong SeatLock.extendLock không lọc theo chủ sở hữu (mọi
    // điều kiện AND user_id=?/AND session_id=? bị bỏ qua), gia hạn được lock
    // của BẤT KỲ ai đang giữ ghế đó — cho phép "câu" giữ ghế vô thời hạn.
    if (!userId && !sessionId) {
      return res.status(400).json({ error: "Cần đăng nhập hoặc cung cấp x-session-id để gia hạn giữ ghế" })
    }

    await SeatLock.extendLock(showtime_id, userId, sessionId, seats, additionalMinutes)
    
    res.json({ 
      message: "Lock extended successfully",
      additionalMinutes
    })
  } catch (error) {
    console.error("Extend lock error:", error)
    res.status(500).json({ error: "Failed to extend lock" })
  }
}

/**
 * Check if specific seats are available
 */
const checkAvailability = async (req, res) => {
  try {
    const { showtimeId } = req.params
    const { seats } = req.body

    if (!showtimeId || !seats || !Array.isArray(seats)) {
      return res.status(400).json({ error: "Showtime ID and seats array are required" })
    }

    // Cũng bỏ qua lock của chính người hỏi — nếu không, khách vừa giữ ghế xong
    // hỏi lại "ghế này còn trống không" sẽ nhận về chính ghế mình đang giữ như
    // thể người khác đã lấy mất.
    const availability = await SeatLock.checkSeatsAvailable(parseInt(showtimeId), seats, {
      ignoreUserId: req.user?.id || null,
      ignoreSessionId: req.sessionID || req.headers['x-session-id'] || null,
    })
    
    res.json(availability)
  } catch (error) {
    console.error("Check availability error:", error)
    res.status(500).json({ error: "Failed to check seat availability" })
  }
}

module.exports = {
  lockSeats,
  unlockSeats,
  getLockedSeats,
  extendLock,
  checkAvailability
}
