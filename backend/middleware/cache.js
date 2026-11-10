// Simple in-memory cache middleware
// For production, use Redis or similar
const NodeCache = require('node-cache')
const crypto = require('crypto')

// Cache with 5 minute TTL by default
const cache = new NodeCache({ stdTTL: 300, checkperiod: 60 })

/**
 * Cache middleware with ETag support
 * @param {number} duration - Cache duration in seconds (default: 300 = 5 minutes)
 */
const cacheMiddleware = (duration = 300) => {
  return (req, res, next) => {
    // Only cache GET requests
    if (req.method !== 'GET') {
      return next()
    }

    const key = `__express__${req.originalUrl || req.url}`
    const cachedResponse = cache.get(key)

    if (cachedResponse) {
      // Cache hit
      res.set('X-Cache', 'HIT')
      // KHÔNG dùng `max-age=<duration>`.
      //
      // max-age bảo trình duyệt: "cứ dùng bản này, KHÔNG cần hỏi lại server
      // trong N giây". Hệ quả: khi admin xoá/sửa dữ liệu, invalidateCache() chỉ
      // xoá được cache TRÊN SERVER — nó không thể với tới cache nằm trong máy
      // người dùng. Trình duyệt vẫn hiển thị dữ liệu cũ cho tới khi hết N giây,
      // dù server đã có dữ liệu mới. Đây chính là lỗi "đã xoá suất chiếu trong
      // trang quản trị nhưng người dùng vẫn thấy suất đó" (max-age=120 với
      // /api/movies/:id/showtimes, và tới 600 giây với /api/movies).
      //
      // `no-cache` KHÔNG có nghĩa là "cấm lưu" — nó có nghĩa "được lưu, nhưng
      // mỗi lần dùng phải hỏi server xem còn mới không". Kết hợp với ETag bên
      // dưới: nếu dữ liệu không đổi, server trả 304 rỗng (rất nhẹ, gần như
      // không tốn băng thông); nếu đã đổi, người dùng nhận ngay bản mới.
      // Giữ được gần trọn lợi ích tiết kiệm mà việc xoá cache thật sự có hiệu lực.
      res.set('Cache-Control', 'no-cache, must-revalidate')
      
      // Generate ETag for cached content
      const etag = crypto.createHash('md5').update(JSON.stringify(cachedResponse)).digest('hex')
      res.set('ETag', `"${etag}"`)
      
      // Check if client has matching ETag
      if (req.headers['if-none-match'] === `"${etag}"`) {
        return res.status(304).end() // Not Modified
      }
      
      return res.json(cachedResponse)
    }

    // Cache miss - override res.json to cache the response
    res.set('X-Cache', 'MISS')
    const originalJson = res.json.bind(res)

    res.json = (body) => {
      // CHỈ cache phản hồi THÀNH CÔNG (2xx). Trước đây cache VÔ ĐIỀU KIỆN mọi
      // body đi qua res.json, kể cả 404/500 — mà nhánh "cache hit" phía trên
      // luôn trả res.json(...) với status mặc định 200. Hậu quả đã tái hiện
      // được: 1 lỗi 500 CHỚP NHOÁNG (mất kết nối DB trong tích tắc) trên
      // /api/movies sẽ bị đóng băng lại, rồi phát cho MỌI người dùng dưới dạng
      // HTTP 200 kèm body {"error": ...} suốt trọn 10 phút TTL — controller
      // không hề được gọi lại để tự phục hồi. Frontend thấy status 200 nên
      // không vào nhánh xử lý lỗi, đọc data.movies ra undefined → trang trắng.
      // Chỉ 1 lần lỗi thoáng qua là hỏng cả site trong nhiều phút.
      const isSuccess = res.statusCode >= 200 && res.statusCode < 300
      if (isSuccess) {
        cache.set(key, body, duration)
        const etag = crypto.createHash('md5').update(JSON.stringify(body)).digest('hex')
        res.set('ETag', `"${etag}"`)
        // KHÔNG dùng `max-age=<duration>`.
      //
      // max-age bảo trình duyệt: "cứ dùng bản này, KHÔNG cần hỏi lại server
      // trong N giây". Hệ quả: khi admin xoá/sửa dữ liệu, invalidateCache() chỉ
      // xoá được cache TRÊN SERVER — nó không thể với tới cache nằm trong máy
      // người dùng. Trình duyệt vẫn hiển thị dữ liệu cũ cho tới khi hết N giây,
      // dù server đã có dữ liệu mới. Đây chính là lỗi "đã xoá suất chiếu trong
      // trang quản trị nhưng người dùng vẫn thấy suất đó" (max-age=120 với
      // /api/movies/:id/showtimes, và tới 600 giây với /api/movies).
      //
      // `no-cache` KHÔNG có nghĩa là "cấm lưu" — nó có nghĩa "được lưu, nhưng
      // mỗi lần dùng phải hỏi server xem còn mới không". Kết hợp với ETag bên
      // dưới: nếu dữ liệu không đổi, server trả 304 rỗng (rất nhẹ, gần như
      // không tốn băng thông); nếu đã đổi, người dùng nhận ngay bản mới.
      // Giữ được gần trọn lợi ích tiết kiệm mà việc xoá cache thật sự có hiệu lực.
      res.set('Cache-Control', 'no-cache, must-revalidate')
      } else {
        // Không để trình duyệt/proxy trung gian giữ lại phản hồi lỗi — trước
        // đây header Cache-Control: public được đặt TRƯỚC khi biết status nên
        // lỗi cũng bị cache ở phía client.
        res.set('Cache-Control', 'no-store')
      }

      return originalJson(body)
    }

    next()
  }
}

