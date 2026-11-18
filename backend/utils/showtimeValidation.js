/**
 * KIỂM TRA TÍNH HỢP LỆ CỦA MỘT SUẤT CHIẾU TẠO/SỬA BẰNG TAY
 *
 * VÌ SAO CẦN FILE NÀY: mọi ràng buộc vật lý của một suất chiếu (phòng thuộc
 * đúng rạp, không chiếu 2 phim cùng lúc trong 1 phòng, không bán nhiều ghế hơn
 * sức chứa, phim phải chiếu xong trước giờ đóng cửa) trước đây CHỈ tồn tại
 * trong ShowtimeGeneratorService — tức là chỉ đường TỰ ĐỘNG mới tuân thủ.
 * Đường TẠO TAY (POST/PUT /api/admin/showtimes) không kiểm tra gì cả, nên qua
 * form quản trị vẫn có thể:
 *   - xếp 2 phim chồng giờ trong cùng 1 phòng (khách 2 suất cùng vào 1 phòng),
 *   - gán phòng của RẠP KHÁC cho suất chiếu của rạp mình,
 *   - bán 999 vé cho phòng 150 ghế,
 *   - đặt giá 1đ, hoặc tạo suất chiếu ở NGÀY ĐÃ QUA.
 * Đã kiểm chứng cả 5 trường hợp đều bị API chấp nhận trước khi có file này.
 *
 * Dùng CHUNG hằng số với generator (MIN_BUFFER_MINUTES, giờ mở/đóng cửa, độ
 * lệch giờ theo rạp) để hai đường tạo lịch không mâu thuẫn nhau — nếu đặt luật
 * riêng ở đây, lịch tạo tay sẽ bị chính generator coi là hợp lệ hoặc ngược lại.
 */
const { pool } = require("../config/database")
const SCHEDULER_CONFIG = require("../config/scheduler.config")

// Đọc CÙNG nguồn với bộ sinh lịch (config.OPERATING_HOURS — ràng buộc RB-C2).
// Trước đây chép tay 2 hằng số ở đây và QUÊN mốc "giờ mở suất cuối", nên
// admin tạo tay được suất 23:50 mà bộ sinh lịch không bao giờ tạo.
const GIO = SCHEDULER_CONFIG.OPERATING_HOURS
const OPENING_HOUR = GIO.OPEN_HOUR
const CLOSING_HOUR = GIO.MUST_END_BY_HOUR // 25 = 01:00 hôm sau: mốc phim phải KẾT THÚC trước

// Khoảng giá hợp lệ cho 1 vé (VNĐ). Đây là chốt chặn nhập liệu sai (thiếu/thừa
// số 0, hoặc giá 1đ), không phải chính sách giá — giá thật do bậc ghế và loại
// vé nhân lên từ mức này.
const MIN_TICKET_PRICE = 20000
const MAX_TICKET_PRICE = 1000000

const bad = (status, error) => ({ ok: false, status, error })

const toMinutes = (time) => {
  const [h, m] = String(time).slice(0, 5).split(":").map(Number)
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : NaN
}

// PHẢI đọc từ WEEKEND_DAYS chứ không tự định nghĩa "Thứ 7 + Chủ nhật": dự án
// này tính CẢ THỨ 6 là cuối tuần ([5,6,0]), và cuối tuần thì rạp mở sớm hơn 45
// phút. Bản đầu của hàm này tự suy ra T7/CN nên coi các suất 08:25 thứ Sáu do
// chính generator tạo ra là "trước giờ mở cửa" — luật tạo tay sẽ chặt hơn luật
// tạo tự động, chặn oan admin ở đúng khung giờ hệ thống vẫn đang dùng.
const isWeekend = (dateStr) => {
  const d = new Date(`${String(dateStr).slice(0, 10)}T00:00:00`)
  return (SCHEDULER_CONFIG.WEEKEND_DAYS || [6, 0]).includes(d.getDay())
}

