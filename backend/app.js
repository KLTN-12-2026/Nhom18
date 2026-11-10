require("dotenv").config()

// Validate environment variables before starting
const { validateEnvironment } = require("./utils/envValidator")
validateEnvironment()

const express = require("express")
const cors = require("cors")
const compression = require("compression")
const helmet = require("helmet")
const { pool, testConnection } = require("./config/database")
const bcrypt = require("bcryptjs")
const { apiLimiter } = require("./middleware/rateLimiter")
const { requestLogger } = require("./middleware/securityLogger")

// Import routes
const authRoutes = require("./routes/auth")
const movieRoutes = require("./routes/movies")
const ticketRoutes = require("./routes/tickets")
const adminRoutes = require("./routes/admin")
const cinemaRoutes = require("./routes/cinemas")
const showtimeRoutes = require("./routes/showtimes")
const reportRoutes = require("./routes/reports")
const chatbotAIRoutes = require("./routes/chatbotAI") // AI-powered chatbot
const seatLockRoutes = require("./routes/seat-locks")
const paymentRoutes = require("./routes/payment")
const comboRoutes = require("./routes/combos")
const favoriteRoutes = require("./routes/favorites")
const ratingRoutes = require("./routes/ratings")
const reviewRoutes = require("./routes/reviews")
const roomRoutes = require("./routes/rooms")
const cinemaStatsRoutes = require("./routes/cinema-stats")
const voucherRoutes = require("./routes/vouchers")
const notificationRoutes = require("./routes/notifications")
const pointsRoutes = require("./routes/points")

const app = express()
const PORT = process.env.PORT || 5000

// Trust proxy (for rate limiting behind reverse proxy)
app.set('trust proxy', 1)

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false, // Disable for now, can configure later
  crossOriginEmbedderPolicy: false,
}))

// Compression middleware (gzip)
app.use(compression())

// Middleware
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow multiple origins for development
      const allowedOrigins = [
        'http://localhost:3000',
        'http://localhost:3001',
        process.env.FRONTEND_URL
      ].filter(Boolean)
      
      // Allow requests with no origin (like mobile apps, Postman, or same-origin)
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true)
      } else {
        callback(new Error('Not allowed by CORS'))
      }
    },
    credentials: true,
  }),
)
app.use(express.json({ limit: '10mb' })) // Limit payload size
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

// Security logging middleware
app.use(requestLogger)

// Apply general rate limiting to all API routes
app.use('/api/', apiLimiter)

// Routes
app.use("/api/auth", authRoutes)
app.use("/api/movies", movieRoutes)
app.use("/api/tickets", ticketRoutes)
app.use("/api/admin", adminRoutes)
app.use("/api/cinemas", cinemaRoutes)
app.use("/api/showtimes", showtimeRoutes)
app.use("/api/admin/reports", reportRoutes)
app.use("/api/chatbot-ai", chatbotAIRoutes)
app.use("/api/seat-locks", seatLockRoutes)
app.use("/api/payment", paymentRoutes)
app.use("/api/combos", comboRoutes)
app.use("/api/settings", require("./routes/settings"))
app.use("/api/favorites", favoriteRoutes)
app.use("/api/ratings", ratingRoutes)
app.use("/api/reviews", reviewRoutes)
app.use("/api/rooms", roomRoutes)
app.use("/api/cinema-stats", cinemaStatsRoutes)
app.use("/api/vouchers", voucherRoutes)
app.use("/api/notifications", notificationRoutes)
app.use("/api/points", pointsRoutes)

// Ensure default admin exists (dev convenience)
const ensureAdmin = async () => {
  try {
    const adminEmail = process.env.ADMIN_EMAIL || "admin@cinema.com"
    const adminPassword = process.env.ADMIN_PASSWORD || "admin123"
    const adminUsername = process.env.ADMIN_USERNAME || "admin"

    const [rows] = await pool.execute("SELECT * FROM users WHERE email = ?", [adminEmail])
    if (rows.length === 0) {
      const hashed = await bcrypt.hash(adminPassword, 12)
      await pool.execute(
        "INSERT INTO users (username, email, password, role, created_at) VALUES (?, ?, ?, 'admin', NOW())",
        [adminUsername, adminEmail, hashed],
      )
      console.log(`👤 Created default admin: ${adminEmail}`)
    } else {
      const user = rows[0]
      if (user.role !== "admin") {
        await pool.execute("UPDATE users SET role = 'admin' WHERE id = ?", [user.id])
        console.log(`🔁 Updated user role to admin for: ${adminEmail}`)
      }
      // Optionally reset password if ADMIN_FORCE_RESET is true
      if (process.env.ADMIN_FORCE_RESET === "true") {
        const hashed = await bcrypt.hash(adminPassword, 12)
        await pool.execute("UPDATE users SET password = ? WHERE id = ?", [hashed, user.id])
        console.log(`🔐 Reset admin password for: ${adminEmail}`)
      }
    }
  } catch (e) {
    console.error("Failed to ensure admin:", e.message)
  }
}

// Health check
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    message: "Movie Booking API is running!",
    timestamp: new Date().toISOString(),
  })
})

// Improved error handling middleware
app.use((err, req, res, next) => {
  // Log error for debugging (but don't expose to client in production)
  console.error('Error:', err)
  
  // Don't expose stack traces in production
  const isDevelopment = process.env.NODE_ENV !== 'production'
  
  // Handle specific error types
  if (err.name === 'ValidationError') {
    return res.status(400).json({ 
      error: 'Dữ liệu không hợp lệ',
      details: isDevelopment ? err.message : undefined
    })
  }
  
  if (err.name === 'UnauthorizedError' || err.name === 'JsonWebTokenError') {
    return res.status(401).json({ 
      error: 'Xác thực thất bại. Vui lòng đăng nhập lại.'
    })
  }
  
  if (err.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({ 
      error: 'Dữ liệu đã tồn tại trong hệ thống'
    })
  }
  
  // Generic error
  res.status(err.status || 500).json({ 
    error: isDevelopment ? err.message : 'Đã xảy ra lỗi. Vui lòng thử lại sau.',
    ...(isDevelopment && { stack: err.stack })
  })
})

