/**
 * BÁO SỰ CỐ SUẤT CHIẾU — thông báo cho khách đã mua vé khi rạp gặp sự cố
 * (mất điện, hỏng máy chiếu, điều hoà, thời tiết...) trước hoặc trong giờ chiếu.
 *
 * Hai loại xử lý:
 *   - 'cancelled': HUỶ suất chiếu. Suất được đánh dấu CANCELLED (ẩn khỏi mọi
 *     danh sách, chặn đặt vé mới), mọi vé bị huỷ và hoàn tiền tự động qua
 *     đúng hàm Ticket.cancelById mà admin vẫn dùng — nên ghế, điểm thưởng,
 *     mã giảm giá đều được trả lại nhất quán, không có đường xử lý thứ hai.
 *   - 'notice': suất VẪN chiếu nhưng có thay đổi (vd trễ 30 phút) — chỉ thông báo.
 *
 * Mỗi khách nhận: 1 email (Gmail) + 1 thông báo trong web (chuông thông báo).
 * Mỗi lần báo được ghi vào showtime_incidents để tra lại về sau.
 *
 * Quyền: admin báo được cho mọi rạp; quản lý chi nhánh chỉ cho rạp của mình
 * (chặn ở routes/admin.js bằng requireOwnCinema).
 */
const { pool } = require("../config/database")
const Ticket = require("../models/Ticket")
const Notification = require("../models/Notification")
const { sendShowtimeIncidentEmail } = require("./emailService")

// Nhóm sự cố — mã gửi từ giao diện, nhãn dùng trong email/thông báo.
const LY_DO = {
  mat_dien: "sự cố mất điện tại rạp",
  may_chieu: "sự cố máy chiếu / âm thanh",
  dieu_hoa: "sự cố hệ thống điều hoà",
  thoi_tiet: "thời tiết xấu / thiên tai",
  an_toan: "sự cố an toàn kỹ thuật của toà nhà",
  khac: "lý do bất khả kháng",
}

const GUI_DONG_THOI = 5 // số email gửi song song — Gmail chặn nếu bắn quá dồn dập

function loi(message, status = 400) {
  return Object.assign(new Error(message), { status })
}

async function layThongTinSuat(showtimeId) {
  const [[s]] = await pool.query(
    `SELECT s.id, s.status, s.cinema_id,
            DATE_FORMAT(s.show_date, '%Y-%m-%d') AS show_date,
            TIME_FORMAT(s.show_time, '%H:%i') AS show_time,
            TIMESTAMP(s.show_date, s.show_time) AS bat_dau,
            m.title AS movie_title, m.duration,
            c.name AS cinema_name, r.room_name
     FROM showtimes s
     JOIN movies m ON m.id = s.movie_id
     JOIN cinemas c ON c.id = s.cinema_id
     LEFT JOIN rooms r ON r.id = s.room_id
     WHERE s.id = ?`,
    [showtimeId],
  )
  return s || null
}

/** Mọi vé còn hiệu lực của suất (đã thanh toán HOẶC đang chờ thanh toán). */
async function layVeBiAnhHuong(showtimeId) {
  const [rows] = await pool.query(
    `SELECT t.id, t.user_id, t.booking_reference, t.total_amount, t.payment_status,
            u.email, COALESCE(u.full_name, u.username, u.email) AS ten,
            (SELECT GROUP_CONCAT(ts.seat_code ORDER BY ts.seat_code SEPARATOR ', ')
             FROM ticket_seats ts WHERE ts.ticket_id = t.id AND ts.status = 'confirmed') AS ghe
     FROM tickets t JOIN users u ON u.id = t.user_id
     WHERE t.showtime_id = ? AND t.booking_status = 'confirmed'
     ORDER BY t.id`,
    [showtimeId],
  )
  return rows
}

