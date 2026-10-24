/**
 * SystemSettings — cấu hình toàn hệ thống (tên site, chế độ bảo trì, cho phép
 * đặt vé, số ghế tối đa/lượt...) lưu trong 1 dòng duy nhất (id=1) của bảng
 * system_settings. Trước đây trang "Cài đặt hệ thống" của admin chỉ hiển
 * thị/echo lại object tĩnh, KHÔNG lưu DB — admin bấm "Lưu" thấy toast thành
 * công nhưng đổi trang là mất, và các công tắc maintenance_mode/booking_enabled
 * không được bất kỳ luồng đặt vé nào đọc để áp dụng thật.
 *
 * Tự tạo bảng (CREATE TABLE IF NOT EXISTS) ở lần gọi đầu tiên trong tiến trình
 * — không cần thêm bước migration thủ công riêng để tính năng này hoạt động.
 */

const { pool } = require("../config/database")

const CACHE_TTL_MS = 30 * 1000
let cache = { data: null, at: 0 }
let tableEnsured = false

async function ensureTable() {
  if (tableEnsured) return
  await pool.query(`
    CREATE TABLE IF NOT EXISTS system_settings (
      id TINYINT UNSIGNED PRIMARY KEY DEFAULT 1,
      site_name VARCHAR(255) NOT NULL DEFAULT 'CinemaGold',
      site_description VARCHAR(500) NOT NULL DEFAULT 'Hệ thống đặt vé xem phim trực tuyến',
      maintenance_mode TINYINT(1) NOT NULL DEFAULT 0,
      booking_enabled TINYINT(1) NOT NULL DEFAULT 1,
      max_seats_per_booking TINYINT UNSIGNED NOT NULL DEFAULT 10,
      contact_email VARCHAR(255) NOT NULL DEFAULT 'support@cinemagold.com',
      support_phone VARCHAR(50) NOT NULL DEFAULT '1900-0000',
      terms_conditions TEXT,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)
  await pool.query(`INSERT IGNORE INTO system_settings (id) VALUES (1)`)
  tableEnsured = true
}

function toPublicShape(row) {
  return {
    site_name: row.site_name,
    site_description: row.site_description,
    maintenance_mode: !!row.maintenance_mode,
    booking_enabled: !!row.booking_enabled,
    max_seats_per_booking: row.max_seats_per_booking,
    contact_email: row.contact_email,
    support_phone: row.support_phone,
    terms_conditions: row.terms_conditions,
  }
}

/** Đọc settings — cache 30s vì luồng đặt vé đọc maintenance_mode/booking_enabled
 * ở MỌI request tạo vé, không nên query DB mỗi lần. Dùng { fresh: true } ngay
 * sau khi update để trả lại đúng giá trị mới nhất cho admin xác nhận. */
async function getSystemSettings({ fresh = false } = {}) {
  if (!fresh && cache.data && Date.now() - cache.at < CACHE_TTL_MS) return cache.data
  await ensureTable()
  const [[row]] = await pool.query("SELECT * FROM system_settings WHERE id = 1")
  const settings = toPublicShape(row)
  cache = { data: settings, at: Date.now() }
  return settings
}

async function updateSystemSettings(patch) {
  await ensureTable()
  const current = await getSystemSettings({ fresh: true })
  const next = {
    site_name: patch.site_name ?? current.site_name,
    site_description: patch.site_description ?? current.site_description,
    maintenance_mode: patch.maintenance_mode ? 1 : 0,
    booking_enabled: patch.booking_enabled === false ? 0 : 1,
    max_seats_per_booking: Math.min(20, Math.max(1, parseInt(patch.max_seats_per_booking) || current.max_seats_per_booking)),
    contact_email: patch.contact_email ?? current.contact_email,
    support_phone: patch.support_phone ?? current.support_phone,
    terms_conditions: patch.terms_conditions ?? current.terms_conditions,
  }
  await pool.query(
    `UPDATE system_settings SET
       site_name = ?, site_description = ?, maintenance_mode = ?, booking_enabled = ?,
       max_seats_per_booking = ?, contact_email = ?, support_phone = ?, terms_conditions = ?
     WHERE id = 1`,
    [
      next.site_name, next.site_description, next.maintenance_mode, next.booking_enabled,
      next.max_seats_per_booking, next.contact_email, next.support_phone, next.terms_conditions,
    ]
  )
  return getSystemSettings({ fresh: true })
}

// Số tổng đài còn là giá trị GIỮ CHỖ (mặc định "1900-0000", hay "1900 xxxx")
// thì KHÔNG hiện cho khách — hiện số giả trên web còn tệ hơn không hiện gì.
function isPlaceholderPhone(phone) {
  const s = String(phone || "").trim()
  const digits = s.replace(/\D/g, "")
  return !digits || /x/i.test(s) || /^19000+$/.test(digits)
}

/** Thông tin liên hệ công khai (chân trang, trang Liên hệ, chatbot) — chỉ các trường không nhạy cảm. */
function toPublicContact(settings) {
  return {
    site_name: settings?.site_name || "CinemaGold",
    contact_email: settings?.contact_email || null,
    support_phone: settings && !isPlaceholderPhone(settings.support_phone) ? settings.support_phone.trim() : null,
    // Giới hạn số ghế mỗi lượt đặt — máy chủ vẫn là nơi cưỡng chế, nhưng giao
    // diện phải biết con số này để KHÔNG hứa sai. Trước đây trang chọn ghế ghi
    // cứng "tối đa 8 ghế" trong khi cài đặt của admin là 10 và máy chủ cho
    // phép đúng 10 — hai trang của cùng một website nói hai con số khác nhau.
    max_seats_per_booking: Number(settings?.max_seats_per_booking) || 10,
  }
}

/** Các dòng liên hệ cho câu trả lời soạn sẵn của chatbot. Câu trả lời được
 * dựng ĐỒNG BỘ nên đọc từ cache, đồng thời làm mới cache cho lần sau. */
function contactLinesSync() {
  getSystemSettings().catch(() => {})
  const c = toPublicContact(cache.data)
  const lines = []
  if (c.support_phone) lines.push(`- **Tổng đài**: ${c.support_phone} (8:00 - 22:00 hàng ngày)`)
  if (c.contact_email) lines.push(`- **Email**: ${c.contact_email}`)
  return lines.join("\n")
}

module.exports = { getSystemSettings, updateSystemSettings, toPublicContact, contactLinesSync }
