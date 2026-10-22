/**
 * Levenshtein Distance (edit distance) — số phép sửa tối thiểu (thêm/xoá/đổi
 * 1 ký tự) để biến chuỗi a thành chuỗi b. Dùng để DUNG SAI LỖI GÕ: khi người
 * dùng gõ sai tên phim (thiếu dấu, gõ nhịu, viết tắt sai...), Aho-Corasick
 * (khớp chính xác) sẽ không tìm thấy gì — lúc đó dùng Levenshtein để tìm tên
 * phim THẬT gần giống nhất với những gì người dùng gõ.
 *
 * Cài đặt bằng quy hoạch động (dynamic programming) chuẩn — độ phức tạp
 * O(m×n) với m, n là độ dài 2 chuỗi.
 */

function levenshteinDistance(a, b) {
  const m = a.length, n = b.length
  if (m === 0) return n
  if (n === 0) return m

  // Chỉ giữ 2 dòng (dòng trước + dòng hiện tại) để tiết kiệm bộ nhớ, thay vì
  // dựng cả ma trận (m+1)×(n+1).
  let prev = Array.from({ length: n + 1 }, (_, j) => j)
  let curr = new Array(n + 1).fill(0)

  for (let i = 1; i <= m; i++) {
    curr[0] = i
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        curr[j] = prev[j - 1]
      } else {
        curr[j] = 1 + Math.min(
          prev[j],     // xoá
          curr[j - 1], // thêm
          prev[j - 1], // đổi
        )
      }
    }
    ;[prev, curr] = [curr, prev]
  }
  return prev[n]
}

/** Độ tương tự chuẩn hoá 0..1 (1 = giống hoàn toàn), tiện so sánh giữa các cặp chuỗi độ dài khác nhau */
function similarity(a, b) {
  const maxLen = Math.max(a.length, b.length)
  if (maxLen === 0) return 1
  return 1 - levenshteinDistance(a, b) / maxLen
}

/**
 * Tìm phần tử trong `candidates` có nhãn (label) gần `query` nhất theo
 * Levenshtein distance. Chỉ trả về nếu khoảng cách đủ "gần" (trong ngưỡng
 * cho phép theo độ dài chuỗi) — tránh gợi ý sai lệch hoàn toàn.
 */
function findClosestMatch(query, candidates, getLabel, maxDistanceRatio = 0.35) {
  const q = (query || "").toLowerCase().trim()
  if (!q) return null

  let best = null
  let bestDistance = Infinity
  for (const candidate of candidates) {
    const label = getLabel(candidate).toLowerCase()
    const distance = levenshteinDistance(q, label)
    if (distance < bestDistance) {
      bestDistance = distance
      best = candidate
    }
  }
  if (!best) return null

  const label = getLabel(best)
  const threshold = Math.max(2, Math.ceil(Math.max(q.length, label.length) * maxDistanceRatio))
  if (bestDistance > threshold) return null

  return { item: best, distance: bestDistance, similarity: similarity(q, label.toLowerCase()) }
}

module.exports = { levenshteinDistance, similarity, findClosestMatch }
