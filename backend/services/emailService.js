const nodemailer = require('nodemailer')

// ── Tạo transporter Gmail ────────────────────────────────────────────
function createTransporter() {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,   // App Password (16 ký tự) — không phải mật khẩu Gmail thường
    },
  })
}

// ── Kiểm tra cấu hình email ─────────────────────────────────────────
function isEmailConfigured() {
  return !!(process.env.EMAIL_USER && process.env.EMAIL_PASS)
}

// ── Gửi email hoặc log ra console nếu chưa cấu hình ────────────────
async function sendEmail(mailOptions) {
  if (!isEmailConfigured()) {
    console.log('📧 [EMAIL LOG - chưa cấu hình SMTP]')
    console.log('   To:', mailOptions.to)
    console.log('   Subject:', mailOptions.subject)
    return true
  }
  try {
    const transporter = createTransporter()
    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM || `"CinemaGold 🎬" <${process.env.EMAIL_USER}>`,
      ...mailOptions,
    })
    console.log(`📧 Email sent → ${mailOptions.to} | msgId: ${info.messageId}`)
    return true
  } catch (err) {
    console.error('❌ Email send failed:', err.message)
    return false
  }
}

// ── Styles dùng chung ────────────────────────────────────────────────
const BASE_STYLE = `
  <style>
    body { margin:0; font-family: 'Segoe UI', Arial, sans-serif; background:#0f0f0f; }
    .wrap { max-width:600px; margin:0 auto; background:#1a1a1a; border-radius:12px; overflow:hidden; }
    .header { background: linear-gradient(135deg,#f59e0b,#d97706); padding:32px 24px; text-align:center; }
    .header h1 { margin:0; color:#fff; font-size:24px; letter-spacing:1px; }
    .header p  { margin:6px 0 0; color:rgba(255,255,255,.8); font-size:14px; }
    .body      { padding:28px 24px; color:#e5e5e5; }
    .card      { background:#262626; border:1px solid #333; border-radius:10px; padding:20px; margin:20px 0; }
    .card h3   { margin:0 0 14px; color:#f59e0b; font-size:15px; text-transform:uppercase; letter-spacing:.5px; }
    /* Dòng thông tin dựng bằng BẢNG, không dùng flexbox: Gmail và Outlook bỏ
       qua display:flex nên nhãn và giá trị bị rơi xuống 2 dòng, lệch hẳn nhau. */
    .rows      { width:100%; border-collapse:collapse; }
    .rows td   { padding:8px 0; border-bottom:1px solid #333; font-size:14px; vertical-align:top; }
    .rows tr:last-child td { border-bottom:none; }
    .label     { color:#9ca3af; white-space:nowrap; padding-right:12px; }
    .value     { color:#f3f4f6; font-weight:600; text-align:right; }
    .qrbox     { background:#fff; border-radius:10px; padding:14px; display:inline-block; }
    .total     { background:#f59e0b; color:#000; border-radius:8px; padding:14px 20px; text-align:center;
                 font-size:18px; font-weight:bold; margin:20px 0; }
    .btn       { display:inline-block; background:#f59e0b; color:#000; text-decoration:none;
                 padding:12px 28px; border-radius:8px; font-weight:bold; margin:16px 0; }
    .footer    { background:#111; padding:16px 24px; text-align:center; color:#6b7280; font-size:12px; }
    .badge     { display:inline-block; background:#f59e0b22; color:#f59e0b; border:1px solid #f59e0b44;
                 border-radius:6px; padding:3px 10px; font-size:13px; font-weight:600; letter-spacing:1px; }
  </style>
`

const FOOTER_YEAR = new Date().getFullYear()

/** Một dòng "nhãn — giá trị" trong thẻ thông tin (dùng bảng, xem BASE_STYLE). */
const dong = (nhan, giaTri) =>
  `<tr><td class="label">${nhan}</td><td class="value">${giaTri}</td></tr>`

