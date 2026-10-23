const User = require("../models/User")
const { pool } = require("../config/database")
const generateToken = require("../middleware/auth").generateToken
const {
  sendResetPasswordEmail, sendWelcomeEmail,
  sendRegistrationCodeEmail, sendChangePasswordCodeEmail,
} = require("../services/emailService")
const { SecurityLogger } = require("../middleware/securityLogger")
const { isStrongPassword, validateRegistrationData } = require("../middleware/validation")
const RegistrationCode = require("../models/RegistrationCode")
const crypto = require("crypto")
const fetch = require("node-fetch")

const securityLogger = new SecurityLogger()

/**
 * Mã 6 số dùng cho xác thực email và đặt lại mật khẩu.
 *
 * PHẢI dùng crypto.randomInt chứ không phải Math.random: Math.random là bộ
 * sinh giả ngẫu nhiên KHÔNG dành cho mật mã (V8 dùng xorshift128+), trạng thái
 * của nó suy ra được từ một số giá trị đã quan sát — mà kẻ tấn công quan sát
 * được hợp lệ: chỉ cần tự bấm "gửi mã" cho email của CHÍNH MÌNH vài lần là có
 * mẫu, rồi đoán mã đặt lại mật khẩu gửi tới email NGƯỜI KHÁC. crypto.randomInt
 * lấy entropy từ hệ điều hành nên không có trạng thái để suy ngược, và cũng
 * không lệch phân bố như phép nhân-làm-tròn ở cách cũ.
 */
const generateSixDigitCode = () => String(crypto.randomInt(100000, 1000000))

// Chỉ chấp nhận redirect nội bộ (path bắt đầu bằng "/") — chặn open redirect
// qua URL protocol-relative (vd "//evil.com" — trình duyệt hiểu là chuyển
// sang domain evil.com dùng đúng scheme hiện tại) hoặc URL có scheme khác
// (vd "javascript:...", "https://evil.com"). Dùng cho cả tham số `state`
// (OAuth) lẫn `returnTo` sau khi hoàn tất đăng nhập.
function isSafeReturnPath(path) {
  if (typeof path !== "string" || !path) return false
  if (!path.startsWith("/")) return false
  if (path.startsWith("//")) return false
  if (path.startsWith("/\\")) return false // 1 số trình duyệt hiểu "/\" như "//"
  return true
}

// Mã trao đổi (exchange code) dùng 1 LẦN, sống rất ngắn (60s) — thay cho việc
// nhét thẳng JWT thật vào URL redirect sau OAuth. Trước đây token sống 7 ngày
// nằm ngay trên URL sẽ bị lưu vào lịch sử trình duyệt, log truy cập của
// server/proxy trung gian, và rò rỉ qua header Referer nếu trang callback vô
// tình tải bất kỳ tài nguyên bên thứ 3 nào — ai đọc được các log/lịch sử đó
// có thể mạo danh người dùng suốt 7 ngày. Với cơ chế đổi mã, thứ lộ ra trên
// URL (nếu có) chỉ dùng được 1 LẦN DUY NHẤT trong 60 giây.
const oauthExchangeCodes = new Map() // code -> { token, expiresAt }
const OAUTH_CODE_TTL_MS = 60 * 1000

function createOAuthExchangeCode(token) {
  const code = crypto.randomBytes(32).toString("hex")
  oauthExchangeCodes.set(code, { token, expiresAt: Date.now() + OAUTH_CODE_TTL_MS })
  return code
}

setInterval(() => {
  const now = Date.now()
  for (const [code, entry] of oauthExchangeCodes) {
    if (entry.expiresAt < now) oauthExchangeCodes.delete(code)
  }
}, 60 * 1000).unref()

// Gửi mã xác thực email TRƯỚC khi tạo tài khoản (bước 1 của đăng ký)
const sendRegistrationCode = async (req, res) => {
  try {
    const { email } = req.body
    if (!email) {
      return res.status(400).json({ error: "Email là bắt buộc" })
    }

    const existingUser = await User.findByEmail(email)
    if (existingUser) {
      return res.status(400).json({ error: "Email này đã được sử dụng" })
    }

    const code = generateSixDigitCode()
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000) // 10 phút

    await RegistrationCode.upsert(email, code, expiresAt)

    const sent = await sendRegistrationCodeEmail(email, code)
    if (!sent) {
      return res.status(500).json({ error: "Không thể gửi email xác thực. Vui lòng thử lại." })
    }

    res.json({ message: "Mã xác thực đã được gửi đến email của bạn" })
  } catch (error) {
    console.error("Send registration code error:", error)
    res.status(500).json({ error: "Gửi mã xác thực thất bại" })
  }
}

