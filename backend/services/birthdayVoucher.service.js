/**
 * Chương trình ưu đãi sinh nhật — kết hợp TỰ ĐỘNG (job chạy mỗi ngày, xem
 * app.js) và THỦ CÔNG (admin có thể chạy tay/gửi lại cho 1 khách qua
 * routes/admin.js, dùng cho hỗ trợ khách hàng khi job tự động lỡ bỏ sót ai đó).
 *
 * Vé ưu đãi dùng CHUNG 1 mã (bảng vouchers, is_birthday_voucher=1) cho mọi
 * khách — không tạo mã riêng cho từng người — nên nội dung thông báo/email
 * luôn đọc TRỰC TIẾP từ DB (không hardcode % giảm/hạn dùng) để không bao giờ
 * lệch với những gì admin đang cấu hình thật ở trang /admin/vouchers.
 */
const { pool } = require("../config/database")
const Notification = require("../models/Notification")
const emailService = require("./emailService")

async function getActiveBirthdayVoucher() {
  const [rows] = await pool.query(
    "SELECT * FROM vouchers WHERE is_birthday_voucher = 1 AND is_active = 1 ORDER BY created_at DESC LIMIT 1",
  )
  return rows[0] || null
}

function formatDiscountText(voucher) {
  const base = voucher.discount_type === "percent"
    ? `Giảm ${Number(voucher.discount_value)}%`
    : `Giảm ${Number(voucher.discount_value).toLocaleString("vi-VN")}đ`
  const cap = voucher.max_discount_amount != null
    ? ` (tối đa ${Number(voucher.max_discount_amount).toLocaleString("vi-VN")}đ)`
    : ""
  return base + cap
}

/**
 * Gửi thông báo trong app + email chúc mừng sinh nhật kèm đầy đủ thông tin ưu
 * đãi cho 1 user cụ thể — dùng chung cho cả job tự động lẫn admin gửi tay.
 * @returns {Promise<{ ok: boolean, reason?: string, voucherCode?: string }>}
 */
async function greetUser(user) {
  const voucher = await getActiveBirthdayVoucher()
  if (!voucher) return { ok: false, reason: "NO_ACTIVE_VOUCHER" }

  const discountText = formatDiscountText(voucher)
  const validUntilText = new Date(voucher.valid_until).toLocaleDateString("vi-VN")

  await Notification.create({
    userId: user.id,
    type: "birthday_greeting",
    title: "🎂 Chúc mừng sinh nhật!",
    message: `Bạn được tặng mã ${voucher.code} — ${discountText}. Áp dụng khi đặt vé đến hết ${validUntilText}.`,
    data: {
      voucherCode: voucher.code,
      discountText,
      description: voucher.description,
      validUntil: voucher.valid_until,
    },
  })

  if (user.email) {
    emailService
      .sendBirthdayEmail(user.email, {
        username: user.full_name || user.username || "bạn",
        voucherCode: voucher.code,
        discountText,
        description: voucher.description,
        validUntilText,
      })
      .catch((e) => console.error("⚠️ Gửi email chúc mừng sinh nhật lỗi:", e.message))
  }

  return { ok: true, voucherCode: voucher.code }
}

/**
 * Chạy mỗi ngày: tìm user có sinh nhật HÔM NAY (trùng tháng + ngày, không
 * quan tâm năm sinh) và CHƯA được chúc mừng trong ~1 năm gần đây, rồi gửi.
 * Idempotent — chạy nhiều lần trong cùng 1 ngày (server restart, admin bấm
 * "chạy ngay") không gửi trùng nhờ kiểm tra Notification.existsForUser.
 */
async function runBirthdayGreetings() {
  const [users] = await pool.query(
    `SELECT id, username, full_name, email, date_of_birth FROM users
     WHERE date_of_birth IS NOT NULL
       AND MONTH(date_of_birth) = MONTH(CURDATE())
       AND DAY(date_of_birth) = DAY(CURDATE())`,
  )

  let sent = 0
  const skipped = []
  for (const user of users) {
    const alreadyGreeted = await Notification.existsForUser(user.id, "birthday_greeting", { withinDays: 365 })
    if (alreadyGreeted) continue
    const result = await greetUser(user)
    if (result.ok) sent++
    else skipped.push({ userId: user.id, reason: result.reason })
  }
  return { checked: users.length, sent, skipped }
}

/**
 * Chạy định kỳ: nhắc CÁC USER CHƯA KHAI NGÀY SINH cập nhật hồ sơ — chỉ gửi 1
 * LẦN DUY NHẤT cho mỗi user (không lặp lại mỗi ngày gây phiền), tới khi họ tự
 * cập nhật date_of_birth (lúc đó điều kiện WHERE không còn khớp nữa).
 */
async function runDobReminders() {
  const [users] = await pool.query(
    `SELECT u.id FROM users u
     WHERE u.date_of_birth IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM notifications n WHERE n.user_id = u.id AND n.type = 'dob_reminder'
       )`,
  )

  for (const user of users) {
    await Notification.create({
      userId: user.id,
      type: "dob_reminder",
      title: "🎂 Cập nhật ngày sinh của bạn",
      message: "Bạn chưa khai ngày sinh trong hồ sơ — cập nhật ngay để nhận ưu đãi giảm giá riêng vào đúng tháng sinh nhật của bạn!",
    })
  }
  return { reminded: users.length }
}

module.exports = {
  getActiveBirthdayVoucher,
  formatDiscountText,
  greetUser,
  runBirthdayGreetings,
  runDobReminders,
}
