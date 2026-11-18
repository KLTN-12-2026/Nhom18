/**
 * Cấu hình chatbot mà ADMIN đổi được ngay trên dashboard — không phải sửa
 * backend/.env rồi khởi động lại server (không làm được lúc đang demo):
 *   - mode        : 'gemini' (ưu tiên AI, lỗi thì tự rơi về luật cứng)
 *                   'rules'  (CHỈ dùng luật cứng — admin chủ động chọn)
 *   - geminiApiKey: khoá admin dán vào khi khoá cũ hết hạn mức; null = dùng .env
 *   - dailyLimit  : số câu hỏi AI/ngày của gói đang dùng, để tính "còn lại"
 *
 * Lưu chung dòng id = 1 của system_settings (xem migration 34). Tự thêm cột nếu
 * thiếu — cùng tinh thần "tự tạo bảng" của systemSettings.service, để chạy được
 * trên máy chưa chạy migration.
 */

const { pool } = require("../config/database")
const { getSystemSettings } = require("./systemSettings.service")

const CACHE_TTL_MS = 15 * 1000
// 2 nguồn trả lời cho khung chat của khách:
//   gemini — Google Gemini (gói miễn phí, 20 lượt/ngày/model)
//   rules  — luật cứng, không gọi AI, không giới hạn
const MODES = ["gemini", "rules"]
const DEFAULT_DAILY_LIMIT = 20

// Hạn mức gói miễn phí tính theo TỪNG MODEL (20 lượt/ngày/model), nên đổi model
// là có ngay hạn mức mới — cách nhanh nhất khi đang demo mà hết lượt.
// Danh sách lấy từ các model hỗ trợ generateContent của khoá đang dùng.

const MODELS_GOI_Y = [
  { id: "gemini-3.6-flash", label: "Gemini 3.6 Flash (mặc định, cân bằng)" },
  { id: "gemini-3.8-flash", label: "Gemini 3.8 Flash (mới nhất)" },
  { id: "gemini-3.7-flash", label: "Gemini 3.7 Flash" },
  { id: "gemini-3.5-flash", label: "Gemini 3.5 Flash" },
  { id: "gemini-3.5-flash-lite", label: "Gemini 3.5 Flash Lite (nhanh nhất)" },
  { id: "gemini-3.1-flash-lite", label: "Gemini 3.1 Flash Lite" },
  { id: "gemini-flash-latest", label: "Gemini Flash Latest (bí danh bản mới nhất)" },
  { id: "gemini-3-flash-preview", label: "Gemini 3 Flash Preview" },
  { id: "gemini-flash-lite-latest", label: "Gemini Flash Lite Latest (bí danh bản nhẹ)" },
]

let cache = { data: null, at: 0 }
let columnsEnsured = false

const COLUMNS = [
  ["chatbot_mode", "VARCHAR(10) NOT NULL DEFAULT 'gemini'"],
  ["gemini_api_key", "VARCHAR(255) NULL"],
  ["gemini_daily_limit", "SMALLINT UNSIGNED NOT NULL DEFAULT 20"],
  ["gemini_model", "VARCHAR(64) NULL"],
]

