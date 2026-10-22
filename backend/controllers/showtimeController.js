const Showtime = require("../models/Showtime")
const SeatLock = require("../models/SeatLock")
const { buildSeatLayout } = require("../utils/seatLayout")
const { getAllowedTicketTypes } = require("../utils/ticketPricing")
const { TICKET_TYPE_DISCLAIMER } = require("../config/ticketPricing.config")

const getShowtimeById = async (req, res) => {
  try {
    const { id } = req.params

    // Chạy song song: lấy showtime (đã JOIN movie/cinema/room) + booked seats + locked seats
    const [showtime, bookedSeats, rawLocks] = await Promise.all([
      Showtime.findById(id),
      Showtime.getBookedSeats(id),
      SeatLock.getLockedSeatsWithOwner(parseInt(id)).catch(() => []),
    ])

    if (!showtime) {
      return res.status(404).json({ error: `Showtime not found for id ${id}` })
    }

    // Xây dựng object lồng nhau từ dữ liệu JOIN (không cần query thêm)
    showtime.movie = showtime.movie_id ? {
      id:          showtime.movie_id,
      title:       showtime.movie_title,
      poster_url:  showtime.poster_url,
      duration:    showtime.duration,
      genre:       showtime.genre,
      rating:      showtime.rating,
      description: showtime.description,
      status:      showtime.movie_status,
      release_date:showtime.release_date,
      director:    showtime.director,
      cast:        showtime.movie_cast,
      studio:      showtime.studio,
      language:    showtime.language,
    } : null

    showtime.cinema = showtime.cinema_id ? {
      id:       showtime.cinema_id,
      name:     showtime.cinema_name,
      location: showtime.location,
    } : null

    showtime.room = showtime.room_id ? {
      id:        showtime.room_id,
      room_name: showtime.room_name,
      room_type: showtime.room_type,
    } : null

    showtime.booked_seats  = bookedSeats

    // TÁCH khoá ghế của CHÍNH người đang hỏi ra khỏi khoá của người khác.
    //
    // Trước đây trả gộp tất cả vào `locked_seats`, và giao diện tô đỏ hết —
    // nên khách bấm sang bước thanh toán (hệ thống giữ ghế cho họ) rồi quay
    // lại đổi ghế thì thấy chính ghế MÌNH đang giữ bị đỏ, không bấm lại được,
    // tưởng vừa bị người khác cướp mất. Ghế đó phải hiện là "bạn đang giữ".
    const idNguoiDung = req.user?.id ?? null
    const maPhien = req.headers["x-session-id"] || null
    const laCuaToi = (l) =>
      (idNguoiDung != null && l.user_id === idNguoiDung) ||
      (maPhien != null && l.session_id === maPhien)

    showtime.locked_seats    = rawLocks.filter(l => !laCuaToi(l)).map(l => l.seat_code).filter(Boolean)
    showtime.my_locked_seats = rawLocks.filter(laCuaToi).map(l => l.seat_code).filter(Boolean)

    // Sơ đồ + HẠNG GHẾ + bảng giá từng hạng do SERVER quyết định và gửi xuống.
    // Trước đây frontend tự sinh sơ đồ ghế và tự cộng phụ thu "ghế đẹp", dẫn
    // tới số tiền hiển thị lệch số tiền thật bị trừ. Giờ client chỉ hiển thị
    // đúng những gì server tính, không tự suy diễn giá nữa.
    showtime.seat_layout = buildSeatLayout(
      showtime.room_capacity || showtime.total_seats,
      showtime.price,
    )

    // Loại vé được phép cho ĐÚNG phim này (theo nhãn phân loại độ tuổi) kèm
    // câu chú thích trách nhiệm — để giao diện khỏi tự định nghĩa luật riêng.
    showtime.ticket_types = getAllowedTicketTypes(showtime.rating)
    showtime.ticket_type_disclaimer = TICKET_TYPE_DISCLAIMER

    res.json({ showtime })
  } catch (error) {
    console.error("Get showtime error:", error)
    // Return the actual error message to help debugging in dev (do not expose in production)
    res.status(500).json({ error: error?.message || "Failed to fetch showtime" })
  }
}

const getShowtimesByDate = async (req, res) => {
  try {
    const { date, cinemaId } = req.query
    if (!date) {
      return res.status(400).json({ error: "Date parameter is required" })
    }
    
    // Pass cinemaId to model for SQL filtering (more efficient)
    const showtimes = await Showtime.findByDate(date, cinemaId || null)

    if (showtimes.length > 0) {
      return res.json({ showtimes, count: showtimes.length, requested_date: date })
    }

    // Fallback: if requested date has no showtimes, return nearest upcoming date.
    const fallbackShowtimes = await Showtime.findNextAvailableByDate(date, cinemaId || null)
    if (fallbackShowtimes.length > 0) {
      return res.json({
        showtimes: fallbackShowtimes,
        count: fallbackShowtimes.length,
        requested_date: date,
        resolved_date: fallbackShowtimes[0].show_date,
        is_fallback: true,
      })
    }

    return res.json({ showtimes: [], count: 0, requested_date: date })
  } catch (error) {
    console.error("Get showtimes by date error:", error)
    res.status(500).json({ error: error?.message || "Failed to fetch showtimes" })
  }
}

const getTodayLiveShowtimes = async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 8, 1), 20)
    const showtimes = await Showtime.findTodayLive(limit)

    // Keep home live section fresh while avoiding repeated cold hits.
    res.set('Cache-Control', 'public, max-age=30, stale-while-revalidate=30')
    res.json({ showtimes, count: showtimes.length })
  } catch (error) {
    console.error('Get today live showtimes error:', error)
    res.status(500).json({ error: error?.message || 'Failed to fetch today live showtimes' })
  }
}

module.exports = {
  getShowtimeById,
  getShowtimesByDate,
  getTodayLiveShowtimes,
}

// Debug helpers (dev only)
const getAllShowtimesDebug = async (req, res) => {
  try {
    const rows = await Showtime.findAll()
    res.json({ count: rows.length, rows })
  } catch (error) {
    console.error("getAllShowtimesDebug error:", error)
    res.status(500).json({ error: error?.message || "Failed to list showtimes" })
  }
}

const getShowtimesByMovieDebug = async (req, res) => {
  try {
    const { movieId } = req.params
    const rows = await Showtime.findByMovie(movieId)
    res.json({ count: rows.length, rows })
  } catch (error) {
    console.error("getShowtimesByMovieDebug error:", error)
    res.status(500).json({ error: error?.message || "Failed to list showtimes for movie" })
  }
}

module.exports.getAllShowtimesDebug = getAllShowtimesDebug
module.exports.getShowtimesByMovieDebug = getShowtimesByMovieDebug
