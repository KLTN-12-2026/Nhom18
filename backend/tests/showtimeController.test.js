const httpMocks = require('node-mocks-http')
const ShowtimeController = require('../controllers/showtimeController')

jest.mock('../models/Showtime')
jest.mock('../models/Movie')
jest.mock('../models/Cinema')
// PHẢI mock cả SeatLock: getShowtimeById gọi SeatLock.getLockedSeatsWithOwner()
// song với 2 model kia (showtimeController.js:12). Thiếu mock này thì test mở
// connection MySQL THẬT — đó chính là lý do `npm test` chạy xong không tự thoát
// và jest báo "worker process has failed to exit gracefully" (open handle
// TCPWRAP trỏ về SeatLock.js). Mock ở đây đúng hơn là thêm --forceExit, vì
// unit test controller lẽ ra không được phụ thuộc vào database đang chạy.
jest.mock('../models/SeatLock')

const Showtime = require('../models/Showtime')
const Movie = require('../models/Movie')
const Cinema = require('../models/Cinema')
const SeatLock = require('../models/SeatLock')

describe('showtimeController', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    // Trả mảng rỗng thay vì undefined — controller gọi .catch() lên kết quả nên
    // bắt buộc phải là Promise.
    // Trả về dạng ĐẦY ĐỦ (có user_id/session_id) vì controller nay phải tách
    // khoá của chính người hỏi ra khỏi khoá của người khác.
    SeatLock.getLockedSeatsWithOwner.mockResolvedValue([])
  })

  test('getShowtimeById returns 404 when not found', async () => {
    const req = httpMocks.createRequest({ method: 'GET', params: { id: 999 } })
    const res = httpMocks.createResponse()

    Showtime.findById.mockResolvedValue(null)

    await ShowtimeController.getShowtimeById(req, res)

    expect(res.statusCode).toBe(404)
  })

  test('getShowtimeById returns showtime with nested movie and cinema', async () => {
    const req = httpMocks.createRequest({ method: 'GET', params: { id: 1 } })
    const res = httpMocks.createResponse()

    Showtime.findById.mockResolvedValue({ id: 1, movie_id: 2, cinema_id: 3 })
    Movie.findById.mockResolvedValue({ id: 2, title: 'Test Movie' })
    Cinema.findById.mockResolvedValue({ id: 3, name: 'Test Cinema' })
    Showtime.getBookedSeats = jest.fn().mockResolvedValue(['A1'])

    await ShowtimeController.getShowtimeById(req, res)

    expect(res.statusCode).toBe(200)
    const data = res._getJSONData()
    expect(data.showtime).toBeDefined()
    expect(data.showtime.movie).toBeDefined()
    expect(data.showtime.cinema).toBeDefined()
  })
})