/**
 * Mã QR của vé: nhân viên soát vé quét thẳng tại cửa rạp thay vì gõ tay mã đặt
 * vé. Nội dung mã chính là booking_reference — đúng thứ tra cứu được trong hệ
 * thống. Ảnh sinh từ dịch vụ QR công khai nên email không cần đính kèm tệp.
 */
const anhQR = (noiDung, kichThuoc = 220) =>
  `https://api.qrserver.com/v1/create-qr-code/?size=${kichThuoc}x${kichThuoc}&margin=8&data=${encodeURIComponent(noiDung)}`

// ── 1. Email xác nhận đặt vé ─────────────────────────────────────────
const sendTicketConfirmationEmail = async (email, data) => {
  const {
    bookingReference, movieTitle, cinemaName,
    showDate, showTime, seats, totalAmount, username,
  } = data

  const formattedAmount = Number(totalAmount).toLocaleString('vi-VN') + ' ₫'
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000'

  return sendEmail({
    to: email,
    subject: `🎬 Đặt vé thành công: ${movieTitle}`,
    html: `<!DOCTYPE html><html><head><meta charset="utf-8">${BASE_STYLE}</head><body>
      <div class="wrap">
        <div class="header">
          <h1>🎬 CinemaGold</h1>
          <p>Đặt vé thành công!</p>
        </div>
        <div class="body">
          <p>Xin chào <strong>${username}</strong>,</p>
          <p>Vé của bạn đã được xác nhận. Vui lòng đến rạp trước <strong>15 phút</strong> để làm thủ tục.</p>

          <div class="card">
            <h3>🎫 Thông tin vé</h3>
            <table class="rows" role="presentation">
              <tr><td class="label">Mã đặt vé</td><td class="value"><span class="badge">${bookingReference}</span></td></tr>
              ${dong('Phim', movieTitle)}
              ${dong('Rạp chiếu', cinemaName)}
              ${dong('Ngày chiếu', showDate)}
              ${dong('Giờ chiếu', showTime)}
              ${dong('Ghế', seats)}
            </table>
          </div>

          <div class="card" style="text-align:center">
            <h3>📱 Mã QR vào cửa</h3>
            <div class="qrbox">
              <img src="${anhQR(bookingReference)}" width="200" height="200" alt="Mã QR vé ${bookingReference}" style="display:block" />
            </div>
            <p style="margin:12px 0 0;color:#9ca3af;font-size:13px">
              Đưa mã này cho nhân viên soát vé quét tại cửa rạp.<br />
              Không quét được thì đọc mã <strong style="color:#f59e0b">${bookingReference}</strong>.
            </p>
          </div>

          <div class="total">Tổng thanh toán: ${formattedAmount}</div>

          <div style="text-align:center">
            <a href="${frontendUrl}/bookings" class="btn">Xem vé của tôi</a>
          </div>

          <p style="color:#9ca3af;font-size:13px;margin-top:20px">
            💡 Mẹo: Bạn có thể check-in bằng mã đặt vé <strong>${bookingReference}</strong> tại quầy vé hoặc máy tự phục vụ.
          </p>
        </div>
        <div class="footer">© ${FOOTER_YEAR} CinemaGold · Email này được gửi tự động, vui lòng không trả lời.</div>
      </div>
    </body></html>`,
  })
}