/**
 * Clear cache by pattern
 */
const clearCache = (pattern) => {
  if (pattern) {
    const keys = cache.keys()
    keys.forEach(key => {
      if (key.includes(pattern)) {
        cache.del(key)
      }
    })
  } else {
    cache.flushAll()
  }
}

/**
 * Các NHÓM cache công khai, gom theo "dữ liệu nào đổi thì phải xoá cache nào".
 *
 * Dùng invalidateCache('showtimes') thay vì tự truyền pattern thô, vì pattern
 * phải khớp với KEY THẬT (`__express__` + originalUrl) — rất dễ viết sai mà
 * không có dấu hiệu gì: clearCache() không báo lỗi khi không khớp key nào, nên
 * 1 pattern sai sẽ im lặng trở thành lệnh rỗng (chính xác là lỗi đã gặp với
 * `/api/showtimes/${id}` trong luồng thanh toán — route đó vốn không hề được
 * cache, còn key thật của danh sách là '/api/showtimes?date=...').
 */
const CACHE_GROUPS = {
  // '/api/showtimes?date=...' (TTL 180s) + '/api/movies/:id/showtimes' (TTL 120s)
  showtimes: ['/showtimes'],
  // '/api/movies', '/api/movies/popular', '/api/movies/status/:s', '/api/movies/:id'
  movies: ['/api/movies'],
  cinemas: ['/api/cinemas'],
  combos: ['/api/combos'],
}

/**
 * Xoá toàn bộ cache của 1 hoặc nhiều nhóm ở trên.
 * @param {...('showtimes'|'movies'|'cinemas'|'combos')} groups
 */
const invalidateCache = (...groups) => {
  for (const group of groups) {
    const patterns = CACHE_GROUPS[group]
    if (!patterns) {
      console.error(`⚠️ invalidateCache: nhóm cache không tồn tại "${group}"`)
      continue
    }
    patterns.forEach((p) => clearCache(p))
  }
}

/**
 * Get cache stats
 */
const getCacheStats = () => {
  return cache.getStats()
}

module.exports = {
  cacheMiddleware,
  clearCache,
  invalidateCache,
  getCacheStats,
  cache
}
