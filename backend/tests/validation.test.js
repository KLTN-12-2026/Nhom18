const { isValidEmail, isStrongPassword, validateRegistrationData } = require('../middleware/validation')

describe('isValidEmail', () => {
  test('accepts well-formed emails', () => {
    expect(isValidEmail('a@b.com')).toBe(true)
    expect(isValidEmail('thien.nguyen@example.co')).toBe(true)
  })

  test('rejects malformed emails', () => {
    expect(isValidEmail('not-an-email')).toBe(false)
    expect(isValidEmail('missing@domain')).toBe(false)
    expect(isValidEmail('@noLocalPart.com')).toBe(false)
  })
})

describe('isStrongPassword', () => {
  test('accepts a password with all required character classes and length', () => {
    const result = isStrongPassword('Abcd1234!')
    expect(result.valid).toBe(true)
  })

  test('rejects a password that is too short', () => {
    const result = isStrongPassword('Ab1!')
    expect(result.valid).toBe(false)
    expect(result.minLength).toBe(false)
  })

  test('rejects a password missing an uppercase letter', () => {
    const result = isStrongPassword('abcd1234!')
    expect(result.valid).toBe(false)
    expect(result.hasUpperCase).toBe(false)
  })

  test('rejects a password missing a special character', () => {
    const result = isStrongPassword('Abcd1234')
    expect(result.valid).toBe(false)
    expect(result.hasSpecialChar).toBe(false)
  })

  test('rejects a purely numeric or all-lowercase password', () => {
    expect(isStrongPassword('12345678').valid).toBe(false)
    expect(isStrongPassword('password').valid).toBe(false)
  })
})

describe('validateRegistrationData', () => {
  const base = { username: 'thien', email: 'thien@example.com', password: 'Abcd1234!', confirmPassword: 'Abcd1234!' }

  test('accepts valid registration data', () => {
    expect(validateRegistrationData(base).valid).toBe(true)
  })

  test('rejects a username shorter than 3 characters', () => {
    const result = validateRegistrationData({ ...base, username: 'ab' })
    expect(result.valid).toBe(false)
    expect(result.errors.join(' ')).toMatch(/ít nhất 3 ký tự/)
  })

  test('rejects mismatched password confirmation', () => {
    const result = validateRegistrationData({ ...base, confirmPassword: 'different' })
    expect(result.valid).toBe(false)
    expect(result.errors.join(' ')).toMatch(/không khớp/)
  })

  test('rejects an invalid email', () => {
    const result = validateRegistrationData({ ...base, email: 'not-an-email' })
    expect(result.valid).toBe(false)
  })

  test('accumulates multiple errors at once', () => {
    const result = validateRegistrationData({ username: 'ab', email: 'bad', password: '123', confirmPassword: '456' })
    expect(result.valid).toBe(false)
    expect(result.errors.length).toBeGreaterThan(1)
  })
})