// ── 2. Email chào mừng khi đăng ký ───────────────────────────────────
const sendWelcomeEmail = async (email, username) => {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000'

  return sendEmail({
    to: email,
    subject: '🎉 Chào mừng đến với CinemaGold!',
    html: `<!DOCTYPE html><html><head><meta charset="utf-8">${BASE_STYLE}</head><body>
      <div class="wrap">
        <div class="header">
          <h1>🎬 CinemaGold</h1>
          <p>Chào mừng thành viên mới!</p>
        </div>
        <div class="body">
          <p>Xin chào <strong>${username}</strong> 👋</p>
          <p>Cảm ơn bạn đã tạo tài khoản tại <strong>CinemaGold</strong> — rạp phim trực tuyến hàng đầu!</p>

          <div class="card">
            <h3>🌟 Bạn có thể làm gì?</h3>
            <p style="margin:6px 0;font-size:14px">🎬 Xem danh sách phim đang chiếu & sắp chiếu</p>
            <p style="margin:6px 0;font-size:14px">💺 Chọn ghế và đặt vé trực tuyến</p>
            <p style="margin:6px 0;font-size:14px">🍿 Thêm combo bắp rang & nước uống</p>
            <p style="margin:6px 0;font-size:14px">📱 Nhận vé điện tử ngay sau khi thanh toán</p>
          </div>

          <div style="text-align:center;margin:24px 0">
            <a href="${frontendUrl}/movies" class="btn">🎬 Xem phim ngay</a>
          </div>
        </div>
        <div class="footer">© ${FOOTER_YEAR} CinemaGold · Email này được gửi tự động, vui lòng không trả lời.</div>
      </div>
    </body></html>`,
  })
}

// ── 3. Email reset password ───────────────────────────────────────────
const sendResetPasswordEmail = async (email, resetCode) => {
  return sendEmail({
    to: email,
    subject: '🔐 Đặt lại mật khẩu - CinemaGold',
    html: `<!DOCTYPE html><html><head><meta charset="utf-8">${BASE_STYLE}</head><body>
      <div class="wrap">
        <div class="header">
          <h1>🎬 CinemaGold</h1>
          <p>Yêu cầu đặt lại mật khẩu</p>
        </div>
        <div class="body">
          <p>Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản của bạn.</p>
          <p>Mã xác thực của bạn:</p>

          <div style="text-align:center;margin:24px 0">
            <div style="display:inline-block;background:#f59e0b;color:#000;font-size:36px;
                        font-weight:bold;letter-spacing:8px;padding:16px 32px;border-radius:10px">
              ${resetCode}
            </div>
          </div>

          <div class="card" style="border-color:#f59e0b44">
            <p style="margin:0;font-size:13px;color:#9ca3af">
              ⏰ Mã hết hạn sau <strong style="color:#f59e0b">15 phút</strong><br>
              🔒 Không chia sẻ mã này với bất kỳ ai<br>
              ❌ Nếu bạn không yêu cầu, hãy bỏ qua email này
            </p>
          </div>
        </div>
        <div class="footer">© ${FOOTER_YEAR} CinemaGold · Email này được gửi tự động, vui lòng không trả lời.</div>
      </div>
    </body></html>`,
  })
}

// ── 4. Email mã xác thực đăng ký tài khoản ───────────────────────────
const sendRegistrationCodeEmail = async (email, code) => {
  return sendEmail({
    to: email,
    subject: '✅ Mã xác thực đăng ký - CinemaGold',
    html: `<!DOCTYPE html><html><head><meta charset="utf-8">${BASE_STYLE}</head><body>
      <div class="wrap">
        <div class="header">
          <h1>🎬 CinemaGold</h1>
          <p>Xác thực email để hoàn tất đăng ký</p>
        </div>
        <div class="body">
          <p>Chào bạn, vui lòng dùng mã sau để hoàn tất tạo tài khoản CinemaGold:</p>

          <div style="text-align:center;margin:24px 0">
            <div style="display:inline-block;background:#f59e0b;color:#000;font-size:36px;
                        font-weight:bold;letter-spacing:8px;padding:16px 32px;border-radius:10px">
              ${code}
            </div>
          </div>

          <div class="card" style="border-color:#f59e0b44">
            <p style="margin:0;font-size:13px;color:#9ca3af">
              ⏰ Mã hết hạn sau <strong style="color:#f59e0b">10 phút</strong><br>
              🔒 Không chia sẻ mã này với bất kỳ ai<br>
              ❌ Nếu bạn không yêu cầu đăng ký, hãy bỏ qua email này
            </p>
          </div>
        </div>
        <div class="footer">© ${FOOTER_YEAR} CinemaGold · Email này được gửi tự động, vui lòng không trả lời.</div>
      </div>
    </body></html>`,
  })
}