function kiemTraDauVao(suat, { loai, lyDo, loiNhan, treMinutes }) {
  if (!suat) throw loi("Không tìm thấy suất chiếu", 404)
  if (!["cancelled", "notice"].includes(loai)) throw loi("Loại xử lý không hợp lệ")
  if (!LY_DO[lyDo]) throw loi("Nhóm sự cố không hợp lệ")
  if (lyDo === "khac" && !String(loiNhan || "").trim()) {
    throw loi("Chọn 'Lý do khác' thì phải ghi lời nhắn giải thích cho khách")
  }
  if (String(loiNhan || "").length > 1000) throw loi("Lời nhắn tối đa 1000 ký tự")
  if (treMinutes != null && treMinutes !== "") {
    const n = Number(treMinutes)
    if (!Number.isInteger(n) || n < 5 || n > 180) throw loi("Số phút trễ phải từ 5 đến 180")
  }
  if (suat.status === "CANCELLED") throw loi("Suất chiếu này đã bị huỷ trước đó", 409)
  // Cho báo tới khi phim CHIẾU XONG — mất điện giữa suất vẫn phải huỷ và hoàn tiền được.
  const ketThuc = new Date(new Date(suat.bat_dau).getTime() + Number(suat.duration || 120) * 60000)
  if (ketThuc < new Date()) throw loi("Suất chiếu đã kết thúc, không thể báo sự cố", 409)
}

async function guiThongBao(ve, suat, thongTin) {
  const { loai, lyDo, loiNhan, treMinutes } = thongTin
  const coHoanTien = loai === "cancelled" && ve.payment_status === "paid"
  let emailOk = false
  if (ve.email) {
    emailOk = await sendShowtimeIncidentEmail(ve.email, {
      username: ve.ten,
      incidentType: loai,
      reasonLabel: LY_DO[lyDo],
      message: loiNhan,
      delayMinutes: loai === "notice" ? treMinutes : null,
      bookingReference: ve.booking_reference,
      movieTitle: suat.movie_title,
      cinemaName: suat.cinema_name,
      roomName: suat.room_name,
      showDate: suat.show_date,
      showTime: suat.show_time,
      seats: ve.ghe || "",
      refundAmount: coHoanTien ? ve.total_amount : 0,
    })
  }
  try {
    await Notification.create({
      userId: ve.user_id,
      type: "showtime_incident",
      title: loai === "cancelled"
        ? `Suất ${suat.movie_title} ${suat.show_time} ${suat.show_date} đã bị huỷ`
        : `Thay đổi suất ${suat.movie_title} ${suat.show_time} ${suat.show_date}`,
      message: loai === "cancelled"
        ? `Do ${LY_DO[lyDo]}, suất chiếu đã bị huỷ. ${coHoanTien ? "Lệnh hoàn tiền đã được ghi nhận, chúng tôi sẽ báo lại khi hoàn tất." : "Vé đã được huỷ."}`
        : `Do ${LY_DO[lyDo]}, suất chiếu có thay đổi${treMinutes ? `: dự kiến bắt đầu trễ ${treMinutes} phút` : ""}. Vé vẫn còn hiệu lực.`,
      data: { showtimeId: suat.id, bookingReference: ve.booking_reference, incidentType: loai },
    })
  } catch (e) {
    console.error(`⚠️ Không tạo được thông báo trong web cho vé ${ve.booking_reference}:`, e.message)
  }
  return emailOk
}

/**
 * @param {object} p
 * @param {number} p.showtimeId
 * @param {'cancelled'|'notice'} p.loai
 * @param {string} p.lyDo - khoá trong LY_DO
 * @param {string} [p.loiNhan]
 * @param {number} [p.treMinutes] - chỉ cho 'notice'
 * @param {number} p.nguoiBaoId
 * @param {boolean} [p.xemTruoc] - chỉ đếm số vé/khách bị ảnh hưởng, không làm gì
 * @param {boolean} [p.boQuaBaoAdmin] - dùng khi xử lý HÀNG LOẠT: mỗi suất một
 *   thông báo sẽ dội bom admin, nên gửi một thông báo tổng ở cuối thay vì từng cái
 */
