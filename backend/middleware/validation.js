/**
 * Input validation and sanitization utilities
 * Prevents SQL injection, XSS, and validates data formats
 */

// Email validation
const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

// Password strength validation
const isStrongPassword = (password) => {
  // At least 8 characters, 1 uppercase, 1 lowercase, 1 number, 1 special character
  const minLength = password.length >= 8
  const hasUpperCase = /[A-Z]/.test(password)
  const hasLowerCase = /[a-z]/.test(password)
  const hasNumber = /[0-9]/.test(password)
  const hasSpecialChar = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)
  
  return {
    valid: minLength && hasUpperCase && hasLowerCase && hasNumber && hasSpecialChar,
    minLength,
    hasUpperCase,
    hasLowerCase,
    hasNumber,
    hasSpecialChar
  }
}

// Sanitize string input (prevent XSS)
const sanitizeString = (str) => {
  if (typeof str !== 'string') return str
  
  return str
    .replace(/[<>]/g, '') // Remove < and > to prevent HTML injection
    .trim()
    .slice(0, 1000) // Limit length
}

// Validate phone number (Vietnamese format)
const isValidPhone = (phone) => {
  if (!phone) return true // Phone is optional
  const phoneRegex = /^(0|\+84)[0-9]{9,10}$/
  return phoneRegex.test(phone.replace(/\s/g, ''))
}

// Validate booking data
const validateBookingData = (data) => {
  const errors = []
  
  if (!data.showtime_id || typeof data.showtime_id !== 'number') {
    errors.push('Showtime ID không hợp lệ')
  }
  
  if (!Array.isArray(data.seats) || data.seats.length === 0) {
    errors.push('Vui lòng chọn ít nhất 1 ghế')
  }
  
  if (data.seats && data.seats.length > 10) {
    errors.push('Không thể đặt quá 10 ghế trong 1 lần')
  }
  
  if (!data.total_amount || typeof data.total_amount !== 'number' || data.total_amount <= 0) {
    errors.push('Tổng tiền không hợp lệ')
  }
  
  // Validate seat codes format (should be like H5, A10, etc.)
  if (data.seats) {
    const invalidSeats = data.seats.filter(seat => {
      return typeof seat !== 'string' || !/^[A-Z][0-9]{1,2}$/.test(seat)
    })
    if (invalidSeats.length > 0) {
      errors.push(`Mã ghế không hợp lệ: ${invalidSeats.join(', ')}`)
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  }
}

// Validate registration data
const validateRegistrationData = (data) => {
  const errors = []
  
  if (!data.username || data.username.trim().length < 3) {
    errors.push('Tên người dùng phải có ít nhất 3 ký tự')
  }
  
  if (data.username && data.username.length > 100) {
    errors.push('Tên người dùng không được quá 100 ký tự')
  }
  
  if (!data.email || !isValidEmail(data.email)) {
    errors.push('Email không hợp lệ')
  }
  
  if (!data.password) {
    errors.push('Mật khẩu là bắt buộc')
  } else {
    const passwordCheck = isStrongPassword(data.password)
    if (!passwordCheck.valid) {
      if (!passwordCheck.minLength) errors.push('Mật khẩu phải có ít nhất 8 ký tự')
      if (!passwordCheck.hasUpperCase) errors.push('Mật khẩu phải có ít nhất 1 chữ hoa')
      if (!passwordCheck.hasLowerCase) errors.push('Mật khẩu phải có ít nhất 1 chữ thường')
      if (!passwordCheck.hasNumber) errors.push('Mật khẩu phải có ít nhất 1 số')
      if (!passwordCheck.hasSpecialChar) errors.push('Mật khẩu phải có ít nhất 1 ký tự đặc biệt (!@#$%^&*...)')
    }
  }
  
  if (data.confirmPassword && data.password !== data.confirmPassword) {
    errors.push('Mật khẩu xác nhận không khớp')
  }
  
  if (data.phone && !isValidPhone(data.phone)) {
    errors.push('Số điện thoại không hợp lệ')
  }
  
  return {
    valid: errors.length === 0,
    errors
  }
}

// Validate login data
const validateLoginData = (data) => {
  const errors = []
  
  if (!data.email || !isValidEmail(data.email)) {
    errors.push('Email không hợp lệ')
  }
  
  if (!data.password || data.password.length < 1) {
    errors.push('Mật khẩu là bắt buộc')
  }
  
  return {
    valid: errors.length === 0,
    errors
  }
}

// Validate movie data (admin)
const validateMovieData = (data) => {
  const errors = []
  
  if (!data.title || data.title.trim().length < 1) {
    errors.push('Tên phim là bắt buộc')
  }
  
  if (data.title && data.title.length > 255) {
    errors.push('Tên phim không được quá 255 ký tự')
  }
  
  if (data.duration && (typeof data.duration !== 'number' || data.duration <= 0 || data.duration > 500)) {
    errors.push('Thời lượng phim không hợp lệ (1-500 phút)')
  }
  
  if (data.rating && (typeof data.rating !== 'number' || data.rating < 0 || data.rating > 10)) {
    errors.push('Đánh giá phim phải từ 0-10')
  }
  
  return {
    valid: errors.length === 0,
    errors
  }
}

// Middleware to validate request body
const validateRequest = (validationFn) => {
  return (req, res, next) => {
    const result = validationFn(req.body)
    
    if (!result.valid) {
      return res.status(400).json({
        error: 'Dữ liệu không hợp lệ',
        details: result.errors
      })
    }
    
    // Sanitize string fields
    if (req.body.username) req.body.username = sanitizeString(req.body.username)
    if (req.body.email) req.body.email = req.body.email.toLowerCase().trim()
    
    next()
  }
}

module.exports = {
  isValidEmail,
  isStrongPassword,
  sanitizeString,
  isValidPhone,
  validateBookingData,
  validateRegistrationData,
  validateLoginData,
  validateMovieData,
  validateRequest
}
