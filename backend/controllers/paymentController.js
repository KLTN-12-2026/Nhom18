const Payment = require("../models/Payment")
const Ticket = require("../models/Ticket")
const Combo = require("../models/Combo")
const Voucher = require("../models/Voucher")
const { calculateSeatPricing } = require("../utils/ticketPricing")
const mockPaymentService = require("../services/mockPaymentService")
const { getSystemSettings } = require("../services/systemSettings.service")
const { pool } = require("../config/database")

/**
 * Helper: đánh dấu ticket paid, gửi email, clear cache, emit socket
 * Dùng chung cho mock / vnpay / momo callback
 */
// tickets.seats là cột JSON native — mysql2 đã tự parse sẵn thành mảng,
// JSON.parse thẳng vào đó sẽ throw ("Z1" is not valid JSON) chứ không còn
// là chuỗi nữa. Dùng chung 1 helper để 2 chỗ cần seats trong cùng luồng
// markTicketPaidAndNotify không lặp lại cùng 1 điều kiện.
function parseTicketSeats(ticket) {
  return Array.isArray(ticket.seats) ? ticket.seats : JSON.parse(ticket.seats || '[]')
}

async function markTicketPaidAndNotify(ticketId) {
  // 1. Mark paid (quan trọng nhất)
  const ketQua = await Ticket.markPaid(ticketId)
  if (!ketQua.ok) {
    // Khách ĐÃ trả tiền nhưng ghế đã thuộc về người khác (vé bị huỷ tự động
    // trước khi tiền về). Không gửi email vé, không tích điểm — vé không tồn
    // tại. Phải hoàn tiền thủ công; ghi log mức error để không bị bỏ sót.
    console.error(`🚨 CẦN HOÀN TIỀN THỦ CÔNG: vé ${ticketId} nhận thanh toán sau khi đã bị huỷ tự động, ghế đã có người khác đặt (${ketQua.reason}).`)
    return
  }
  if (ketQua.revived) {
    console.log(`♻️ Vé ${ticketId} được khôi phục: tiền về sau khi bị huỷ tự động, ghế vẫn còn trống nên đã giữ lại.`)
  }

  // 2. Load ticket để dùng sau
  const ticket = await Ticket.findById(ticketId)
  if (!ticket) return

  // 2.5 Nhả khoá ghế — vé đã thanh toán xong thì ghế được giữ bằng chính vé
  // (ticket_seats), không cần khoá tạm nữa. Không dọn thì dòng khoá nằm lại
  // tới khi hết hạn, và API trả ghế đó ở CẢ booked_seats lẫn locked_seats —
  // dư thừa, và làm bộ soát lỗi báo "khoá ghế quá hạn chưa được dọn".
  try {
    const SeatLock = require('../models/SeatLock')
    const seats = parseTicketSeats(ticket)
    if (seats.length) await SeatLock.unlockSeats(ticket.showtime_id, ticket.user_id, null, seats)
  } catch (e) {
    console.error(`⚠️ Không nhả được khoá ghế sau khi thanh toán vé ${ticketId} (không ảnh hưởng vé):`, e.message)
  }

  // 3. Gửi email xác nhận (non-critical)
  try {
    const User = require('../models/User')
    const user = await User.findById(ticket.user_id)
    if (user && user.email) {
      const { sendTicketConfirmationEmail } = require('../services/emailService')
      const seats = parseTicketSeats(ticket)
      await sendTicketConfirmationEmail(user.email, {
        bookingReference: ticket.booking_reference,
        movieTitle:       ticket.movie_title  || 'Phim',
        cinemaName:       ticket.cinema_name  || 'Rạp',
        showDate:         ticket.show_date    || '',
        showTime:         ticket.show_time    || '',
        seats:            seats.join(', '),
        totalAmount:      ticket.total_amount || 0,
        username:         user.username || user.email,
      })
    }
  } catch (e) {
    // console.error (không phải warn) — hệ thống log tập trung ở production
    // thường lọc/cảnh báo theo mức error, còn warn dễ bị bỏ qua. Email xác
    // nhận không gửi được nghĩa là khách đã thanh toán nhưng không nhận được
    // vé qua email, đáng để biết ngay thay vì chỉ nằm im trong log.
    console.error(`⚠️ Email xác nhận không gửi được cho ticket ${ticketId} (không ảnh hưởng thanh toán):`, e.message)
  }

  // 3.5 Tích điểm thưởng (1 điểm / 10.000đ đã thanh toán) — idempotent nhờ
  // UNIQUE(type, reference_type, reference_id) ở point_transactions, an toàn
  // nếu webhook thanh toán gọi lại (vd VNPay/MoMo retry callback).
  try {
    const pointsService = require('../services/points.service')
    const amount = pointsService.pointsForAmount(ticket.total_amount)
    if (amount > 0) {
      await pointsService.awardPoints(ticket.user_id, amount, `Đặt vé ${ticket.booking_reference || ''}`.trim(), {
        referenceType: 'ticket',
        referenceId: ticket.id,
      })
    }
  } catch (e) {
    console.error(`⚠️ Tích điểm không thành công cho ticket ${ticketId} (không ảnh hưởng thanh toán):`, e.message)
  }

  // 4. Clear cache + socket
  try {
    const { clearCache } = require('../middleware/cache')
    // Pattern '/showtimes' khớp CẢ 2 route ĐANG được cache và có chứa số ghế
    // trống: '/api/showtimes?date=...' (danh sách theo ngày, TTL 3 phút) và
    // '/api/movies/:id/showtimes' (TTL 2 phút). Pattern cũ
    // `/api/showtimes/${id}` KHÔNG khớp key nào cả (đã kiểm chứng): route
    // '/api/showtimes/:id' vốn cố tình KHÔNG cache vì cần dữ liệu ghế
    // real-time, còn key của danh sách là '/api/showtimes?date=...' — ký tự
    // ngay sau "showtimes" là '?' chứ không phải '/'. Tức là lệnh xoá cache
    // này trước đây là lệnh RỖNG, trong khi đúng 2 chỗ hiển thị "còn N ghế"
    // cho người dùng thì không bao giờ được làm mới sau khi có người đặt vé.
    clearCache('/showtimes')
    const { getIO } = require('../socket')
    const seats = parseTicketSeats(ticket)
    getIO().to(`showtime-${ticket.showtime_id}`).emit('seats-purchased', {
      showtimeId: ticket.showtime_id, seats, ticketId,
    })
  } catch (e) {
    // Không throw (thanh toán đã ghi nhận thành công, không được vỡ luồng vì
    // lỗi phụ này), nhưng PHẢI log lại — trước đây nuốt lỗi hoàn toàn im lặng,
    // nếu getIO() lỗi (vd gọi trước khi initializeSocket chạy xong) thì cache
    // cũ + không ai xem showtime này realtime thấy ghế vừa được mua, mà không
    // có dấu vết nào trong log để biết vì sao.
    console.error(`⚠️ Lỗi clear cache/emit socket cho ticket ${ticketId} (không ảnh hưởng thanh toán):`, e.message)
  }
}

