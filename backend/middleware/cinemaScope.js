/**
 * PHÂN QUYỀN THEO CHI NHÁNH cho vai trò 'cinema_manager'.
 *
 * Tách khỏi middleware/auth.js CÓ CHỦ ĐÍCH: auth.js bắt buộc phải có
 * JWT_SECRET ngay lúc nạp module (throw nếu thiếu). Các controller chỉ cần
 * hàm thuần getScopedCinemaId() mà lại phải kéo theo cả yêu cầu JWT_SECRET,
 * khiến unit test của controller (vốn không dựng biến môi trường) sập ngay ở
 * bước import. Ở đây không đụng gì tới JWT nên import ở đâu cũng an toàn.
 */

/**
 * Rạp mà người đang đăng nhập bị giới hạn trong đó.
 *  - cinema_manager -> id rạp được gán
 *  - admin / user   -> null (không giới hạn)
 *
 * Luôn đọc từ req.user (lấy từ DB khi xác thực token), KHÔNG đọc từ query
 * string — tin tham số client gửi lên thì quản lý chỉ cần sửa URL là xem
 * được dữ liệu rạp khác.
 */
function getScopedCinemaId(req) {
  return req.user?.role === "cinema_manager" ? (req.user.cinema_id ?? null) : null
}

/**
 * Chặn quản lý CHƯA ĐƯỢC GÁN RẠP. Tài khoản như vậy không có phạm vi hợp lệ,
 * nếu cho đi tiếp thì getScopedCinemaId trả null và họ vô tình được đối xử
 * như admin — đúng lỗ hổng đang cần vá. Đặt SAU requireStaff.
 */
const requireCinemaAssigned = (req, res, next) => {
  if (req.user?.role === "cinema_manager" && !req.user.cinema_id) {
    return res.status(403).json({
      error: "Tài khoản quản lý của bạn chưa được gán rạp. Vui lòng liên hệ quản trị viên.",
    })
  }
  next()
}

/**
 * Chặn quản lý thao tác lên rạp KHÔNG PHẢI của mình.
 * @param {(req) => number|string|null|undefined|Promise<...>} pickCinemaId -
 *   lấy id rạp mà request đang nhắm tới (từ body/params, hoặc tra DB).
 * Trả 403 (không phải 404) để phân biệt rõ "không có quyền" với "không tồn tại".
 */
function requireOwnCinema(pickCinemaId) {
  return async (req, res, next) => {
    try {
      if (req.user?.role !== "cinema_manager") return next() // admin: không giới hạn
      const target = await pickCinemaId(req)
      if (target == null) return next() // không xác định được -> để handler tự xử lý (404...)
      if (Number(target) !== Number(req.user.cinema_id)) {
        return res.status(403).json({ error: "Bạn chỉ được thao tác trên rạp mình quản lý." })
      }
      next()
    } catch (err) {
      console.error("requireOwnCinema error:", err)
      return res.status(500).json({ error: "Không kiểm tra được quyền truy cập rạp" })
    }
  }
}

module.exports = { getScopedCinemaId, requireCinemaAssigned, requireOwnCinema }