const register = async (req, res) => {
  try {
    const { username, full_name, email, password, confirmPassword, code, phone, date_of_birth } = req.body

    // Validate registration data
    const validation = validateRegistrationData({ username, email, password, confirmPassword })
    if (!validation.valid) {
      return res.status(400).json({
        error: validation.errors.length === 1 ? validation.errors[0] : "Vui lòng kiểm tra các trường sau:",
        errors: validation.errors
      })
    }

    // Ngày sinh không bắt buộc (giống updateProfile) — chỉ cần không phải
    // ngày trong tương lai. Khai sớm ngay lúc đăng ký để chương trình ưu đãi
    // sinh nhật hoạt động được ngay, không phải đợi user tự vào /profile cập nhật.
    if (date_of_birth && new Date(date_of_birth) > new Date()) {
      return res.status(400).json({ error: "Ngày sinh không hợp lệ" })
    }

    if (!code) {
      return res.status(400).json({ error: "Vui lòng nhập mã xác thực đã gửi đến email" })
    }

    // Verify email code
    const codeResult = await RegistrationCode.verify(email, code)
    if (!codeResult.valid) {
      if (codeResult.reason === "LOCKED") {
        return res.status(429).json({ error: "Bạn đã nhập sai mã quá nhiều lần. Vui lòng yêu cầu gửi lại mã mới." })
      }
      return res.status(400).json({ error: "Mã xác thực không đúng hoặc đã hết hạn" })
    }

    // Check if user already exists
    const existingUser = await User.findByEmail(email)
    if (existingUser) {
      return res.status(400).json({ error: "Email này đã được sử dụng" })
    }

    // Create user (full_name/phone lưu lại đúng dữ liệu người dùng nhập ở form
    // đăng ký, trước đây các field này chỉ được validate rồi bị bỏ qua hoàn toàn)
    const userId = await User.create({ username, full_name, email, password, phone, date_of_birth: date_of_birth || null })

    // Xoá mã đã dùng
    await RegistrationCode.deleteByEmail(email)
    const user = await User.findById(userId)

    // Generate token
    const token = generateToken(user)

    // Log successful registration
    securityLogger.logAuth('register', {
      userId: user.id,
      username: user.username,
      ip: req.ip,
      userAgent: req.get('user-agent'),
      success: true
    })

    // Gửi email chào mừng (không chặn response nếu email lỗi)
    sendWelcomeEmail(user.email, user.username).catch(() => {})

    res.status(201).json({
      message: "Đăng ký thành công",
      token,
      user: {
        id: user.id,
        username: user.username,
        full_name: user.full_name,
        email: user.email,
        phone: user.phone || null,
        date_of_birth: user.date_of_birth || null,
        role: user.role,
      },
    })
  } catch (error) {
    console.error("Registration error:", error)
    res.status(500).json({ error: "Đăng ký thất bại. Vui lòng thử lại sau." })
  }
}

const login = async (req, res) => {
  try {
    const { email, password } = req.body

    // Validation
    if (!email || !password) {
      return res.status(400).json({ error: "Vui lòng nhập email và mật khẩu" })
    }

    // Find user
    const user = await User.findByEmail(email)
    if (!user) {
      securityLogger.logFailedLogin({
        username: email,
        ip: req.ip,
        userAgent: req.get('user-agent'),
        reason: 'User not found'
      })
      return res.status(401).json({ error: "Email hoặc mật khẩu không đúng" })
    }

    // Check if user is blocked
    if (user.is_blocked) {
      securityLogger.logFailedLogin({
        username: email,
        ip: req.ip,
        userAgent: req.get('user-agent'),
        reason: 'Account blocked'
      })
      return res.status(403).json({ error: "Tài khoản của bạn đã bị khoá" })
    }

    // Verify password
    const isValidPassword = await User.verifyPassword(password, user.password)
    if (!isValidPassword) {
      securityLogger.logFailedLogin({
        username: email,
        ip: req.ip,
        userAgent: req.get('user-agent'),
        reason: 'Invalid password'
      })
      return res.status(401).json({ error: "Email hoặc mật khẩu không đúng" })
    }

    // Generate token
    const token = generateToken(user)

    // Log successful login
    securityLogger.logAuth('login', {
      userId: user.id,
      username: user.username,
      ip: req.ip,
      userAgent: req.get('user-agent'),
      success: true
    })

    res.json({
      message: "Đăng nhập thành công",
      token,
      user: {
        id: user.id,
        username: user.username,
        full_name: user.full_name,
        email: user.email,
        phone: user.phone || null,
        role: user.role,
        google_id: user.google_id || null,
      },
    })
  } catch (error) {
    console.error("Login error:", error)
    res.status(500).json({ error: "Đăng nhập thất bại" })
  }
}