async function baoSuCo(p) {
  const suat = await layThongTinSuat(p.showtimeId)
  kiemTraDauVao(suat, p)
  const dsVe = await layVeBiAnhHuong(p.showtimeId)

  const tongQuan = {
    showtime: {
      id: suat.id, movie_title: suat.movie_title, cinema_name: suat.cinema_name,
      room_name: suat.room_name, show_date: suat.show_date, show_time: suat.show_time,
    },
    affected_tickets: dsVe.length,
    paid_tickets: dsVe.filter((v) => v.payment_status === "paid").length,
    affected_customers: new Set(dsVe.map((v) => v.user_id)).size,
    refund_total: p.loai === "cancelled"
      ? dsVe.filter((v) => v.payment_status === "paid").reduce((t, v) => t + Number(v.total_amount), 0)
      : 0,
  }
  if (p.xemTruoc) return { preview: true, ...tongQuan }

  if (p.loai === "cancelled") {
    // Đánh dấu huỷ TRƯỚC khi huỷ từng vé: từ giây này không ai đặt thêm được
    // (hai chốt chặn ở paymentController/ticketController). UPDATE có điều kiện
    // status='ACTIVE' nên hai người cùng bấm huỷ thì chỉ một người thành công.
    const [kq] = await pool.query(
      "UPDATE showtimes SET status = 'CANCELLED' WHERE id = ? AND status = 'ACTIVE'",
      [suat.id],
    )
    if (kq.affectedRows === 0) throw loi("Suất chiếu này vừa được người khác huỷ", 409)
    await pool.query("DELETE FROM seat_locks WHERE showtime_id = ?", [suat.id])

    // Lấy lại danh sách SAU khi khoá suất — phòng có vé vừa kịp tạo giữa lúc
    // xem trước và lúc bấm xác nhận.
    const veHienTai = await layVeBiAnhHuong(suat.id)
    dsVe.length = 0
    dsVe.push(...veHienTai)
    for (const ve of dsVe) {
      const r = await Ticket.cancelById(ve.id) // chế độ admin: không áp hạn huỷ 2 tiếng
      if (!r.ok && r.reason !== "ALREADY_CANCELLED") {
        console.error(`⚠️ Không huỷ được vé ${ve.booking_reference} khi huỷ suất ${suat.id}:`, r.reason)
      }
    }
    try { require("../middleware/cache").invalidateCache("showtimes") } catch (_) {}
  }

  const [ins] = await pool.query(
    `INSERT INTO showtime_incidents
       (showtime_id, incident_type, reason, message, delay_minutes, reported_by, affected_tickets)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [suat.id, p.loai, p.lyDo, p.loiNhan || null,
     p.loai === "notice" && p.treMinutes ? Number(p.treMinutes) : null,
     p.nguoiBaoId || null, dsVe.length],
  )

  // GHI LỆNH HOÀN TIỀN VÀO SỔ (migration 49). Trước đây huỷ vé là xong, không
  // ai tra được tiền đã thực sự trả chưa. Từ đây mỗi vé đã thanh toán sinh
  // đúng một dòng trong bảng refunds; lỗi thuộc về rạp và số tiền nhỏ thì tự
  // duyệt ngay, số tiền lớn phải chờ quản trị viên — xem refund.config.js.
  //
  // Đặt SAU khi huỷ vé và SAU khi ghi nhật ký sự cố để lệnh hoàn trỏ được về
  // đúng lần báo sự cố đã sinh ra nó.
  // Đếm số lệnh hoàn phải chờ người duyệt — trả về cho nơi gọi gộp thông báo.
  let soChoDuyet = 0
  let tienChoDuyet = 0
  if (p.loai === "cancelled") {
    const veDaTra = dsVe.filter((v) => v.payment_status === "paid")
    // Trần "mỗi sự cố": với sự cố diện rộng thì lấy tổng của CẢ LOẠT (truyền
    // vào qua p.tongTienSuCo), không phải tổng của riêng suất này — huỷ 20
    // suất mà mỗi suất đều dưới trần thì vẫn là một khoản tiền rất lớn.
    const tongTien = p.tongTienSuCo ?? veDaTra.reduce((t, v) => t + Number(v.total_amount), 0)
    const { deNghiHoan } = require("./refund.service")
    for (const ve of veDaTra) {
      try {
        const kq = await deNghiHoan({
          ticketId: ve.id,
          nguon: "su_co",
          lyDo: `Huỷ suất chiếu do ${LY_DO[p.lyDo]}`,
          nguoiDeNghiId: p.nguoiBaoId,
          incidentId: ins.insertId,
          tongTienSuCo: tongTien,
          // Gộp thành MỘT thông báo ở dưới: huỷ suất 80 chỗ mà bắn 80 thông
          // báo thì admin tắt chuông, lần sau có việc thật cũng không ai đọc.
          boQuaBaoAdmin: true,
        })
        if (kq?.taoMoi && !kq.tuDongDuyet) {
          soChoDuyet++
          tienChoDuyet += Number(ve.total_amount)
        }
      } catch (e) {
        // Không để lỗi ghi sổ làm hỏng việc đã huỷ xong — nhưng phải kêu to,
        // vì một vé không có dòng hoàn tiền là một khoản tiền không ai theo dõi.
        console.error(`⚠️ KHÔNG GHI ĐƯỢC LỆNH HOÀN cho vé ${ve.booking_reference}:`, e.message)
      }
    }

    // Một thông báo gộp cho cả suất. Xử lý hàng loạt thì nơi gọi tự gộp tiếp
    // (boQuaBaoAdmin) để 20 suất không thành 20 thông báo.
    if (soChoDuyet > 0 && !p.boQuaBaoAdmin) {
      try {
        const { baoHoanTienChoDuyet } = require("./branchNotify.service")
        await baoHoanTienChoDuyet({
          soLenh: soChoDuyet,
          tongTien: tienChoDuyet,
          lyDo: `huỷ suất ${suat.movie_title} ${suat.show_time} ${suat.show_date} do ${LY_DO[p.lyDo]}`,
          cinemaName: suat.cinema_name,
        })
      } catch (e) {
        console.error("⚠️ Không báo được cho admin về các lệnh hoàn chờ duyệt:", e.message)
      }
    }
  }

  let daGui = 0
  let loiGui = 0
  for (let i = 0; i < dsVe.length; i += GUI_DONG_THOI) {
    const lo = dsVe.slice(i, i + GUI_DONG_THOI)
    const kq = await Promise.all(lo.map((ve) => guiThongBao(ve, suat, p).catch(() => false)))
    daGui += kq.filter(Boolean).length
    loiGui += kq.filter((x) => !x).length
  }
  await pool.query(
    "UPDATE showtime_incidents SET emails_sent = ?, emails_failed = ? WHERE id = ?",
    [daGui, loiGui, ins.insertId],
  )

  // BÁO ADMIN SAU KHI ĐÃ XỬ LÝ XONG. Quản lý chi nhánh có mặt tại rạp nên xử
  // lý ngay (huỷ suất, hoàn tiền, báo khách) rồi hệ thống tự báo admin — chờ
  // admin duyệt mới được làm thì khách đã chờ hết buổi chiếu.
  // Xử lý hàng loạt (baoSuCoHangLoat) tự gửi MỘT thông báo tổng ở cuối, nên
  // bỏ qua ở đây — nếu không, huỷ 20 suất là admin nhận 20 thông báo.
  if (!p.boQuaBaoAdmin) {
    try {
      const { baoSuCoChoAdmin } = require("./branchNotify.service")
      await baoSuCoChoAdmin({
        incident: { loai: p.loai, lyDoNhan: LY_DO[p.lyDo] },
        suat,
        nguoiBao: p.nguoiBao,
        soVe: dsVe.length,
        soTienHoan: tongQuan.refund_total,
      })
    } catch (e) {
      console.error("⚠️ Không báo được sự cố cho admin (không ảnh hưởng việc đã xử lý):", e.message)
    }
  }

  return {
    preview: false,
    incident_id: ins.insertId,
    ...tongQuan,
    affected_tickets: dsVe.length,
    emails_sent: daGui,
    emails_failed: loiGui,
    // Để baoSuCoHangLoat cộng dồn rồi gửi MỘT thông báo cho cả loạt.
    refunds_cho_duyet: { so_lenh: soChoDuyet, tong_tien: tienChoDuyet },
  }
}

/**
 * SỰ CỐ DIỆN RỘNG — mất điện cả rạp, sửa chữa một dãy phòng, thời tiết…
 *
 * Báo từng suất một thì mất hàng chục thao tác đúng lúc đang rối; hàm này
 * chọn cả loạt suất theo RẠP + PHÒNG + KHOẢNG GIỜ rồi xử lý một lượt, dùng
 * lại đúng luồng của baoSuCo (huỷ, hoàn tiền, email, nhật ký) nên không có
 * đường xử lý thứ hai để lệch nhau.
 *
 * Quy tắc "xử lý trước, báo sau" giữ nguyên: mỗi khách vẫn nhận email riêng
 * cho vé của mình, còn admin nhận MỘT thông báo tổng ở cuối.
 *
 * @param {object} p
 * @param {number} p.cinemaId
 * @param {number[]} [p.roomIds] - bỏ trống = mọi phòng của rạp
 * @param {string} p.tuLuc - 'YYYY-MM-DD HH:mm'
 * @param {string} p.denLuc
 * @param {boolean} [p.xemTruoc]
 */
async function baoSuCoHangLoat(p) {
  if (!p.cinemaId) throw loi("Thiếu rạp")
  if (!p.tuLuc || !p.denLuc) throw loi("Thiếu khoảng thời gian")
  if (new Date(p.tuLuc) > new Date(p.denLuc)) throw loi("Khoảng thời gian không hợp lệ")
  if (!["cancelled", "notice"].includes(p.loai)) throw loi("Loại xử lý không hợp lệ")
  if (!LY_DO[p.lyDo]) throw loi("Nhóm sự cố không hợp lệ")

  const dsPhong = Array.isArray(p.roomIds) ? p.roomIds.map(Number).filter(Boolean) : []
  const [suats] = await pool.query(
    `SELECT s.id, s.room_id, r.room_name, m.title AS movie_title, m.duration,
            DATE_FORMAT(s.show_date, '%Y-%m-%d') AS show_date,
            TIME_FORMAT(s.show_time, '%H:%i') AS show_time,
            (SELECT COUNT(*) FROM tickets t WHERE t.showtime_id = s.id AND t.booking_status = 'confirmed') AS so_ve,
            (SELECT COALESCE(SUM(t.total_amount), 0) FROM tickets t
             WHERE t.showtime_id = s.id AND t.booking_status = 'confirmed' AND t.payment_status = 'paid') AS tien_hoan
     FROM showtimes s
     JOIN movies m ON m.id = s.movie_id
     LEFT JOIN rooms r ON r.id = s.room_id
     WHERE s.cinema_id = ? AND s.status = 'ACTIVE'
       AND TIMESTAMP(s.show_date, s.show_time) BETWEEN ? AND ?
       -- Suất đã chiếu XONG thì không xử lý nữa (đang chiếu dở vẫn tính)
       AND DATE_ADD(TIMESTAMP(s.show_date, s.show_time), INTERVAL m.duration MINUTE) > NOW()
       ${dsPhong.length ? "AND s.room_id IN (?)" : ""}
     ORDER BY s.show_date, s.show_time`,
    dsPhong.length ? [p.cinemaId, p.tuLuc, p.denLuc, dsPhong] : [p.cinemaId, p.tuLuc, p.denLuc],
  )

  const tong = {
    showtimes: suats.map((s) => ({
      id: s.id, movie_title: s.movie_title, room_name: s.room_name,
      show_date: s.show_date, show_time: s.show_time,
      affected_tickets: Number(s.so_ve), refund: Number(s.tien_hoan),
    })),
    total_showtimes: suats.length,
    total_tickets: suats.reduce((t, s) => t + Number(s.so_ve), 0),
    refund_total: p.loai === "cancelled" ? suats.reduce((t, s) => t + Number(s.tien_hoan), 0) : 0,
  }
  if (p.xemTruoc) return { preview: true, ...tong }
  if (!suats.length) throw loi("Không có suất chiếu nào trong khoảng đã chọn", 404)

  let emailGui = 0
  let emailLoi = 0
  let daXuLy = 0
  // Cộng dồn cả loạt rồi gửi MỘT thông báo — huỷ 20 suất không thành 20 tin.
  const hoanChoDuyet = { so_lenh: 0, tong_tien: 0 }
  const thatBai = []
  for (const s of suats) {
    try {
      const kq = await baoSuCo({
        ...p,
        showtimeId: s.id,
        boQuaBaoAdmin: true,
        // Trần tự duyệt tính trên TỔNG CẢ LOẠT, không phải từng suất.
        tongTienSuCo: tong.refund_total,
      })
      emailGui += kq.emails_sent || 0
      emailLoi += kq.emails_failed || 0
      hoanChoDuyet.so_lenh += kq.refunds_cho_duyet?.so_lenh || 0
      hoanChoDuyet.tong_tien += kq.refunds_cho_duyet?.tong_tien || 0
      daXuLy++
    } catch (e) {
      // Một suất hỏng không được làm dừng cả loạt — ghi lại để báo admin biết
      thatBai.push({ id: s.id, movie_title: s.movie_title, show_time: s.show_time, error: e.message })
    }
  }

  if (hoanChoDuyet.so_lenh > 0) {
    try {
      const { baoHoanTienChoDuyet } = require("./branchNotify.service")
      const [[r]] = await pool.query("SELECT name FROM cinemas WHERE id = ?", [p.cinemaId])
      await baoHoanTienChoDuyet({
        soLenh: hoanChoDuyet.so_lenh,
        tongTien: hoanChoDuyet.tong_tien,
        lyDo: `sự cố diện rộng: ${daXuLy} suất chiếu, ${LY_DO[p.lyDo]}`,
        cinemaName: r?.name || null,
      })
    } catch (e) {
      console.error("⚠️ Không báo được cho admin về các lệnh hoàn chờ duyệt:", e.message)
    }
  }

  try {
    const { baoSuCoChoAdmin } = require("./branchNotify.service")
    const [[rap]] = await pool.query("SELECT name FROM cinemas WHERE id = ?", [p.cinemaId])
    await baoSuCoChoAdmin({
      incident: { loai: p.loai, lyDoNhan: LY_DO[p.lyDo] },
      suat: {
        id: null, cinema_id: p.cinemaId, cinema_name: rap?.name || `Rạp #${p.cinemaId}`,
        movie_title: `${daXuLy} suất chiếu`,
        show_date: String(p.tuLuc).slice(0, 10),
        show_time: `${String(p.tuLuc).slice(11, 16)}–${String(p.denLuc).slice(11, 16)}`,
        room_name: dsPhong.length ? `${dsPhong.length} phòng` : "toàn rạp",
      },
      nguoiBao: p.nguoiBao,
      soVe: tong.total_tickets,
      soTienHoan: tong.refund_total,
    })
  } catch (e) {
    console.error("⚠️ Không gửi được thông báo tổng cho admin:", e.message)
  }

  return {
    preview: false,
    ...tong,
    processed: daXuLy,
    failed: thatBai,
    refunds_cho_duyet: hoanChoDuyet,
    emails_sent: emailGui,
    emails_failed: emailLoi,
  }
}