// ── 5. Email mã xác thực đổi mật khẩu ────────────────────────────────
const sendChangePasswordCodeEmail = async (email, code) => {
  return sendEmail({
    to: email,
    subject: '🔐 Mã xác thực đổi mật khẩu - CinemaGold',
    html: `<!DOCTYPE html><html><head><meta charset="utf-8">${BASE_STYLE}</head><body>
      <div class="wrap">
        <div class="header">
          <h1>🎬 CinemaGold</h1>
          <p>Xác thực đổi mật khẩu</p>
        </div>
        <div class="body">
          <p>Bạn vừa yêu cầu đổi mật khẩu cho tài khoản của mình. Dùng mã sau để xác nhận:</p>

          <div style="text-align:center;margin:24px 0">
            <div style="display:inline-block;background:#f59e0b;color:#000;font-size:36px;
                        font-weight:bold;letter-spacing:8px;padding:16px 32px;border-radius:10px">
              ${code}
            </div>
          </div>

          <div class="card" style="border-color:#f59e0b44">
            <p style="margin:0;font-size:13px;color:#9ca3af">
              ⏰ Mã hết hạn sau <strong style="color:#f59e0b">10 phút</strong><br>
              🔒 Không chia sẻ mã này với bất kỳ ai<br>
              ❌ Nếu bạn không yêu cầu đổi mật khẩu, hãy bỏ qua email này và kiểm tra lại tài khoản
            </p>
          </div>
        </div>
        <div class="footer">© ${FOOTER_YEAR} CinemaGold · Email này được gửi tự động, vui lòng không trả lời.</div>
      </div>
    </body></html>`,
  })
}

// ── 6. Email chúc mừng sinh nhật kèm ưu đãi ──────────────────────────
// Ghi đầy đủ thông tin ưu đãi NGAY TRONG email (mã, % giảm, giảm tối đa, hạn
// dùng) — người dùng thường không mở web ngay lúc nhận mail, nên email phải
// tự đủ thông tin để dùng sau, không chỉ có link chung chung.
const sendBirthdayEmail = async (email, data) => {
  const { username, voucherCode, discountText, description, validUntilText } = data
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000'

  return sendEmail({
    to: email,
    subject: '🎂 Chúc mừng sinh nhật! Quà tặng từ CinemaGold bên trong',
    html: `<!DOCTYPE html><html><head><meta charset="utf-8">${BASE_STYLE}</head><body>
      <div class="wrap">
        <div class="header" style="background: linear-gradient(135deg,#ec4899,#f59e0b)">
          <h1>🎂 CinemaGold</h1>
          <p>Chúc mừng sinh nhật bạn!</p>
        </div>
        <div class="body">
          <p>Xin chào <strong>${username}</strong> 🎉,</p>
          <p>Nhân dịp sinh nhật, CinemaGold xin gửi tặng bạn một ưu đãi đặc biệt — cảm ơn bạn đã đồng hành cùng chúng tôi!</p>

          <div class="card" style="border-color:#ec489944">
            <h3 style="color:#ec4899">🎁 Ưu đãi sinh nhật của bạn</h3>
            <table class="rows" role="presentation">
              <tr><td class="label">Mã ưu đãi</td><td class="value"><span class="badge" style="background:#ec489922;color:#ec4899;border-color:#ec489944">${voucherCode}</span></td></tr>
              ${dong('Ưu đãi', discountText)}
              ${dong('Mô tả', description)}
              ${dong('Có hiệu lực đến', validUntilText)}
            </table>
          </div>

          <div style="text-align:center;margin:24px 0">
            <a href="${frontendUrl}/movies" class="btn" style="background:#ec4899;color:#fff">🎬 Đặt vé ngay để dùng ưu đãi</a>
          </div>

          <p style="color:#9ca3af;font-size:13px;margin-top:20px">
            💡 Nhập mã <strong style="color:#ec4899">${voucherCode}</strong> ở bước thanh toán để áp dụng ưu đãi.
          </p>
        </div>
        <div class="footer">© ${FOOTER_YEAR} CinemaGold · Chúc bạn một ngày sinh nhật thật vui vẻ!</div>
      </div>
    </body></html>`,
  })
}