const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id)

    // Quản lý chi nhánh cần biết mình phụ trách rạp NÀO — hiển thị ngay trên
    // bảng quản trị, tránh tình trạng nhìn giao diện không phân biệt được với
    // admin. Chỉ truy vấn thêm khi thật sự là quản lý có gắn rạp.
    let cinemaName = null
    if (user.role === "cinema_manager" && user.cinema_id) {
      const [[row]] = await pool.query("SELECT name FROM cinemas WHERE id = ?", [user.cinema_id])
      cinemaName = row?.name || null
    }

    res.json({
      user: {
        id: user.id,
        username: user.username,
        full_name: user.full_name,
        email: user.email,
        phone: user.phone || null,
        date_of_birth: user.date_of_birth || null,
        role: user.role,
        google_id: user.google_id || null,
        cinema_id: user.cinema_id || null,
        cinema_name: cinemaName,
      },
    })
  } catch (error) {
    console.error("Get profile error:", error)
    res.status(500).json({ error: "Không thể lấy thông tin hồ sơ" })
  }
}

const updateProfile = async (req, res) => {
  try {
    const { username, email, phone, full_name, currentPassword, date_of_birth } = req.body
    const userId = req.user.id

    // Ngày sinh không được ở tương lai — chặn sớm để tránh dữ liệu vô lý
    // (voucher sinh nhật dựa vào trường này để tính tháng sinh thật).
    if (date_of_birth && new Date(date_of_birth) > new Date()) {
      return res.status(400).json({ error: "Ngày sinh không hợp lệ" })
    }

    // Validation
    if (!username || !email) {
      return res.status(400).json({ error: "Tên và email là bắt buộc" })
    }

    // Check if email is already used by another user
    const existingUser = await User.findByEmail(email)
    if (existingUser && existingUser.id !== userId) {
      return res.status(400).json({ error: "Email đã được sử dụng" })
    }

    // Đổi EMAIL là hành động nhạy cảm — nếu attacker chiếm được session tạm
    // thời (token rò rỉ, XSS, máy dùng chung...), đổi email tài khoản nạn
    // nhân sang 1 email attacker kiểm soát rồi đăng nhập lại bằng Google OAuth
    // với email đó sẽ biến quyền truy cập TẠM THỜI thành CHIẾM TÀI KHOẢN VĨNH
    // VIỄN (Google tự động liên kết tài khoản theo email khớp). Bắt buộc xác
    // thực lại mật khẩu hiện tại trước khi đổi email — cùng nguyên tắc
    // "step-up authentication" đã áp dụng cho đổi mật khẩu (sendChangePasswordCode).
    const currentUser = await User.findByIdWithSecrets(userId)
    if (email !== currentUser.email) {
      if (currentUser.google_id) {
        return res.status(400).json({ error: "Tài khoản đăng nhập bằng Google không thể tự đổi email" })
      }
      if (!currentPassword) {
        return res.status(400).json({ error: "Vui lòng nhập mật khẩu hiện tại để đổi email" })
      }
      const isValidPassword = await User.verifyPassword(currentPassword, currentUser.password)
      if (!isValidPassword) {
        return res.status(401).json({ error: "Mật khẩu hiện tại không đúng" })
      }
    }

    // Update user
    await User.updateProfile(userId, { username, email, phone, full_name, date_of_birth })

    const updatedUser = await User.findById(userId)

    res.json({
      message: "Cập nhật thông tin thành công",
      user: {
        id: updatedUser.id,
        username: updatedUser.username,
        full_name: updatedUser.full_name,
        email: updatedUser.email,
        phone: updatedUser.phone || null,
        date_of_birth: updatedUser.date_of_birth || null,
        role: updatedUser.role,
      },
    })
  } catch (error) {
    console.error("Update profile error:", error)
    res.status(500).json({ error: "Cập nhật thất bại" })
  }
}

