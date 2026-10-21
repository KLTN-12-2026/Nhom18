/**
 * RÀ SOÁT LOGIC TOÀN HỆ THỐNG
 * Mỗi phép kiểm tra mô tả một quy tắc nghiệp vụ PHẢI luôn đúng.
 * Trả về 0 dòng = đạt. Trả về >0 dòng = có dữ liệu vi phạm quy tắc đó.
 */
require("dotenv").config()
const { pool } = require("../config/database")

const KQ = []
const kiem = async (nhom, ten, sql, params = []) => {
  try {
    const [rows] = await pool.query(sql, params)
    KQ.push({ nhom, ten, so: rows.length, mau: rows.slice(0, 3) })
  } catch (e) {
    KQ.push({ nhom, ten, loi: e.message })
  }
}

;(async () => {
  // ─── ĐẶT VÉ & GHẾ ───────────────────────────────────────────────
  await kiem("Đặt vé", "Ghế bán trùng trong cùng suất chiếu",
    `SELECT showtime_id, seat_code FROM ticket_seats WHERE status='confirmed'
     GROUP BY showtime_id, seat_code HAVING COUNT(*) > 1`)

  await kiem("Đặt vé", "available_seats khớp số ghế đã bán",
    `SELECT s.id FROM showtimes s
     LEFT JOIN (SELECT showtime_id, COUNT(*) c FROM ticket_seats WHERE status='confirmed' GROUP BY showtime_id) x
       ON x.showtime_id = s.id
     WHERE s.available_seats <> s.total_seats - COALESCE(x.c, 0)`)

  await kiem("Đặt vé", "available_seats nằm trong khoảng hợp lệ",
    `SELECT id FROM showtimes WHERE available_seats < 0 OR available_seats > total_seats`)

  await kiem("Đặt vé", "Vé xác nhận đều có ít nhất 1 ghế",
    `SELECT t.id FROM tickets t WHERE t.booking_status='confirmed'
       AND NOT EXISTS (SELECT 1 FROM ticket_seats ts WHERE ts.ticket_id=t.id AND ts.status='confirmed')`)

  await kiem("Đặt vé", "ticket_seats.showtime_id khớp tickets.showtime_id",
    `SELECT ts.id FROM ticket_seats ts JOIN tickets t ON t.id=ts.ticket_id
     WHERE ts.showtime_id <> t.showtime_id`)

  await kiem("Đặt vé", "Vé đã huỷ thì ghế cũng phải huỷ theo",
    `SELECT ts.id FROM ticket_seats ts JOIN tickets t ON t.id=ts.ticket_id
     WHERE t.booking_status='cancelled' AND ts.status='confirmed'`)

  await kiem("Đặt vé", "Ghế khoá quá hạn chưa được dọn",
    `SELECT id FROM seat_locks WHERE expires_at < NOW()`)

  // ─── TIỀN & THANH TOÁN ──────────────────────────────────────────
  await kiem("Thanh toán", "Tổng tiền vé = tổng giá ghế + combo − giảm giá",
    `SELECT t.id FROM tickets t JOIN ticket_seats ts ON ts.ticket_id=t.id AND ts.status='confirmed'
     WHERE t.booking_status='confirmed'
     GROUP BY t.id, t.total_amount, t.combo_total, t.discount_amount
     HAVING ABS(t.total_amount - (SUM(ts.price) + COALESCE(t.combo_total,0) - COALESCE(t.discount_amount,0))) > 1`)

  await kiem("Thanh toán", "Không có số tiền âm",
    `SELECT id FROM tickets WHERE total_amount < 0 OR COALESCE(combo_total,0) < 0 OR COALESCE(discount_amount,0) < 0`)

  await kiem("Thanh toán", "Giảm giá không vượt quá tổng tiền",
    `SELECT id FROM tickets WHERE COALESCE(discount_amount,0) > total_amount + COALESCE(discount_amount,0)`)

  await kiem("Thanh toán", "Vé đã huỷ không còn ở trạng thái 'đã thanh toán'",
    `SELECT id FROM tickets WHERE booking_status='cancelled' AND payment_status='paid'`)

  await kiem("Thanh toán", "Giá ghế > 0",
    `SELECT ts.id FROM ticket_seats ts WHERE ts.status='confirmed' AND ts.price <= 0`)

  // ─── ĐIỂM THƯỞNG & VOUCHER ──────────────────────────────────────
  // Cột point_transactions.amount ĐÃ TỰ MANG DẤU: giao dịch 'earn' lưu số
  // dương, 'redeem'/'revoke' lưu số ÂM. Vì vậy số dư = SUM(amount) trực tiếp.
  //
  // Công thức cũ ở đây là `CASE WHEN type='earn' THEN amount ELSE -amount END`
  // — nó giả định amount luôn dương và tự suy dấu từ cột type, nên với dòng
  // redeem lưu -40 nó tính ra -(-40) = +40, tức CỘNG thêm thay vì trừ. Sai này
  // im lặng suốt vì tới trước đó chưa có giao dịch đổi điểm nào; chỉ lộ ra khi
  // người dùng đầu tiên đổi điểm lấy voucher.
  await kiem("Điểm/Voucher", "Số dư điểm khớp sổ cái giao dịch",
    `SELECT u.id FROM users u LEFT JOIN point_transactions pt ON pt.user_id=u.id
     GROUP BY u.id, u.points
     HAVING u.points <> COALESCE(SUM(pt.amount), 0)`)

  await kiem("Điểm/Voucher", "Không ai có điểm âm",
    `SELECT id FROM users WHERE points < 0`)

  await kiem("Điểm/Voucher", "used_count khớp số lượt đổi thực tế",
    `SELECT v.id FROM vouchers v LEFT JOIN voucher_redemptions vr ON vr.voucher_id=v.id
     GROUP BY v.id, v.used_count HAVING v.used_count <> COUNT(vr.id)`)

  await kiem("Điểm/Voucher", "Voucher không dùng quá giới hạn",
    `SELECT id FROM vouchers WHERE usage_limit IS NOT NULL AND used_count > usage_limit`)

  // ─── LỊCH CHIẾU ─────────────────────────────────────────────────
  await kiem("Lịch chiếu", "Không có 2 suất chồng giờ trong cùng phòng",
    `SELECT a.id FROM showtimes a
     JOIN showtimes b ON b.room_id=a.room_id AND b.show_date=a.show_date AND b.id>a.id
     JOIN movies ma ON ma.id=a.movie_id JOIN movies mb ON mb.id=b.movie_id
     WHERE a.room_id IS NOT NULL
       AND a.show_time < ADDTIME(b.show_time, SEC_TO_TIME((mb.duration+15)*60))
       AND b.show_time < ADDTIME(a.show_time, SEC_TO_TIME((ma.duration+15)*60))`)

  await kiem("Lịch chiếu", "Phòng chiếu phải thuộc đúng rạp của suất",
    `SELECT s.id FROM showtimes s JOIN rooms r ON r.id=s.room_id WHERE s.cinema_id <> r.cinema_id`)

  // CHỈ xét suất TƯƠNG LAI. showtimes.total_seats là BẢN CHỤP sức chứa phòng
  // tại thời điểm tạo suất — đó là lý do cột này tồn tại riêng thay vì luôn
  // JOIN sang rooms. Khi sửa sức chứa một phòng (vd nâng cấp phòng IMAX từ 80
  // lên 200 ghế), các suất ĐÃ CHIẾU phải giữ nguyên con số cũ mới phản ánh
  // đúng thực tế lúc đó — nhất là những suất đã bán vé.
  await kiem("Lịch chiếu", "total_seats khớp sức chứa phòng (suất tương lai)",
    `SELECT s.id FROM showtimes s JOIN rooms r ON r.id=s.room_id
     WHERE s.show_date >= CURDATE() AND s.total_seats <> r.total_seats`)

  await kiem("Lịch chiếu", "Giá vé > 0",
    `SELECT id FROM showtimes WHERE price <= 0`)

  await kiem("Lịch chiếu", "Suất chiếu tương lai không thuộc phim đã ngừng chiếu",
    `SELECT s.id FROM showtimes s JOIN movies m ON m.id=s.movie_id
     WHERE s.show_date >= CURDATE() AND m.status='ENDED'`)

  // Luật giờ giấc — phải TÍNH ĐÚNG NHƯ ShowtimeGeneratorService._openCloseMinutes,
  // nếu không sẽ báo oan. Bản trước dùng mốc phẳng 01:00 cho giờ kết thúc nhưng
  // lại cộng sẵn 20 phút cho giờ mở suất cuối, tức là hai nửa của cùng một luật
  // dùng hai công thức khác nhau: 13 suất hợp lệ của rạp lệch +10/+20 phút bị
  // báo là vi phạm. Độ lệch giờ theo rạp (0/10/20 phút) là CỐ Ý — để ba rạp
  // không cùng mở suất vào đúng một phút.
  const lich = require("../config/scheduler.config")
  const soBien = lich.CINEMA_TIME_OFFSET_VARIANTS || 1
  const buoc = lich.CINEMA_TIME_OFFSET_STEP_MINUTES || 0
  // Giờ hoạt động đọc CÙNG nguồn với bộ sinh lịch (ràng buộc RB-C2), không chép tay
  const gio = lich.OPERATING_HOURS
  const lechGiay = `((s.cinema_id % ${soBien}) * ${buoc} * 60)`
  // Cuối tuần = Thứ Sáu, Bảy, Chủ nhật (DAYOFWEEK: 1=CN, 6=T6, 7=T7) — khớp
  // _isWeekend của bộ sinh lịch, nơi Thứ Sáu ĐƯỢC tính là cuối tuần.
  const cuoiTuan = `DAYOFWEEK(s.show_date) IN (1, 6, 7)`
  await kiem("Lịch chiếu", "Giờ chiếu nằm trong khung mở/đóng cửa của từng rạp",
    `SELECT s.id FROM showtimes s JOIN movies m ON m.id=s.movie_id
     WHERE s.show_date >= CURDATE()
       AND (TIME_TO_SEC(s.show_time) + m.duration*60 > ${gio.MUST_END_BY_HOUR}*3600 + ${lechGiay}
            OR TIME_TO_SEC(s.show_time) > ${gio.LAST_START_HOUR}*3600 + IF(${cuoiTuan}, ${gio.LAST_START_OFFSET_MINUTES.weekend}*60, ${gio.LAST_START_OFFSET_MINUTES.weekday}*60) + ${lechGiay})`)

  // ─── PHÂN QUYỀN & TÀI KHOẢN ─────────────────────────────────────
  await kiem("Phân quyền", "Quản lý chi nhánh đều đã được gán rạp",
    `SELECT id FROM users WHERE role='cinema_manager' AND cinema_id IS NULL`)

  await kiem("Phân quyền", "cinema_id chỉ gán cho quản lý chi nhánh",
    `SELECT id FROM users WHERE role <> 'cinema_manager' AND cinema_id IS NOT NULL`)

  await kiem("Phân quyền", "Email không trùng nhau",
    `SELECT email FROM users GROUP BY email HAVING COUNT(*) > 1`)

  await kiem("Phân quyền", "Tài khoản thường đều có mật khẩu",
    `SELECT id FROM users WHERE google_id IS NULL AND (password IS NULL OR password = '')`)

  // ─── ĐÁNH GIÁ ───────────────────────────────────────────────────
  await kiem("Đánh giá", "Chỉ người đã mua vé mới được đánh giá",
    `SELECT mr.id FROM movie_reviews mr WHERE NOT EXISTS (
       SELECT 1 FROM tickets t JOIN showtimes s ON s.id=t.showtime_id
       WHERE t.user_id=mr.user_id AND s.movie_id=mr.movie_id AND t.booking_status='confirmed')`)

  await kiem("Đánh giá", "Điểm chấm nằm trong 1..5",
    `SELECT id FROM movie_ratings WHERE rating < 1 OR rating > 5`)

  await kiem("Đánh giá", "average_rating khớp điểm chấm thực tế",
    `SELECT m.id FROM movies m JOIN movie_ratings mr ON mr.movie_id=m.id
     GROUP BY m.id, m.average_rating HAVING ABS(COALESCE(m.average_rating,0) - AVG(mr.rating)) > 0.05`)

  // ─── DỮ LIỆU MỒ CÔI ─────────────────────────────────────────────
  await kiem("Toàn vẹn", "Vé trỏ tới suất chiếu không tồn tại",
    `SELECT t.id FROM tickets t LEFT JOIN showtimes s ON s.id=t.showtime_id WHERE s.id IS NULL`)

  // Hai phép kiểm này bù cho chỗ THIẾU KHOÁ NGOẠI của ticket_seats: bảng này
  // chỉ có PRIMARY + UNIQUE, không có ràng buộc tham chiếu tới tickets hay
  // showtimes. Cơ sở dữ liệu vì thế KHÔNG tự chặn dòng mồ côi, và thực tế đã
  // tích tụ 14 dòng trỏ tới vé đã bị xoá (phát hiện 16/09/2026).
  await kiem("Toàn vẹn", "Dòng ghế trỏ tới vé không tồn tại",
    `SELECT ts.id FROM ticket_seats ts LEFT JOIN tickets t ON t.id = ts.ticket_id
     WHERE t.id IS NULL`)

  // tickets.seats (JSON) và ticket_seats lưu CÙNG một thông tin ở hai nơi.
  // Hai nguồn thì sớm muộn cũng lệch: vé #8 có 2 ghế trong JSON nhưng chỉ 1
  // dòng trong bảng, khiến total_amount gấp đôi tổng giá ghế thật — đúng vi
  // phạm mà mục "Thanh toán" vẫn báo.
  await kiem("Toàn vẹn", "Số ghế trong tickets.seats khớp số dòng ticket_seats",
    `SELECT t.id FROM tickets t
     WHERE t.seats IS NOT NULL
       AND JSON_LENGTH(t.seats) <> (SELECT COUNT(*) FROM ticket_seats ts WHERE ts.ticket_id = t.id)`)

  await kiem("Toàn vẹn", "Suất chiếu trỏ tới phim/rạp không tồn tại",
    `SELECT s.id FROM showtimes s LEFT JOIN movies m ON m.id=s.movie_id
     LEFT JOIN cinemas c ON c.id=s.cinema_id WHERE m.id IS NULL OR c.id IS NULL`)

  await kiem("Toàn vẹn", "Phim nổi bật đều đang chiếu",
    `SELECT id FROM movies WHERE featured_order IS NOT NULL AND status <> 'NOW_SHOWING'`)

  await kiem("Toàn vẹn", "Thứ tự phim nổi bật không trùng nhau",
    `SELECT featured_order FROM movies WHERE featured_order IS NOT NULL
     GROUP BY featured_order HAVING COUNT(*) > 1`)

  // ─── IN KẾT QUẢ ─────────────────────────────────────────────────
  let dat = 0, loi = 0, hong = 0
  let nhomHienTai = ""
  for (const k of KQ) {
    if (k.nhom !== nhomHienTai) { nhomHienTai = k.nhom; console.log(`\n── ${k.nhom} ──`) }
    if (k.loi) { hong++; console.log(`  [?] ${k.ten}\n      khong chay duoc: ${k.loi.slice(0, 80)}`); continue }
    if (k.so === 0) { dat++; console.log(`  [OK] ${k.ten}`) }
    else {
      loi++
      console.log(`  [!!] ${k.ten} — ${k.so} dong vi pham`)
      k.mau.forEach((r) => console.log(`       ${JSON.stringify(r)}`))
    }
  }
  console.log("\n" + "=".repeat(64))
  console.log(`KET QUA: ${dat} dat / ${loi} vi pham / ${hong} khong chay duoc  (tong ${KQ.length})`)
  await pool.end()
})()