// Nội dung do quản lý tự gõ (lời nhắn) đưa thẳng vào HTML email — phải
// thoát ký tự đặc biệt, nếu không ai đó gõ "<a href=...>" là chèn được link lạ
// vào email gửi hàng loạt dưới danh nghĩa rạp.
const escapeHtml = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;')

// ── 7. Email thông báo sự cố suất chiếu ──────────────────────────────
// Gửi cho MỌI khách có vé của suất gặp sự cố (mất điện, hỏng máy chiếu...).
// Hai loại: 'cancelled' — suất bị huỷ, vé đã được hoàn tiền tự động;
// 'notice' — suất vẫn chiếu nhưng có thay đổi (trễ giờ...), khách cần biết.
// Email phải tự đủ thông tin (phim, rạp, giờ, ghế, số tiền hoàn) vì khách
// thường đọc trên điện thoại, không mở web ngay.
const sendShowtimeIncidentEmail = async (email, data) => {
  const {
    username, incidentType, reasonLabel, message, delayMinutes,
    bookingReference, movieTitle, cinemaName, roomName, showDate, showTime, seats, refundAmount,
  } = data
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000'
  const huy = incidentType === 'cancelled'
  const mau = huy ? '#ef4444' : '#f59e0b'

  const tieuDe = huy
    ? `⚠️ Suất chiếu ${movieTitle} đã bị huỷ — chúng tôi đang hoàn tiền vé của bạn`
    : `📢 Thông báo quan trọng về suất chiếu ${movieTitle} của bạn`

  // KHÔNG viết "đã hoàn tiền" ở đây. Lúc gửi email này, vé mới chỉ được huỷ và
  // lệnh hoàn vừa được ghi vào sổ — tiền chưa hề rời khỏi cổng thanh toán.
  // Khách sẽ nhận một email riêng (sendRefundEmail) khi tiền thực sự về.
  const noiDungChinh = huy
    ? `<p>Chúng tôi rất tiếc phải thông báo: do <strong>${escapeHtml(reasonLabel)}</strong>, suất chiếu dưới đây <strong>đã bị huỷ</strong>.</p>
       <p>Vé của bạn đã được huỷ và <strong>lệnh hoàn tiền đã được ghi nhận</strong> — bạn không cần làm gì thêm. Mã giảm giá (nếu có) đã được trả lại vào tài khoản. Chúng tôi sẽ gửi email xác nhận riêng ngay khi khoản tiền được hoàn xong.</p>`
    : `<p>Do <strong>${escapeHtml(reasonLabel)}</strong>, suất chiếu dưới đây có thay đổi. Vé của bạn <strong>vẫn còn hiệu lực</strong>.</p>
       ${delayMinutes ? `<p>⏰ Suất chiếu dự kiến <strong>bắt đầu trễ khoảng ${Number(delayMinutes)} phút</strong> so với giờ ghi trên vé.</p>` : ''}`

  return sendEmail({
    to: email,
    subject: tieuDe,
    html: `<!DOCTYPE html><html><head><meta charset="utf-8">${BASE_STYLE}</head><body>
      <div class="wrap">
        <div class="header" style="background: linear-gradient(135deg,${mau},#7f1d1d)">
          <h1>🎬 CinemaGold</h1>
          <p>${huy ? 'Thông báo huỷ suất chiếu' : 'Thông báo thay đổi suất chiếu'}</p>
        </div>
        <div class="body">
          <p>Xin chào <strong>${escapeHtml(username)}</strong>,</p>
          ${noiDungChinh}
          ${message ? `<div class="card" style="border-color:${mau}66"><h3 style="color:${mau}">💬 Lời nhắn từ rạp</h3><p style="margin:0;white-space:pre-line">${escapeHtml(message)}</p></div>` : ''}

          <div class="card">
            <h3>🎫 Vé bị ảnh hưởng</h3>
            <table class="rows" role="presentation">
            <tr><td class="label">Mã đặt vé</td><td class="value"><span class="badge">${escapeHtml(bookingReference)}</span></td></tr>
            ${dong('Phim', escapeHtml(movieTitle))}
            ${dong('Rạp chiếu', escapeHtml(cinemaName) + (roomName ? ' · ' + escapeHtml(roomName) : ''))}
            ${dong('Ngày chiếu', escapeHtml(showDate))}
            ${dong('Giờ chiếu', escapeHtml(showTime))}
            ${dong('Ghế', escapeHtml(seats))}
            </table>
          </div>

          ${huy && refundAmount ? `<div class="total" style="background:${mau};color:#fff">Số tiền hoàn: ${Number(refundAmount).toLocaleString('vi-VN')} ₫</div>

          <!-- KHÁCH CHỌN CÁCH NHẬN TIỀN NGAY TRONG EMAIL (migration 50).
               Lỗi là của rạp, nên đừng bắt khách tự mò vào trang hồ sơ tìm chỗ
               chọn. Hai nút dưới đây dẫn thẳng tới đúng mục đó. -->
          <div class="card" style="border-color:${mau}66">
            <h3 style="color:${mau}">Bạn muốn nhận lại số tiền này thế nào?</h3>
            <table class="rows" role="presentation" style="width:100%">
              <tr>
                <td style="padding:8px 0">
                  <strong style="color:#f5f5f5">Nhận voucher ngay</strong><br>
                  <span style="color:#9ca3af;font-size:13px">Đúng ${Number(refundAmount).toLocaleString('vi-VN')}₫, dùng được liền cho suất chiếu khác</span>
                </td>
              </tr>
              <tr>
                <td style="padding:8px 0;border-top:1px solid #2a2a2a">
                  <strong style="color:#f5f5f5">Hoàn về thẻ / ví</strong><br>
                  <span style="color:#9ca3af;font-size:13px">Về đúng nơi bạn đã thanh toán, mất 3–7 ngày làm việc</span>
                </td>
              </tr>
            </table>
            <div style="text-align:center;margin-top:14px">
              <a href="${frontendUrl}/profile?tab=refunds" class="btn" style="background:${mau};color:#fff">Chọn cách nhận tiền</a>
            </div>
          </div>
          <p style="color:#9ca3af;font-size:13px">Không chọn thì mặc định tiền được hoàn về phương thức thanh toán ban đầu. Bạn sẽ nhận email xác nhận khi hoàn tất.</p>` : ''}

          <div style="text-align:center">
            <a href="${frontendUrl}/${huy ? 'movies' : 'bookings'}" class="btn" style="background:#374151;color:#fff">${huy ? '🎬 Xem các suất chiếu khác' : 'Xem vé của tôi'}</a>
          </div>
          <p style="color:#9ca3af;font-size:13px;margin-top:20px">Thành thật xin lỗi vì sự bất tiện này. Mọi thắc mắc vui lòng liên hệ quầy vé hoặc tổng đài của rạp.</p>
        </div>
        <div class="footer">© ${FOOTER_YEAR} CinemaGold · Email này được gửi tự động, vui lòng không trả lời.</div>
      </div>
    </body></html>`,
  })
}