// 404 handler
app.use((req, res) => {
  res.status(404).json({ 
    error: "Endpoint không tồn tại",
    path: req.path,
    method: req.method
  })
})

// Start server
const server = app.listen(PORT, async () => {
  console.log(`🚀 Server running on port ${PORT}`)
  await testConnection()
  await ensureAdmin()
  // Nạp lại Markov chain (gợi ý ý định kế tiếp của chatbot) đã học từ các
  // lần chạy trước, thay vì bắt đầu lại từ đầu mỗi lần server restart.
  await require("./services/intentMarkovChain.service").loadFromDB()

  // Giải phóng định kỳ các vé "bỏ dở giữa chừng" (đã trừ ghế nhưng chưa
  // thanh toán quá lâu) — không có job này, ghế bị kẹt vĩnh viễn nếu khách
  // bỏ ngang lúc thanh toán (đóng tab, bấm huỷ mà frontend chỉ reset UI).
  // Dọn luôn khoá ghế đã hết hạn trong cùng nhịp. Trước đây việc dọn CHỈ xảy ra
  // khi có người thao tác (lockSeats / checkSeatsAvailable / get_locked_seats),
  // nên suất chiếu không ai mở ra xem sẽ giữ lại dòng khoá quá hạn vô thời hạn —
  // không chặn ai đặt vé (mọi truy vấn đều lọc expires_at > NOW()) nhưng làm bẩn
  // bảng và khiến bộ soát lỗi logic báo vi phạm.
  const Ticket = require("./models/Ticket")
  const SeatLock = require("./models/SeatLock")
  const donDinhKy = async () => {
    try {
      const released = await Ticket.releaseStalePendingTickets(20)
      if (released > 0) console.log(`🧹 Đã giải phóng ${released} vé bỏ dở giữa chừng (quá 20 phút chưa thanh toán)`)
    } catch (e) {
      console.error("⚠️ Lỗi giải phóng vé bỏ dở:", e.message)
    }
    try {
      const xoa = await SeatLock.cleanupExpiredLocks()
      if (xoa > 0) console.log(`🧹 Đã dọn ${xoa} khoá ghế hết hạn`)
    } catch (e) {
      console.error("⚠️ Lỗi dọn khoá ghế hết hạn:", e.message)
    }
  }
  donDinhKy()
  setInterval(donDinhKy, 5 * 60 * 1000)

  // Tự động chuyển trạng thái phim theo release_date (UPCOMING→COMING_SOON→
  // NOW_SHOWING→ENDED) — trước đây chỉ có 1 script chạy tay 1 lần, khiến phim
  // "Sắp chiếu" có release_date đã trôi qua nhiều tháng vẫn đứng yên mãi.
  // Chạy ngay lúc khởi động (sửa ngay dữ liệu cũ) rồi lặp lại mỗi giờ.
  const { runMovieLifecycleUpdate } = require("./services/movieLifecycle.service")
  runMovieLifecycleUpdate().catch((e) => console.error("⚠️ Lỗi cập nhật trạng thái phim:", e.message))
  setInterval(() => {
    runMovieLifecycleUpdate().catch((e) => console.error("⚠️ Lỗi cập nhật trạng thái phim:", e.message))
  }, 60 * 60 * 1000)

  // Độ phổ biến (movies.popularity_score/total_bookings) là cột DẪN XUẤT —
  // trang chủ xếp mục "Phổ biến" theo nó. Tính lại từ vé/yêu thích/đánh giá
  // thật lúc khởi động và mỗi giờ để không đứng yên ở số liệu cũ.
  const Movie = require("./models/Movie")
  const runPopularity = () =>
    Movie.recomputeAllPopularity().catch((e) => console.error("⚠️ Lỗi tính độ phổ biến phim:", e.message))
  runPopularity()
  setInterval(runPopularity, 60 * 60 * 1000)

  // Chương trình ưu đãi sinh nhật (tự động) — chạy ngay lúc khởi động (phòng
  // trường hợp server tắt đúng vào ngày sinh nhật ai đó) rồi lặp lại mỗi giờ.
  // Idempotent nên chạy nhiều lần/ngày không gửi trùng (xem birthdayVoucher.service.js).
  const birthdayVoucherService = require("./services/birthdayVoucher.service")
  const runBirthdayJobs = async () => {
    try {
      const greet = await birthdayVoucherService.runBirthdayGreetings()
      if (greet.sent > 0) console.log(`🎂 Đã chúc mừng sinh nhật + gửi ưu đãi cho ${greet.sent} người dùng`)
    } catch (e) {
      console.error("⚠️ Lỗi gửi chúc mừng sinh nhật:", e.message)
    }
    try {
      const remind = await birthdayVoucherService.runDobReminders()
      if (remind.reminded > 0) console.log(`🎂 Đã nhắc ${remind.reminded} người dùng cập nhật ngày sinh`)
    } catch (e) {
      console.error("⚠️ Lỗi nhắc cập nhật ngày sinh:", e.message)
    }
  }
  runBirthdayJobs()
  setInterval(runBirthdayJobs, 60 * 60 * 1000)
})

// Initialize Socket.IO
const { initializeSocket } = require("./socket")
initializeSocket(server)

module.exports = app
