const jwt = require("jsonwebtoken")
const User = require("../models/User")

// No fallback: a hardcoded default secret would be a critical vulnerability if this
// module is ever loaded without going through utils/envValidator's startup check.
if (!process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET environment variable is required and not set")
}
const JWT_SECRET = process.env.JWT_SECRET
const STAFF_ROLES = ["admin", "cinema_manager"]

// Generate JWT token
const generateToken = (user) => {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      // Nhúng token_version hiện tại của user — cho phép THU HỒI token này
      // (và mọi token cũ khác) từ phía server bằng cách tăng token_version
      // lên (logout/đổi mật khẩu), dù JWT về bản chất là stateless và còn
      // hạn 7 ngày. Không có cơ chế này thì "đăng xuất" chỉ là xoá token ở
      // phía trình duyệt — 1 token bị rò rỉ vẫn dùng được tới khi hết hạn.
      tokenVersion: user.token_version || 0,
    },
    JWT_SECRET,
    { expiresIn: "7d" },
  )
}

// Verify JWT token middleware
const verifyToken = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1]

    if (!token) {
      return res.status(401).json({ error: "Access token required" })
    }

    const decoded = jwt.verify(token, JWT_SECRET)
    const user = await User.findById(decoded.id)

    if (!user) {
      return res.status(401).json({ error: "User not found" })
    }

    if (user.is_blocked) {
      return res.status(403).json({ error: "Account is blocked" })
    }

    // Token đã bị thu hồi (logout/đổi mật khẩu tăng token_version sau khi
    // token này được cấp) — coi như hết hạn dù chữ ký JWT vẫn hợp lệ.
    if ((decoded.tokenVersion || 0) !== (user.token_version || 0)) {
      return res.status(401).json({ error: "Session đã hết hạn, vui lòng đăng nhập lại" })
    }

    req.user = user
    next()
  } catch (error) {
    return res.status(401).json({ error: "Invalid token" })
  }
}

// Xác thực TUỲ CHỌN — dùng cho route công khai (vd chatbot) mà vẫn cần biết
// danh tính thật khi có đăng nhập. Không có token → req.user = null, vẫn next()
// bình thường (khách vẫn dùng được). Có token nhưng SAI → chặn luôn (401), tránh
// trường hợp client giả mạo token hỏng để né xác thực mà vẫn lọt qua.
const optionalAuth = async (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1]
  if (!token) {
    req.user = null
    return next()
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET)
    const user = await User.findById(decoded.id)
    if (!user || user.is_blocked) {
      return res.status(401).json({ error: "Invalid token" })
    }
    if ((decoded.tokenVersion || 0) !== (user.token_version || 0)) {
      return res.status(401).json({ error: "Session đã hết hạn, vui lòng đăng nhập lại" })
    }
    req.user = user
    next()
  } catch (error) {
    return res.status(401).json({ error: "Invalid token" })
  }
}

/**
 * Nhận diện người dùng NẾU CÓ THỂ, và KHÔNG BAO GIỜ chặn.
 *
 * Khác optionalAuth ở đúng một điểm: token hỏng/hết hạn thì coi như khách vãng
 * lai (req.user = null) thay vì trả 401.
 *
 * Chỉ dùng cho route CÔNG KHAI CHỈ ĐỌC, nơi danh tính chỉ để cá nhân hoá phần
 * hiển thị chứ không mở thêm quyền gì. Ví dụ: xem chi tiết suất chiếu cần biết
 * người hỏi là ai để tách khoá ghế CỦA HỌ ra khỏi khoá của người khác — nhưng
 * ai cũng xem được trang đó, kể cả chưa đăng nhập.
 *
 * KHÔNG dùng cho route có hành vi khác nhau giữa khách và người đã đăng nhập
 * (ví dụ chatbot đọc đơn hàng cá nhân) — ở đó phải dùng optionalAuth, vì bỏ
 * qua token hỏng sẽ mở đường cho việc cố tình gửi token rác để được đối xử
 * như khách.
 *
 * Vì sao cần: trước đây route xem suất chiếu để optionalAuth, nên người dùng
 * có token HẾT HẠN (rất thường gặp) mở trang chọn ghế là nhận 401 và trang
 * trắng — trong khi cùng trang đó, người chưa đăng nhập lại xem được bình thường.
 */
const nhanDienNeuCo = async (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1]
  req.user = null
  if (!token) return next()

  try {
    const decoded = jwt.verify(token, JWT_SECRET)
    const user = await User.findById(decoded.id)
    if (user && !user.is_blocked && (decoded.tokenVersion || 0) === (user.token_version || 0)) {
      req.user = user
    }
  } catch (_) {
    // Token hỏng/hết hạn — cứ coi như khách vãng lai, không chặn.
  }
  next()
}

// Admin role middleware
const requireAdmin = (req, res, next) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({ error: "Admin access required" })
  }
  next()
}

const requireStaff = (req, res, next) => {
  if (!STAFF_ROLES.includes(req.user.role)) {
    return res.status(403).json({ error: "Staff access required" })
  }
  next()
}

// User role middleware
const requireUser = (req, res, next) => {
  if (!["user", ...STAFF_ROLES].includes(req.user.role)) {
    return res.status(403).json({ error: "User access required" })
  }
  next()
}

module.exports = {
  generateToken,
  verifyToken,
  optionalAuth,
  nhanDienNeuCo,
  requireAdmin,
  requireStaff,
  requireUser,
}
