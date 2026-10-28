const rateLimit = require("express-rate-limit")

// Rate limiter cho authentication endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 requests per windowMs
  message: {
    error: "Quá nhiều lần thử đăng nhập. Vui lòng thử lại sau 15 phút."
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Skip successful requests
  skipSuccessfulRequests: false,
  // Store in memory (use Redis in production for distributed systems)
  handler: (req, res) => {
    res.status(429).json({
      error: "Quá nhiều lần thử đăng nhập từ IP này. Vui lòng thử lại sau 15 phút."
    })
  }
})

// Stricter rate limiter for failed login attempts
const strictAuthLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 attempts per hour
  message: {
    error: "Tài khoản tạm thời bị khóa do quá nhiều lần đăng nhập thất bại. Vui lòng thử lại sau 1 giờ."
  },
  skipSuccessfulRequests: true, // Don't count successful logins
  handler: (req, res) => {
    res.status(429).json({
      error: "Tài khoản tạm thời bị khóa do quá nhiều lần đăng nhập thất bại. Vui lòng thử lại sau 1 giờ hoặc liên hệ hỗ trợ."
    })
  }
})

// General API rate limiter
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'production' ? 100 : 1000, // Higher limit in development
  message: {
    error: "Quá nhiều request từ IP này. Vui lòng thử lại sau."
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => process.env.NODE_ENV === 'development' && req.ip === '::1', // Skip for localhost in dev
})

// Strict limiter for booking endpoints (prevent spam)
const bookingLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 10, // Max 10 booking attempts per 5 minutes
  message: {
    error: "Quá nhiều lần đặt vé. Vui lòng đợi một chút trước khi thử lại."
  },
  handler: (req, res) => {
    res.status(429).json({
      error: "Bạn đang đặt vé quá nhanh. Vui lòng đợi 5 phút và thử lại."
    })
  }
})

// Rate limiter for seat lock operations
const seatLockLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 30, // Max 30 seat operations per minute per IP
  message: {
    error: "Quá nhiều thao tác với ghế ngồi. Vui lòng chậm lại."
  },
  skipSuccessfulRequests: false,
})

module.exports = {
  authLimiter,
  strictAuthLimiter,
  apiLimiter,
  bookingLimiter,
  seatLockLimiter
}