/** Giờ mở/đóng cửa (tính bằng phút trong ngày) — sao đúng công thức generator. */
const openCloseMinutes = (dateStr, cinemaId) => {
  const variants = SCHEDULER_CONFIG.CINEMA_TIME_OFFSET_VARIANTS || 1
  const step = SCHEDULER_CONFIG.CINEMA_TIME_OFFSET_STEP_MINUTES || 0
  const offset = (Number(cinemaId) % variants) * step
  const weekend = isWeekend(dateStr)
  return {
    openMin: OPENING_HOUR * 60 - (weekend ? SCHEDULER_CONFIG.WEEKEND_EXTRA_OPEN_MINUTES : 0) + offset,
    closeMin: CLOSING_HOUR * 60 + offset, // 01:00 — không nới thêm vào cuối tuần
    // Giờ mở suất CUỐI: 22:30 ngày thường, 23:15 cuối tuần (+ độ lệch theo rạp)
    lastStartMin: GIO.LAST_START_HOUR * 60 + (weekend ? GIO.LAST_START_OFFSET_MINUTES.weekend : GIO.LAST_START_OFFSET_MINUTES.weekday) + offset,
  }
}

/**
 * @param {object} p
 * @param {number} p.movieId
 * @param {number} p.cinemaId
 * @param {number|null} p.roomId       null = để hàm tự chọn phòng trống
 * @param {string} p.showDate          YYYY-MM-DD
 * @param {string} p.showTime          HH:MM hoặc HH:MM:SS
 * @param {number} [p.totalSeats]      bỏ trống = lấy đúng sức chứa phòng
 * @param {number} [p.price]
 * @param {number} [p.excludeShowtimeId] bỏ qua chính suất đang sửa khi dò trùng
 * @param {boolean} [p.allowPast]      cho phép ngày quá khứ (dùng khi sửa suất cũ)
 * @returns {Promise<{ok:true, roomId:number, totalSeats:number}|{ok:false,status:number,error:string}>}
 */
