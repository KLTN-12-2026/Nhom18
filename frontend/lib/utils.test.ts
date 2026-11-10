import { cn, formatVND } from './utils'

describe('cn', () => {
  test('merges class names and drops falsy values', () => {
    expect(cn('a', false && 'b', undefined, 'c')).toBe('a c')
  })

  test('lets tailwind-merge resolve conflicting utility classes', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4')
  })
})

describe('formatVND', () => {
  test('formats a positive number as Vietnamese currency', () => {
    expect(formatVND(100000)).toContain('100.000')
    expect(formatVND(100000)).toContain('₫')
  })

  test('formats a numeric string the same way as a number', () => {
    expect(formatVND('50000')).toBe(formatVND(50000))
  })

  test('falls back to 0 for null, undefined, or non-numeric input', () => {
    expect(formatVND(null)).toBe(formatVND(0))
    expect(formatVND(undefined)).toBe(formatVND(0))
    expect(formatVND('not-a-number')).toBe(formatVND(0))
  })
})