/**
 * Create payment for booking
 * This creates the payment URL and QR code
 */
const createPayment = async (req, res) => {
  // Khai báo NGOÀI try (không phải bên trong) để catch bên dưới truy cập được
  // — dùng để ROLLBACK nếu vé vừa tạo xong trong chính request này nhưng 1
  // bước SAU đó (lấy cấu hình cổng thanh toán, gọi API VNPay/MoMo...) lỗi.
  // Trước đây lỗi ở các bước này khiến vé đã commit (available_seats đã trừ,
  // booking_status='confirmed') bị BỎ LẠI VĨNH VIỄN không ai đặt lại được,
  // vì code chỉ nhả seat lock ở khối catch của RIÊNG bước tạo vé (txErr),
  // không che được các lỗi xảy ra SAU khi vé đã tạo thành công.
  let ticketId
  let isNewTicket = false
  try {
    const {
      showtime_id,
      seats,
      combo_items,
      payment_method,
      return_url,
      ticket_id, // Optional - if provided, use existing ticket
      voucher_code,
      seat_types,
    } = req.body;

    const user_id = req.user.id;
    isNewTicket = !ticket_id

    // Validate payment method - Include 'mock' for testing
    if (!['vnpay', 'momo', 'mock'].includes(payment_method)) {
      return res.status(400).json({ error: 'Phương thức thanh toán không hợp lệ. Chỉ hỗ trợ VNPay, MoMo hoặc Mock Payment.' });
    }

    let ticket;

    // If ticket_id provided, use existing ticket
    if (ticket_id) {
      ticket = await Ticket.findById(ticket_id);
      if (!ticket) {
        return res.status(404).json({ error: 'Không tìm thấy vé' });
      }

      // Check if ticket belongs to user
      if (ticket.user_id !== user_id) {
        return res.status(403).json({ error: 'Bạn không có quyền thanh toán vé này' });
      }

      // Check if already paid
      if (ticket.payment_status === 'paid') {
        return res.status(400).json({ error: 'Vé này đã được thanh toán' });
      }

      // Chặn tạo NHIỀU đơn thanh toán còn hiệu lực cùng lúc cho CÙNG 1 vé —
      // nếu không, user mở 2 tab (hoặc bấm lại nút thanh toán) sẽ có 2 link
      // VNPay/MoMo thật cùng sống song song; nếu hoàn tất CẢ HAI, cả hai đều
      // đúng chữ ký/hợp lệ nên hệ thống tính là thanh toán thành công — nghĩa
      // là khách bị trừ tiền 2 lần ở phía cổng thanh toán mà hệ thống không
      // hề hay biết để cảnh báo/ngăn chặn từ trước. Chỉ tái sử dụng đơn cũ
      // nếu còn hiệu lực trong 15 phút gần nhất (khớp thời gian giữ ghế).
      const existingTxs = await Payment.getTransactionsByTicketId(ticket_id)
      const stillLivePending = existingTxs.find((tx) =>
        tx.status === 'pending' && (Date.now() - new Date(tx.created_at).getTime()) < 15 * 60 * 1000
      )
      if (stillLivePending) {
        return res.json({
          success: true,
          ticket_id: ticket_id,
          transaction_id: stillLivePending.id,
          order_id: stillLivePending.gateway_order_id,
          payment_url: stillLivePending.payment_url,
          qr_code_url: stillLivePending.qr_code_url,
          amount: stillLivePending.amount,
          payment_method: stillLivePending.payment_method,
          message: 'Bạn đã có 1 đơn thanh toán đang chờ cho vé này, vui lòng hoàn tất hoặc đợi hết hạn trước khi tạo đơn mới',
        })
      }

      ticketId = ticket_id;
    }
    // Otherwise, create new ticket
    else {
      if (!showtime_id || !seats || !Array.isArray(seats) || seats.length === 0) {
        return res.status(400).json({ error: 'Vui lòng cung cấp showtime_id và seats' });
      }

      // Áp dụng công tắc cấu hình hệ thống thật (trang Cài Đặt admin) — trước
      // đây các cờ này chỉ hiển thị trên UI, không nơi nào đọc để chặn đặt vé,
      // khiến admin bật "Chế độ bảo trì"/tắt "Cho phép đặt vé" nhưng hệ thống
      // vẫn nhận đặt vé bình thường.
      const settings = await getSystemSettings();
      if (settings.maintenance_mode) {
        return res.status(503).json({ error: 'Hệ thống đang bảo trì, tạm thời không thể đặt vé. Vui lòng thử lại sau.' });
      }
      if (!settings.booking_enabled) {
        return res.status(403).json({ error: 'Chức năng đặt vé hiện đang tạm khoá.' });
      }
      if (seats.length > settings.max_seats_per_booking) {
        return res.status(400).json({ error: `Mỗi lượt đặt vé tối đa ${settings.max_seats_per_booking} ghế.` });
      }

      // Import required modules
      const Showtime = require("../models/Showtime");
      const SeatLock = require("../models/SeatLock");
      const sessionId = req.sessionID || req.headers['x-session-id'] || null;

      // 'mock' không có trong ENUM cũ của DB → map sang 'cash' khi lưu
      // Logic xử lý vẫn dùng payment_method gốc ('mock')
      const dbPaymentMethod = ['vnpay', 'momo', 'zalopay'].includes(payment_method)
        ? payment_method : 'cash';

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

      // Get showtime
      const showtime = await Showtime.findById(showtime_id);
      if (!showtime) {
        return res.status(404).json({ error: 'Không tìm thấy suất chiếu' });
      }
      // Hai chốt chặn cuối trước khi tạo vé thật — khách có thể giữ sẵn link
      // hoặc tab cũ trỏ thẳng tới suất chiếu, bỏ qua trang danh sách (nơi suất
      // của rạp đóng / suất đã huỷ vốn đã bị ẩn). Trước đây luồng thanh toán
      // chính này không kiểm tra rạp đóng, chỉ luồng /tickets/book có.
      if (showtime.status === 'CANCELLED') {
        return res.status(409).json({ error: 'Suất chiếu này đã bị huỷ do sự cố tại rạp. Vui lòng chọn suất chiếu khác.' });
      }
      if (showtime.cinema_status === 'INACTIVE') {
        return res.status(409).json({ error: 'Rạp chiếu của suất này đang tạm ngừng hoạt động, không thể đặt vé. Vui lòng chọn suất chiếu khác.' });
      }

      // Kiểm tra suất chiếu đã qua chưa
      try {
        const [sh, sm] = (showtime.show_time || '00:00').split(':').map(Number)
        const rawDate   = (showtime.show_date || '').toString().split('T')[0]
        const [sy, smo, sd] = rawDate.split('-').map(Number)
        const showAt    = new Date(sy, smo - 1, sd, sh, sm)
        if (showAt < new Date()) {
          return res.status(400).json({ error: 'Suất chiếu này đã kết thúc, không thể đặt vé.' })
        }
      } catch (_) {}

      // Tính giá từng ghế theo loại vé (người lớn/sinh viên/trẻ em/cao tuổi)
      const seatPrice = showtime.price || 75000;
      const pricing = calculateSeatPricing(seats, seatPrice, seat_types, {
        roomCapacity: showtime.room_capacity || showtime.total_seats,
        movieRating: showtime.rating,
      });
      if (pricing.invalidSeat) {
        return res.status(400).json({ error: `Loại vé không hợp lệ cho ghế ${pricing.invalidSeat}` });
      }
      // Xem chú thích ở ticketController — chốt chặn độ tuổi phía server.
      if (pricing.forbiddenType) {
        return res.status(400).json({
          error: `Phim này yêu cầu người xem từ ${pricing.minAge} tuổi trở lên — không thể chọn loại vé này cho ghế ${pricing.forbiddenSeat}.`,
        });
      }
      const { seatPrices, seatsTotal } = pricing;
      const subtotal = seatsTotal + comboTotal;

      // Áp mã giảm giá (nếu có) — chỉ xem trước, lượt dùng thật được ghi
      // trong Ticket.bookWithTransaction cùng transaction với việc tạo vé.
      let voucherResult = null;
      if (voucher_code) {
        voucherResult = await Voucher.validate(voucher_code, user_id, subtotal);
        if (!voucherResult.valid) {
          return res.status(400).json({ error: voucherResult.reason });
        }
      }
      const discountAmount = voucherResult?.discountAmount || 0;
      const totalAmount = subtotal - discountAmount;

      // Kiểm tra ghế trống (không bị lock bởi ai và chưa được đặt)
      // Bỏ qua lock của chính người đang thanh toán — xem chú thích trong
      // SeatLock.checkSeatsAvailable.
      const availability = await SeatLock.checkSeatsAvailable(showtime_id, seats, {
        ignoreUserId: user_id,
        ignoreSessionId: sessionId,
      });
      if (!availability.available) {
        const unavailableSeats = [...availability.lockedSeats, ...availability.bookedSeats];
        return res.status(409).json({
          error: `Các ghế sau không còn trống: ${unavailableSeats.join(', ')}`,
          unavailableSeats
        });
      }

      // Lock ghế 15 phút cho quá trình thanh toán
      try {
        await SeatLock.lockSeats(showtime_id, user_id, sessionId, seats, SeatLock.HOLD_MINUTES);
      } catch (error) {
        if (error.message === 'SEATS_LOCKED') {
          return res.status(409).json({ error: 'Ghế vừa được người khác chọn' });
        }
        throw error;
      }

      // Đảm bảo bảng ticket_seats tồn tại (idempotent — an toàn chạy nhiều lần).
      // Schema này khớp với trạng thái SAU migration 26-fix-ticket-seats-cancel-block.sql
      // (uq_showtime_seat cũ chặn vĩnh viễn 1 seat_code sau khi vé bị huỷ/hết hạn —
      // xem migration đó để biết chi tiết); chỉ áp dụng khi bootstrap 1 DB hoàn
      // toàn mới chưa từng chạy migrations, nên viết thẳng schema đích ở đây.
      await pool.execute(`
        CREATE TABLE IF NOT EXISTS ticket_seats (
          id          INT AUTO_INCREMENT PRIMARY KEY,
          ticket_id   INT NOT NULL,
          showtime_id INT NOT NULL,
          seat_code   VARCHAR(10) NOT NULL,
          ticket_type ENUM('adult','student','child','senior') NOT NULL DEFAULT 'adult',
          price       DECIMAL(10,2) DEFAULT NULL,
          status      VARCHAR(20) NOT NULL DEFAULT 'confirmed',
          active_seat_key VARCHAR(40) GENERATED ALWAYS AS (
            CASE WHEN status = 'confirmed' THEN CONCAT(showtime_id, ':', seat_code) ELSE NULL END
          ) STORED,
          created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY  uq_active_seat (active_seat_key),
          INDEX       idx_ts_ticket_id (ticket_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      // Generate booking reference
      const booking_reference = `BK${Date.now()}${Math.random().toString(36).substr(2, 4).toUpperCase()}`;

      // Atomic: ticket (combo_items dạng JSON) + ticket_seats + available_seats (transaction)
      try {
        ticketId = await Ticket.bookWithTransaction({
          user_id,
          showtime_id,
          seats,
          seatTypes: seat_types,
          seatPrices,
          validatedCombos,
          comboTotal,
          totalAmount,
          voucher: voucherResult?.valid
            ? { id: voucherResult.voucher.id, code: voucherResult.voucher.code, discountAmount }
            : null,
          bookingReference: booking_reference,
          bookingStatus: 'confirmed',
          paymentStatus: 'pending',
          paymentMethod: dbPaymentMethod,
          cinemaId: showtime.cinema_id,
        });
      } catch (txErr) {
        // Bất kể lỗi gì, phải nhả lock 15 phút ngay — nếu không, ghế bị kẹt
        // "đang khoá" cho tới khi hết hạn dù booking đã thất bại, chặn oan
        // người khác đặt lại đúng ghế đó trong suốt 15 phút.
        await SeatLock.unlockSeats(showtime_id, user_id, sessionId, seats).catch(() => {});
        if (txErr.code === 'NO_SEATS_AVAILABLE') {
          return res.status(409).json({ error: 'Không đủ ghế trống' });
        }
        if (txErr.code === 'VOUCHER_LIMIT_EXCEEDED') {
          return res.status(409).json({ error: 'Mã giảm giá vừa hết lượt sử dụng, vui lòng thử lại không dùng mã.' });
        }
        // Kho bắp nước của RẠP ĐÓ vừa hết trong lúc khách đang chọn (xem
        // ComboInventory.tru — trừ kho là thao tác nguyên tử nên chỉ một người
        // lấy được suất cuối). Báo đúng tên món để khách biết bỏ món nào ra.
        if (txErr.code === 'COMBO_OUT_OF_STOCK') {
          return res.status(409).json({ error: `Rạp vừa hết "${txErr.tenMon}". Vui lòng bỏ món này hoặc chọn món khác rồi thanh toán lại.` });
        }
        throw txErr;
      }

      ticket = await Ticket.findById(ticketId);
    }

    // Get payment gateway settings (not required for mock payment)
    let settings = null;
    if (payment_method !== 'mock') {
      settings = await Payment.getGatewaySettings(payment_method);
      if (!settings) {
        return res.status(500).json({ error: `Cổng thanh toán ${payment_method} chưa được cấu hình` });
      }

      // Chặn SỚM khi thông tin cổng thanh toán vẫn còn là giá trị giữ chỗ.
      // Trước đây hệ thống cứ ký bằng "YOUR_TMN_CODE_HERE" rồi đẩy khách sang
      // VNPay, và khách nhận về một mã lỗi khó hiểu của VNPay mà không ai đoán
      // được nguyên nhân thật là ".env chưa điền". Thà báo rõ ngay tại đây.
      const thieu = Payment.kiemTraCauHinhCong(payment_method, settings);
      if (thieu) {
        console.error(`⚠️ [${payment_method}] ${thieu}`);
        return res.status(503).json({
          error: `Cổng ${payment_method.toUpperCase()} chưa sẵn sàng: ${thieu}`,
          hint: 'Điền thông tin cổng thanh toán vào backend/.env rồi khởi động lại máy chủ. Trong lúc chờ, chọn phương thức "Thanh toán giả lập" để đặt vé bình thường.',
        });
      }
    }

    // Đảm bảo bảng payment_transactions tồn tại
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS payment_transactions (
        id                   INT AUTO_INCREMENT PRIMARY KEY,
        ticket_id            INT NOT NULL,
        user_id              INT NOT NULL,
        payment_method       VARCHAR(20) NOT NULL,
        amount               DECIMAL(10,2) NOT NULL,
        currency             VARCHAR(10) DEFAULT 'VND',
        status               ENUM('pending','success','completed','failed','cancelled','refunded') DEFAULT 'pending',
        gateway_transaction_id VARCHAR(255) DEFAULT NULL,
        gateway_order_id     VARCHAR(255) DEFAULT NULL,
        qr_code_url          VARCHAR(1000) DEFAULT NULL,
        payment_url          VARCHAR(1000) DEFAULT NULL,
        request_data         JSON DEFAULT NULL,
        response_data        JSON DEFAULT NULL,
        callback_data        JSON DEFAULT NULL,
        error_message        TEXT DEFAULT NULL,
        created_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        completed_at         TIMESTAMP NULL DEFAULT NULL,
        INDEX idx_pt_ticket_id (ticket_id),
        INDEX idx_pt_user_id   (user_id),
        INDEX idx_pt_gateway_order (gateway_order_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Generate unique order ID
    const orderId = `${payment_method.toUpperCase()}_${ticket.booking_reference}_${Date.now()}`;
    
    // Prepare order info
    const orderInfo = `Thanh toan ve phim ${ticket.movie_title || 'Movie'} - ${ticket.booking_reference}`;
    const amount = Math.round(ticket.total_amount); // Round to integer
    const clientIp = req.ip || req.connection.remoteAddress || '127.0.0.1';
    
    // Frontend return URL (where user goes after payment). Gateway sẽ nối thêm
    // vnp_*/resultCode... vào sau, nên phải tự nhét ticketId vào đây — trang
    // payment-success không có cách nào khác để biết đang xem vé nào khi trình
    // duyệt được VNPay/MoMo redirect thẳng về (không đi qua polling ở tab gốc).
    const baseReturnUrl = return_url || `${process.env.FRONTEND_URL || 'http://localhost:3000'}/booking/payment-success`;
    const returnUrl = `${baseReturnUrl}${baseReturnUrl.includes('?') ? '&' : '?'}ticketId=${ticketId}`;
    
    // URL để cổng thanh toán GỌI NGƯỢC VỀ server báo kết quả (IPN/webhook).
    //
    // PUBLIC_BASE_URL cho phép khai báo địa chỉ CÔNG KHAI của backend, tách
    // khỏi địa chỉ mà trình duyệt dùng để gọi API. Rất cần khi chạy sandbox ở
    // máy cá nhân: server MoMo/VNPay nằm ngoài Internet, KHÔNG thể gọi vào
    // http://localhost:5000, nên phải trỏ qua một đường hầm (ngrok/localtunnel).
    // Không có biến này thì buộc phải cho frontend gọi API qua đường hầm và
    // build lại toàn bộ frontend (vì NEXT_PUBLIC_* bị nhúng lúc build).
    // Khi để trống (mặc định), giữ nguyên hành vi cũ — suy ra từ chính request.
    const callbackBase = (process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
    const notifyUrl = `${callbackBase}/api/payment/callback/${payment_method}`;

    // Log URL callback cho giao dịch THẬT (không phải mock) kèm cảnh báo nếu
    // nó trỏ vào localhost — đây là nguyên nhân số 1 khiến "thanh toán xong mà
    // vé vẫn treo": cổng thanh toán ở ngoài Internet không gọi vào máy cá nhân
    // được, nên IPN không bao giờ tới và vé mãi ở trạng thái chờ thanh toán.
    if (payment_method !== 'mock') {
      const isLocal = /localhost|127\.0\.0\.1|::1/.test(callbackBase);
      console.log(`💳 [${payment_method}] URL nhận kết quả thanh toán: ${notifyUrl}`);
      if (isLocal) {
        console.warn(
          '⚠️  URL trên trỏ vào máy cục bộ — cổng thanh toán KHÔNG gọi về được, ' +
          'vé sẽ mãi ở trạng thái "chờ thanh toán". Hãy mở một đường hầm ra Internet ' +
          '(vd: npx localtunnel --port 5000) rồi đặt PUBLIC_BASE_URL trong .env.',
        );
      }
    }

    let paymentUrl = '';
    let qrCodeUrl = '';
    let transactionId = null;

    try {
      // Check if mock payment should be used
      // Use mock if: (1) payment_method is 'mock', OR (2) ENABLE_MOCK_PAYMENT env is 'true'
      const useMockPayment = payment_method === 'mock' || process.env.ENABLE_MOCK_PAYMENT === 'true'

      if (useMockPayment) {
        // Use mock payment for testing
        console.log('🧪 Using MOCK payment mode for testing')
        
        const mockResult = mockPaymentService.createMockPaymentUrl({
          ticketId,
          amount,
          orderInfo
        })
        
        paymentUrl = mockResult.paymentUrl
        // Trước đây dòng này tạo `data:text/plain;base64,...` rồi gán vào
        // <img src> — kiểu MIME text/plain KHÔNG BAO GIỜ hiển thị được thành
        // ảnh, nên mã QR ở chế độ giả lập luôn vỡ. Sinh ảnh QR thật từ chính
        // đường dẫn thanh toán giả lập, giống hệt nhánh MoMo bên dưới.
        qrCodeUrl = Payment.generateQRCodeURL(mockResult.paymentUrl)
        
        // Auto hoàn thành mock payment sau 2 giây
        setTimeout(async () => {
          try {
            // 1. Update transaction (non-critical — bỏ qua nếu lỗi)
            try {
              await pool.execute(
                `UPDATE payment_transactions SET status = 'success', gateway_transaction_id = ?,
                 completed_at = NOW(), updated_at = NOW() WHERE gateway_order_id = ?`,
                [mockResult.transactionNo || 'MOCK_TXN', orderId]
              )
            } catch (_) {}

            // 2. Mark ticket paid + send email + clear cache + emit socket (shared helper)
            await markTicketPaidAndNotify(ticketId)
            console.log(`✅ Mock payment: ticket ${ticketId} marked as paid`)
          } catch (err) {
            console.error('❌ Mock payment auto-complete error:', err.message)
          }
        }, 2000)
      } 
      else if (payment_method === 'vnpay') {
        // Generate VNPay payment URL
        paymentUrl = Payment.generateVNPayURL({
          orderId,
          amount,
          orderInfo,
          returnUrl,
          ipAddr: clientIp
        }, settings);
        
        qrCodeUrl = Payment.generateQRCodeURL(paymentUrl);
      } 
      else if (payment_method === 'momo') {
        // Generate MoMo payment
        const momoResult = await Payment.generateMoMoPayment({
          orderId,
          amount,
          orderInfo,
          returnUrl,
          notifyUrl
        }, settings);

        if (momoResult.resultCode === 0) {
          paymentUrl = momoResult.payUrl;

          // KHÔNG dùng thẳng momoResult.qrCodeUrl làm src của thẻ <img>.
          //
          // Tên trường gây hiểu nhầm: MoMo trả về `qrCodeUrl` là một chuỗi
          // DEEPLINK dạng "momo://app?action=payWithApp&isScanQR=true&..." —
          // tức là NỘI DUNG cần mã hoá thành mã QR, KHÔNG PHẢI đường dẫn tới
          // một tấm ảnh. Gán thẳng vào <img src> thì trình duyệt không tải được
          // và hiển thị ảnh vỡ (ô trắng kèm chữ alt).
          //
          // Mã hoá `payUrl` (https) thay vì deeplink momo:// vì payUrl quét
          // được bằng BẤT KỲ ứng dụng camera nào — camera mặc định của điện
          // thoại sẽ mở trang thanh toán MoMo, còn app MoMo thì nhận diện
          // trực tiếp. Deeplink momo:// chỉ app MoMo hiểu, camera thường quét
          // ra một chuỗi vô nghĩa.
          qrCodeUrl = Payment.generateQRCodeURL(paymentUrl);
        } else {
          throw new Error(momoResult.message || 'MoMo payment creation failed');
        }
      }

      // Save transaction to database (dùng dbPaymentMethod để tránh lỗi ENUM)
      const txMethod = ['vnpay', 'momo', 'zalopay'].includes(payment_method)
        ? payment_method : 'cash';
      transactionId = await Payment.createTransaction({
        ticket_id: ticketId,
        user_id,
        payment_method: txMethod,
        amount,
        gateway_order_id: orderId,
        payment_url: paymentUrl,
        qr_code_url: qrCodeUrl,
        request_data: {
          orderInfo,
          returnUrl,
          notifyUrl,
          amount
        }
      })

      // Update ticket with payment info
      await Ticket.updatePaymentFields(ticketId, {
        payment_url: paymentUrl,
        qr_code_url: qrCodeUrl,
        payment_gateway_ref: orderId,
      });

      // Trả về payment_method THẬT SỰ đã dùng (mock hoặc gateway thật) — nếu
      // ENABLE_MOCK_PAYMENT ép mock trong khi user chọn vnpay/momo, frontend
      // phải biết để hiển thị màn hình mock (spinner) thay vì QR thật, tránh
      // hiển thị QR giả (dữ liệu text, không phải ảnh) như thể là QR VNPay/MoMo.
      res.json({
        success: true,
        ticket_id: ticketId,
        transaction_id: transactionId,
        order_id: orderId,
        payment_url: paymentUrl,
        qr_code_url: qrCodeUrl,
        amount,
        payment_method: useMockPayment ? 'mock' : payment_method,
        message: `Vui lòng quét mã QR hoặc truy cập link để thanh toán`
      });

    } catch (error) {
      console.error(`${payment_method} payment generation error:`, error);
      throw error;
    }

  } catch (error) {
    console.error('Create payment error:', error.message, error.stack)

    // Vé vừa tạo THÀNH CÔNG trong chính request này (ticketId đã có giá trị)
    // nhưng 1 bước SAU đó lỗi (thiếu cấu hình cổng thanh toán, gọi API
    // VNPay/MoMo thất bại...) — huỷ vé + trả lại ghế ngay, không được để
    // available_seats bị trừ oan mà không ai đặt được nữa. Không rollback vé
    // đã tồn tại từ trước (ticket_id được truyền vào từ đầu) vì đó là 1 lượt
    // thử thanh toán lại, không phải vé mới tạo trong request này.
    if (isNewTicket && ticketId) {
      try {
        await Ticket.cancelById(ticketId)
        console.log(`↩️ Đã huỷ vé ${ticketId} và trả lại ghế do lỗi tạo thanh toán`)
      } catch (rollbackErr) {
        console.error(`⚠️ Không thể tự động huỷ vé ${ticketId} sau lỗi thanh toán:`, rollbackErr.message)
      }
    }

    res.status(500).json({
      error: 'Không thể tạo thanh toán. Vui lòng thử lại.',
    })
  }
}

/**
 * Xử lý kết quả thanh toán VNPay — DÙNG CHUNG cho hai đường vào:
 *
 *   1. IPN  (server -> server): VNPay gọi thẳng vào máy chủ ta. Đây là nguồn
 *      sự thật chính thức, nhưng CHỈ chạy được khi máy chủ có địa chỉ công
 *      khai (đường hầm ngrok/cloudflared khi chạy ở máy cá nhân).
 *   2. Return URL (qua trình duyệt khách): sau khi trả tiền, VNPay chuyển
 *      trình duyệt về kèm ĐẦY ĐỦ tham số CÓ CHỮ KÝ — cùng bộ dữ liệu, cùng
 *      thuật toán ký. Không ai giả mạo được nếu không có HashSecret.
 *
 * Vì sao cần đường thứ hai: khi đường hầm chết (localtunnel rất hay chết),
 * IPN không bao giờ tới, khách trả tiền xong mà vé vẫn treo rồi bị job dọn
 * huỷ sau 20 phút — đúng tình huống đã gặp ngày 15/09 với vé
 * BK17894623880334U4X. Xác minh trên Return URL cứu được chính xác ca đó.
 *
 * Hàm này KHÔNG tự trả HTTP; nó trả { rspCode, message } để mỗi đường vào tự
 * định dạng phản hồi theo yêu cầu riêng. Idempotent: gọi bao nhiêu lần cũng
 * chỉ xác nhận vé đúng một lần, nên hai đường vào cùng chạy cũng không sao.
 */
const xuLyKetQuaVNPay = async (vnpParams, nguon = 'IPN') => {
  const settings = await Payment.getGatewaySettings('vnpay')
  if (!settings) {
    console.error('VNPay gateway settings not found')
    return { rspCode: '99', message: 'Payment gateway not configured' }
  }

  // Chữ ký là thứ DUY NHẤT quyết định có tin bộ dữ liệu này hay không.
  const isValid = Payment.verifyVNPayCallback({ ...vnpParams }, settings)
  if (!isValid) {
    console.error(`VNPay [${nguon}] signature verification failed`)
    return { rspCode: '97', message: 'Invalid signature' }
  }

  const orderId = vnpParams.vnp_TxnRef
  const responseCode = vnpParams.vnp_ResponseCode
  const transactionId = vnpParams.vnp_TransactionNo
  const amount = parseInt(vnpParams.vnp_Amount) / 100 // xu -> VND

  const transaction = await Payment.getTransactionByOrderId(orderId)
  if (!transaction) {
    console.error(`VNPay [${nguon}] transaction not found: ${orderId}`)
    return { rspCode: '01', message: 'Order not found' }
  }

  // Đối chiếu số tiền VNPay báo về với số tiền đơn hàng thật đã lưu lúc tạo
  // giao dịch — chữ ký đã đảm bảo vnp_Amount không bị giả mạo trên đường
  // truyền, nhưng vẫn nên đối chiếu thêm theo đúng khuyến nghị tích hợp của
  // VNPay (RspCode '04'), phòng trường hợp dữ liệu 2 bên lệch nhau vì lý do
  // khác (vd đơn hàng bị sửa giá sau khi đã tạo link thanh toán).
  if (Math.round(amount) !== Math.round(Number(transaction.amount))) {
    console.error(`VNPay [${nguon}] amount mismatch: nhận ${amount}, chờ ${transaction.amount}`)
    return { rspCode: '04', message: 'Invalid amount' }
  }

  // IDEMPOTENT: VNPay có thể gửi lại IPN nhiều lần cho CÙNG 1 giao dịch, và
  // bây giờ còn thêm khả năng Return URL và IPN cùng tới. Nếu giao dịch đã xử
  // lý xong rồi mà xử lý lại từ đầu, markTicketPaidAndNotify sẽ gửi email xác
  // nhận trùng lặp và bắn lại socket 'seats-purchased' nhiều lần.
  if (['success', 'completed', 'failed'].includes(transaction.status)) {
    console.log(`ℹ️ VNPay [${nguon}] ${orderId} đã xử lý trước đó, bỏ qua`)
    return { rspCode: '02', message: 'Order already confirmed', ticketId: transaction.ticket_id, daXuLyTruocDo: true }
  }

  const success = responseCode === '00'

  await Payment.updateTransaction(transaction.id, {
    status: success ? 'success' : 'failed',
    gateway_transaction_id: transactionId,
    callback_data: vnpParams,
    error_message: success ? null : `VNPay error code: ${responseCode}`,
    completed_at: new Date(),
  })

  if (success) {
    await markTicketPaidAndNotify(transaction.ticket_id)
    console.log(`✅ VNPay [${nguon}] thanh toán thành công cho vé ${transaction.ticket_id}`)
  } else {
    console.log(`❌ VNPay [${nguon}] thanh toán thất bại cho vé ${transaction.ticket_id}: mã ${responseCode}`)
  }

  // RspCode '00' ở đây nghĩa là "merchant đã NHẬN VÀ XỬ LÝ xong thông báo",
  // khác với vnp_ResponseCode '00' nghĩa là "thanh toán thành công" — 2 khái
  // niệm khác nhau theo đúng tài liệu VNPay.
  return { rspCode: '00', message: 'Confirm Success', ticketId: transaction.ticket_id, thanhCong: success }
}

/**
 * VNPay callback handler (IPN - Instant Payment Notification)
 */
const vnpayCallback = async (req, res) => {
  // QUAN TRỌNG: VNPay yêu cầu IPN trả về ĐÚNG body JSON dạng
  // { RspCode, Message } theo tài liệu tích hợp chính thức. Nếu không trả đúng
  // định dạng này, VNPay coi là merchant CHƯA XÁC NHẬN và sẽ tự động gửi lại
  // IPN nhiều lần (retry), dù về phía ta status HTTP vẫn là 200. Luôn trả HTTP
  // 200 kèm đúng RspCode — không dùng HTTP status 4xx/5xx cho các lỗi nghiệp
  // vụ (không tìm thấy đơn, sai chữ ký...), vì VNPay coi bất kỳ gì khác 200 là
  // "chưa nhận được", vẫn sẽ tiếp tục retry.
  try {
    console.log('VNPay IPN received:', req.query)
    const kq = await xuLyKetQuaVNPay(req.query, 'IPN')
    return res.status(200).json({ RspCode: kq.rspCode, Message: kq.message })
  } catch (error) {
    console.error('VNPay callback error:', error)
    return res.status(200).json({ RspCode: '99', Message: 'Unknown error' })
  }
}

/**
 * Xác nhận thanh toán từ RETURN URL (trình duyệt khách gửi lên).
 *
 * Trang /booking/payment-success nhận được nguyên bộ tham số vnp_* do VNPay
 * nối vào URL, và gửi lên đây. Bảo mật ngang IPN vì cùng kiểm tra
 * vnp_SecureHash — không có HashSecret thì không ký giả được.
 *
 * Không thay thế IPN (khách có thể đóng trình duyệt trước khi quay về), mà là
 * lớp thứ hai để không phụ thuộc hoàn toàn vào đường hầm.
 */
const vnpayReturnConfirm = async (req, res) => {
  try {
    const vnpParams = req.body && Object.keys(req.body).length ? req.body : req.query
    if (!vnpParams || !vnpParams.vnp_SecureHash) {
      return res.status(400).json({ error: 'Thiếu tham số VNPay' })
    }

    const kq = await xuLyKetQuaVNPay(vnpParams, 'Return URL')

    // Chữ ký sai là dấu hiệu giả mạo -> 400. Các trường hợp còn lại đều là
    // kết quả nghiệp vụ hợp lệ, trả 200 kèm mô tả để giao diện tự hiển thị.
    if (kq.rspCode === '97') return res.status(400).json({ error: 'Chữ ký không hợp lệ' })

    return res.json({
      rspCode: kq.rspCode,
      message: kq.message,
      ticketId: kq.ticketId ?? null,
      daThanhToan: kq.thanhCong === true || kq.daXuLyTruocDo === true,
    })
  } catch (error) {
    console.error('VNPay return confirm error:', error)
    return res.status(500).json({ error: 'Không xác nhận được thanh toán' })
  }
}

/**
 * MoMo callback handler (IPN)
 */
const momoCallback = async (req, res) => {
  try {
    const callbackData = req.body

    console.log('MoMo callback received:', callbackData)

    // Get payment settings
    const settings = await Payment.getGatewaySettings('momo')
    if (!settings) {
      return res.status(500).json({ message: 'Payment gateway not configured' })
    }

    // Verify signature
    const isValid = Payment.verifyMoMoCallback(callbackData, settings)
    
    if (!isValid) {
      console.error('MoMo signature verification failed')
      return res.status(400).json({ message: 'Invalid signature' })
    }

    const orderId = callbackData.orderId
    const resultCode = callbackData.resultCode
    const transactionId = callbackData.transId
    const amount = callbackData.amount

    // Get transaction from DB
    const transaction = await Payment.getTransactionByOrderId(orderId)
    if (!transaction) {
      console.error('Transaction not found:', orderId)
      return res.status(404).json({ message: 'Transaction not found' })
    }

    // IDEMPOTENT: MoMo có thể gửi lại IPN nhiều lần cho CÙNG 1 giao dịch —
    // nếu xử lý lại từ đầu, markTicketPaidAndNotify sẽ gửi email xác nhận
    // trùng lặp và bắn lại socket 'seats-purchased' nhiều lần cho 1 đơn hàng.
    if (transaction.status === 'success' || transaction.status === 'completed' || transaction.status === 'failed') {
      console.log(`ℹ️ MoMo callback lặp lại cho giao dịch ${orderId} (đã xử lý trước đó, bỏ qua)`)
      return res.status(200).json({ message: 'OK' })
    }

    // Update transaction based on result code
    const success = resultCode === 0
    const status = success ? 'success' : 'failed'

    await Payment.updateTransaction(transaction.id, {
      status,
      gateway_transaction_id: transactionId,
      callback_data: callbackData,
      error_message: success ? null : callbackData.message,
      completed_at: new Date()
    })

    if (success) {
      // Mark ticket paid + send email + clear cache + emit socket (shared helper)
      await markTicketPaidAndNotify(transaction.ticket_id)
      console.log(`✅ MoMo payment successful for ticket ${transaction.ticket_id}`)
    } else {
      console.log(`❌ MoMo payment failed for ticket ${transaction.ticket_id}: ${callbackData.message}`)
    }

    // Return success to MoMo
    res.status(200).json({ message: 'OK' })

  } catch (error) {
    console.error('MoMo callback error:', error)
    res.status(500).json({ message: 'Internal server error' })
  }
}

/**
 * Check payment status (for frontend to poll)
 */
const checkPaymentStatus = async (req, res) => {
  try {
    const { ticket_id } = req.params
    const user_id = req.user.id

    const ticket = await Ticket.findById(ticket_id)
    
    if (!ticket) {
      return res.status(404).json({ error: 'Không tìm thấy vé' })
    }

    if (ticket.user_id !== user_id) {
      return res.status(403).json({ error: 'Không có quyền truy cập' })
    }

    // Get latest transaction
    const transactions = await Payment.getTransactionsByTicketId(ticket_id)
    const latestTransaction = transactions[0]

    res.json({
      ticket_id,
      payment_status: ticket.payment_status,
      booking_status: ticket.booking_status,
      paid_at: ticket.paid_at,
      transaction: latestTransaction ? {
        status: latestTransaction.status,
        payment_method: latestTransaction.payment_method,
        amount: latestTransaction.amount,
        gateway_transaction_id: latestTransaction.gateway_transaction_id,
        completed_at: latestTransaction.completed_at
      } : null
    })

  } catch (error) {
    console.error('Check payment status error:', error)
    res.status(500).json({ error: 'Không thể kiểm tra trạng thái thanh toán' })
  }
}

/**
 * Get payment history for a user
 */
const getPaymentHistory = async (req, res) => {
  try {
    const user_id = req.user.id

    const transactions = await Payment.getPaymentHistoryByUser(user_id)

    res.json({ transactions })

  } catch (error) {
    console.error('Get payment history error:', error)
    res.status(500).json({ error: 'Không thể lấy lịch sử thanh toán' })
  }
}

module.exports = {
  createPayment,
  vnpayCallback,
  vnpayReturnConfirm,
  momoCallback,
  checkPaymentStatus,
  getPaymentHistory,
  markTicketPaidAndNotify,
}