/** Nhật ký sự cố gần đây; cinemaId != null thì chỉ lấy của rạp đó (quản lý chi nhánh). */
async function lichSu({ cinemaId = null, limit = 30 } = {}) {
  const [rows] = await pool.query(
    `SELECT i.*, s.cinema_id, m.title AS movie_title, c.name AS cinema_name, r.room_name,
            DATE_FORMAT(s.show_date, '%Y-%m-%d') AS show_date,
            TIME_FORMAT(s.show_time, '%H:%i') AS show_time,
            COALESCE(u.full_name, u.username, u.email) AS reported_by_name
     FROM showtime_incidents i
     JOIN showtimes s ON s.id = i.showtime_id
     JOIN movies m ON m.id = s.movie_id
     JOIN cinemas c ON c.id = s.cinema_id
     LEFT JOIN rooms r ON r.id = s.room_id
     LEFT JOIN users u ON u.id = i.reported_by
     ${cinemaId ? "WHERE s.cinema_id = ?" : ""}
     ORDER BY i.created_at DESC
     LIMIT ?`,
    cinemaId ? [cinemaId, Math.min(Number(limit) || 30, 100)] : [Math.min(Number(limit) || 30, 100)],
  )
  return rows.map((r) => ({ ...r, reason_label: LY_DO[r.reason] || r.reason }))
}

