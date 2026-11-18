const { pool } = require("../config/database")
const { formatLocalDateString } = require("../utils/dateUtils")

// Log ẩn danh 1 lượt hỏi-đáp của chatbot (KHÔNG lưu user_id/email/IP) — dùng
// để phân tích xu hướng câu hỏi thật (ý định nào phổ biến, AI hay fallback
// trả lời, câu nào bị đánh giá 👎 nhiều) thay vì chỉ dựa vào cảm giác chủ quan.
class ChatInteraction {
  static async create({ message, reply, intent, aiAvailable, sentimentLabel, hasCards }) {
    const [result] = await pool.execute(
      `INSERT INTO chatbot_interactions (message, reply, intent, ai_available, sentiment_label, has_cards)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [message, reply, intent || null, aiAvailable ? 1 : 0, sentimentLabel || null, hasCards ? 1 : 0],
    )
    return result.insertId
  }

  static async addFeedback(interactionId, rating) {
    if (rating !== "up" && rating !== "down") {
      throw new Error("rating phải là 'up' hoặc 'down'")
    }
    const [rows] = await pool.execute("SELECT id FROM chatbot_interactions WHERE id = ?", [interactionId])
    if (!rows.length) throw new Error("Không tìm thấy lượt chat tương ứng")
    await pool.execute(
      "INSERT INTO chatbot_feedback (interaction_id, rating) VALUES (?, ?)",
      [interactionId, rating],
    )
  }

  // ─────────────────────────────────────────────
  // ANALYTICS — dùng cho trang admin theo dõi "trend" chatbot: AI hay fallback
  // trả lời nhiều hơn, ý định nào phổ biến nhất, tỉ lệ 👍/👎, và các câu bị
  // đánh giá 👎 gần đây để biết chatbot đang trả lời sai ở đâu.
  //
  // QUAN TRỌNG: mọi hàm bên dưới cùng nhận 1 tham số `days` từ trang admin
  // (selector "7/30/90 ngày qua") và PHẢI hiểu "N ngày qua" theo ĐÚNG 1 nghĩa
  // duy nhất — N NGÀY DƯƠNG LỊCH giờ Việt Nam gần nhất, TÍNH CẢ HÔM NAY (vd
  // N=7 → hôm nay + 6 ngày trước, đúng với số cột hiển thị trong biểu đồ
  // getDailyTrend). Trước đây getSummary/getIntentDistribution/... dùng cửa
  // sổ TRƯỢT THEO GIỜ THỰC (DATE_SUB(NOW(), INTERVAL N DAY) — "N*24 giờ tính
  // ngược từ giờ hiện tại") trong khi getDailyTrend dùng ranh giới NGÀY
  // DƯƠNG LỊCH (CURDATE()) — 2 định nghĩa "N ngày qua" KHÁC NHAU tới ~25 giờ
  // ở biên (đã đo trực tiếp), khiến số "Tổng lượt chat" ở thẻ tổng và tổng
  // các cột trong biểu đồ xu hướng theo ngày KHÔNG khớp nhau khi dữ liệu trải
  // dài nhiều ngày — nhìn như 2 nguồn dữ liệu mâu thuẫn dù cùng 1 trang.
  // dayRangeFilter() chuẩn hoá về 1 định nghĩa DUY NHẤT, dùng chung cho TẤT
  // CẢ các hàm dưới đây. KHÔNG CONVERT_TZ: kiểm chứng trực tiếp trên DB thật
  // (xem giải thích ở Ticket.getDashboardStats()) cho thấy MySQL server ở
  // đây chạy time_zone=SYSTEM với hệ điều hành đặt sẵn giờ VN, nên created_at
  // (ghi bằng NOW()/CURRENT_TIMESTAMP) đã LÀ giờ VN sẵn — CONVERT_TZ
  // '+00:00'→'+07:00' cộng dư thêm 7 tiếng, đẩy sai ngày cho dữ liệu từ ~17h
  // VN trở đi mỗi ngày. CURDATE() cùng máy/cùng kết nối cũng trả về đúng
  // ngày VN, nên so sánh trực tiếp created_at với CURDATE() là đúng, không
  // cần quy đổi.
  static dayRangeFilter(column, days) {
    const safeDays = Math.max(parseInt(days) || 30, 1)
    return {
      clause: `${column} >= DATE_SUB(CURDATE(), INTERVAL ? DAY)`,
      param: safeDays - 1, // N ngày qua = hôm nay + (N-1) ngày trước, KHÔNG phải N ngày trước hôm nay
    }
  }

  static async getSummary(days = 30) {
    const { clause, param } = ChatInteraction.dayRangeFilter("created_at", days)
    const [[row]] = await pool.execute(
      `SELECT COUNT(*) as total,
              SUM(ai_available) as ai_count,
              SUM(has_cards) as has_cards_count
       FROM chatbot_interactions
       WHERE ${clause}`,
      [param],
    )
    // mysql2 trả kết quả SUM()/COUNT() dạng chuỗi cho cột kiểu BIGINT/DECIMAL
    // tuỳ cấu hình driver — "0" là chuỗi TRUTHY trong JS nên `row.x || 0` sẽ
    // giữ nguyên chuỗi "0" thay vì ép về số 0, khiến response trả về kiểu dữ
    // liệu không nhất quán (có lúc number, có lúc string) dù interface phía
    // frontend khai báo là number. Ép Number(...) tường minh cho chắc chắn.
    const total = Number(row.total) || 0
    const aiCount = Number(row.ai_count) || 0
    return {
      total,
      aiCount,
      fallbackCount: total - aiCount,
      hasCardsCount: Number(row.has_cards_count) || 0,
    }
  }

  static async getIntentDistribution(days = 30) {
    const { clause, param } = ChatInteraction.dayRangeFilter("created_at", days)
    const [rows] = await pool.execute(
      `SELECT COALESCE(intent, 'unknown') as intent, COUNT(*) as count
       FROM chatbot_interactions
       WHERE ${clause}
       GROUP BY intent ORDER BY count DESC`,
      [param],
    )
    return rows
  }

  static async getSentimentDistribution(days = 30) {
    const { clause, param } = ChatInteraction.dayRangeFilter("created_at", days)
    const [rows] = await pool.execute(
      `SELECT COALESCE(sentiment_label, 'unknown') as sentiment, COUNT(*) as count
       FROM chatbot_interactions
       WHERE ${clause}
       GROUP BY sentiment_label ORDER BY count DESC`,
      [param],
    )
    return rows
  }

  static async getFeedbackSummary(days = 30) {
    const { clause, param } = ChatInteraction.dayRangeFilter("cf.created_at", days)
    const [rows] = await pool.execute(
      `SELECT cf.rating, COUNT(*) as count
       FROM chatbot_feedback cf
       WHERE ${clause}
       GROUP BY cf.rating`,
      [param],
    )
    const up = rows.find((r) => r.rating === "up")?.count || 0
    const down = rows.find((r) => r.rating === "down")?.count || 0
    return { up, down, total: up + down }
  }

  // `days` PHẢI truyền vào và dùng chung dayRangeFilter() với các hàm phía
  // trên — trước đây hàm này bỏ qua `days` hoàn toàn (luôn quét TOÀN BỘ lịch
  // sử bất kể admin chọn khoảng thời gian nào trên trang), khiến danh sách
  // "câu trả lời bị đánh giá chưa hữu ích" có thể lẫn dữ liệu rất cũ dù đang
  // xem báo cáo "7 ngày qua" — gây hiểu nhầm là dữ liệu không nhất quán.
  static async getRecentDownvoted(limit = 20, days = 30) {
    const safeLimit = Math.min(Math.max(parseInt(limit) || 20, 1), 100)
    const { clause, param } = ChatInteraction.dayRangeFilter("cf.created_at", days)
    const [rows] = await pool.query(
      `SELECT ci.id, ci.message, ci.reply, ci.intent, ci.ai_available, cf.created_at as voted_at
       FROM chatbot_feedback cf
       JOIN chatbot_interactions ci ON ci.id = cf.interaction_id
       WHERE cf.rating = 'down' AND ${clause}
       ORDER BY cf.created_at DESC
       LIMIT ${safeLimit}`,
      [param],
    )
    return rows
  }

  // "Trend theo ngày" — số lượt chat, tỉ lệ AI/fallback, số câu không trả
  // lời được và số 👍/👎 gộp theo TỪNG NGÀY, để trang admin vẽ được biểu đồ
  // so sánh hôm nay/tuần này với các ngày/tuần trước, thay vì chỉ 1 con số
  // tổng gộp chung cho cả khoảng `days` như getSummary() ở trên.
  //
  // 1 điều PHẢI xử lý đúng (điều "1." cũ về CONVERT_TZ đã BỊ THÁO BỎ — xem
  // giải thích chi tiết ở Ticket.getDashboardStats(): kiểm chứng LẠI trực
  // tiếp trên DB thật ở thời điểm hiện tại cho thấy MySQL server đang chạy
  // time_zone=SYSTEM với hệ điều hành đặt sẵn giờ VN — tức created_at ĐÃ LÀ
  // giờ VN, không phải UTC như nhận định trước đây. Có thể cấu hình múi giờ
  // hệ điều hành của máy chạy MySQL đã đổi khác đi kể từ lúc dòng comment cũ
  // được viết. Nếu môi trường chạy đổi lại, cần đo lại bằng
  // `SELECT NOW(), UTC_TIMESTAMP()` trước khi thêm CONVERT_TZ trở lại):
  //   2. Query GROUP BY chỉ trả về NHỮNG NGÀY THỰC SỰ CÓ dữ liệu — nếu để
  //      nguyên, biểu đồ "7/30/90 ngày qua" sẽ co lại chỉ còn vài cột thưa
  //      thớt (sai lệch trực quan, dễ bị hiểu nhầm là lỗi) thay vì 1 dải N
  //      ngày liên tục với các ngày trống = 0. Điền đầy (zero-fill) toàn bộ
  //      dải ngày trước khi trả về.
  static async getDailyTrend(days = 30) {
    const safeDays = Math.min(Math.max(parseInt(days) || 30, 1), 90)
    // Cùng định nghĩa "N ngày qua" với dayRangeFilter() ở trên — trước đây
    // lệch 1 ngày khiến SQL fetch dư 1 ngày dữ liệu mà vòng lặp zero-fill
    // bên dưới không bao giờ dùng tới (lãng phí, dễ gây nhầm lẫn khi đối
    // chiếu với getSummary — 2 nơi phải cùng trả về đúng 1 con số tổng).
    const { clause: interactionClause, param: interactionParam } = ChatInteraction.dayRangeFilter("created_at", safeDays)
    const { clause: feedbackClause, param: feedbackParam } = ChatInteraction.dayRangeFilter("created_at", safeDays)
    const [rows] = await pool.execute(
      `SELECT DATE(created_at) as chat_date,
              COUNT(*) as total,
              SUM(ai_available) as ai_count,
              SUM(CASE WHEN ai_available = 0 AND intent = 'default' THEN 1 ELSE 0 END) as unanswered_count
       FROM chatbot_interactions
       WHERE ${interactionClause}
       GROUP BY chat_date
       ORDER BY chat_date ASC`,
      [interactionParam],
    )
    const [feedbackRows] = await pool.execute(
      `SELECT DATE(created_at) as chat_date, rating, COUNT(*) as count
       FROM chatbot_feedback
       WHERE ${feedbackClause}
       GROUP BY chat_date, rating`,
      [feedbackParam],
    )
    const feedbackByDate = new Map()
    for (const r of feedbackRows) {
      if (!feedbackByDate.has(r.chat_date)) feedbackByDate.set(r.chat_date, { up: 0, down: 0 })
      feedbackByDate.get(r.chat_date)[r.rating] = Number(r.count)
    }
    const byDate = new Map()
    for (const r of rows) {
      const fb = feedbackByDate.get(r.chat_date) || { up: 0, down: 0 }
      const total = Number(r.total)
      const aiCount = Number(r.ai_count) || 0
      byDate.set(r.chat_date, {
        date: r.chat_date,
        total,
        aiCount,
        fallbackCount: total - aiCount,
        unansweredCount: Number(r.unanswered_count) || 0,
        upvotes: fb.up,
        downvotes: fb.down,
      })
    }

    // Zero-fill: đảm bảo trả về ĐỦ safeDays ngày liên tục (kể cả ngày không
    // có lượt chat nào), tính theo giờ ĐỊA PHƯƠNG của Node process (đã xác
    // nhận trùng giờ Việt Nam) — dùng chung quy ước với formatLocalDateString
    // (utils/dateUtils.js) để tránh lệch ngày do toISOString() quy đổi UTC.
    const result = []
    const today = new Date()
    for (let i = safeDays - 1; i >= 0; i--) {
      const d = new Date(today)
      d.setDate(d.getDate() - i)
      const key = formatLocalDateString(d)
      result.push(byDate.get(key) || { date: key, total: 0, aiCount: 0, fallbackCount: 0, unansweredCount: 0, upvotes: 0, downvotes: 0 })
    }
    return result
  }

  // Câu hỏi mà pipeline rule-based (fallback) KHÔNG khớp được bất kỳ nhánh
  // nào (rơi về câu chào mặc định) — đây chính là danh sách "gợi ý mở rộng
  // FAQ_RULES/MOOD_MAP" trực tiếp từ nhu cầu thật của người dùng, thay vì
  // đoán mò. Chỉ lấy khi ai_available=0 (fallback trả lời) vì intent='default'
  // lúc Gemini trả lời không có nghĩa là "chatbot không hiểu" — Gemini là LLM
  // tổng quát, tự xử lý được nhiều câu ngoài các rule cứng.
  // `days` cùng lý do như getRecentDownvoted() ở trên — quét theo đúng
  // khoảng thời gian admin đang chọn xem, không phải toàn bộ lịch sử.
  static async getRecentUnanswered(limit = 20, days = 30) {
    const safeLimit = Math.min(Math.max(parseInt(limit) || 20, 1), 100)
    const { clause, param } = ChatInteraction.dayRangeFilter("created_at", days)
    const [rows] = await pool.query(
      `SELECT id, message, created_at
       FROM chatbot_interactions
       WHERE ai_available = 0 AND intent = 'default' AND ${clause}
       ORDER BY created_at DESC
       LIMIT ${safeLimit}`,
      [param],
    )
    return rows
  }
}

module.exports = ChatInteraction
