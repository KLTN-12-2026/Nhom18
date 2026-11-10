const { body, param, query, validationResult } = require('express-validator')

// Validation error handler
const validate = (req, res, next) => {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Dữ liệu không hợp lệ',
      errors: errors.array().map(err => ({
        field: err.path,
        message: err.msg
      }))
    })
  }
  next()
}

// User validation rules
const validateRegister = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Email không hợp lệ'),
  body('username')
    .trim()
    .isLength({ min: 3, max: 50 })
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage('Tên đăng nhập phải từ 3-50 ký tự và chỉ chứa chữ, số, gạch dưới'),
  body('password')
    .isLength({ min: 8 })
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Mật khẩu phải có ít nhất 8 ký tự, bao gồm chữ hoa, chữ thường và số'),
  body('full_name')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Họ tên phải từ 2-100 ký tự'),
  body('phone')
    .optional()
    .matches(/^[0-9]{10,11}$/)
    .withMessage('Số điện thoại không hợp lệ'),
  validate
]

const validateLogin = [
  body('email')
    .trim()
    .isEmail()
    .normalizeEmail()
    .withMessage('Email không hợp lệ'),
  body('password')
    .notEmpty()
    .withMessage('Mật khẩu không được để trống'),
  validate
]

// Movie validation rules
const validateMovieId = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('ID phim không hợp lệ'),
  validate
]

const validateCreateMovie = [
  body('title')
    .trim()
    .isLength({ min: 1, max: 200 })
    .withMessage('Tiêu đề phim phải từ 1-200 ký tự'),
  body('description')
    .trim()
    .isLength({ min: 10, max: 2000 })
    .withMessage('Mô tả phim phải từ 10-2000 ký tự'),
  body('duration')
    .isInt({ min: 1, max: 500 })
    .withMessage('Thời lượng phim phải từ 1-500 phút'),
  body('genre')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Thể loại không hợp lệ'),
  // Nhãn phân loại tuổi hiện hành ở Việt Nam là P/K/T13/T16/T18/C — đúng như
  // dữ liệu thật trong DB. Danh sách cũ thiếu T13/T16/T18 nên bấm "Lưu" khi
  // sửa 32/41 phim đều bị trả 400. Giữ các nhãn cũ để không chặn dữ liệu cũ.
  body('rating')
    .trim()
    .isIn(['P', 'K', 'T13', 'T16', 'T18', 'C', 'G', 'PG', 'PG-13', 'R', 'NC-17', 'C13', 'C16', 'C18'])
    .withMessage('Phân loại tuổi không hợp lệ (P, K, T13, T16, T18, C)'),
  body('release_date')
    .isISO8601()
    .withMessage('Ngày phát hành không hợp lệ'),
  body('original_year')
    .optional({ values: 'falsy' })
    .isInt({ min: 1888, max: 2100 })
    .withMessage('Năm phát hành gốc phải từ 1888 đến 2100'),
  // Poster được phép là URL đầy đủ HOẶC đường dẫn ảnh trong /public (8 phim
  // đang dùng dạng "/john.jpg" — isURL() từ chối nên không sửa được các phim đó).
  // values:'falsy' để ô bỏ trống ("") không bị bắt lỗi — optional() mặc định
  // của express-validator v7 chỉ bỏ qua undefined.
  body('poster_url')
    .optional({ values: 'falsy' })
    .matches(/^(https?:\/\/|\/)\S+$/)
    .withMessage('Poster phải là URL (http/https) hoặc đường dẫn bắt đầu bằng /'),
  body('trailer_url')
    .optional({ values: 'falsy' })
    .isURL()
    .withMessage('URL trailer không hợp lệ'),
  validate
]

// Showtime validation rules
const validateShowtimeId = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('ID suất chiếu không hợp lệ'),
  validate
]

const validateCreateShowtime = [
  body('movie_id')
    .isInt({ min: 1 })
    .withMessage('ID phim không hợp lệ'),
  body('cinema_id')
    .isInt({ min: 1 })
    .withMessage('ID rạp không hợp lệ'),
  body('show_date')
    .isISO8601()
    .withMessage('Ngày chiếu không hợp lệ'),
  body('show_time')
    .matches(/^([01]\d|2[0-3]):([0-5]\d):([0-5]\d)$/)
    .withMessage('Giờ chiếu không hợp lệ (HH:MM:SS)'),
  body('price')
    .isFloat({ min: 0, max: 10000000 })
    .withMessage('Giá vé không hợp lệ'),
  validate
]

// Ticket validation rules
const validateCreateTicket = [
  body('showtime_id')
    .isInt({ min: 1 })
    .withMessage('ID suất chiếu không hợp lệ'),
  body('seats')
    .isArray({ min: 1, max: 10 })
    .withMessage('Phải chọn ít nhất 1 ghế và tối đa 10 ghế'),
  body('seats.*')
    .matches(/^[A-Z]\d{1,2}$/)
    .withMessage('Mã ghế không hợp lệ (VD: A1, B10)'),
  body('combo_id')
    .optional()
    .isInt({ min: 1 })
    .withMessage('ID combo không hợp lệ'),
  validate
]

// Payment validation rules
const validatePaymentCallback = [
  query('vnp_TxnRef')
    .notEmpty()
    .withMessage('Mã giao dịch không được để trống'),
  query('vnp_ResponseCode')
    .notEmpty()
    .withMessage('Mã phản hồi không được để trống'),
  validate
]

// Cinema validation rules
const validateCinemaId = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('ID rạp không hợp lệ'),
  validate
]

// Combo validation rules
const validateComboId = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('ID combo không hợp lệ'),
  validate
]

// Search and pagination validation
const validatePagination = [
  query('page')
    .optional()
    .isInt({ min: 1, max: 1000 })
    .withMessage('Số trang không hợp lệ'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Giới hạn không hợp lệ (1-100)'),
  validate
]

const validateSearch = [
  query('q')
    .trim()
    .isLength({ min: 1, max: 200 })
    .withMessage('Từ khóa tìm kiếm phải từ 1-200 ký tự'),
  validate
]

// Date range validation
const validateDateRange = [
  query('from_date')
    .optional()
    .isISO8601()
    .withMessage('Ngày bắt đầu không hợp lệ'),
  query('to_date')
    .optional()
    .isISO8601()
    .withMessage('Ngày kết thúc không hợp lệ'),
  validate
]

module.exports = {
  validate,
  validateRegister,
  validateLogin,
  validateMovieId,
  validateCreateMovie,
  validateShowtimeId,
  validateCreateShowtime,
  validateCreateTicket,
  validatePaymentCallback,
  validateCinemaId,
  validateComboId,
  validatePagination,
  validateSearch,
  validateDateRange
}