// Bước 1: xác minh mật khẩu hiện tại rồi gửi mã xác thực về email
const sendChangePasswordCode = async (req, res) => {
  try {
    const { currentPassword } = req.body
    const userId = req.user.id

    if (!currentPassword) {
      return res.status(400).json({ error: "Vui lòng nhập mật khẩu hiện tại" })
    }

    const user = await User.findByIdWithSecrets(userId)

    if (user.google_id) {
      return res.status(400).json({ error: "Tài khoản Google không thể đổi mật khẩu" })
    }

    const isValidPassword = await User.verifyPassword(currentPassword, user.password)
    if (!isValidPassword) {
      return res.status(401).json({ error: "Mật khẩu hiện tại không đúng" })
    }

    const code = generateSixDigitCode()
    const resetToken = crypto.randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000) // 10 phút

    await User.saveResetCode(userId, code, resetToken, expiresAt)

    const sent = await sendChangePasswordCodeEmail(user.email, code)
    if (!sent) {
      return res.status(500).json({ error: "Không thể gửi email xác thực. Vui lòng thử lại." })
    }

    res.json({ message: "Mã xác thực đã được gửi đến email của bạn" })
  } catch (error) {
    console.error("Send change-password code error:", error)
    res.status(500).json({ error: "Gửi mã xác thực thất bại" })
  }
}

// Bước 2: xác minh mã + cập nhật mật khẩu mới
const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword, code } = req.body
    const userId = req.user.id

    // Validation
    if (!currentPassword || !newPassword || !code) {
      return res.status(400).json({ error: "Mật khẩu hiện tại, mật khẩu mới và mã xác thực là bắt buộc" })
    }

    // Validate new password strength
    const passwordCheck = isStrongPassword(newPassword)
    if (!passwordCheck.valid) {
      const errors = []
      if (!passwordCheck.minLength) errors.push('Mật khẩu phải có ít nhất 8 ký tự')
      if (!passwordCheck.hasUpperCase) errors.push('Mật khẩu phải có ít nhất 1 chữ hoa')
      if (!passwordCheck.hasLowerCase) errors.push('Mật khẩu phải có ít nhất 1 chữ thường')
      if (!passwordCheck.hasNumber) errors.push('Mật khẩu phải có ít nhất 1 số')
      if (!passwordCheck.hasSpecialChar) errors.push('Mật khẩu phải có ít nhất 1 ký tự đặc biệt (!@#$%^&*...)')
      return res.status(400).json({ error: errors.join(', ') })
    }

    // Get user and verify current password
    const user = await User.findByIdWithSecrets(userId)

    // Google OAuth users do not have a password
    if (user.google_id) {
      return res.status(400).json({ error: "Tài khoản Google không thể đổi mật khẩu" })
    }

    const isValidPassword = await User.verifyPassword(currentPassword, user.password)
    if (!isValidPassword) {
      return res.status(401).json({ error: "Mật khẩu hiện tại không đúng" })
    }

    // Verify email code
    const isValidCode = await User.verifyResetCode(userId, code)
    if (!isValidCode) {
      return res.status(400).json({ error: "Mã xác thực không đúng hoặc đã hết hạn" })
    }

    // Update password
    await User.updatePassword(userId, newPassword)
    await User.clearResetCode(userId)
    // Thu hồi MỌI token cũ (kể cả token đang dùng cho chính request này) —
    // đổi mật khẩu thường là vì nghi ngờ bị lộ, nên các phiên đăng nhập cũ
    // (kể cả trên thiết bị khác) phải hết hiệu lực ngay, không chờ hết hạn 7
    // ngày. Frontend đã tự logout + yêu cầu đăng nhập lại sau bước này.
    await User.incrementTokenVersion(userId)

    res.json({ message: "Đổi mật khẩu thành công" })
  } catch (error) {
    console.error("Change password error:", error)
    res.status(500).json({ error: "Đổi mật khẩu thất bại" })
  }
}

const logout = async (req, res) => {
  try {
    // Tăng token_version — thu hồi NGAY token vừa dùng để gọi endpoint này
    // (và mọi token cũ khác chưa đăng xuất trên thiết bị khác), không chỉ dựa
    // vào việc frontend tự xoá token khỏi sessionStorage. Xem middleware/auth.js.
    await User.incrementTokenVersion(req.user.id)
    res.json({ message: "Đăng xuất thành công" })
  } catch (error) {
    console.error("Logout error:", error)
    res.status(500).json({ error: "Đăng xuất thất bại" })
  }
}

