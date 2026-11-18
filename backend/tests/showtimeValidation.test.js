/**
 * Bộ luật vật lý của một suất chiếu (utils/showtimeValidation).
 *
 * Cả 5 trường hợp dưới ĐỀU TỪNG ĐƯỢC API CHẤP NHẬN trên máy thật trước khi có
 * lớp kiểm tra này — nên test ở đây không phải viết cho đủ, mà để 5 lỗ hổng đó
 * không âm thầm mở lại. Giả lập pool để test chạy được không cần MySQL.
 */
jest.mock('../config/database', () => ({ pool: { query: jest.fn() } }))

const { pool } = require('../config/database')
const { validateShowtimeSlot } = require('../utils/showtimeValidation')

// Ngày tương lai cố định rơi vào THỨ TƯ (ngày thường) để giờ mở cửa không phụ
// thuộc luật cuối tuần — 2027-06-16 là thứ Tư.
const NGAY = '2027-06-16'
const PHIM = { id: 7, title: 'Phim thử', duration: 120 }
const PHONG = { id: 3, room_name: 'Phòng 1', cinema_id: 1, total_seats: 150, is_active: 1 }

/**
 * Định tuyến câu query theo nội dung SQL thay vì theo thứ tự gọi — thứ tự sẽ
 * đổi mỗi lần refactor validator, còn ý nghĩa từng câu thì không.
 */
function moPool({ phim = PHIM, phong = PHONG, trungGio = null, dsPhong = [PHONG] } = {}) {
  pool.query.mockImplementation(async (sql) => {
    if (sql.includes('FROM movies')) return [[phim].filter(Boolean)]
    if (sql.includes('FROM rooms WHERE id')) return [[phong].filter(Boolean)]
    if (sql.includes('FROM rooms')) return [dsPhong]
    if (sql.includes('FROM showtimes')) return [trungGio ? [trungGio] : []]
    return [[]]
  })
}

const gui = (ghiDe = {}) => validateShowtimeSlot({
  movieId: PHIM.id, cinemaId: 1, roomId: PHONG.id,
  showDate: NGAY, showTime: '14:00', totalSeats: 100, price: 90000, ...ghiDe,
})

beforeEach(() => { jest.clearAllMocks() })

describe('validateShowtimeSlot', () => {
  test('chấp nhận suất chiếu hợp lệ', async () => {
    moPool()
    const r = await gui()
    expect(r.ok).toBe(true)
    expect(r.roomId).toBe(PHONG.id)
    expect(r.totalSeats).toBe(100)
  })

  test('từ chối phòng thuộc rạp khác', async () => {
    moPool({ phong: { ...PHONG, cinema_id: 2 } })
    const r = await gui()
    expect(r.ok).toBe(false)
    expect(r.status).toBe(400)
    expect(r.error).toMatch(/không thuộc rạp/i)
  })

  test('từ chối khi phòng đang chiếu phim khác chồng giờ', async () => {
    // Suất sẵn có 13:00 phim 120 phút -> bận tới 15:00 (+20 phút dọn phòng),
    // nên 14:00 phải bị chặn dù KHÔNG trùng khít giờ bắt đầu.
    moPool({ trungGio: { id: 99, show_time: '13:00:00', title: 'Phim đang chiếu', duration: 120 } })
    const r = await gui()
    expect(r.ok).toBe(false)
    expect(r.status).toBe(409)
    expect(r.error).toMatch(/đang chiếu/i)
  })

  test('từ chối bán nhiều vé hơn sức chứa phòng', async () => {
    moPool()
    const r = await gui({ totalSeats: 999 })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/150 ghế/)
  })

  test('mặc định lấy đúng sức chứa phòng khi không truyền số ghế', async () => {
    moPool()
    const r = await gui({ totalSeats: undefined })
    expect(r.ok).toBe(true)
    expect(r.totalSeats).toBe(PHONG.total_seats)
  })

  test('từ chối giá vé ngoài khoảng hợp lệ', async () => {
    moPool()
    expect((await gui({ price: 1 })).ok).toBe(false)
    expect((await gui({ price: 99000000 })).ok).toBe(false)
    expect((await gui({ price: 90000 })).ok).toBe(true)
  })

  test('từ chối suất chiếu ở thời điểm đã qua', async () => {
    moPool()
    const r = await gui({ showDate: '2020-01-01' })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/đã qua/i)
  })

  test('từ chối phim kết thúc sau giờ đóng cửa', async () => {
    moPool({ phim: { ...PHIM, duration: 195 } })
    const r = await gui({ showTime: '22:30' })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/hoạt động/i)
  })

  test('tự chọn phòng trống khác khi không chỉ định phòng', async () => {
    const phongBan = { ...PHONG, id: 3, room_name: 'Phòng bận' }
    const phongTrong = { id: 4, room_name: 'Phòng trống', cinema_id: 1, total_seats: 120, is_active: 1 }
    pool.query.mockImplementation(async (sql, params) => {
      if (sql.includes('FROM movies')) return [[PHIM]]
      if (sql.includes('FROM rooms WHERE id')) return [[phongBan]]
      if (sql.includes('FROM rooms')) return [[phongBan, phongTrong]]
      // chỉ phòng 3 mới bận
      if (sql.includes('FROM showtimes')) {
        return [params[0] === 3 ? [{ id: 9, show_time: '13:00:00', title: 'X', duration: 120 }] : []]
      }
      return [[]]
    })
    const r = await gui({ roomId: null, totalSeats: undefined })
    expect(r.ok).toBe(true)
    expect(r.roomId).toBe(4)
    expect(r.totalSeats).toBe(120)
  })

  test('báo hết phòng khi mọi phòng đều bận', async () => {
    moPool({ trungGio: { id: 9, show_time: '13:00:00', title: 'X', duration: 120 } })
    const r = await gui({ roomId: null })
    expect(r.ok).toBe(false)
    expect(r.status).toBe(409)
  })
})
