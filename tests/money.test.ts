// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  convertFromTHB,
  convertToTHB,
  currencyDigits,
  multiplyMoney,
  parseAmountInput,
  roundMoney,
  sumMoney,
  toMinor,
} from '@/utils/money'

describe('money arithmetic', () => {
  it('knows minor units per currency', () => {
    expect(currencyDigits('THB')).toBe(2)
    expect(currencyDigits('JPY')).toBe(0)
    expect(currencyDigits('KRW')).toBe(0)
  })

  it('rounds half-up on the decimal value, not the binary float', () => {
    expect(toMinor(1.005, 'THB')).toBe(101)
    expect(toMinor(2.675, 'THB')).toBe(268)
    expect(toMinor(1234.5, 'JPY')).toBe(1235)
    expect(roundMoney(0.1 + 0.2, 'THB')).toBe(0.3)
  })

  it('sums and multiplies without floating-point drift', () => {
    expect(sumMoney([0.1, 0.2, 0.3], 'THB')).toBe(0.6)
    expect(sumMoney([19.99, 0.01], 'THB')).toBe(20)
    expect(multiplyMoney(19.99, 3, 'THB')).toBe(59.97)
    expect(multiplyMoney(1180, 3, 'JPY')).toBe(3540)
    expect(() => multiplyMoney(10, 1.5, 'THB')).toThrow()
  })

  it('converts currencies with user-provided rates', () => {
    expect(convertToTHB(1000, 'JPY', 0.235)).toBe(235)
    expect(convertToTHB(1180, 'JPY', 0.235)).toBe(277.3)
    expect(convertToTHB(1, 'USD', 36.123456)).toBe(36.12)
    expect(convertToTHB(1, 'USD', 36.125)).toBe(36.13)
    expect(convertToTHB(500, 'THB', 99)).toBe(500)
    expect(convertFromTHB(235, 'JPY', 0.235)).toBe(1000)
    expect(convertFromTHB(100, 'USD', 36)).toBe(2.78)
  })

  it('parses user input', () => {
    expect(parseAmountInput('1,234.50')).toBe(1234.5)
    expect(parseAmountInput(' 12 000 ')).toBe(12000)
    expect(parseAmountInput('')).toBeNull()
    expect(Number.isNaN(parseAmountInput('12a'))).toBe(true)
    expect(Number.isNaN(parseAmountInput('.'))).toBe(true)
  })
})
