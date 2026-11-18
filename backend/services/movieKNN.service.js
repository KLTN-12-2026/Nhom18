/**
 * KNN (K-Nearest Neighbors) bằng khoảng cách Euclidean — gợi ý phim dựa trên
 * "vector đặc trưng" của phim, thay cho cách cũ chỉ so khớp thô `genre LIKE`.
 *
 * Mỗi phim được biểu diễn thành 1 vector số:
 *   [one-hot thể loại..., độ phổ biến (chuẩn hoá), điểm đánh giá (chuẩn hoá), thời lượng (chuẩn hoá)]
 * "Vector sở thích" của user = trung bình vector các phim user đã xem.
 * Khoảng cách Euclidean từ vector sở thích đến từng phim CHƯA xem → sắp tăng
 * dần → lấy K phim gần nhất (gần = giống sở thích user nhất).
 */

function buildGenreVocabulary(movies) {
  const set = new Set()
  for (const m of movies) {
    for (const g of (m.genre || "").split(",").map((x) => x.trim()).filter(Boolean)) {
      set.add(g)
    }
  }
  return [...set].sort()
}

function movieToVector(movie, genreVocab, normalizers) {
  const genreSet = new Set((movie.genre || "").split(",").map((x) => x.trim()).filter(Boolean))
  const genreVec = genreVocab.map((g) => (genreSet.has(g) ? 1 : 0))
  const popularity = Math.min(1, (Number(movie.popularity_score) || 0) / normalizers.maxPopularity)
  const rating = Math.min(1, (Number(movie.average_rating) || 0) / 5)
  const duration = Math.min(1, (Number(movie.duration) || 0) / normalizers.maxDuration)
  return [...genreVec, popularity, rating, duration]
}

function euclideanDistance(v1, v2) {
  let sum = 0
  for (let i = 0; i < v1.length; i++) {
    const diff = (v1[i] || 0) - (v2[i] || 0)
    sum += diff * diff
  }
  return Math.sqrt(sum)
}

function averageVector(vectors) {
  if (!vectors.length) return null
  const dim = vectors[0].length
  const avg = new Array(dim).fill(0)
  for (const v of vectors) for (let i = 0; i < dim; i++) avg[i] += v[i]
  return avg.map((s) => s / vectors.length)
}

/**
 * @param {Array} watchedMovies - phim user đã xem (đầy đủ field genre/popularity_score/average_rating/duration)
 * @param {Array} candidateMovies - phim ứng viên để gợi ý (đã loại phim đã xem, đã lọc NOW_SHOWING)
 * @param {number} k - số láng giềng gần nhất muốn lấy
 * @returns {Array} candidateMovies đã sắp theo độ gần (gần nhất trước), kèm field `_distance`
 */
function recommendByKNN(watchedMovies, candidateMovies, k = 5) {
  if (!watchedMovies.length || !candidateMovies.length) return []

  const allMovies = [...watchedMovies, ...candidateMovies]
  const genreVocab = buildGenreVocabulary(allMovies)
  const normalizers = {
    maxPopularity: Math.max(1, ...allMovies.map((m) => Number(m.popularity_score) || 0)),
    maxDuration: Math.max(1, ...allMovies.map((m) => Number(m.duration) || 0)),
  }

  const watchedVectors = watchedMovies.map((m) => movieToVector(m, genreVocab, normalizers))
  const userVector = averageVector(watchedVectors) // "trọng tâm" sở thích của user trong không gian đặc trưng

  const scored = candidateMovies.map((movie) => {
    const vec = movieToVector(movie, genreVocab, normalizers)
    return { ...movie, _distance: euclideanDistance(userVector, vec) }
  })

  scored.sort((a, b) => a._distance - b._distance)
  return scored.slice(0, k)
}

module.exports = {
  buildGenreVocabulary,
  movieToVector,
  euclideanDistance,
  averageVector,
  recommendByKNN,
}
