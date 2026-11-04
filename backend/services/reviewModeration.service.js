/**
 * Kiểm duyệt đánh giá TỰ ĐỘNG — chấm ngay lúc user gửi review (routes/reviews.js
 * POST /:movieId), quyết định review hiện công khai ngay ('approved') hay cần
 * admin duyệt tay trước ('flagged', ẩn khỏi danh sách công khai cho tới khi
 * duyệt). Cùng phong cách rule-based/từ điển như sentimentAnalysis.service.js
 * (không phải machine learning) — CHỈ chặn dấu hiệu VI PHẠM rõ ràng (từ tục,
 * spam), KHÔNG chặn theo sắc thái tiêu cực: phê bình gay gắt nhưng đúng mực
 * ("phim này quá dở, phí tiền") vẫn là ý kiến hợp lệ, không phải vi phạm.
 */

// Danh sách rút gọn, mang tính đại diện — không phải bộ lọc toàn diện. Viết
// thường, so khớp không phân biệt hoa/thường ở containsBannedWord().
const BANNED_WORDS = [
  "đm", "đmm", "vcl", "vloz", "clm", "đù mé", "đéo", "địt", "lồn", "cặc", "buồi",
  "óc chó", "thằng ngu", "con điên", "chó chết",
  "fuck", "shit", "bitch", "asshole",
]

function containsBannedWord(text) {
  const lower = text.toLowerCase()
  return BANNED_WORDS.find((w) => lower.includes(w)) || null
}

function detectSpamPattern(text) {
  if (/https?:\/\//i.test(text)) return "Chứa đường dẫn (link)"
  // Cùng 1 ký tự lặp lại ≥7 lần liên tiếp (vd "aaaaaaa", "!!!!!!!") — dấu hiệu spam/rác
  if (/(.)\1{6,}/.test(text)) return "Chứa ký tự lặp lại bất thường"
  // Toàn bộ viết hoa + đủ dài — giống la hét/spam hơn là đánh giá thật
  const letters = text.replace(/[^a-zA-ZÀ-ỹà-ỹ]/g, "")
  if (letters.length >= 20 && letters === letters.toUpperCase()) return "Viết hoa toàn bộ nội dung"
  return null
}

/** @returns {{ status: 'approved'|'flagged', reason: string|null }} */
function autoModerate(reviewText) {
  const bannedWord = containsBannedWord(reviewText)
  if (bannedWord) return { status: "flagged", reason: "Chứa từ ngữ không phù hợp" }

  const spamReason = detectSpamPattern(reviewText)
  if (spamReason) return { status: "flagged", reason: spamReason }

  return { status: "approved", reason: null }
}

module.exports = { autoModerate }
