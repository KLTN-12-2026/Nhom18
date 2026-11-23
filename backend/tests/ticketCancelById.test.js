jest.mock('../config/database', () => ({ pool: { getConnection: jest.fn() } }))
// Xem chú thích tương tự trong ticketCancelByAdmin.test.js — cô lập khỏi
// points.service thật (dùng connection.query, không có trong mockConnection).
jest.mock('../services/points.service', () => ({ revokePoints: jest.fn().mockResolvedValue({ revoked: false }) }))

const { pool } = require('../config/database')
const Ticket = require('../models/Ticket')

// Suất chiếu xa trong tương lai — tránh vô tình chạm ngưỡng SELF_CANCEL_CUTOFF_MINUTES
// trong các test không cố tình kiểm tra giới hạn thời gian huỷ.
const FAR_FUTURE_SHOWTIME = { show_date: '2099-01-01', show_time: '20:00' }

function mockConnection({ ticketRow, seatCount, redemptions = [] }) {
  const calls = []
  const connection = {
    beginTransaction: jest.fn(),
    commit: jest.fn(),
    rollback: jest.fn(),
    release: jest.fn(),
    execute: jest.fn((sql, params) => {
      calls.push({ sql, params })
      if (sql.includes('FROM tickets t JOIN showtimes s')) {
        return [ticketRow ? [ticketRow] : []]
      }
      // Voucher.releaseForTicket — lượt dùng mã của vé bị huỷ
      if (sql.includes('FROM voucher_redemptions')) {
        return [redemptions]
      }
      if (sql.includes('SELECT COUNT(*) AS cnt')) {
        return [[{ cnt: seatCount }]]
      }
      return [{}]
    }),
  }
  pool.getConnection.mockResolvedValue(connection)
  return { connection, calls }
}