/**
 * KHÔI PHỤC SUẤT CHIẾU ĐÃ HUỶ — quyền ghi đè của quản trị viên (migration 49).
 *
 * Hai tình huống có thật: quản lý chi nhánh bấm nhầm suất, hoặc sự cố được
 * khắc phục nhanh hơn dự kiến (mất điện 10 phút rồi có lại). Không có đường
 * khôi phục thì cách duy nhất là tạo lại suất mới — mất sạch dấu vết và khách
 * cũ không ai biết chuyện gì đã xảy ra.
 *
 * ┌─ VÉ ĐÃ HUỶ KHÔNG TỰ SỐNG LẠI ────────────────────────────────────────┐
 * │ Cố tình như vậy. Lệnh hoàn tiền có thể đã gửi sang cổng thanh toán,   │
 * │ voucher bồi thường có thể đã phát và khách đã tiêu. "Hồi sinh" vé lúc │
 * │ đó là trả khách một chỗ ngồi mà tiền đã trả lại — rạp mất trắng, và   │
 * │ ghế có thể đã được người khác đặt trong lúc suất mở bán lại.          │
 * │ Thay vào đó: mở lại suất để bán, rồi MỜI khách cũ đặt lại.            │
 * └───────────────────────────────────────────────────────────────────────┘
 *
 * @param {object} p
 * @param {number} p.showtimeId
 * @param {number} p.nguoiKhoiPhucId
 * @param {string} [p.lyDo] - vì sao khôi phục, ghi vào nhật ký
 * @param {boolean} [p.xemTruoc]
 */