const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body

    if (!email) {
      return res.status(400).json({ error: "Email là bắt buộc" })
    }

    // Find user
    const user = await User.findByEmail(email)
    if (!user) {
      // Don't reveal if email exists for security
      return res.json({ message: "Nếu email tồn tại, mã xác thực đã được gửi" })
    }

    // Generate 6-digit reset code
    const resetCode = generateSixDigitCode()
    const resetToken = crypto.randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000) // 15 minutes

    // Save reset code to database
    await User.saveResetCode(user.id, resetCode, resetToken, expiresAt)

    // Send email — GIỮ NGUYÊN thông báo chung chung cho client dù gửi thành
    // công hay thất bại (không như sendRegistrationCode ở trên, vốn đã lộ sẵn
    // email tồn tại qua nhánh "Email này đã được sử dụng" nên trả 500 riêng
    // không sao) — route này đang cố tình PHÒNG NGỪA DÒ EMAIL (nhánh !user ở
    // trên cũng trả đúng message này), nếu trả lỗi khác riêng cho trường hợp
    // gửi thất bại sẽ vô tình tạo ra oracle: hễ SMTP có sự cố là mọi email CÓ
    // TỒN TẠI đều nhận 500 còn email không tồn tại luôn nhận 200. Log lỗi thật
    // to ở server để admin biết mà xử lý, còn client vẫn thấy đúng 1 câu.
    const sent = await sendResetPasswordEmail(email, resetCode)
    if (!sent) {
      console.error(`⚠️ Email reset mật khẩu KHÔNG gửi được cho ${email} — user sẽ chờ mã không bao giờ tới.`)
    }

    res.json({ message: "Mã xác thực đã được gửi đến email của bạn" })
  } catch (error) {
    console.error("Forgot password error:", error)
    res.status(500).json({ error: "Gửi mã xác thực thất bại" })
  }
}

const resetPassword = async (req, res) => {
  try {
    const { email, resetCode, newPassword } = req.body

    if (!email || !resetCode || !newPassword) {
      return res.status(400).json({ error: "Tất cả các trường là bắt buộc" })
    }

    const passwordCheck = isStrongPassword(newPassword)
    if (!passwordCheck.valid) {
      const errors = []
      if (!passwordCheck.minLength) errors.push('Mật khẩu phải có ít nhất 8 ký tự')
      if (!passwordCheck.hasUpperCase) errors.push('Mật khẩu phải có ít nhất 1 chữ hoa')
      if (!passwordCheck.hasLowerCase) errors.push('Mật khẩu phải có ít nhất 1 chữ thường')
      if (!passwordCheck.hasNumber) errors.push('Mật khẩu phải có ít nhất 1 số')
      if (!passwordCheck.hasSpecialChar) errors.push('Mật khẩu phải có ít nhất 1 ký tự đặc biệt (!@#$%^&*...)')
      return res.status(400).json({ error: errors.join(', ') })
    }

    // Find user and verify reset code
    const user = await User.findByEmail(email)
    if (!user) {
      return res.status(400).json({ error: "Email không tồn tại" })
    }

    // Verify reset code
    const isValidCode = await User.verifyResetCode(user.id, resetCode)
    if (!isValidCode) {
      return res.status(400).json({ error: "Mã xác thực không đúng hoặc đã hết hạn" })
    }

    // Update password
    await User.updatePassword(user.id, newPassword)

    // Clear reset code
    await User.clearResetCode(user.id)

    // Đặt lại mật khẩu qua quên mật khẩu thường là do lo ngại tài khoản bị
    // chiếm — thu hồi mọi token cũ (nếu kẻ tấn công đang có 1 token hợp lệ từ
    // trước, token đó phải mất tác dụng ngay sau khi chủ tài khoản lấy lại quyền).
    await User.incrementTokenVersion(user.id)

    res.json({ message: "Đặt lại mật khẩu thành công" })
  } catch (error) {
    console.error("Reset password error:", error)
    res.status(500).json({ error: "Đặt lại mật khẩu thất bại" })
  }
}

