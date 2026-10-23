const Ticket = require("../models/Ticket");
const Showtime = require("../models/Showtime");
const SeatLock = require("../models/SeatLock");
const Combo = require("../models/Combo");
const Voucher = require("../models/Voucher");
const { calculateSeatPricing } = require("../utils/ticketPricing");

const bookTicket = async (req, res) => {
  try {
    const { showtime_id, seats, combo_items, voucher_code, seat_types } = req.body;

    // Validate input trước khi đụng tới req.user — tránh 500 (TypeError đọc
    // req.user.id khi undefined) lúc đáng lẽ phải trả 400 cho payload sai.
    if (!showtime_id || !seats || !Array.isArray(seats)) {
      return res.status(400).json({ error: "Dữ liệu đặt vé không hợp lệ" });
    }

    if (seats.length === 0 || seats.length > 10) {
      return res.status(400).json({ error: "Số lượng ghế không hợp lệ (1-10 ghế)" });
    }

    const user_id = req.user.id;
    const sessionId = req.sessionID || req.headers['x-session-id'] || null;

    // Validate combos if provided
    let comboTotal = 0;
    let validatedCombos = [];
    
    if (combo_items && combo_items.length > 0) {
      const comboValidation = await Combo.validateComboItems(combo_items);
      if (!comboValidation.valid) {
        return res.status(400).json({ 
          error: 'Combo không hợp lệ',
          details: comboValidation.errors
        });
      }
      
      comboTotal = await Combo.calculateComboTotal(combo_items);
      // Snapshot name/price hiện tại vào chính item — xem chú thích ở
      // Combo.enrichComboItems(). Không dùng combo_items thô nữa.
      validatedCombos = await Combo.enrichComboItems(combo_items);
    }

    // Check showtime exists and has available seats
    const showtime = await Showtime.findById(showtime_id);
    if (!showtime) {
      return res.status(404).json({ error: "Không tìm thấy suất chiếu" });
    }

    // Rạp đã bị admin tạm đóng (cinemas.status='INACTIVE') KHÔNG được đặt vé
    // mới — findByMovie/findByDate đã lọc rạp đóng khỏi trang duyệt, nhưng
    // đây là CHỐT CHẶN CUỐI trước khi tạo vé thật, phòng trường hợp khách có
    // sẵn link/tab cũ trỏ thẳng tới showtime_id (bỏ qua bước duyệt danh sách)
    // hoặc admin đóng rạp đúng lúc khách đang ở bước chọn ghế.
    if (showtime.status === "CANCELLED") {
      return res.status(409).json({ error: "Suất chiếu này đã bị huỷ do sự cố tại rạp. Vui lòng chọn suất chiếu khác." });
    }
    if (showtime.cinema_status === "INACTIVE") {
      return res.status(409).json({ error: "Rạp chiếu của suất này đang tạm ngừng hoạt động, không thể đặt vé. Vui lòng chọn suất chiếu khác." });
    }

    // Cùng chốt chặn đã có ở paymentController.js (luồng đặt vé chính) —
    // endpoint này vẫn public nên phải kiểm tra riêng, tránh đặt được vé cho
    // suất chiếu đã kết thúc.
    try {
      const [sh, sm] = (showtime.show_time || "00:00").split(":").map(Number);
      const rawDate = (showtime.show_date || "").toString().split("T")[0];
      const [sy, smo, sd] = rawDate.split("-").map(Number);
      const showAt = new Date(sy, smo - 1, sd, sh, sm);
      if (showAt < new Date()) {
        return res.status(400).json({ error: "Suất chiếu này đã kết thúc, không thể đặt vé." });
      }
    } catch (_) {}

    if (showtime.available_seats < seats.length) {
      return res.status(400).json({ error: "Không đủ ghế trống" });
    }

    // Tính giá từng ghế theo loại vé (người lớn/sinh viên/trẻ em/cao tuổi) —
    // trước đây mọi ghế tính chung 1 giá "seatPrice * số ghế", không thực tế
    // so với rạp thật (luôn có giá ưu đãi riêng cho trẻ em/sinh viên/cao tuổi).
    const seatPrice = showtime.price || 75000;
    const pricing = calculateSeatPricing(seats, seatPrice, seat_types, {
      roomCapacity: showtime.room_capacity || showtime.total_seats,
      movieRating: showtime.rating,
    });
    if (pricing.invalidSeat) {
      return res.status(400).json({ error: `Loại vé không hợp lệ cho ghế ${pricing.invalidSeat}` });
    }
    // Chặn ở server: giao diện đã ẩn loại vé không hợp lệ, nhưng request có thể
    // bị sửa tay để gửi lên vé trẻ em cho phim 18+.
    if (pricing.forbiddenType) {
      return res.status(400).json({
        error: `Phim này yêu cầu người xem từ ${pricing.minAge} tuổi trở lên — không thể chọn loại vé này cho ghế ${pricing.forbiddenSeat}.`,
      });
    }
    const { seatPrices, seatsTotal } = pricing;
    const subtotal = seatsTotal + comboTotal;

    // Áp mã giảm giá (nếu có) trước khi khoá ghế — chỉ XEM TRƯỚC ở đây,
    // lượt dùng thật chỉ được ghi nhận trong Ticket.bookWithTransaction (cùng
    // transaction với việc tạo vé), tránh trừ lượt oan nếu bước đặt vé sau đó thất bại.
    let voucherResult = null;
    if (voucher_code) {
      voucherResult = await Voucher.validate(voucher_code, user_id, subtotal);
      if (!voucherResult.valid) {
        return res.status(400).json({ error: voucherResult.reason });
      }
    }
    const discountAmount = voucherResult?.discountAmount || 0;
    const total_amount = subtotal - discountAmount;

    // Check if seats are available
    // Truyền danh tính người đang đặt để lock CỦA CHÍNH HỌ (giữ ở bước chọn
    // ghế) không tự chặn họ ở bước thanh toán — xem SeatLock.checkSeatsAvailable.
    const availability = await SeatLock.checkSeatsAvailable(showtime_id, seats, {
      ignoreUserId: user_id,
      ignoreSessionId: sessionId,
    });

    if (!availability.available) {
      await SeatLock.unlockSeats(showtime_id, user_id, sessionId, seats).catch(() => {});
      
      const unavailableSeats = [...availability.lockedSeats, ...availability.bookedSeats];
      return res.status(409).json({ 
        error: `Các ghế sau không còn trống: ${unavailableSeats.join(', ')}. Vui lòng chọn ghế khác.`,
        unavailableSeats,
        lockedSeats: availability.lockedSeats,
        bookedSeats: availability.bookedSeats
      });
    }

    // Khoá NGẮN (2 phút) bao quanh chính giao dịch tạo vé, rồi nhả ngay ở
    // dưới — CỐ Ý khác SeatLock.HOLD_MINUTES (15 phút): 15 phút là thời gian
    // GIỮ GHẾ cho khách suy nghĩ/điền thông tin ở luồng thanh toán, còn ở đây
    // vé được tạo ngay trong cùng request nên chỉ cần đủ để chống tranh chấp.
    try {
      await SeatLock.lockSeats(showtime_id, user_id, sessionId, seats, 2);
    } catch (error) {
      if (error.message === 'SEATS_LOCKED') {
        return res.status(409).json({ 
          error: "Ghế vừa được người khác chọn. Vui lòng chọn ghế khác."
        });
      }
      throw error;
    }

    // Generate booking reference
    const booking_reference = `BK${Date.now()}${Math.random().toString(36).substr(2, 4).toUpperCase()}`;

    // Atomic transaction: insert ticket (combo_items dạng JSON) + ticket_seats + decrement seats
    let ticketId;
    try {
      ticketId = await Ticket.bookWithTransaction({
        user_id,
        showtime_id,
        seats,
        seatTypes: seat_types,
        seatPrices,
        validatedCombos,
        comboTotal,
        totalAmount: total_amount,
        voucher: voucherResult?.valid
          ? { id: voucherResult.voucher.id, code: voucherResult.voucher.code, discountAmount }
          : null,
        bookingReference: booking_reference,
        // booking_status là ENUM('confirmed','cancelled') — không có 'pending'.
        // "chờ thanh toán" được biểu diễn bằng payment_status='pending', không
        // phải booking_status; dùng "pending" ở đây làm INSERT luôn lỗi
        // "Data truncated for column 'booking_status'".
        bookingStatus: "confirmed",
        paymentStatus: "pending",
        cinemaId: showtime.cinema_id,
      });
    } catch (err) {
      // Bất kể lỗi gì (hết ghế hay lỗi DB bất ngờ), phải nhả lock ngay — nếu
      // không, ghế bị kẹt "đang khoá" cho tới khi lock tự hết hạn dù booking
      // đã thất bại, chặn oan người khác đặt lại đúng ghế đó.
      await SeatLock.unlockSeats(showtime_id, user_id, sessionId, seats).catch(() => {});
      if (err.code === "NO_SEATS_AVAILABLE") {
        return res.status(409).json({ error: "Không còn đủ ghế trống, vui lòng thử lại." });
      }
      if (err.code === "VOUCHER_LIMIT_EXCEEDED") {
        return res.status(409).json({ error: "Mã giảm giá vừa hết lượt sử dụng, vui lòng thử lại không dùng mã." });
      }
      if (err.code === "COMBO_OUT_OF_STOCK") {
        return res.status(409).json({ error: `Rạp vừa hết "${err.tenMon}". Vui lòng bỏ món này hoặc chọn món khác rồi đặt lại.` });
      }
      throw err;
    }

    // Release the lock (outside transaction — best-effort)
    await SeatLock.unlockSeats(showtime_id, user_id, sessionId, seats).catch(() => {});

    const ticket = await Ticket.findById(ticketId);

    res.status(201).json({
      message: "Đặt vé thành công! Vui lòng thanh toán để hoàn tất.",
      ticket,
      breakdown: {
        seats: seats.length,
        seat_price: seatPrice,
        seat_prices: seatPrices,
        seats_total: seatsTotal,
        combo_total: comboTotal,
        discount_amount: discountAmount,
        voucher_code: voucherResult?.valid ? voucherResult.voucher.code : null,
        total_amount: total_amount
      }
    });
  } catch (error) {
    console.error("Book ticket error:", error);
    res.status(500).json({ error: "Failed to book ticket. Please try again." });
  }
};