async function khoiPhucSuat(p) {
  const suat = await layThongTinSuat(p.showtimeId)
  if (!suat) throw loi("Không tìm thấy suất chiếu", 404)
  if (suat.status !== "CANCELLED") throw loi("Suất chiếu này đang hoạt động bình thường, không cần khôi phục", 409)

  const batDau = new Date(suat.bat_dau)
  if (batDau < new Date()) {
    throw loi("Suất chiếu đã qua giờ bắt đầu, khôi phục cũng không bán được vé nữa", 409)
  }

  // Khách từng có vé ở suất này — để mời đặt lại.
  const [khachCu] = await pool.query(
    `SELECT DISTINCT t.user_id, t.booking_reference
       FROM tickets t
      WHERE t.showtime_id = ? AND t.booking_status = 'cancelled'`,
    [p.showtimeId],
  )
  // Lệnh hoàn đã chạy tới đâu rồi — quản trị viên cần biết trước khi bấm.
  const [[tienHoan]] = await pool.query(
    `SELECT COUNT(*) AS so_lenh,
            COALESCE(SUM(CASE WHEN r.trang_thai = 'thanh_cong' THEN 1 ELSE 0 END), 0) AS da_hoan_xong,
            COALESCE(SUM(r.so_tien), 0) AS tong_tien
       FROM refunds r JOIN tickets t ON t.id = r.ticket_id
      WHERE t.showtime_id = ?`,
    [p.showtimeId],
  )

  const tongQuan = {
    showtime: {
      id: suat.id, movie_title: suat.movie_title, cinema_name: suat.cinema_name,
      room_name: suat.room_name, show_date: suat.show_date, show_time: suat.show_time,
    },
    khach_cu: khachCu.length,
    lenh_hoan: Number(tienHoan.so_lenh),
    lenh_hoan_da_xong: Number(tienHoan.da_hoan_xong),
    tien_da_hoan: Number(tienHoan.tong_tien),
  }
  if (p.xemTruoc) return { preview: true, ...tongQuan }

  // UPDATE có điều kiện status='CANCELLED' — hai người cùng bấm thì chỉ một
  // người thành công, giống hệt chốt chặn lúc huỷ.
  const [kq] = await pool.query(
    "UPDATE showtimes SET status = 'ACTIVE' WHERE id = ? AND status = 'CANCELLED'",
    [suat.id],
  )
  if (kq.affectedRows === 0) throw loi("Suất chiếu này vừa được người khác khôi phục", 409)

  const [ins] = await pool.query(
    `INSERT INTO showtime_incidents
       (showtime_id, incident_type, reason, message, reported_by, affected_tickets)
     VALUES (?, 'restored', 'khac', ?, ?, ?)`,
    [suat.id, p.lyDo || "Khôi phục suất chiếu đã huỷ", p.nguoiKhoiPhucId || null, khachCu.length],
  )

  // Mời khách cũ quay lại. Không hứa giữ ghế: ghế đã được nhả, ai đặt trước
  // được trước — nói thẳng trong thông báo để khách không hiểu nhầm.
  for (const k of khachCu) {
    try {
      await Notification.create({
        userId: k.user_id,
        type: "showtime_restored",
        title: `Suất ${suat.movie_title} ${suat.show_time} ${suat.show_date} đã mở bán lại`,
        message: `Sự cố đã được khắc phục và suất chiếu hoạt động trở lại. Vé cũ (${k.booking_reference}) đã huỷ và đang được hoàn tiền nên không tự khôi phục — mời bạn đặt lại, ghế còn trống theo thứ tự đặt trước.`,
        data: { showtimeId: suat.id, bookingReference: k.booking_reference },
      })
    } catch (e) {
      console.error(`⚠️ Không báo được cho khách ${k.user_id} về việc khôi phục suất:`, e.message)
    }
  }

  try { require("../middleware/cache").invalidateCache("showtimes") } catch (_) {}

  return { preview: false, incident_id: ins.insertId, ...tongQuan }
}

module.exports = { baoSuCo, baoSuCoHangLoat, khoiPhucSuat, lichSu, LY_DO }