// ── 8. Email xác nhận ĐÃ HOÀN TIỀN ───────────────────────────────────
// Gửi khi khoản hoàn ĐÃ THỰC SỰ hoàn tất (cổng thanh toán xác nhận, voucher
// đã phát, điểm đã cộng, hoặc thu ngân đã chi tiền mặt) — KHÔNG gửi lúc mới
// huỷ vé. Đây là khác biệt cố ý: email báo huỷ suất chỉ hứa "đang xử lý hoàn
// tiền", còn email này mới là lời khẳng định tiền đã về. Hứa sai thời điểm là
// nguồn gốc của mọi khiếu nại "rạp nói hoàn rồi mà tôi chưa nhận".
const sendRefundEmail = async (email, data) => {
  const {
    username, bookingReference, movieTitle, cinemaName, showDate, showTime,
    amount, channelLabel, voucherCode, voucherExpiry,
  } = data
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000'
  const mau = '#10b981'

  return sendEmail({
    to: email,
    subject: `✅ Đã hoàn tiền vé ${bookingReference} — ${Number(amount).toLocaleString('vi-VN')}đ`,
    html: `<!DOCTYPE html><html><head><meta charset="utf-8">${BASE_STYLE}</head><body>
      <div class="wrap">
        <div class="header" style="background: linear-gradient(135deg,${mau},#065f46)">
          <h1>🎬 CinemaGold</h1>
          <p>Xác nhận hoàn tiền</p>
        </div>
        <div class="body">
          <p>Xin chào <strong>${escapeHtml(username)}</strong>,</p>
          <p>Khoản hoàn tiền cho vé của bạn <strong>đã được xử lý xong</strong> qua <strong>${escapeHtml(channelLabel)}</strong>.</p>

          <div class="card">
            <h3>🎫 Vé được hoàn</h3>
            <table class="rows" role="presentation">
            <tr><td class="label">Mã đặt vé</td><td class="value"><span class="badge">${escapeHtml(bookingReference)}</span></td></tr>
            ${movieTitle ? dong('Phim', escapeHtml(movieTitle)) : ''}
            ${cinemaName ? dong('Rạp chiếu', escapeHtml(cinemaName)) : ''}
            ${showDate ? dong('Suất chiếu', escapeHtml(showTime || '') + ' · ' + escapeHtml(showDate)) : ''}
            </table>
          </div>

          <div class="total" style="background:${mau};color:#fff">Số tiền hoàn: ${Number(amount).toLocaleString('vi-VN')} ₫</div>

          ${voucherCode ? `<div class="card" style="border-color:${mau}66">
            <h3 style="color:${mau}">🎁 Mã bồi thường của bạn</h3>
            <p style="font-size:24px;letter-spacing:3px;text-align:center;margin:12px 0"><strong>${escapeHtml(voucherCode)}</strong></p>
            <p style="margin:0;color:#9ca3af;font-size:13px">Mã chỉ dùng được bằng chính tài khoản này${voucherExpiry ? `, hạn tới <strong>${escapeHtml(voucherExpiry)}</strong>` : ''}. Nhập mã ở bước thanh toán khi đặt vé lần sau.</p>
          </div>` : `<p style="color:#9ca3af;font-size:13px">Tiền về tài khoản trong 3–7 ngày làm việc tuỳ ngân hàng. Nếu quá thời gian trên chưa nhận được, vui lòng liên hệ quầy vé kèm mã đặt vé ở trên.</p>`}

          <div style="text-align:center">
            <a href="${frontendUrl}/movies" class="btn" style="background:${mau};color:#fff">🎬 Đặt vé suất khác</a>
          </div>
        </div>
        <div class="footer">© ${FOOTER_YEAR} CinemaGold · Email này được gửi tự động, vui lòng không trả lời.</div>
      </div>
    </body></html>`,
  })
}

module.exports = {
  sendTicketConfirmationEmail,
  sendWelcomeEmail,
  sendResetPasswordEmail,
  sendRegistrationCodeEmail,
  sendChangePasswordCodeEmail,
  sendBirthdayEmail,
  sendShowtimeIncidentEmail,
  sendRefundEmail,
}
