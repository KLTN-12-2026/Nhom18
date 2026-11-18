/**
 * Markov Chain (bậc 1) trên các "ý định" (intent) hội thoại — mô hình hoá
 * xác suất chuyển trạng thái P(ý định tiếp theo | ý định hiện tại), dùng để
 * GỢI Ý hành động tiếp theo một cách thông minh hơn (vd: người hỏi lịch
 * chiếu thường hỏi giá vé tiếp theo → chủ động gợi ý trước).
 *
 * Ma trận chuyển trạng thái = PRIOR (thiết kế dựa trên hành vi người dùng
 * điển hình, vì hệ thống chưa có log hội thoại thật để học từ đầu) + LIVE
 * COUNTS (đếm thực tế, cộng dồn vào prior theo kiểu Bayesian updating — mô
 * hình "học dần" theo thời gian).
 *
 * PERSISTENCE: liveCounts được nạp lại từ bảng chatbot_intent_transitions
 * lúc server khởi động (loadFromDB, gọi 1 lần trong app.js) và mỗi lần có
 * transition mới sẽ UPSERT ngược lại DB — "fire-and-forget" (không await
 * trên đường xử lý chat) để việc ghi DB không làm chậm phản hồi chatbot.
 * Nhờ vậy model tiếp tục học được xuyên suốt qua các lần restart, thay vì
 * mất sạch mỗi lần server khởi động lại như trước.
 */
const { pool } = require("../config/database")

const INTENTS = [
  "greeting", "mood", "schedule", "pricing", "room_pricing",
  "cinema_info", "booking", "personalized", "movie_info", "faq", "default",
]

// Ma trận tiên nghiệm: trọng số tương đối (không cần chuẩn hoá tổng = 1, sẽ
// tự chuẩn hoá lúc tính xác suất) — phản ánh hành trình hỏi điển hình của
// khách đặt vé xem phim.
const PRIOR_TRANSITIONS = {
  greeting:     { mood: 3, movie_info: 2, schedule: 1, pricing: 1 },
  mood:         { schedule: 3, pricing: 2, movie_info: 2, booking: 1 },
  schedule:     { pricing: 3, booking: 2, cinema_info: 1, room_pricing: 1 },
  pricing:      { schedule: 2, room_pricing: 2, booking: 2 },
  room_pricing: { schedule: 2, pricing: 1, booking: 1 },
  cinema_info:  { schedule: 2, pricing: 1 },
  booking:      { faq: 1, default: 1 },
  personalized: { schedule: 2, pricing: 1, movie_info: 1 },
  movie_info:   { schedule: 3, pricing: 1, personalized: 1 },
  faq:          { schedule: 1, pricing: 1, default: 1 },
  default:      { mood: 1, movie_info: 1 },
}

// Gợi ý hành động cụ thể tương ứng với mỗi intent dự đoán — dùng để hiển thị
// câu gợi ý tự nhiên cho người dùng.
const INTENT_SUGGESTIONS = {
  mood:         "gợi ý phim theo tâm trạng của bạn",
  schedule:     "tra lịch chiếu",
  pricing:      "xem giá vé",
  room_pricing: "so sánh giá các loại phòng",
  cinema_info:  "tìm rạp chiếu gần bạn",
  booking:      "tra cứu mã đặt vé",
  personalized: "gợi ý phim riêng cho bạn",
  movie_info:   "tìm hiểu thêm về 1 bộ phim",
  faq:          "hỏi về chính sách đặt vé/thanh toán",
}

// Đếm thực tế (nạp lại từ DB lúc khởi động + cộng dồn lúc đang chạy):
// liveCounts[from][to] = số lần
let liveCounts = {}

/** Nạp lại toàn bộ transition_count đã lưu từ lần chạy trước — gọi 1 lần lúc
 * server khởi động (app.js). Lỗi ở đây không được chặn server boot lên. */
async function loadFromDB() {
  try {
    const [rows] = await pool.query(
      "SELECT from_intent, to_intent, transition_count FROM chatbot_intent_transitions"
    )
    const loaded = {}
    for (const row of rows) {
      if (!INTENTS.includes(row.from_intent) || !INTENTS.includes(row.to_intent)) continue
      loaded[row.from_intent] = loaded[row.from_intent] || {}
      loaded[row.from_intent][row.to_intent] = row.transition_count
    }
    liveCounts = loaded
    console.log(`🔗 Markov chain: nạp ${rows.length} transition đã lưu từ lần chạy trước`)
  } catch (e) {
    console.warn("⚠️ Không nạp được Markov chain từ DB (dùng prior mặc định):", e.message)
  }
}

/** Ghi transition xuống DB — fire-and-forget (KHÔNG await ở nơi gọi), vì đây
 * chỉ là việc học nền, không được làm chậm phản hồi chatbot. */
function persistTransition(fromIntent, toIntent) {
  pool.query(
    `INSERT INTO chatbot_intent_transitions (from_intent, to_intent, transition_count)
     VALUES (?, ?, 1)
     ON DUPLICATE KEY UPDATE transition_count = transition_count + 1`,
    [fromIntent, toIntent]
  ).catch((e) => console.warn("⚠️ Không lưu được Markov transition:", e.message))
}

function recordTransition(fromIntent, toIntent) {
  if (!fromIntent || !toIntent || !INTENTS.includes(fromIntent) || !INTENTS.includes(toIntent)) return
  liveCounts[fromIntent] = liveCounts[fromIntent] || {}
  liveCounts[fromIntent][toIntent] = (liveCounts[fromIntent][toIntent] || 0) + 1
  persistTransition(fromIntent, toIntent)
}

/** Trộn prior + live count, chuẩn hoá thành phân phối xác suất thật (tổng = 1) */
function getTransitionProbabilities(fromIntent) {
  const prior = PRIOR_TRANSITIONS[fromIntent] || {}
  const live = liveCounts[fromIntent] || {}
  const combined = {}
  for (const [to, w] of Object.entries(prior)) combined[to] = (combined[to] || 0) + w
  for (const [to, c] of Object.entries(live)) combined[to] = (combined[to] || 0) + c

  const total = Object.values(combined).reduce((s, w) => s + w, 0)
  if (!total) return {}
  const probs = {}
  for (const [to, w] of Object.entries(combined)) probs[to] = w / total
  return probs
}

/** Dự đoán ý định kế tiếp có xác suất cao nhất, dựa trên ý định hiện tại */
function predictNextIntent(currentIntent) {
  const probs = getTransitionProbabilities(currentIntent)
  const entries = Object.entries(probs).sort((a, b) => b[1] - a[1])
  if (!entries.length) return null
  const [intent, probability] = entries[0]
  return { intent, probability, suggestion: INTENT_SUGGESTIONS[intent] || null, distribution: probs }
}

/** Xoá sạch cả liveCounts trong RAM lẫn bảng chatbot_intent_transitions —
 * PHẢI xoá cả 2 nơi, nếu không lần server restart kế tiếp sẽ loadFromDB() và
 * âm thầm khôi phục lại đúng dữ liệu vừa "reset", khiến việc reset vô nghĩa. */
async function resetLiveCounts() {
  liveCounts = {}
  await pool.query("TRUNCATE TABLE chatbot_intent_transitions")
}

module.exports = {
  INTENTS,
  PRIOR_TRANSITIONS,
  INTENT_SUGGESTIONS,
  recordTransition,
  getTransitionProbabilities,
  predictNextIntent,
  resetLiveCounts,
  loadFromDB,
}
