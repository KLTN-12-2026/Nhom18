const httpMocks = require('node-mocks-http')
const TicketController = require('../controllers/ticketController')

// Mocks for models and DB pool
jest.mock('../models/Ticket')
jest.mock('../models/Showtime')
jest.mock('../models/SeatLock')
jest.mock('../models/Combo')
jest.mock('../config/database', () => ({ pool: { execute: jest.fn() } }))

const Ticket = require('../models/Ticket')
const Showtime = require('../models/Showtime')
const SeatLock = require('../models/SeatLock')
const Combo = require('../models/Combo')

describe('ticketController.bookTicket', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('returns 400 for invalid payload', async () => {
    const req = httpMocks.createRequest({ method: 'POST', body: {} })
    const res = httpMocks.createResponse()

    await TicketController.bookTicket(req, res)

    expect(res.statusCode).toBe(400)
    const data = res._getJSONData()
    expect(data.error).toBeDefined()
  })

  test('books ticket when seats available', async () => {
    const req = httpMocks.createRequest({
      method: 'POST',
      body: { showtime_id: 1, seats: ['A1'], combo_items: [] },
      user: { id: 2 },
      sessionID: 'sess-1'
    })
    const res = httpMocks.createResponse()

    Showtime.findById.mockResolvedValue({ id: 1, available_seats: 10, price: 50000 })
    Combo.validateComboItems.mockResolvedValue({ valid: true })
    Combo.calculateComboTotal.mockResolvedValue(0)
    SeatLock.checkSeatsAvailable.mockResolvedValue({ available: true, lockedSeats: [], bookedSeats: [] })
    SeatLock.lockSeats.mockResolvedValue(true)
    // Mock the booking transaction (now consolidated in the Ticket model)
    Ticket.bookWithTransaction.mockResolvedValue(123)
    Ticket.findById.mockResolvedValue({ id: 123 })
    Showtime.updateAvailableSeats = jest.fn().mockResolvedValue(true)
    SeatLock.unlockSeats = jest.fn().mockResolvedValue(true)

    await TicketController.bookTicket(req, res)

    expect(res.statusCode).toBe(201)
    const data = res._getJSONData()
    expect(data.ticket).toBeDefined()
    expect(data.breakdown).toBeDefined()
  })
})
