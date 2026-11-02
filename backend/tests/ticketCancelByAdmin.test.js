jest.mock('../config/database', () => ({ pool: { getConnection: jest.fn() } }))
// revokePoints chỉ chạm tới khi payment_status='paid' — mock riêng để tránh
// gọi thật vào points.service (nó dùng connection.query, mockConnection ở
// đây chỉ định nghĩa .execute) và giữ các test này tập trung đúng vào SQL
// huỷ vé/hoàn ghế của Ticket.cancelByAdmin, không phụ thuộc points.service.
jest.mock('../services/points.service', () => ({ revokePoints: jest.fn().mockResolvedValue({ revoked: false }) }))

const { pool } = require('../config/database')
const Ticket = require('../models/Ticket')

function mockConnection({ ticketRow, seatCount, redemptions = [] }) {
  const calls = []
  const connection = {
    beginTransaction: jest.fn(),
    commit: jest.fn(),
    rollback: jest.fn(),
    release: jest.fn(),
    execute: jest.fn((sql, params) => {
      calls.push({ sql, params })
      // Truy vấn nay JOIN showtimes để lấy cinema_id + combo_items (hoàn kho bắp nước)
      if (sql.includes('FROM tickets t JOIN showtimes s') && sql.includes('booking_reference')) {
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

describe('Ticket.cancelByAdmin', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('returns NOT_FOUND when the booking reference does not exist', async () => {
    const { connection } = mockConnection({ ticketRow: null })

    const result = await Ticket.cancelByAdmin('BK-NOPE')

    expect(result).toEqual({ ok: false, reason: 'NOT_FOUND' })
    expect(connection.commit).toHaveBeenCalled()
  })

  test('returns ALREADY_CANCELLED without touching seats again', async () => {
    const { connection, calls } = mockConnection({
      ticketRow: { id: 5, showtime_id: 9, booking_status: 'cancelled', payment_status: 'paid' },
    })

    const result = await Ticket.cancelByAdmin('BK-1')

    expect(result).toEqual({ ok: false, reason: 'ALREADY_CANCELLED' })
    expect(calls.some((c) => c.sql.includes('UPDATE showtimes'))).toBe(false)
  })

  test('marks the ticket cancelled and releases its exact seat count back to the showtime', async () => {
    const { connection, calls } = mockConnection({
      ticketRow: { id: 5, showtime_id: 9, booking_status: 'confirmed', payment_status: 'pending' },
      seatCount: 3,
    })

    const result = await Ticket.cancelByAdmin('BK-1')

    expect(result).toEqual({ ok: true })
    const updateTickets = calls.find((c) => c.sql.includes('UPDATE tickets'))
    expect(updateTickets.params).toEqual(['pending', 5])
    const updateShowtimes = calls.find((c) => c.sql.includes('UPDATE showtimes'))
    expect(updateShowtimes.params).toEqual([3, 9])
    expect(connection.commit).toHaveBeenCalled()
    expect(connection.release).toHaveBeenCalled()
  })

  test('cancelling an already-PAID booking also flips payment_status to refunded', async () => {
    const { calls } = mockConnection({
      ticketRow: { id: 5, showtime_id: 9, booking_status: 'confirmed', payment_status: 'paid' },
      seatCount: 3,
    })

    const result = await Ticket.cancelByAdmin('BK-1')

    expect(result).toEqual({ ok: true })
    const updateTickets = calls.find((c) => c.sql.includes('UPDATE tickets'))
    expect(updateTickets.params).toEqual(['refunded', 5])
  })
})