async function ensureColumns() {
  if (columnsEnsured) return
  await getSystemSettings() // đảm bảo bảng system_settings đã tồn tại
  // MySQL 8 KHÔNG có "ADD COLUMN IF NOT EXISTS" — phải tự tra information_schema.
  const [rows] = await pool.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'system_settings'`,
  )
  const have = new Set(rows.map((r) => r.COLUMN_NAME))
  for (const [name, ddl] of COLUMNS) {
    if (!have.has(name)) await pool.query(`ALTER TABLE system_settings ADD COLUMN ${name} ${ddl}`)
  }
  columnsEnsured = true
}

/**
 * Admin thường dán NGUYÊN đường link lấy khoá (vd
 * "https://generativelanguage.googleapis.com/...?key=AIza...") thay vì chỉ khoá.
 * Tự bóc phần key= ra để khỏi bắt người dùng cắt chuỗi bằng tay.
 */
function normalizeKey(raw) {
  const s = String(raw || "").trim()
  if (!s) return ""
  const m = s.match(/[?&]key=([A-Za-z0-9_-]+)/)
  return m ? m[1] : s
}

/**
 * Admin dán được NHIỀU khoá (mỗi dòng một khoá, hoặc ngăn bằng dấu phẩy).
 * Mỗi khoá thuộc một dự án Google khác nhau = một hạn mức hoàn toàn mới, nên
 * nhiều khoá là cách trực tiếp nhất để hỏi liên tục lâu hơn.
 */
function normalizeKeys(raw) {
  return String(raw || "")
    .split(/[\s,;]+/)
    .map((k) => normalizeKey(k))
    .filter(Boolean)
    .filter((k, i, arr) => arr.indexOf(k) === i)
}

/** Nhãn ngắn để phân biệt khoá trong bảng đếm mà không lộ khoá. */
function idKhoa(key) {
  return String(key || "").slice(-6)
}

/** Che khoá trước khi trả ra giao diện — KHÔNG bao giờ gửi khoá đầy đủ ra ngoài. */
function maskKey(key) {
  if (!key) return null
  return key.length <= 10 ? "••••••" : `${key.slice(0, 6)}••••${key.slice(-4)}`
}

async function getChatbotConfig({ fresh = false } = {}) {
  if (!fresh && cache.data && Date.now() - cache.at < CACHE_TTL_MS) return cache.data
  await ensureColumns()
  const [[row]] = await pool.query(
    "SELECT chatbot_mode, gemini_api_key, gemini_daily_limit, gemini_model FROM system_settings WHERE id = 1",
  )
  const data = {
    mode: MODES.includes(row?.chatbot_mode) ? row.chatbot_mode : "gemini",
    // Khoá đầu tiên giữ tên cũ cho các chỗ đang dùng; danh sách đầy đủ ở geminiApiKeys.
    geminiApiKey: normalizeKeys(row?.gemini_api_key)[0] || null,
    geminiApiKeys: normalizeKeys(row?.gemini_api_key),
    dailyLimit: Number(row?.gemini_daily_limit) || DEFAULT_DAILY_LIMIT,
    model: String(row?.gemini_model || "").trim() || null,
  }
  cache = { data, at: Date.now() }
  return data
}

/** @param {{mode?: string, apiKey?: string, dailyLimit?: number}} patch */
async function updateChatbotConfig(patch) {
  await ensureColumns()
  const fields = []
  const params = []

  if (patch.mode !== undefined) {
    if (!MODES.includes(patch.mode)) throw new Error("Chế độ chatbot không hợp lệ (chỉ 'gemini' hoặc 'rules')")
    fields.push("chatbot_mode = ?")
    params.push(patch.mode)
  }

  if (patch.apiKey !== undefined) {
    const keys = normalizeKeys(patch.apiKey)
    // Chuỗi rỗng = xoá hết khoá trong DB, quay lại dùng khoá trong .env.
    const hong = keys.find((k) => !/^[A-Za-z0-9_.-]{20,250}$/.test(k))
    if (hong) {
      throw new Error(`Khoá không hợp lệ: "${hong.slice(0, 12)}..." — dán khoá (hoặc link chứa ?key=...) lấy từ aistudio.google.com/apikey`)
    }
    fields.push("gemini_api_key = ?")
    params.push(keys.length ? keys.join("\n") : null)
  }
  if (patch.model !== undefined) {
    const model = String(patch.model || "").trim()
    // Chuỗi rỗng = quay lại dùng GEMINI_MODEL trong .env
    if (model && !/^[a-zA-Z0-9.-]{3,64}$/.test(model)) throw new Error("Tên model không hợp lệ")
    fields.push("gemini_model = ?")
    params.push(model || null)
  }
  if (patch.dailyLimit !== undefined) {
    const n = Number(patch.dailyLimit)
    if (!Number.isFinite(n) || n < 1 || n > 10000) throw new Error("Giới hạn câu hỏi/ngày phải từ 1 đến 10000")
    fields.push("gemini_daily_limit = ?")
    params.push(Math.round(n))
  }

  if (fields.length) {
    await pool.query(`UPDATE system_settings SET ${fields.join(", ")} WHERE id = 1`, params)
    cache = { data: null, at: 0 }
  }
  return getChatbotConfig({ fresh: true })
}

// ─── Đếm lượt gọi Gemini theo ngày (xem migration 35) ───────────────────────
//
// Hạn mức của Google tính theo SỐ LƯỢT GỌI API, không phải số câu hỏi:
//   quotaId GenerateRequestsPerDayPerProjectPerModel-FreeTier, limit 20
// Một câu hỏi phức tạp tốn 6+ lượt (mỗi lần AI tra cứu dữ liệu là 1 lượt, cộng
// lượt viết câu trả lời cuối). Đếm đúng lượt gọi thì con số trên dashboard mới
// khớp với thời điểm Google thật sự chặn.
let usageTableEnsured = false

async function ensureUsageTable() {
  if (usageTableEnsured) return
  await pool.query(
    "CREATE TABLE IF NOT EXISTS gemini_usage (" +
      "usage_date DATE NOT NULL," +
      "model VARCHAR(64) NOT NULL," +
      "key_id VARCHAR(12) NOT NULL DEFAULT ''," +
      "requests INT UNSIGNED NOT NULL DEFAULT 0," +
      "quota_errors INT UNSIGNED NOT NULL DEFAULT 0," +
      "updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP," +
      "PRIMARY KEY (usage_date, model, key_id)" +
    ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
  )
  usageTableEnsured = true
}

/** Ghi nhận 1 lượt gọi API — gọi SAU MỖI request tới Gemini, kể cả lượt bị lỗi. */
async function ghiNhanLuotGoi(model, { quotaError = false, key = "" } = {}) {
  try {
    await ensureUsageTable()
    await pool.query(
      "INSERT INTO gemini_usage (usage_date, model, key_id, requests, quota_errors) VALUES (CURDATE(), ?, ?, 1, ?) " +
      "ON DUPLICATE KEY UPDATE requests = requests + 1, quota_errors = quota_errors + VALUES(quota_errors)",
      [model, idKhoa(key), quotaError ? 1 : 0],
    )
  } catch (e) {
    // Đếm lượt chỉ để hiển thị — hỏng thì bỏ qua, không được làm chết lượt chat.
    console.error("Ghi nhận lượt gọi Gemini thất bại:", e.message)
  }
}

/** @returns {Promise<{requests:number, quotaErrors:number}>} số lượt gọi model này hôm nay */
async function demLuotGoiHomNay(model) {
  await ensureUsageTable()
  const [[row]] = await pool.query(
    "SELECT COALESCE(SUM(requests),0) requests, COALESCE(SUM(quota_errors),0) quota_errors FROM gemini_usage WHERE usage_date = CURDATE() AND model = ?",
    [model],
  )
  return { requests: Number(row?.requests) || 0, quotaErrors: Number(row?.quota_errors) || 0 }
}

/** Số lượt theo TỪNG CẶP model+khoá — dùng để chọn cặp còn hạn mức. */
async function demLuotGoiTheoCap() {
  await ensureUsageTable()
  const [rows] = await pool.query("SELECT model, key_id, requests FROM gemini_usage WHERE usage_date = CURDATE()")
  return Object.fromEntries(rows.map((r) => [`${r.model}|${r.key_id}`, Number(r.requests) || 0]))
}

/** @returns {Promise<Record<string, number>>} model -> số lượt gọi hôm nay */
async function demLuotGoiTheoModel() {
  await ensureUsageTable()
  const [rows] = await pool.query("SELECT model, SUM(requests) requests FROM gemini_usage WHERE usage_date = CURDATE() GROUP BY model")
  return Object.fromEntries(rows.map((r) => [r.model, Number(r.requests) || 0]))
}

module.exports = { getChatbotConfig, updateChatbotConfig, maskKey, normalizeKey, normalizeKeys, idKhoa, demLuotGoiTheoCap, MODES, MODELS_GOI_Y, DEFAULT_DAILY_LIMIT, ghiNhanLuotGoi, demLuotGoiHomNay, demLuotGoiTheoModel }
