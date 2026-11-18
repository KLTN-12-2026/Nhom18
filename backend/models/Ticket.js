const { pool } = require("../config/database")
const { withTransaction } = require("../utils/db")
const { formatLocalDateString } = require("../utils/dateUtils")

class Ticket {
  // Khách tự huỷ vé phải huỷ trước giờ chiếu ít nhất bằng này (phút) — giống
  // chính sách rạp thật (CGV/Lotte thường chặn huỷ/hoàn vé trong vòng 2 tiếng
  // trước suất chiếu), tránh trường hợp xem xong phim mới bấm huỷ để "hoàn tiền".
  static SELF_CANCEL_CUTOFF_MINUTES = 120

  /**
   * Atomically books a ticket: insert into tickets (combo_items lưu ngay dưới
   * dạng JSON trên chính bảng tickets, không có bảng ticket_combos riêng) +
   * ticket_seats, rồi trừ showtimes.available_seats.
   * Consolidates the booking transaction that used to be duplicated (and had
   * diverged) between ticketController.bookTicket and paymentController.createPayment.
   * Throws an error with code "NO_SEATS_AVAILABLE" if seats ran out concurrently.
   */
  static async bookWithTransaction({
    user_id,
    showtime_id,
    seats,
    seatTypes = null, // { [seatCode]: 'adult'|'student'|'child'|'senior' } — mặc định 'adult' nếu thiếu
    seatPrices = null, // { [seatCode]: number } — giá đã tính theo loại vé, xem ticketPricing.config.js
    validatedCombos = [],
    comboTotal = 0,
    totalAmount,
    bookingReference,
    bookingStatus,
    paymentStatus,
    paymentMethod = null,
    voucher = null, // { id, code, discountAmount } — xem Voucher.validate()
    cinemaId = null, // rạp của suất chiếu — cần để trừ kho bắp nước ĐÚNG chi nhánh
  }) {
    return withTransaction(async (connection) => {
      const [result] = await connection.execute(
        `INSERT INTO tickets
         (user_id, showtime_id, seats, combo_items, combo_total, voucher_code, discount_amount,
          total_amount, booking_reference, booking_status, payment_status, payment_method, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
          user_id,
          showtime_id,
          JSON.stringify(seats),
          validatedCombos.length > 0 ? JSON.stringify(validatedCombos) : null,
          comboTotal,
          voucher?.code ?? null,
          voucher?.discountAmount ?? 0,
          totalAmount,
          bookingReference,
          bookingStatus,
          paymentStatus,
          paymentMethod,
        ],
      )
      const ticketId = result.insertId

      const seatRows = seats.map((seatCode) => [
        ticketId,
        showtime_id,
        seatCode,
        seatTypes?.[seatCode] || "adult",
        seatPrices?.[seatCode] ?? null,
        bookingStatus,
      ])
      await connection.query(
        "INSERT INTO ticket_seats (ticket_id, showtime_id, seat_code, ticket_type, price, status) VALUES ?",
        [seatRows],
      )

      const [updateResult] = await connection.execute(
        "UPDATE showtimes SET available_seats = available_seats - ? WHERE id = ? AND available_seats >= ?",
        [seats.length, showtime_id, seats.length],
      )
      if (updateResult.affectedRows === 0) {
        throw Object.assign(new Error("NO_SEATS_AVAILABLE"), { code: "NO_SEATS_AVAILABLE" })
      }

      // Trừ kho bắp nước của ĐÚNG rạp đó, trong CÙNG transaction — nếu bước nào
      // phía trên hỏng (hết ghế, voucher hết lượt) thì kho cũng được hoàn theo,
      // không bị hụt hàng vì một đơn chưa bao giờ tồn tại.
      if (cinemaId && validatedCombos.length) {
        await require("./ComboInventory").tru(connection, cinemaId, validatedCombos)
      }

      // Ghi nhận lượt dùng voucher TRONG CÙNG transaction — nếu bước nào phía
      // trên throw (hết ghế...), lượt dùng mã cũng rollback theo, không bị
      // "trừ lượt" oan cho vé chưa từng được tạo thật.
      if (voucher?.id) {
        const Voucher = require("./Voucher")
        await Voucher.redeem(connection, {
          voucherId: voucher.id,
          userId: user_id,
          ticketId,
          discountAmount: voucher.discountAmount,
        })
      }

      return ticketId
    })
  }

  /**
   * Ghi nhận vé đã thanh toán.
   *
   * Trường hợp khó: tiền về SAU KHI job dọn vé bỏ dở đã huỷ vé và trả ghế
   * (MoMo không có hạn thanh toán; Return URL/IPN có thể tới muộn). Trước đây
   * hàm này cứ đặt booking_status='confirmed' — vé "sống lại" nhưng ghế KHÔNG
   * được giữ lại (ticket_seats vẫn 'cancelled', available_seats đã cộng trả),
   * nên ghế có thể đã bán cho người khác: một ghế hai chủ.
   *
   * Giờ: vé chưa bị huỷ → chỉ đánh dấu đã trả. Vé đã bị huỷ → thử giữ lại
   * ĐÚNG các ghế cũ; UNIQUE(active_seat_key) tự từ chối nếu ghế đã có người
   * mua. Giữ được thì khôi phục vé; không giữ được thì để vé huỷ, trả về
   * SEATS_TAKEN để nơi gọi báo cần hoàn tiền thủ công.
   * @returns {Promise<{ ok: boolean, revived?: boolean, reason?: 'NOT_FOUND' | 'SEATS_TAKEN' }>}
   */
  static async markPaid(ticketId) {
    return withTransaction(async (connection) => {
      const [[t]] = await connection.execute(
        `SELECT t.id, t.showtime_id, t.booking_status, t.combo_items, s.cinema_id
         FROM tickets t JOIN showtimes s ON s.id = t.showtime_id
         WHERE t.id = ? FOR UPDATE`,
        [ticketId],
      )
      if (!t) return { ok: false, reason: "NOT_FOUND" }

      if (t.booking_status !== "cancelled") {
        await connection.execute(
          'UPDATE tickets SET payment_status = "paid", paid_at = COALESCE(paid_at, NOW()) WHERE id = ?',
          [ticketId],
        )
        return { ok: true }
      }

      let soGhe = 0
      try {
        // Một câu lệnh duy nhất: nếu BẤT KỲ ghế nào đã có người khác giữ, cả
        // câu bị từ chối (ER_DUP_ENTRY) và không ghế nào bị đổi.
        const [r] = await connection.execute(
          'UPDATE ticket_seats SET status = "confirmed" WHERE ticket_id = ? AND status = "cancelled"',
          [ticketId],
        )
        soGhe = r.affectedRows
      } catch (e) {
        if (e.code === "ER_DUP_ENTRY") return { ok: false, reason: "SEATS_TAKEN" }
        throw e
      }

      const [u] = await connection.execute(
        "UPDATE showtimes SET available_seats = available_seats - ? WHERE id = ? AND available_seats >= ?",
        [soGhe, t.showtime_id, soGhe],
      )
      if (u.affectedRows === 0) {
        // Không đủ ghế trống theo bộ đếm — hoàn tác bước trên cho nhất quán.
        await connection.execute(
          'UPDATE ticket_seats SET status = "cancelled" WHERE ticket_id = ?',
          [ticketId],
        )
        return { ok: false, reason: "SEATS_TAKEN" }
      }

      await connection.execute(
        'UPDATE tickets SET booking_status = "confirmed", payment_status = "paid", paid_at = NOW() WHERE id = ?',
        [ticketId],
      )
      await require("./Voucher").restoreForTicket(connection, ticketId)
      // Kho bắp nước đã được hoàn lúc vé bị huỷ → nay vé sống lại thì trừ lại.
      // Hết hàng thì ComboInventory.tru ném lỗi, transaction rollback và vé giữ
      // nguyên trạng thái huỷ — đúng hơn là giao vé mà không có hàng để giao.
      if (t.cinema_id && t.combo_items?.length) {
        await require("./ComboInventory").tru(connection, t.cinema_id, t.combo_items)
      }
      return { ok: true, revived: true }
    })
  }

  static async markFailed(ticketId) {
    const [result] = await pool.execute(
      'UPDATE tickets SET payment_status = "failed" WHERE id = ?',
      [ticketId],
    )
    return result.affectedRows > 0
  }

  static async updatePaymentFields(ticketId, { payment_url, qr_code_url, payment_gateway_ref }) {
    const [result] = await pool.execute(
      "UPDATE tickets SET payment_url = ?, qr_code_url = ?, payment_gateway_ref = ? WHERE id = ?",
      [payment_url, qr_code_url, payment_gateway_ref, ticketId],
    )
    return result.affectedRows > 0
  }

  static async findByReference(reference) {
    const [rows] = await pool.query(
      `SELECT t.booking_reference as reference, t.booking_status as status, t.total_amount as amount,
              m.title as movie, c.name as cinema,
              s.show_date, s.show_time,
              (SELECT GROUP_CONCAT(ts.seat_code ORDER BY ts.seat_code SEPARATOR ', ')
               FROM ticket_seats ts WHERE ts.ticket_id = t.id) as seats
       FROM tickets t
       JOIN showtimes s ON t.showtime_id = s.id
       JOIN movies m ON s.movie_id = m.id
       JOIN cinemas c ON s.cinema_id = c.id
       WHERE t.booking_reference = ?`,
      [reference],
    )
    return rows[0] || null
  }

  static async getSeatCount(ticketId) {
    const [[{ cnt }]] = await pool.execute(
      "SELECT COUNT(*) AS cnt FROM ticket_seats WHERE ticket_id = ?",
      [ticketId],
    )
    return cnt || 0
  }

  static async create(ticketData) {
    const { user_id, showtime_id, seats, total_amount, booking_reference } = ticketData

    const [result] = await pool.execute(
      'INSERT INTO tickets (user_id, showtime_id, seats, total_amount, booking_reference, booking_status, payment_status, created_at) VALUES (?, ?, ?, ?, ?, "confirmed", "paid", NOW())',
      [user_id, showtime_id, JSON.stringify(seats), total_amount, booking_reference],
    )

    return result.insertId
  }

  static async findAll() {
    const [rows] = await pool.execute(`
      SELECT t.*, u.username, u.email, m.title as movie_title, 
             s.show_date, s.show_time, c.name as cinema_name
      FROM tickets t
      JOIN users u ON t.user_id = u.id
      JOIN showtimes s ON t.showtime_id = s.id
      JOIN movies m ON s.movie_id = m.id
      JOIN cinemas c ON s.cinema_id = c.id
      ORDER BY t.created_at DESC
    `)
    return rows
  }

  static async findByUser(userId) {
    const [rows] = await pool.execute(
      `
      SELECT t.*, m.title as movie_title, m.poster_url,
             s.show_date, s.show_time, c.name as cinema_name, c.location
      FROM tickets t
      JOIN showtimes s ON t.showtime_id = s.id
      JOIN movies m ON s.movie_id = m.id
      JOIN cinemas c ON s.cinema_id = c.id
      WHERE t.user_id = ?
      ORDER BY t.created_at DESC
    `,
      [userId],
    )
    return rows
  }

  static async findById(id) {
    const [rows] = await pool.execute(
      `
      SELECT t.*, u.username, u.email, m.title as movie_title, 
             s.show_date, s.show_time, c.name as cinema_name, c.location,
             r.room_name as screen_name, r.room_type
      FROM tickets t
      JOIN users u ON t.user_id = u.id
      JOIN showtimes s ON t.showtime_id = s.id
      JOIN movies m ON s.movie_id = m.id
      JOIN cinemas c ON s.cinema_id = c.id
      LEFT JOIN rooms r ON s.room_id = r.id
      WHERE t.id = ?
    `,
      [id],
    )
    return rows[0]
  }

  static async getDetailedTicket(ticketId, userId = null) {
    const query = `
      SELECT 
        t.id,
        t.booking_reference,
        t.booking_status,
        t.payment_status,
        t.total_amount,
        t.combo_total,
        t.voucher_code,
        t.discount_amount,
        -- Danh sách ghế lấy TỪ BẢNG ticket_seats chứ không đọc cột t.seats.
        -- Cùng một thông tin ghế từng được lưu ở HAI nơi (cột JSON t.seats và
        -- bảng ticket_seats) nên hai nơi có thể lệch nhau — thực tế đã lệch:
        -- vé #8 ghi trong JSON là 2 ghế nhưng chỉ giữ được 1 vì ghế kia đã có
        -- người khác. ticket_seats mới là nguồn sự thật: nó có ràng buộc UNIQUE
        -- chống đặt trùng và là căn cứ tính available_seats.
        COALESCE(
          (SELECT JSON_ARRAYAGG(z.seat_code) FROM
             (SELECT ts.seat_code FROM ticket_seats ts WHERE ts.ticket_id = t.id ORDER BY ts.seat_code) z),
          t.seats
        ) AS seats,
        t.combo_items,
        t.created_at,
        t.updated_at,
        u.id as user_id,
        u.username,
        u.email,
        m.id as movie_id,
        m.title as movie_title,
        m.poster_url,
        m.genre,
        m.duration,
        m.rating,
        s.id as showtime_id,
        s.show_date,
        s.show_time,
        s.price as seat_price,
        c.id as cinema_id,
        c.name as cinema_name,
        c.location as cinema_location,
        r.room_name as screen_name,
        r.room_type,
        r.total_seats as room_capacity
      FROM tickets t
      JOIN users u ON t.user_id = u.id
      JOIN showtimes s ON t.showtime_id = s.id
      JOIN movies m ON s.movie_id = m.id
      JOIN cinemas c ON s.cinema_id = c.id
      LEFT JOIN rooms r ON s.room_id = r.id
      WHERE t.id = ?
      ${userId ? 'AND t.user_id = ?' : ''}
    `
    
    const params = userId ? [ticketId, userId] : [ticketId]
    const [rows] = await pool.execute(query, params)
    
    if (rows.length === 0) return null
    
    const ticket = rows[0]
    
    // Parse JSON fields
    if (typeof ticket.seats === 'string') {
      ticket.seats = JSON.parse(ticket.seats)
    }
    if (ticket.combo_items && typeof ticket.combo_items === 'string') {
      ticket.combo_items = JSON.parse(ticket.combo_items)
    }
    
    return ticket
  }

  static async cancel(id) {
    const [result] = await pool.execute('UPDATE tickets SET booking_status = "cancelled" WHERE id = ?', [id])
    return result.affectedRows > 0
  }

  /**
   * Báo cho khách những mã giảm giá vừa được trả lại sau khi huỷ vé.
   *
   * Vì sao cần: khách chỉ nhìn thấy "vé đã huỷ" và số tiền mặt được hoàn, rất
   * dễ tưởng mã đã dùng là mất luôn. Với voucher bồi thường — bằng ĐÚNG NGUYÊN
   * GIÁ VÉ — hiểu nhầm đó khiến khách tưởng mình mất cả triệu đồng.
   *
   * Chỉ báo MÃ CÁ NHÂN (bồi thường, đổi điểm, sinh nhật). Mã khuyến mãi chung
   * ai cũng dùng được thì trả lại lượt không có ý nghĩa gì với khách.
   *
   * Gọi SAU KHI transaction đã commit; lỗi ở đây không ảnh hưởng việc huỷ vé.
   */
  static async _baoVoucherDuocTraLai({ daTraLai, userId, bookingReference }) {
    const caNhan = daTraLai.filter((v) => v.laMaCaNhan)
    if (!caNhan.length) return false

    const Notification = require("./Notification")
    const moTa = caNhan
      .map((v) => `${v.code} (${Number(v.giaTriDaGiam).toLocaleString("vi-VN")}đ)`)
      .join(", ")

    await Notification.create({
      userId,
      type: "voucher_restored",
      title: caNhan.length > 1 ? "🎟️ Các mã giảm giá đã được trả lại" : "🎟️ Mã giảm giá đã được trả lại",
      message:
        `Vé${bookingReference ? ` ${bookingReference}` : ""} đã huỷ, mã ${moTa} được trả lại vào tài khoản ` +
        `và dùng tiếp được cho lần đặt vé sau.`,
      data: { bookingReference, vouchers: caNhan.map((v) => v.code) },
    })
    return true
  }

  /**
   * Admin huỷ vé theo booking_reference: đánh dấu cancelled VÀ trả ghế về
   * showtime trong cùng 1 transaction (cancel() một mình không trả ghế).
   * @returns {Promise<{ ok: boolean, reason?: 'NOT_FOUND' | 'ALREADY_CANCELLED' }>}
   */
  static async cancelByAdmin(reference) {
    // Bắc cầu dữ liệu ra ngoài transaction cho bước thu hồi điểm thưởng phía
    // dưới, KHÔNG nhét vào object trả về — giữ nguyên hợp đồng công khai
    // { ok, reason? } của hàm này (nơi gọi/test đã dựa vào đúng shape này).
    let pointsInfo = null
    let voucherInfo = null
    const result = await withTransaction(async (connection) => {
      const [rows] = await connection.execute(
        `SELECT t.id, t.user_id, t.showtime_id, t.booking_status, t.payment_status,
                t.combo_items, t.booking_reference, s.cinema_id
         FROM tickets t JOIN showtimes s ON s.id = t.showtime_id
         WHERE t.booking_reference = ?`,
        [reference],
      )
      const ticket = rows[0]
      if (!ticket) return { ok: false, reason: "NOT_FOUND" }
      if (ticket.booking_status === "cancelled") return { ok: false, reason: "ALREADY_CANCELLED" }

      const [[{ cnt }]] = await connection.execute(
        "SELECT COUNT(*) AS cnt FROM ticket_seats WHERE ticket_id = ?",
        [ticket.id],
      )

      // Vé ĐÃ THANH TOÁN mà bị huỷ thì phải chuyển payment_status sang
      // "refunded" — trước đây chỉ đổi booking_status, để nguyên
      // payment_status="paid" khiến: (1) dashboard doanh thu vẫn tính tiền vé
      // đã huỷ vào tổng thu (lọc theo payment_status='paid'), (2) UI vừa hiện
      // badge "Đã huỷ" vừa hiện "Đã thanh toán" mâu thuẫn nhau trên cùng 1 vé.
      const newPaymentStatus = ticket.payment_status === "paid" ? "refunded" : ticket.payment_status
      await connection.execute(
        'UPDATE tickets SET booking_status = "cancelled", payment_status = ? WHERE id = ?',
        [newPaymentStatus, ticket.id],
      )
      // Đánh dấu ticket_seats sang 'cancelled' theo — active_seat_key (cột
      // sinh, xem migration 26) chỉ giữ giá trị (showtime_id, seat_code) khi
      // status='confirmed', nên bước này giải phóng ghế cho showtime để ai đó
      // đặt lại được, thay vì để UNIQUE KEY chặn vĩnh viễn ghế đó.
      await connection.execute(
        'UPDATE ticket_seats SET status = "cancelled" WHERE ticket_id = ?',
        [ticket.id],
      )
      await connection.execute(
        "UPDATE showtimes SET available_seats = LEAST(total_seats, available_seats + ?) WHERE id = ?",
        [cnt || 0, ticket.showtime_id],
      )
      // Trả lại lượt dùng mã giảm giá — xem Voucher.releaseForTicket.
      // Bắc cầu ra ngoài transaction để báo cho khách SAU KHI đã commit: khách
      // chỉ thấy vé bị huỷ thì tưởng mất luôn mã, mà mã bồi thường bằng cả giá vé.
      voucherInfo = await require("./Voucher").releaseForTicket(connection, ticket.id)
      if (voucherInfo?.daTraLai?.length) {
        voucherInfo.userId = ticket.user_id
        voucherInfo.bookingReference = ticket.booking_reference ?? null
      }
      // Hoàn bắp nước về kho của ĐÚNG rạp — khách huỷ vé thì suất bắp đó bán
      // lại được cho người khác, không thì kho hụt dần mà không ai biết vì sao.
      if (ticket.cinema_id && ticket.combo_items?.length) {
        await require("./ComboInventory").hoanLai(connection, ticket.cinema_id, ticket.combo_items)
      }

      if (ticket.payment_status === "paid") {
        pointsInfo = { userId: ticket.user_id, ticketId: ticket.id }
      }
      return { ok: true }
    })

    // Thu hồi điểm thưởng đã tích cho vé này (nếu có) — CHẠY SAU KHI transaction
    // huỷ vé đã commit thành công, side effect không nghiêm trọng giống hệt mẫu
    // awardPoints() ở paymentController.markTicketPaidAndNotify: không để lỗi
    // phụ này làm hỏng việc huỷ vé (tiền/ghế) đã ghi nhận xong. Trước đây bước
    // này hoàn toàn không tồn tại — vé đã hoàn tiền vẫn giữ nguyên điểm thưởng,
    // đổi được voucher thật cho 1 đơn hàng đã bị huỷ.
    // Báo khách những mã vừa dùng lại được. Lỗi ở đây không được ảnh hưởng
    // kết quả huỷ vé — vé đã huỷ xong, mã đã trả lại xong.
    if (voucherInfo?.daTraLai?.length && voucherInfo.userId) {
      try {
        await Ticket._baoVoucherDuocTraLai(voucherInfo)
      } catch (e) {
        console.error("⚠️ Không báo được cho khách về mã giảm giá đã trả lại:", e.message)
      }
    }

    if (pointsInfo) {
      try {
        const pointsService = require("../services/points.service")
        await pointsService.revokePoints(pointsInfo.userId, "ticket", pointsInfo.ticketId, "Hoàn tiền vé đã huỷ")
      } catch (e) {
        console.error(`⚠️ Thu hồi điểm thưởng không thành công cho vé ${pointsInfo.ticketId}:`, e.message)
      }
    }

    // Huỷ vé = ghế được trả lại → số "còn N ghế" trên các trang danh sách lịch
    // chiếu (đang cache 2-3 phút) đã cũ. Đặt ở model để phủ MỌI luồng huỷ: user
    // tự huỷ, admin huỷ, rollback khi tạo thanh toán lỗi, và job tự huỷ vé bỏ dở.
    if (result.ok) {
      try {
        require("../middleware/cache").invalidateCache("showtimes")
      } catch (e) {
        console.error("⚠️ Không xoá được cache lịch chiếu sau khi huỷ vé:", e.message)
      }
    }

    return result
  }

  /**
   * Huỷ vé theo id + trả ghế về showtime trong cùng 1 transaction.
   * Dùng chung cho cả "user tự huỷ vé của mình" (truyền requireUserId) và
   * "admin huỷ vé bất kỳ qua route /api/tickets/:id/cancel" (không truyền).
   * Trước đây 2 luồng này gọi `cancel()` (chỉ đổi trạng thái) rồi
   * `Showtime.incrementAvailableSeats()` bằng 2 lệnh UPDATE rời nhau, không
   * transaction — nếu server crash giữa 2 bước, vé bị đánh dấu huỷ nhưng
   * ghế không được trả lại. Áp dụng đúng mẫu đã dùng ở `cancelByAdmin`
   * (huỷ theo booking_reference) nhưng tổng quát hoá theo ticket id.
   *
   * Giới hạn thời gian huỷ CHỈ áp dụng cho user tự huỷ (requireUserId có giá
   * trị) — giống rạp thật (CGV/Lotte) chặn khách tự huỷ/hoàn vé quá sát giờ
   * chiếu để tránh lợi dụng xem xong mới huỷ, nhưng nhân viên/admin xử lý yêu
   * cầu đặc biệt (rạp có sự cố, khách khiếu nại...) vẫn huỷ được bất kỳ lúc nào.
   * @param {number} id
   * @param {{ requireUserId?: number }} [options]
   * @returns {Promise<{ ok: boolean, reason?: 'NOT_FOUND' | 'ALREADY_CANCELLED' | 'FORBIDDEN' | 'TOO_LATE', minutesUntilShowtime?: number }>}
   */
  static async cancelById(id, { requireUserId } = {}) {
    let pointsInfo = null
    let voucherInfo = null
    const result = await withTransaction(async (connection) => {
      const [rows] = await connection.execute(
        `SELECT t.id, t.user_id, t.showtime_id, t.booking_status, t.payment_status,
                t.combo_items, t.booking_reference, s.cinema_id, s.show_date, s.show_time
         FROM tickets t JOIN showtimes s ON t.showtime_id = s.id
         WHERE t.id = ?`,
        [id],
      )
      const ticket = rows[0]
      if (!ticket) return { ok: false, reason: "NOT_FOUND" }
      if (requireUserId != null && ticket.user_id !== requireUserId) {
        return { ok: false, reason: "FORBIDDEN" }
      }
      if (ticket.booking_status === "cancelled") return { ok: false, reason: "ALREADY_CANCELLED" }

      if (requireUserId != null) {
        const [sh, sm] = (ticket.show_time || "00:00").split(":").map(Number)
        const rawDate = (ticket.show_date || "").toString().split("T")[0]
        const [sy, smo, sd] = rawDate.split("-").map(Number)
        const showAt = new Date(sy, smo - 1, sd, sh, sm)
        const minutesUntilShowtime = (showAt.getTime() - Date.now()) / 60000
        if (minutesUntilShowtime < Ticket.SELF_CANCEL_CUTOFF_MINUTES) {
          return { ok: false, reason: "TOO_LATE", minutesUntilShowtime: Math.round(minutesUntilShowtime) }
        }
      }

      const [[{ cnt }]] = await connection.execute(
        "SELECT COUNT(*) AS cnt FROM ticket_seats WHERE ticket_id = ?",
        [ticket.id],
      )

      // Vé ĐÃ THANH TOÁN mà bị huỷ thì phải chuyển payment_status sang
      // "refunded" — nếu không, dashboard doanh thu vẫn tính tiền vé đã huỷ
      // (lọc theo payment_status='paid'), và UI hiện đồng thời badge "Đã huỷ"
      // lẫn "Đã thanh toán" mâu thuẫn nhau trên cùng 1 vé.
      const newPaymentStatus = ticket.payment_status === "paid" ? "refunded" : ticket.payment_status
      await connection.execute(
        'UPDATE tickets SET booking_status = "cancelled", payment_status = ? WHERE id = ?',
        [newPaymentStatus, ticket.id],
      )
      // Giải phóng active_seat_key — xem chú thích trong cancelByAdmin ở trên.
      await connection.execute(
        'UPDATE ticket_seats SET status = "cancelled" WHERE ticket_id = ?',
        [ticket.id],
      )
      await connection.execute(
        "UPDATE showtimes SET available_seats = LEAST(total_seats, available_seats + ?) WHERE id = ?",
        [cnt || 0, ticket.showtime_id],
      )
      // Trả lại lượt dùng mã giảm giá — xem Voucher.releaseForTicket.
      // Bắc cầu ra ngoài transaction để báo cho khách SAU KHI đã commit: khách
      // chỉ thấy vé bị huỷ thì tưởng mất luôn mã, mà mã bồi thường bằng cả giá vé.
      voucherInfo = await require("./Voucher").releaseForTicket(connection, ticket.id)
      if (voucherInfo?.daTraLai?.length) {
        voucherInfo.userId = ticket.user_id
        voucherInfo.bookingReference = ticket.booking_reference ?? null
      }
      // Hoàn bắp nước về kho của ĐÚNG rạp — khách huỷ vé thì suất bắp đó bán
      // lại được cho người khác, không thì kho hụt dần mà không ai biết vì sao.
      if (ticket.cinema_id && ticket.combo_items?.length) {
        await require("./ComboInventory").hoanLai(connection, ticket.cinema_id, ticket.combo_items)
      }

      if (ticket.payment_status === "paid") {
        pointsInfo = { userId: ticket.user_id, ticketId: ticket.id }
      }
      return { ok: true }
    })

    // Thu hồi điểm thưởng đã tích cho vé này (nếu có) — xem chú thích đầy đủ
    // trong cancelByAdmin ở trên, áp dụng y hệt cho cả 2 luồng tự huỷ/admin huỷ
    // theo id đều đi qua cancelById này.
    // Báo khách những mã vừa dùng lại được. Lỗi ở đây không được ảnh hưởng
    // kết quả huỷ vé — vé đã huỷ xong, mã đã trả lại xong.
    if (voucherInfo?.daTraLai?.length && voucherInfo.userId) {
      try {
        await Ticket._baoVoucherDuocTraLai(voucherInfo)
      } catch (e) {
        console.error("⚠️ Không báo được cho khách về mã giảm giá đã trả lại:", e.message)
      }
    }

    if (pointsInfo) {
      try {
        const pointsService = require("../services/points.service")
        await pointsService.revokePoints(pointsInfo.userId, "ticket", pointsInfo.ticketId, "Hoàn tiền vé đã huỷ")
      } catch (e) {
        console.error(`⚠️ Thu hồi điểm thưởng không thành công cho vé ${pointsInfo.ticketId}:`, e.message)
      }
    }

    // Huỷ vé = ghế được trả lại → số "còn N ghế" trên các trang danh sách lịch
    // chiếu (đang cache 2-3 phút) đã cũ. Đặt ở model để phủ MỌI luồng huỷ: user
    // tự huỷ, admin huỷ, rollback khi tạo thanh toán lỗi, và job tự huỷ vé bỏ dở.
    if (result.ok) {
      try {
        require("../middleware/cache").invalidateCache("showtimes")
      } catch (e) {
        console.error("⚠️ Không xoá được cache lịch chiếu sau khi huỷ vé:", e.message)
      }
    }

    return result
  }

  /**
   * Tự động huỷ các vé "bỏ dở giữa chừng" — đã tạo xong (booking_status=
   * 'confirmed', ghế đã bị trừ khỏi available_seats) nhưng CHƯA thanh toán
   * quá lâu (user đóng tab, bấm "Huỷ giao dịch" ở màn thanh toán mock/QR mà
   * frontend chỉ reset UI chứ không gọi API huỷ, hoặc rớt mạng giữa chừng).
   * Không có cơ chế này, ghế bị "kẹt" vĩnh viễn — không ai đặt lại được — cho
   * tới khi admin phát hiện và huỷ tay. Chạy định kỳ (xem app.js). Ngưỡng
   * mặc định 20 phút = 15 phút giữ ghế (SeatLock) + 5 phút dự phòng, tránh
   * huỷ nhầm 1 giao dịch đang xử lý bình thường nhưng hơi chậm.
   * @returns {Promise<number>} số vé đã được giải phóng
   */
  static async releaseStalePendingTickets(maxAgeMinutes = 20) {
    const [staleTickets] = await pool.query(
      `SELECT id FROM tickets
       WHERE booking_status = 'confirmed' AND payment_status = 'pending'
         AND created_at < DATE_SUB(NOW(), INTERVAL ? MINUTE)`,
      [maxAgeMinutes],
    )
    let released = 0
    for (const { id } of staleTickets) {
      const result = await Ticket.cancelById(id)
      if (result.ok) released++
    }
    return released
  }

  static async getStats() {
    const [totalBookings] = await pool.execute("SELECT COUNT(*) as count FROM tickets")
    const [totalRevenue] = await pool.execute(
      'SELECT SUM(total_amount) as revenue FROM tickets WHERE booking_status = "confirmed" AND payment_status = "paid"',
    )
    const [todayBookings] = await pool.execute(
      "SELECT COUNT(*) as count FROM tickets WHERE DATE(created_at) = CURDATE()",
    )

    return {
      totalBookings: totalBookings[0].count,
      totalRevenue: totalRevenue[0].revenue || 0,
      todayBookings: todayBookings[0].count,
    }
  }

  static async getDailyStats(dateString) {
    // dateString in 'YYYY-MM-DD'
    const [[{ ticketsToday }]] = await pool.query('SELECT COUNT(*) as ticketsToday FROM tickets WHERE DATE(created_at) = ?', [dateString])
    const [[{ ticketsYesterday }]] = await pool.query('SELECT COUNT(*) as ticketsYesterday FROM tickets WHERE DATE(created_at) = DATE_SUB(?, INTERVAL 1 DAY)', [dateString])
    const [[{ revenueToday }]] = await pool.query('SELECT COALESCE(SUM(total_amount),0) as revenueToday FROM tickets WHERE DATE(created_at) = ?', [dateString])
    const [[{ revenueYesterday }]] = await pool.query('SELECT COALESCE(SUM(total_amount),0) as revenueYesterday FROM tickets WHERE DATE(created_at) = DATE_SUB(?, INTERVAL 1 DAY)', [dateString])
    return { ticketsToday, ticketsYesterday, revenueToday, revenueYesterday }
  }

  static async getRecentBookings(limit = 10, cinemaId = null) {
    const cinemaFilter = cinemaId ? "WHERE s.cinema_id = ?" : ""
    const params = cinemaId ? [cinemaId, limit] : [limit]

    const [rows] = await pool.query(
      `SELECT t.booking_reference as reference,
              t.booking_status as status,
              t.payment_status,
              t.total_amount as amount,
              t.created_at,
        -- Danh sách ghế lấy TỪ BẢNG ticket_seats chứ không đọc cột t.seats.
        -- Cùng một thông tin ghế từng được lưu ở HAI nơi (cột JSON t.seats và
        -- bảng ticket_seats) nên hai nơi có thể lệch nhau — thực tế đã lệch:
        -- vé #8 ghi trong JSON là 2 ghế nhưng chỉ giữ được 1 vì ghế kia đã có
        -- người khác. ticket_seats mới là nguồn sự thật: nó có ràng buộc UNIQUE
        -- chống đặt trùng và là căn cứ tính available_seats.
        COALESCE(
          (SELECT JSON_ARRAYAGG(z.seat_code) FROM
             (SELECT ts.seat_code FROM ticket_seats ts WHERE ts.ticket_id = t.id ORDER BY ts.seat_code) z),
          t.seats
        ) AS seats,
              m.title as movie,
              c.name as cinema,
              s.show_date,
              s.show_time
       FROM tickets t
       JOIN showtimes s ON t.showtime_id = s.id
       JOIN movies m ON s.movie_id = m.id
       JOIN cinemas c ON s.cinema_id = c.id
       ${cinemaFilter}
       ORDER BY t.created_at DESC
       LIMIT ?`,
      params,
    )
    // Format dates
    return rows.map(row => ({
      ...row,
      show_date: row.show_date ? new Date(row.show_date).toISOString().split('T')[0] : null,
      show_time: row.show_time || 'N/A'
    }))
  }

  /**
   * @param {number} limit
   * @param {number|null} cinemaId - giới hạn theo 1 rạp (quản lý chi nhánh).
   */
  static async getAllBookingsDetailed(limit = 100, cinemaId = null) {
    const [rows] = await pool.query(
      `SELECT t.booking_reference as reference,
              t.booking_status as status,
              t.payment_status,
              t.total_amount as amount, t.created_at,
              m.title as movie, c.name as cinema, s.show_date, s.show_time,
        -- Danh sách ghế lấy TỪ BẢNG ticket_seats chứ không đọc cột t.seats.
        -- Cùng một thông tin ghế từng được lưu ở HAI nơi (cột JSON t.seats và
        -- bảng ticket_seats) nên hai nơi có thể lệch nhau — thực tế đã lệch:
        -- vé #8 ghi trong JSON là 2 ghế nhưng chỉ giữ được 1 vì ghế kia đã có
        -- người khác. ticket_seats mới là nguồn sự thật: nó có ràng buộc UNIQUE
        -- chống đặt trùng và là căn cứ tính available_seats.
        COALESCE(
          (SELECT JSON_ARRAYAGG(z.seat_code) FROM
             (SELECT ts.seat_code FROM ticket_seats ts WHERE ts.ticket_id = t.id ORDER BY ts.seat_code) z),
          t.seats
        ) AS seats,
              u.username as customer_name,
              u.email as customer_email
       FROM tickets t
       JOIN showtimes s ON t.showtime_id = s.id
       JOIN movies m ON s.movie_id = m.id
       JOIN cinemas c ON s.cinema_id = c.id
       LEFT JOIN users u ON t.user_id = u.id
       ${cinemaId ? "WHERE s.cinema_id = ?" : ""}
       ORDER BY t.created_at DESC
       LIMIT ?`,
      cinemaId ? [cinemaId, limit] : [limit],
    )
    return rows
  }

  /**
   * Số liệu vận hành THỰC (toàn bộ hệ thống, không phải mẫu 10 booking gần nhất).
   * Trước đây dashboard suy ra "vé chờ thanh toán"/"vé đã hủy" từ recentBookings
   * (chỉ 10 dòng) — sai lệch nặng khi có nhiều vé tồn hơn 10 (ví dụ: 43 vé pending
   * thật nhưng mẫu 10 gần nhất có thể toàn vé đã thanh toán, hiển thị "0").
   *
   * QUAN TRỌNG: "vé chờ thanh toán" PHẢI kèm điều kiện booking_status='confirmed'
   * — trước đây chỉ lọc payment_status='pending', nhưng releaseStalePendingTickets()
   * (job tự động huỷ vé bỏ dở giữa chừng, xem app.js) chỉ đổi booking_status
   * thành 'cancelled' khi huỷ, CHỦ Ý giữ nguyên payment_status='pending' (vì
   * chưa hề thanh toán thì không có gì để chuyển sang "refunded" cả — xem
   * cancelById()/cancelByAdmin()). Thiếu điều kiện này khiến MỌI vé bỏ dở đã bị
   * huỷ từ hàng tháng trước vẫn bị đếm là "đang chờ thanh toán" mãi mãi — kiểm
   * chứng trực tiếp: cả 43 vé "pending" trong DB thật đều có booking_status
   * ='cancelled' (vé cũ nhất từ tháng 1/2026), tức số "chờ thanh toán" thật sự
   * phải là 0, không phải 43. cancelledRecentCount không dính lỗi này vì đã có
   * sẵn điều kiện thời gian 24h + kiểm tra booking_status riêng.
   */
  static async getOperationalCounts(cinemaId = null) {
    const cinemaFilter = cinemaId ? "AND s.cinema_id = ?" : ""
    const cinemaParams = cinemaId ? [cinemaId] : []

    const [[row]] = await pool.query(
      `SELECT
        (SELECT COUNT(*) FROM tickets t JOIN showtimes s ON t.showtime_id = s.id
         WHERE t.payment_status = 'pending' AND t.booking_status = 'confirmed' ${cinemaFilter}) as pendingCount,
        (SELECT COALESCE(SUM(t.total_amount), 0) FROM tickets t JOIN showtimes s ON t.showtime_id = s.id
         WHERE t.payment_status = 'pending' AND t.booking_status = 'confirmed' ${cinemaFilter}) as pendingRevenue,
        (SELECT COUNT(*) FROM tickets t JOIN showtimes s ON t.showtime_id = s.id
         WHERE (t.booking_status IN ('cancelled', 'failed') OR t.payment_status = 'failed')
           AND t.created_at >= NOW() - INTERVAL 1 DAY ${cinemaFilter}) as cancelledRecentCount
      `,
      [...cinemaParams, ...cinemaParams, ...cinemaParams],
    )
    return row
  }

  // QUAN TRỌNG — LỊCH SỬ LỖI MÚI GIỜ (2 lớp, đã xảy ra thật cả 2 lần):
  // (1) `today`/`yesterday` trước đây tính bằng `new Date().toISOString()...`
  //     — quy đổi UTC TRƯỚC khi cắt chuỗi ngày, khiến khung 00h00-06h59 giờ
  //     VN mỗi ngày bị tính lùi lại 1 ngày. Đã sửa bằng formatLocalDateString
  //     (giờ địa phương Node.js) — vẫn đúng, giữ nguyên.
  // (2) Sau đó thêm CONVERT_TZ(col, '+00:00','+07:00') khi so khớp với
  //     paid_at/created_at, với giả định các cột này lưu giờ UTC — nhưng
  //     kiểm chứng trực tiếp trên DB thật cho thấy MySQL server ở đây chạy
  //     time_zone=SYSTEM và hệ điều hành đã đặt sẵn giờ VN (+07:00), nên
  //     NOW()/CURRENT_TIMESTAMP (dùng để ghi created_at/paid_at) TRẢ VỀ SẴN
  //     giờ VN, không phải UTC. Áp thêm CONVERT_TZ '+00:00'→'+07:00' lên 1
  //     giá trị ĐÃ LÀ giờ VN sẽ cộng dư thêm 7 tiếng nữa — kiểm chứng trực
  //     tiếp: vé tạo lúc 23:58 ngày 29/7 bị CONVERT_TZ đẩy thành 06:58 ngày
  //     30/7, đủ để "hôm nay" tính sai thành "ngày mai" suốt từ ~17h VN tới
  //     nửa đêm mỗi ngày. Bỏ CONVERT_TZ — so sánh trực tiếp vì cả cột DB lẫn
  //     `today`/`yesterday` (tính từ Date() phía Node, cùng máy, cùng giờ hệ
  //     thống) đã cùng nằm trong 1 khung giờ VN nhất quán, không cần quy đổi.
  static async getDashboardStats(cinemaId = null) {
    const today = formatLocalDateString(new Date())
    const yesterday = formatLocalDateString(new Date(Date.now() - 24 * 60 * 60 * 1000))
    const lastMonth = formatLocalDateString(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))

    const cinemaFilter = cinemaId ? "AND s.cinema_id = ?" : ""
    const cinemaParam = cinemaId ? [cinemaId] : []
    const vnDate = (col) => `DATE(${col})`

    const [[stats]] = await pool.query(
      `SELECT
        (SELECT COUNT(*) FROM users) as totalUsers,
        (SELECT COUNT(*) FROM users WHERE ${vnDate('created_at')} = ?) as newUsersToday,
        (SELECT COUNT(*) FROM users WHERE created_at >= ?) as newUsersThisMonth,
        (SELECT COUNT(*) FROM movies) as totalMovies,
        (SELECT COUNT(*) FROM movies WHERE created_at >= ?) as newMoviesThisMonth,

        (SELECT COALESCE(COUNT(*), 0)
         FROM tickets t
         JOIN showtimes s ON t.showtime_id = s.id
         WHERE ${vnDate('COALESCE(t.paid_at, t.created_at)')} = ?
         AND t.payment_status = 'paid' ${cinemaFilter}
        ) as ticketsToday,

        (SELECT COALESCE(SUM(t.total_amount), 0)
         FROM tickets t
         JOIN showtimes s ON t.showtime_id = s.id
         WHERE ${vnDate('COALESCE(t.paid_at, t.created_at)')} = ?
         AND t.payment_status = 'paid' ${cinemaFilter}
        ) as revenueToday,

        (SELECT COALESCE(COUNT(*), 0)
         FROM tickets t
         JOIN showtimes s ON t.showtime_id = s.id
         WHERE ${vnDate('COALESCE(t.paid_at, t.created_at)')} = ?
         AND t.payment_status = 'paid' ${cinemaFilter}
        ) as ticketsYesterday,

        (SELECT COALESCE(SUM(t.total_amount), 0)
         FROM tickets t
         JOIN showtimes s ON t.showtime_id = s.id
         WHERE ${vnDate('COALESCE(t.paid_at, t.created_at)')} = ?
         AND t.payment_status = 'paid' ${cinemaFilter}
        ) as revenueYesterday
      `,
      [
        today, lastMonth, lastMonth,
        today, ...cinemaParam,
        today, ...cinemaParam,
        yesterday, ...cinemaParam,
        yesterday, ...cinemaParam,
      ],
    )

    return stats
  }
}

module.exports = Ticket