const getUserTickets = async (req, res) => {
  try {
    const tickets = await Ticket.findByUser(req.user.id);
    // seats_total = total_amount - combo_total + discount_amount (CỘNG LẠI
    // discount) — total_amount đã là số tiền THỰC THU sau khi trừ voucher
    // (xem bookTicket: total_amount = seatsTotal + comboTotal - discountAmount),
    // nếu không cộng lại discount_amount thì vé có dùng voucher sẽ hiện giá vé
    // bị "ăn bớt" đúng bằng số tiền giảm, thay vì hiện đúng giá vé gốc + dòng
    // giảm giá riêng.
    const ticketsWithSeatsTotal = tickets.map(t => ({
      ...t,
      seats_total: Number(t.total_amount || 0) - Number(t.combo_total || 0) + Number(t.discount_amount || 0)
    }));
    res.json({ tickets: ticketsWithSeatsTotal });
  } catch (error) {
    console.error("Get user tickets error:", error);
    res.status(500).json({ error: "Failed to fetch tickets" });
  }
};

const getTicketDetail = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    
    const ticket = await Ticket.getDetailedTicket(id, userId);
    
    if (!ticket) {
      return res.status(404).json({ error: "Không tìm thấy vé hoặc bạn không có quyền xem vé này" });
    }
    
    // seats_total = total_amount - combo_total + discount_amount, xem giải
    // thích ở getUserTickets phía trên (total_amount đã trừ voucher rồi).
    const seatsTotal = Number(ticket.total_amount || 0) - Number(ticket.combo_total || 0) + Number(ticket.discount_amount || 0);
    
    res.json({ 
      ticket: {
        ...ticket,
        seats_total: seatsTotal
      }
    });
  } catch (error) {
    console.error("Get ticket detail error:", error);
    res.status(500).json({ error: "Failed to fetch ticket details" });
  }
};

