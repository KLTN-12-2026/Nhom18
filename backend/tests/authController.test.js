const httpMocks = require('node-mocks-http')

jest.mock('../models/User')
jest.mock('../models/RegistrationCode')
jest.mock('../services/emailService', () => ({
  sendResetPasswordEmail: jest.fn().mockResolvedValue(true),
  sendWelcomeEmail: jest.fn().mockResolvedValue(true),
  sendRegistrationCodeEmail: jest.fn().mockResolvedValue(true),
  sendChangePasswordCodeEmail: jest.fn().mockResolvedValue(true),
}))
jest.mock('../middleware/securityLogger', () => ({
  SecurityLogger: jest.fn().mockImplementation(() => ({
    logAuth: jest.fn(),
    logFailedLogin: jest.fn(),
  })),
}))
jest.mock('../middleware/auth', () => ({
  generateToken: jest.fn(() => 'fake-jwt-token'),
}))

const User = require('../models/User')
const RegistrationCode = require('../models/RegistrationCode')
const AuthController = require('../controllers/authController')

describe('authController.login', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('returns 400 when email or password is missing', async () => {
    const req = httpMocks.createRequest({ method: 'POST', body: { email: 'a@b.com' } })
    const res = httpMocks.createResponse()

    await AuthController.login(req, res)

    expect(res.statusCode).toBe(400)
  })

  test('returns 401 for unknown email without revealing the reason', async () => {
    User.findByEmail.mockResolvedValue(null)
    const req = httpMocks.createRequest({ method: 'POST', body: { email: 'nope@b.com', password: 'x' } })
    const res = httpMocks.createResponse()

    await AuthController.login(req, res)

    expect(res.statusCode).toBe(401)
    const data = res._getJSONData()
    expect(data.error).toBe('Email hoặc mật khẩu không đúng')
  })

  test('returns 403 for a blocked account', async () => {
    User.findByEmail.mockResolvedValue({ id: 1, is_blocked: true, password: 'hash' })
    const req = httpMocks.createRequest({ method: 'POST', body: { email: 'a@b.com', password: 'x' } })
    const res = httpMocks.createResponse()

    await AuthController.login(req, res)

    expect(res.statusCode).toBe(403)
  })

  test('returns 401 for wrong password, same generic message as unknown email', async () => {
    User.findByEmail.mockResolvedValue({ id: 1, is_blocked: false, password: 'hash' })
    User.verifyPassword.mockResolvedValue(false)
    const req = httpMocks.createRequest({ method: 'POST', body: { email: 'a@b.com', password: 'wrong' } })
    const res = httpMocks.createResponse()

    await AuthController.login(req, res)

    expect(res.statusCode).toBe(401)
    expect(res._getJSONData().error).toBe('Email hoặc mật khẩu không đúng')
  })

  test('returns 200 with a token on valid credentials', async () => {
    User.findByEmail.mockResolvedValue({
      id: 1, username: 'thien', email: 'a@b.com', role: 'user', is_blocked: false, password: 'hash',
    })
    User.verifyPassword.mockResolvedValue(true)
    const req = httpMocks.createRequest({ method: 'POST', body: { email: 'a@b.com', password: 'right' } })
    const res = httpMocks.createResponse()

    await AuthController.login(req, res)

    expect(res.statusCode).toBe(200)
    const data = res._getJSONData()
    expect(data.token).toBe('fake-jwt-token')
    expect(data.user.email).toBe('a@b.com')
    // Mật khẩu (kể cả hash) không bao giờ được trả về client
    expect(data.user.password).toBeUndefined()
  })
})

describe('authController.register', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('returns 400 for weak/invalid registration data', async () => {
    const req = httpMocks.createRequest({
      method: 'POST',
      body: { username: '', email: 'not-an-email', password: '123', confirmPassword: '456', code: '111111' },
    })
    const res = httpMocks.createResponse()

    await AuthController.register(req, res)

    expect(res.statusCode).toBe(400)
  })

  test('returns 400 when verification code is missing', async () => {
    const req = httpMocks.createRequest({
      method: 'POST',
      body: { username: 'thien', email: 'thien@example.com', password: 'Abcd1234!', confirmPassword: 'Abcd1234!' },
    })
    const res = httpMocks.createResponse()

    await AuthController.register(req, res)

    expect(res.statusCode).toBe(400)
    expect(res._getJSONData().error).toMatch(/mã xác thực/i)
  })

  test('returns 400 when verification code is invalid or expired', async () => {
    RegistrationCode.verify.mockResolvedValue({ valid: false, reason: 'WRONG_CODE' })
    const req = httpMocks.createRequest({
      method: 'POST',
      body: {
        username: 'thien', email: 'thien@example.com',
        password: 'Abcd1234!', confirmPassword: 'Abcd1234!', code: '000000',
      },
    })
    const res = httpMocks.createResponse()

    await AuthController.register(req, res)

    expect(res.statusCode).toBe(400)
  })

  test('returns 429 when the code has been locked after too many wrong attempts', async () => {
    RegistrationCode.verify.mockResolvedValue({ valid: false, reason: 'LOCKED' })
    const req = httpMocks.createRequest({
      method: 'POST',
      body: {
        username: 'thien', email: 'thien@example.com',
        password: 'Abcd1234!', confirmPassword: 'Abcd1234!', code: '000000',
      },
    })
    const res = httpMocks.createResponse()

    await AuthController.register(req, res)

    expect(res.statusCode).toBe(429)
  })

  test('returns 201 and a token on successful registration', async () => {
    RegistrationCode.verify.mockResolvedValue({ valid: true })
    User.findByEmail.mockResolvedValue(null)
    User.create.mockResolvedValue(42)
    User.findById.mockResolvedValue({ id: 42, username: 'thien', email: 'thien@example.com', role: 'user' })

    const req = httpMocks.createRequest({
      method: 'POST',
      body: {
        username: 'thien', email: 'thien@example.com',
        password: 'Abcd1234!', confirmPassword: 'Abcd1234!', code: '123456',
      },
    })
    const res = httpMocks.createResponse()

    await AuthController.register(req, res)

    expect(res.statusCode).toBe(201)
    expect(res._getJSONData().token).toBe('fake-jwt-token')
    expect(RegistrationCode.deleteByEmail).toHaveBeenCalledWith('thien@example.com')
  })
})
