jest.mock('../config/database', () => ({ pool: { execute: jest.fn() } }))

const { pool } = require('../config/database')
const RegistrationCode = require('../models/RegistrationCode')

describe('RegistrationCode.verify', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('returns NOT_FOUND when no code was ever requested for this email', async () => {
    pool.execute.mockResolvedValueOnce([[]])

    const result = await RegistrationCode.verify('nobody@example.com', '123456')

    expect(result).toEqual({ valid: false, reason: 'NOT_FOUND' })
  })

  test('returns LOCKED once attempts has reached the max, without checking the code', async () => {
    pool.execute.mockResolvedValueOnce([[{
      code: '123456', expires_at: new Date(Date.now() + 60_000), attempts: 5,
    }]])

    const result = await RegistrationCode.verify('a@b.com', '123456')

    expect(result).toEqual({ valid: false, reason: 'LOCKED' })
    // Chỉ 1 lệnh SELECT — không có UPDATE tăng attempts nữa vì đã khoá
    expect(pool.execute).toHaveBeenCalledTimes(1)
  })

  test('returns EXPIRED for a code past its expiry, without incrementing attempts', async () => {
    pool.execute.mockResolvedValueOnce([[{
      code: '123456', expires_at: new Date(Date.now() - 60_000), attempts: 0,
    }]])

    const result = await RegistrationCode.verify('a@b.com', '999999')

    expect(result).toEqual({ valid: false, reason: 'EXPIRED' })
    expect(pool.execute).toHaveBeenCalledTimes(1)
  })

  test('increments attempts on a wrong code and reports WRONG_CODE', async () => {
    pool.execute
      .mockResolvedValueOnce([[{
        code: '123456', expires_at: new Date(Date.now() + 60_000), attempts: 2,
      }]])
      .mockResolvedValueOnce([{}])

    const result = await RegistrationCode.verify('a@b.com', '000000')

    expect(result).toEqual({ valid: false, reason: 'WRONG_CODE' })
    expect(pool.execute).toHaveBeenCalledTimes(2)
    expect(pool.execute.mock.calls[1][0]).toMatch(/UPDATE registration_codes SET attempts/)
  })

  test('returns valid: true for a correct, unexpired, unlocked code', async () => {
    pool.execute.mockResolvedValueOnce([[{
      code: '123456', expires_at: new Date(Date.now() + 60_000), attempts: 1,
    }]])

    const result = await RegistrationCode.verify('a@b.com', '123456')

    expect(result).toEqual({ valid: true })
  })
})

describe('RegistrationCode.upsert', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('resets attempts to 0 when a new code is issued', async () => {
    pool.execute.mockResolvedValue([{}])

    await RegistrationCode.upsert('a@b.com', '123456', new Date())

    expect(pool.execute.mock.calls[0][0]).toMatch(/attempts = 0/)
  })
})