const getAllTickets = async (req, res) => {
  try {
    const tickets = await Ticket.findAll();
    res.json({ tickets });
  } catch (error) {
    console.error("Get all tickets error:", error);
    res.status(500).json({ error: "Failed to fetch tickets" });
  }
};

const cancelTicket = async (req, res) => {
  try {
    const { id } = req.params;

    // cancelById huỷ vé + hoàn ghế trong 1 transaction (trước đây là 2 lệnh
    // UPDATE rời nhau, có thể để lại trạng thái nửa vời nếu crash giữa chừng)
    const result = await Ticket.cancelById(id);
    if (!result.ok) {
      if (result.reason === "NOT_FOUND") {
        return res.status(404).json({ error: "Ticket not found" });
      }
      return res.status(400).json({ error: "Ticket already cancelled" });
    }

    await ghiSoHoanTien(id, "admin", `Quản trị viên huỷ vé`, req.user?.id);
    res.json({ message: "Ticket cancelled successfully" });
  } catch (error) {
    console.error("Cancel ticket error:", error);
    res.status(500).json({ error: "Failed to cancel ticket" });
  }
};

/**
 * Ghi lệnh hoàn tiền vào sổ sau khi huỷ vé (migration 49).
 *
 * KHÔNG được để lỗi ở đây làm hỏng kết quả huỷ vé: ghế đã nhả, vé đã huỷ,
 * khách đã thấy. Nhưng cũng không được im lặng — một vé đã thanh toán mà
 * không có dòng hoàn tiền là một khoản tiền không ai theo dõi.
 *
 * Vé chưa từng thanh toán thì deNghiHoan() tự bỏ qua, không tạo dòng rác.
 */
