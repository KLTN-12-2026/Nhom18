const httpMocks = require('node-mocks-http')

jest.mock('../models/Ticket')
jest.mock('../models/Cinema')
jest.mock('../models/Showtime')
// updateShowtime/createShowtime nay goi validateShowtimeSlot — mot don vi RIENG
// co test rieng (showtimeValidation.test.js) va can DB that (tra phim/phong/
// suat trung gio). Day la test cua controller nen gia lap no o trang thai "hop
// le" de van kiem tra dung phan logic cua controller: chan doi ngay/gio khi da
// ban ve, ghi lai so ghe... Khong gia lap thi moi test o day tra 400 vi khong
// co DB, che mat chinh thu can kiem tra.
jest.mock('../utils/showtimeValidation', () => ({
  validateShowtimeSlot: jest.fn(async ({ roomId, totalSeats }) => ({
    ok: true, roomId: roomId ?? 1, roomName: 'Phòng test', totalSeats: Number(totalSeats), duration: 120,
  })),
  MIN_TICKET_PRICE: 20000,
  MAX_TICKET_PRICE: 1000000,
}))

const Ticket = require('../models/Ticket')
const Cinema = require('../models/Cinema')
const Showtime = require('../models/Showtime')
const AdminController = require('../controllers/adminController')

describe('adminController.cancelBooking', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('returns 404 when the booking reference does not exist', async () => {
    Ticket.cancelByAdmin.mockResolvedValue({ ok: false, reason: 'NOT_FOUND' })
    const req = httpMocks.createRequest({ method: 'POST', params: { reference: 'BK-NOPE' } })
    const res = httpMocks.createResponse()

    await AdminController.cancelBooking(req, res)

    expect(res.statusCode).toBe(404)
  })

  test('returns 400 when the booking was already cancelled', async () => {
    Ticket.cancelByAdmin.mockResolvedValue({ ok: false, reason: 'ALREADY_CANCELLED' })
    const req = httpMocks.createRequest({ method: 'POST', params: { reference: 'BK-1' } })
    const res = httpMocks.createResponse()

    await AdminController.cancelBooking(req, res)

    expect(res.statusCode).toBe(400)
  })

  test('returns 200 on a successful cancellation', async () => {
    Ticket.cancelByAdmin.mockResolvedValue({ ok: true })
    const req = httpMocks.createRequest({ method: 'POST', params: { reference: 'BK-1' } })
    const res = httpMocks.createResponse()

    await AdminController.cancelBooking(req, res)

    expect(res.statusCode).toBe(200)
  })
})

describe('adminController.deleteCinema', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  // An bảo toàn dữ liệu: rạp đã có suất chiếu/phòng thì KHÔNG được xoá cứng
  // (sẽ CASCADE xoá vé khách hàng) — chỉ được chuyển sang ngừng hoạt động.
  test('deactivates instead of hard-deleting a cinema that has rooms or showtimes', async () => {
    Cinema.hasUsage.mockResolvedValue(true)
    Cinema.update.mockResolvedValue(true)
    const req = httpMocks.createRequest({ method: 'DELETE', params: { id: '1' } })
    const res = httpMocks.createResponse()

    await AdminController.deleteCinema(req, res)

    expect(Cinema.update).toHaveBeenCalledWith('1', { is_active: false })
    expect(Cinema.delete).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(200)
  })

  test('hard-deletes a cinema with no rooms or showtimes', async () => {
    Cinema.hasUsage.mockResolvedValue(false)
    Cinema.delete.mockResolvedValue(true)
    const req = httpMocks.createRequest({ method: 'DELETE', params: { id: '2' } })
    const res = httpMocks.createResponse()

    await AdminController.deleteCinema(req, res)

    expect(Cinema.delete).toHaveBeenCalledWith('2')
    expect(res.statusCode).toBe(200)
  })

  test('returns 404 for a cinema that does not exist', async () => {
    Cinema.hasUsage.mockResolvedValue(false)
    Cinema.delete.mockResolvedValue(false)
    const req = httpMocks.createRequest({ method: 'DELETE', params: { id: '999' } })
    const res = httpMocks.createResponse()

    await AdminController.deleteCinema(req, res)

    expect(res.statusCode).toBe(404)
  })
})

describe('adminController.updateShowtime', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('returns 404 when the showtime does not exist', async () => {
    Showtime.findById.mockResolvedValue(null)
    const req = httpMocks.createRequest({ method: 'PUT', params: { id: '1' }, body: { price: 100000 } })
    const res = httpMocks.createResponse()

    await AdminController.updateShowtime(req, res)

    expect(res.statusCode).toBe(404)
  })

  // Bảo vệ khách đã mua vé: không cho đổi ngày/giờ/số ghế khi đã có vé bán ra.
  test('rejects a date/time change once tickets have been sold', async () => {
    Showtime.findById.mockResolvedValue({ id: 1, movie_id: 1, cinema_id: 1, room_id: 1, show_date: '2026-01-01', show_time: '19:00:00', price: 90000, total_seats: 100 })
    Showtime.hasTickets.mockResolvedValue(true)
    const req = httpMocks.createRequest({ method: 'PUT', params: { id: '1' }, body: { show_date: '2026-02-02' } })
    const res = httpMocks.createResponse()

    await AdminController.updateShowtime(req, res)

    expect(res.statusCode).toBe(400)
    expect(Showtime.update).not.toHaveBeenCalled()
  })

  test('allows a price-only change once tickets have been sold', async () => {
    Showtime.findById.mockResolvedValue({ id: 1, movie_id: 1, cinema_id: 1, room_id: 1, show_date: '2026-01-01', show_time: '19:00:00', price: 90000, total_seats: 100 })
    Showtime.hasTickets.mockResolvedValue(true)
    Showtime.update.mockResolvedValue(true)
    const req = httpMocks.createRequest({ method: 'PUT', params: { id: '1' }, body: { price: 120000 } })
    const res = httpMocks.createResponse()

    await AdminController.updateShowtime(req, res)

    expect(res.statusCode).toBe(200)
    expect(Showtime.update).toHaveBeenCalledWith('1', expect.objectContaining({ price: 120000, total_seats: 100 }))
  })

  test('allows a full update (date/time/seats) when no tickets have been sold', async () => {
    Showtime.findById.mockResolvedValue({ id: 1, movie_id: 1, cinema_id: 1, room_id: 1, show_date: '2026-01-01', show_time: '19:00:00', price: 90000, total_seats: 100 })
    Showtime.hasTickets.mockResolvedValue(false)
    Showtime.update.mockResolvedValue(true)
    Showtime.setAvailableSeats.mockResolvedValue(true)
    const req = httpMocks.createRequest({
      method: 'PUT', params: { id: '1' },
      body: { show_date: '2026-02-02', show_time: '20:00:00', price: 100000, total_seats: 150 },
    })
    const res = httpMocks.createResponse()

    await AdminController.updateShowtime(req, res)

    expect(res.statusCode).toBe(200)
    expect(Showtime.setAvailableSeats).toHaveBeenCalledWith('1', 150)
  })
})