const googleAuth = (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    // Nút "Google" ở frontend điều hướng CẢ TRANG (window.location.href) tới
    // route này, không phải fetch — trả JSON thô ở đây từng khiến user thấy
    // nguyên 1 trang JSON lỗi thay vì quay lại UI. Redirect sang /auth/callback
    // (trang đã có sẵn bảng thông báo lỗi + tự chuyển về /login sau 3s) để có
    // trải nghiệm nhất quán với các nhánh lỗi khác của luồng Google OAuth.
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000"
    return res.redirect(`${frontendUrl}/auth/callback?error=google_not_configured`)
  }

  const callbackUrl =
    process.env.GOOGLE_CALLBACK_URL || "http://localhost:5000/api/auth/google/callback"

  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: callbackUrl,
    response_type: "code",
    scope: "openid email profile",
    access_type: "offline",
    prompt: "select_account",
    state: isSafeReturnPath(req.query.returnTo) ? req.query.returnTo : "/",
  })

  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`)
}

const googleCallback = async (req, res) => {
  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000"

  try {
    const { code, state, error } = req.query

    if (error || !code) {
      return res.redirect(`${frontendUrl}/auth/callback?error=google_cancelled`)
    }

    const callbackUrl =
      process.env.GOOGLE_CALLBACK_URL || "http://localhost:5000/api/auth/google/callback"

    // Exchange authorization code for access token
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: callbackUrl,
        grant_type: "authorization_code",
      }).toString(),
    })

    if (!tokenRes.ok) {
      console.error("Google token exchange failed:", await tokenRes.text())
      return res.redirect(`${frontendUrl}/auth/callback?error=google_token_failed`)
    }

    const tokens = await tokenRes.json()

    // Get user info from Google
    const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    })

    if (!userInfoRes.ok) {
      return res.redirect(`${frontendUrl}/auth/callback?error=google_userinfo_failed`)
    }

    const googleUser = await userInfoRes.json()
    const { id: googleId, email, name, picture, verified_email: verifiedEmail } = googleUser

    if (!email) {
      return res.redirect(`${frontendUrl}/auth/callback?error=google_no_email`)
    }

    // Find or create user in database
    let user
    try {
      user = await User.findOrCreateGoogleUser({
        googleId,
        email,
        username: name || email.split("@")[0],
        fullName: name || null,
        avatarUrl: picture,
        verifiedEmail: verifiedEmail === true,
      })
    } catch (err) {
      if (err.code === "EMAIL_NOT_VERIFIED") {
        securityLogger.logAuth("google_oauth", {
          username: email, ip: req.ip, userAgent: req.get("user-agent"),
          success: false, reason: "email_not_verified_by_google",
        })
        return res.redirect(`${frontendUrl}/auth/callback?error=google_email_not_verified`)
      }
      throw err
    }

    if (!user) {
      return res.redirect(`${frontendUrl}/auth/callback?error=user_creation_failed`)
    }

    if (user.is_blocked) {
      return res.redirect(`${frontendUrl}/auth/callback?error=account_blocked`)
    }

    const token = generateToken(user)

    securityLogger.logAuth("google_oauth", {
      userId: user.id,
      username: user.username,
      ip: req.ip,
      userAgent: req.get("user-agent"),
      success: true,
    })

    const returnTo = isSafeReturnPath(state) ? state : "/"
    const exchangeCode = createOAuthExchangeCode(token)
    res.redirect(
      `${frontendUrl}/auth/callback?code=${exchangeCode}&returnTo=${encodeURIComponent(returnTo)}`
    )
  } catch (err) {
    console.error("Google OAuth callback error:", err)
    res.redirect(`${(process.env.FRONTEND_URL || "http://localhost:3000")}/auth/callback?error=google_auth_failed`)
  }
}

// Đổi mã trao đổi (exchange code, dùng 1 lần) sau OAuth redirect thành JWT
// thật — tách khỏi URL để token không bị lưu vào lịch sử trình duyệt/log.
const exchangeGoogleCode = async (req, res) => {
  const { code } = req.body
  if (!code || typeof code !== "string") {
    return res.status(400).json({ error: "code là bắt buộc" })
  }
  const entry = oauthExchangeCodes.get(code)
  oauthExchangeCodes.delete(code) // dùng 1 lần — xoá ngay bất kể hợp lệ hay không
  if (!entry || entry.expiresAt < Date.now()) {
    return res.status(400).json({ error: "Mã đăng nhập không hợp lệ hoặc đã hết hạn" })
  }
  return res.json({ token: entry.token })
}

module.exports = {
  register,
  sendRegistrationCode,
  login,
  getProfile,
  updateProfile,
  changePassword,
  sendChangePasswordCode,
  logout,
  forgotPassword,
  resetPassword,
  googleAuth,
  googleCallback,
  exchangeGoogleCode,
}
