/**
 * Phân tích Sắc thái Văn bản (Sentiment Analysis) — chấm 1 đoạn văn bản tiếng
 * Việt là TÍCH CỰC / TRUNG LẬP / TIÊU CỰC bằng phương pháp dựa trên từ điển
 * trọng số (lexicon-based), có xử lý PHỦ ĐỊNH ("không hay" phải đảo cực của
 * "hay") và TỪ NHẤN MẠNH ("rất tệ", "tệ thật" phải nặng hơn "tệ" thường).
 *
 * Khác với Naive Bayes Classifier đã dùng để phân loại TÂM TRẠNG MUỐN XEM
 * PHIM GÌ (vd "tôi đang buồn" → gợi ý phim hài) — sentiment analysis ở đây đo
 * THÁI ĐỘ/CẢM XÚC của người viết đối với MỘT THỨ CỤ THỂ (bộ phim, dịch vụ),
 * dùng cho review phim (gắn nhãn tích cực/tiêu cực) và phát hiện khách đang
 * khó chịu khi chat (để chatbot phản hồi khéo hơn).
 */

// Trọng số dương = tích cực, dùng số dương trong dict; cực âm tính khi tính điểm.
const POSITIVE_WORDS = {
  "hay": 2, "tuyệt": 3, "tuyệt vời": 3, "xuất sắc": 3, "đỉnh": 3, "đỉnh cao": 3,
  "thích": 2, "yêu": 2, "hài lòng": 2, "ấn tượng": 2, "cuốn": 2, "lôi cuốn": 2,
  "kịch tính": 2, "hấp dẫn": 2, "đẹp": 1, "mượt": 1, "đáng xem": 2, "đáng tiền": 2,
  "chất lượng": 1, "tốt": 1, "ổn": 1, "vui": 1, "cảm động": 2, "xứng đáng": 2,
  "không thể bỏ lỡ": 2, "mãn nhãn": 3, "đáng đồng tiền": 2, "diễn xuất tốt": 2,
  "nội dung hay": 2, "kỹ xảo đẹp": 2, "rất thích": 3, "quá hay": 3,
}

const NEGATIVE_WORDS = {
  "dở": 2, "tệ": 2, "chán": 2, "thất vọng": 3, "lỗi": 2, "kém": 2, "nhạt": 2,
  "dài dòng": 1, "vô lý": 2, "phí tiền": 3, "không đáng": 3, "lừa đảo": 3,
  "tồi": 2, "tồi tệ": 3, "rác": 3, "phí thời gian": 3, "bực": 2, "khó chịu": 2,
  "bực mình": 2, "ghét": 2, "ức chế": 2, "sai sót": 2, "lag": 1,
  "đắt": 1, "chậm": 1, "hỏng": 2, "rởm": 2, "dở tệ": 3, "quá tệ": 3, "thất vọng quá": 3,
}

// Đứng TRƯỚC cụm từ cảm xúc → đảo cực (vd "không hay" = tiêu cực dù "hay" là tích cực)
const NEGATIONS_BEFORE = new Set(["không", "chẳng", "chả", "đừng", "chưa"])
// Đứng SAU cụm từ cảm xúc → cũng đảo cực (vd "hay đâu" = không hay)
const NEGATIONS_AFTER = new Set(["đâu", "gì đâu"])
// Đứng trước HOẶC sau cụm từ cảm xúc → khuếch đại trọng số (vd "rất tệ", "tệ thật")
const INTENSIFIERS = new Set(["rất", "quá", "cực", "vô cùng", "siêu", "thật", "thực sự", "lắm", "kinh khủng", "cực kỳ"])

// QUAN TRỌNG: dùng CHUNG normalize() (có khôi phục dấu) với chatbotNLU.service
// — không tự định nghĩa 1 normalize() riêng chỉ lowercase+trim như trước đây.
// Toàn bộ từ điển POSITIVE_WORDS/NEGATIVE_WORDS và các từ phủ định/nhấn mạnh ở
// trên đều viết CÓ DẤU, nhưng người dùng thật rất hay gõ KHÔNG DẤU (đã là vấn
// đề được xử lý kỹ ở chatbotNLU.service.js). Nếu chỉ lowercase+trim mà không
// khôi phục dấu, câu không dấu sẽ:
//   1. Bỏ sót hoàn toàn các từ cảm xúc có dấu trong từ điển (vd "tệ"/"ghét"/
//      "tuyệt vời" gõ thành "te"/"ghet"/"tuyet voi" sẽ KHÔNG khớp được gì, bị
//      chấm "neutral" oan dù câu rõ ràng có cảm xúc — kiểm chứng trực tiếp:
//      "dịch vụ tệ quá, thất vọng" ra "negative" đúng, nhưng "dich vu te qua,
//      that vong" (cùng nghĩa, gõ không dấu) lại ra "neutral").
//   2. Tệ hơn: nếu từ CẢM XÚC không dấu (vd "hay") tình cờ trùng chữ dù có dấu
//      hay không, nhưng từ PHỦ ĐỊNH đứng trước nó ("không") bị gõ thành
//      "khong" thì KHÔNG khớp NEGATIONS_BEFORE (chỉ chứa "không" có dấu) —
//      phủ định bị bỏ qua, khiến câu tiêu cực rõ ràng ("phim này không hay" gõ
//      không dấu) bị chấm ngược thành "positive" (kiểm chứng trực tiếp).
const { normalize } = require("./chatbotNLU.service")