// Trước đây cancelTicket/cancelMyTicket dùng Ticket.cancel() + Showtime.incrementAvailableSeats()
// bằng 2 lệnh UPDATE rời nhau, không transaction. Ticket.cancelById() gộp lại thành 1 transaction
// (giống cancelByAdmin) và kiểm tra quyền sở hữu qua requireUserId khi cần.
describe('Ticket.cancelById', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('returns NOT_FOUND when the ticket id does not exist', async () => {
    mockConnection({ ticketRow: null })

    const result = await Ticket.cancelById(999)

    expect(result).toEqual({ ok: false, reason: 'NOT_FOUND' })
  })

  test('returns FORBIDDEN when requireUserId does not match the ticket owner', async () => {
    mockConnection({
      ticketRow: { id: 5, user_id: 42, showtime_id: 9, booking_status: 'confirmed', ...FAR_FUTURE_SHOWTIME },
    })

    const result = await Ticket.cancelById(5, { requireUserId: 1 })

    expect(result).toEqual({ ok: false, reason: 'FORBIDDEN' })
  })

  test('returns ALREADY_CANCELLED without touching seats again', async () => {
    const { calls } = mockConnection({
      ticketRow: { id: 5, user_id: 42, showtime_id: 9, booking_status: 'cancelled', ...FAR_FUTURE_SHOWTIME },
    })

    const result = await Ticket.cancelById(5, { requireUserId: 42 })

    expect(result).toEqual({ ok: false, reason: 'ALREADY_CANCELLED' })
    expect(calls.some((c) => c.sql.includes('UPDATE showtimes'))).toBe(false)
  })

  test('marks the ticket cancelled and releases its exact seat count back to the showtime, in one transaction', async () => {
    const { connection, calls } = mockConnection({
      ticketRow: { id: 5, user_id: 42, showtime_id: 9, booking_status: 'confirmed', payment_status: 'pending', ...FAR_FUTURE_SHOWTIME },
      seatCount: 2,
    })

    const result = await Ticket.cancelById(5, { requireUserId: 42 })

    expect(result).toEqual({ ok: true })
    const updateTickets = calls.find((c) => c.sql.includes('UPDATE tickets'))
    expect(updateTickets.params).toEqual(['pending', 5])
    const updateShowtimes = calls.find((c) => c.sql.includes('UPDATE showtimes'))
    expect(updateShowtimes.params).toEqual([2, 9])
    expect(connection.commit).toHaveBeenCalled()
    expect(connection.release).toHaveBeenCalled()
  })

  test('cancelling an already-PAID ticket also flips payment_status to refunded (so revenue reports and badges stay consistent)', async () => {
    const { calls } = mockConnection({
      ticketRow: { id: 5, user_id: 42, showtime_id: 9, booking_status: 'confirmed', payment_status: 'paid', ...FAR_FUTURE_SHOWTIME },
      seatCount: 2,
    })

    const result = await Ticket.cancelById(5, { requireUserId: 42 })

    expect(result).toEqual({ ok: true })
    const updateTickets = calls.find((c) => c.sql.includes('UPDATE tickets'))
    expect(updateTickets.params).toEqual(['refunded', 5])
  })

  test('allows cancelling without ownership check when requireUserId is omitted (admin route)', async () => {
    mockConnection({
      ticketRow: { id: 5, user_id: 42, showtime_id: 9, booking_status: 'confirmed', payment_status: 'pending', ...FAR_FUTURE_SHOWTIME },
      seatCount: 1,
    })

    const result = await Ticket.cancelById(5)

    expect(result).toEqual({ ok: true })
  })

  test('blocks self-cancel within the 2-hour cutoff before showtime', async () => {
    const soon = new Date(Date.now() + 30 * 60000) // 30 phút nữa
    const pad = (n) => String(n).padStart(2, '0')
    mockConnection({
      ticketRow: {
        id: 5, user_id: 42, showtime_id: 9, booking_status: 'confirmed', payment_status: 'paid',
        show_date: `${soon.getFullYear()}-${pad(soon.getMonth() + 1)}-${pad(soon.getDate())}`,
        show_time: `${pad(soon.getHours())}:${pad(soon.getMinutes())}`,
      },
    })

    const result = await Ticket.cancelById(5, { requireUserId: 42 })

    expect(result.ok).toBe(false)
    expect(result.reason).toBe('TOO_LATE')
  })

  test('admin cancel bypasses the 2-hour cutoff (requireUserId omitted)', async () => {
    const soon = new Date(Date.now() + 30 * 60000)
    const pad = (n) => String(n).padStart(2, '0')
    mockConnection({
      ticketRow: {
        id: 5, user_id: 42, showtime_id: 9, booking_status: 'confirmed', payment_status: 'paid',
        show_date: `${soon.getFullYear()}-${pad(soon.getMonth() + 1)}-${pad(soon.getDate())}`,
        show_time: `${pad(soon.getHours())}:${pad(soon.getMinutes())}`,
      },
      seatCount: 1,
    })

    const result = await Ticket.cancelById(5)

    expect(result).toEqual({ ok: true })
  })
})

// Lượt dùng mã giảm giá bị trừ ngay lúc TẠO ĐƠN; trước đây huỷ vé (kể cả vé
// bỏ dở bị job tự huỷ) không trả lại, khách mất mã vĩnh viễn.
describe('Ticket.cancelById — trả lại voucher', () => {
  beforeEach(() => jest.clearAllMocks())

  test('huỷ vé có dùng mã thì giảm used_count và xoá dòng ghi nhận, trong cùng transaction', async () => {
    const { connection, calls } = mockConnection({
      ticketRow: { id: 5, user_id: 42, showtime_id: 9, booking_status: 'confirmed', payment_status: 'pending', ...FAR_FUTURE_SHOWTIME },
      seatCount: 1,
      redemptions: [{ id: 77, voucher_id: 3 }],
    })

    const result = await Ticket.cancelById(5)

    expect(result).toEqual({ ok: true })
    const giam = calls.find((c) => c.sql.includes('UPDATE vouchers SET used_count = GREATEST(used_count - 1, 0)'))
    expect(giam.params).toEqual([3])
    const xoa = calls.find((c) => c.sql.includes('DELETE FROM voucher_redemptions'))
    expect(xoa.params).toEqual([77])
    expect(connection.commit).toHaveBeenCalled()
  })

  test('vé không dùng mã thì không đụng tới bảng vouchers', async () => {
    const { calls } = mockConnection({
      ticketRow: { id: 5, user_id: 42, showtime_id: 9, booking_status: 'confirmed', payment_status: 'pending', ...FAR_FUTURE_SHOWTIME },
      seatCount: 1,
    })

    await Ticket.cancelById(5)

    expect(calls.some((c) => c.sql.includes('UPDATE vouchers'))).toBe(false)
  })
})