async function validateShowtimeSlot({
  movieId, cinemaId, roomId, showDate, showTime,
  totalSeats, price, excludeShowtimeId = null, allowPast = false,
}) {
  const date = String(showDate).slice(0, 10)
  const time = String(showTime).slice(0, 5)
  const startMin = toMinutes(time)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(startMin)) {
    return bad(400, "Ngày hoặc giờ chiếu không hợp lệ")
  }

  if (price !== undefined && price !== null) {
    const p = Number(price)
    if (!Number.isFinite(p) || p < MIN_TICKET_PRICE || p > MAX_TICKET_PRICE) {
      return bad(400, `Giá vé phải từ ${MIN_TICKET_PRICE.toLocaleString("vi-VN")}đ đến ${MAX_TICKET_PRICE.toLocaleString("vi-VN")}đ`)
    }
  }

  const [[movie]] = await pool.query("SELECT id, title, duration FROM movies WHERE id = ?", [movieId])
  if (!movie) return bad(404, "Không tìm thấy phim")
  const duration = Number(movie.duration) || 120

  // Suất chiếu trong quá khứ không bán được vé nào — chỉ làm bẩn báo cáo và
  // hiển thị "còn chỗ" cho một buổi chiếu đã diễn ra.
  if (!allowPast) {
    const now = new Date()
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
    if (date < today || (date === today && startMin <= now.getHours() * 60 + now.getMinutes())) {
      return bad(400, "Không thể tạo suất chiếu ở thời điểm đã qua")
    }
  }

  // Phim phải KẾT THÚC trước giờ đóng cửa (buffer dọn phòng nằm sau giờ chiếu
  // xong nên không tính vào hạn chót này — giống hệt checkRoomConflict).
  const { openMin, closeMin, lastStartMin } = openCloseMinutes(date, cinemaId)
  // Quá nửa đêm thì hiển thị 24:30 -> 00:30 cho dễ đọc.
  const fmt = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`
  if (startMin > lastStartMin) {
    return bad(400, `Rạp không mở suất sau ${fmt(lastStartMin)} vào ngày này (giờ bắt đầu suất cuối cùng).`)
  }
  if (startMin < openMin || startMin + duration > closeMin) {
    return bad(400, `Rạp chỉ hoạt động ${fmt(openMin)}–${fmt(closeMin)}. Phim dài ${duration} phút nên phải bắt đầu chậm nhất lúc ${fmt(Math.min(closeMin - duration, lastStartMin))}.`)
  }

  const buffer = SCHEDULER_CONFIG.MIN_BUFFER_MINUTES ?? 20
  const endMin = startMin + duration + buffer

  // ── Chọn / kiểm tra phòng ───────────────────────────────────────────────
  let room = null
  if (roomId) {
    const [[r]] = await pool.query(
      "SELECT id, room_name, cinema_id, total_seats, is_active FROM rooms WHERE id = ?", [roomId])
    if (!r) return bad(404, "Không tìm thấy phòng chiếu")
    // Phòng thuộc rạp khác: suất chiếu sẽ hiện dưới tên rạp này nhưng lại giữ
    // chỗ một phòng vật lý của rạp kia — hỏng cả sơ đồ ghế lẫn số liệu lấp đầy.
    if (Number(r.cinema_id) !== Number(cinemaId)) {
      return bad(400, `Phòng "${r.room_name}" không thuộc rạp đã chọn`)
    }
    if (!r.is_active) return bad(400, `Phòng "${r.room_name}" đang ngừng hoạt động`)
    room = r
  }

  // ── Dò chồng lấn trong cùng phòng (theo THỜI LƯỢNG, không chỉ trùng giờ) ──
  const conflictOf = async (rid) => {
    const [rows] = await pool.query(
      `SELECT s.id, s.show_time, m.title, m.duration
       FROM showtimes s JOIN movies m ON m.id = s.movie_id
       WHERE s.room_id = ? AND s.show_date = ? AND (? IS NULL OR s.id <> ?)
         AND TIME_TO_SEC(s.show_time)/60 < ?
         AND TIME_TO_SEC(s.show_time)/60 + m.duration + ? > ?
       LIMIT 1`,
      [rid, date, excludeShowtimeId, excludeShowtimeId, endMin, buffer, startMin])
    return rows[0] || null
  }

  if (room) {
    const c = await conflictOf(room.id)
    if (c) {
      return bad(409, `Phòng "${room.room_name}" đang chiếu "${c.title}" lúc ${String(c.show_time).slice(0, 5)} (${c.duration} phút). Cần cách nhau ít nhất ${buffer} phút để dọn phòng.`)
    }
  } else {
    // Không chỉ định phòng: chọn phòng trống thật sự (trước đây chỉ loại phòng
    // TRÙNG KHÍT giờ, nên vẫn chọn trúng phòng đang chiếu dở một phim khác).
    const [candidates] = await pool.query(
      `SELECT id, room_name, total_seats FROM rooms
       WHERE cinema_id = ? AND is_active = TRUE ORDER BY total_seats DESC`, [cinemaId])
    for (const r of candidates) {
      if (!(await conflictOf(r.id))) { room = r; break }
    }
    if (!room) {
      return bad(409, "Rạp không còn phòng trống trong khung giờ này (đã tính cả thời lượng phim và thời gian dọn phòng).")
    }
  }

  // ── Số ghế không được vượt sức chứa phòng ───────────────────────────────
  const capacity = Number(room.total_seats)
  let seats = totalSeats === undefined || totalSeats === null ? capacity : Number(totalSeats)
  if (!Number.isInteger(seats) || seats <= 0) return bad(400, "Số ghế không hợp lệ")
  if (seats > capacity) {
    return bad(400, `Phòng "${room.room_name}" chỉ có ${capacity} ghế, không thể mở bán ${seats} vé.`)
  }

  return { ok: true, roomId: room.id, roomName: room.room_name, totalSeats: seats, duration }
}

module.exports = { validateShowtimeSlot, MIN_TICKET_PRICE, MAX_TICKET_PRICE }