function tokenize(text) {
  return normalize(text).split(/[\s,.!?;:"'()]+/).filter(Boolean)
}

const MAX_PHRASE_LEN = 3

/**
 * @param {string} rawText
 * @returns {{label: "positive"|"neutral"|"negative", score: number, positiveHits: string[], negativeHits: string[]}}
 */
function analyzeSentiment(rawText) {
  const tokens = tokenize(rawText)
  let score = 0
  const positiveHits = []
  const negativeHits = []

  for (let i = 0; i < tokens.length; i++) {
    let matched = false
    for (let len = MAX_PHRASE_LEN; len >= 1; len--) {
      if (i + len > tokens.length) continue
      const phrase = tokens.slice(i, i + len).join(" ")
      const isPos = POSITIVE_WORDS[phrase] !== undefined
      const isNeg = NEGATIVE_WORDS[phrase] !== undefined
      if (!isPos && !isNeg) continue

      let weight = isPos ? POSITIVE_WORDS[phrase] : -NEGATIVE_WORDS[phrase]

      const prevWord = i > 0 ? tokens[i - 1] : null
      const nextWord = i + len < tokens.length ? tokens[i + len] : null
      // NEGATIONS_AFTER chứa cả cụm 2 từ (vd "gì đâu"), nên phải so cả cụm 2
      // từ liền sau, không chỉ 1 từ đơn — nếu chỉ so nextWord (luôn là 1 từ),
      // các entry 2 từ trong Set sẽ không bao giờ khớp được.
      const nextTwoWords = i + len + 1 < tokens.length ? `${tokens[i + len]} ${tokens[i + len + 1]}` : null
      // CÙNG LỖI đã sửa ở NEGATIONS_AFHER nhưng còn sót ở INTENSIFIERS: 4/10 từ
      // nhấn mạnh trong Set là cụm 2 TỪ ("vô cùng", "thực sự", "kinh khủng",
      // "cực kỳ") nhưng trước đây chỉ so với prevWord/nextWord (luôn 1 token
      // sau khi tokenize tách theo khoảng trắng) — 4 entry đó CHẾT hoàn toàn,
      // không bao giờ khớp được (kiểm chứng trực tiếp: "giá vé đắt kinh khủng"
      // chỉ tính điểm của riêng "đắt" (-1.5), không hề nhân 1.5 dù "kinh khủng"
      // rõ ràng đang nhấn mạnh ngay sau). Thêm prevTwoWords/nextTwoWords cho cả
      // 2 phía, đối xứng với cách NEGATIONS_AFTER đã xử lý.
      const prevTwoWords = i > 1 ? `${tokens[i - 2]} ${tokens[i - 1]}` : null

      if ((prevWord && NEGATIONS_BEFORE.has(prevWord)) || (nextWord && NEGATIONS_AFTER.has(nextWord)) || (nextTwoWords && NEGATIONS_AFTER.has(nextTwoWords))) {
        weight = -weight
      } else if (
        (prevWord && INTENSIFIERS.has(prevWord)) || (nextWord && INTENSIFIERS.has(nextWord)) ||
        (prevTwoWords && INTENSIFIERS.has(prevTwoWords)) || (nextTwoWords && INTENSIFIERS.has(nextTwoWords))
      ) {
        weight *= 1.5
      }

      score += weight
      ;(weight > 0 ? positiveHits : negativeHits).push(phrase)
      i += len - 1 // nhảy qua cụm từ đã khớp, tránh đếm trùng các từ con bên trong
      matched = true
      break
    }
    if (!matched) continue
  }

  const label = score > 0 ? "positive" : score < 0 ? "negative" : "neutral"
  return { label, score, positiveHits, negativeHits }
}

const LABEL_DISPLAY = {
  positive: { text: "Tích cực", emoji: "😊" },
  neutral: { text: "Trung lập", emoji: "😐" },
  negative: { text: "Tiêu cực", emoji: "😞" },
}

module.exports = { analyzeSentiment, LABEL_DISPLAY }