async function ghiSoHoanTien(ticketId, nguon, lyDo, nguoiDeNghiId) {
  try {
    const { deNghiHoan } = require("../services/refund.service");
    return await deNghiHoan({ ticketId, nguon, lyDo, nguoiDeNghiId });
  } catch (e) {
    console.error(`⚠️ KHÔNG GHI ĐƯỢC LỆNH HOÀN cho vé #${ticketId}:`, e.message);
    return null;
  }
}

const getTicketStats = async (req, res) => {
  try {
    const stats = await Ticket.getStats();
    res.json({ stats });
  } catch (error) {
    console.error("Get ticket stats error:", error);
    res.status(500).json({ error: "Failed to fetch stats" });
  }
};

const cancelMyTicket = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // cancelById huỷ vé + hoàn ghế trong 1 transaction, đồng thời kiểm tra
    // quyền sở hữu (requireUserId) trong cùng truy vấn để tránh race giữa
    // lúc kiểm tra và lúc huỷ.
    const result = await Ticket.cancelById(id, { requireUserId: userId });
    if (!result.ok) {
      if (result.reason === "NOT_FOUND") {
        return res.status(404).json({ error: "Ticket not found" });
      }
      if (result.reason === "FORBIDDEN") {
        return res.status(403).json({ error: "Not authorized to cancel this ticket" });
      }
      if (result.reason === "TOO_LATE") {
        return res.status(400).json({
          error: `Không thể huỷ vé trong vòng 2 giờ trước giờ chiếu (suất chiếu bắt đầu sau ${Math.max(0, result.minutesUntilShowtime)} phút). Vui lòng liên hệ tổng đài để được hỗ trợ.`,
        });
      }
      return res.status(400).json({ error: "Ticket already cancelled" });
    }

    // Khách tự huỷ đúng hạn: lỗi không thuộc về ai, nhưng tiền vẫn phải trả
    // lại. Nguồn 'khach_huy' nằm trong danh sách được tự động duyệt nếu số
    // tiền dưới ngưỡng — khách không phải chờ ai bấm nút.
    const hoan = await ghiSoHoanTien(id, "khach_huy", "Khách tự huỷ vé", userId);

    res.json({
      message: "Ticket cancelled successfully",
      refund: hoan?.refundId
        ? {
            id: hoan.refundId,
            status: hoan.tuDongDuyet ? "da_duyet" : "cho_duyet",
            message: hoan.tuDongDuyet
              ? "Yêu cầu hoàn tiền đã được duyệt tự động và đang xử lý."
              : "Yêu cầu hoàn tiền đã được ghi nhận, chờ quản trị viên duyệt.",
          }
        : null,
    });
  } catch (error) {
    console.error("Cancel my ticket error:", error);
    res.status(500).json({ error: "Failed to cancel ticket" });
  }
};

module.exports = {
  bookTicket,
  getUserTickets,
  getTicketDetail,
  getAllTickets,
  cancelTicket,
  getTicketStats,
  cancelMyTicket,
};
