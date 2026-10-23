// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  addDaysToDate,
  daysBetween,
  durationBetweenLocal,
  enumerateDates,
  getDisplayStatus,
  gmtOffsetLabel,
  instantToLocalDate,
  isValidDateString,
  isValidLocalDateTime,
  isValidTimeString,
  isValidTimeZone,
  todayInTimeZone,
  zonedToInstant,
} from '@/utils/time'

describe('date strings', () => {
  it('validates calendar dates, times and local date-times', () => {
    expect(isValidDateString('2026-02-28')).toBe(true)
    expect(isValidDateString('2026-02-29')).toBe(false)
    expect(isValidDateString('2028-02-29')).toBe(true)
    expect(isValidDateString('2026-13-01')).toBe(false)
    expect(isValidTimeString('23:59')).toBe(true)
    expect(isValidTimeString('24:00')).toBe(false)
    expect(isValidLocalDateTime('2026-11-10T07:05')).toBe(true)
    expect(isValidLocalDateTime('2026-11-10 07:05')).toBe(false)
  })

  it('enumerates inclusive trip days, across month and year ends', () => {
    expect(enumerateDates('2026-12-30', '2027-01-02')).toEqual(['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02'])
    expect(enumerateDates('2026-11-10', '2026-11-10')).toEqual(['2026-11-10'])
    expect(enumerateDates('2026-11-10', '2026-11-09')).toEqual([])
    expect(daysBetween('2026-11-10', '2026-11-14')).toBe(4)
    expect(addDaysToDate('2026-02-28', 1)).toBe('2026-03-01')
  })
})

describe('time zones', () => {
  it('validates IANA zones', () => {
    expect(isValidTimeZone('Asia/Tokyo')).toBe(true)
    expect(isValidTimeZone('Mars/Olympus')).toBe(false)
  })

  it('computes "today" in the trip time zone, not the device zone', () => {
    const instant = new Date('2026-03-01T16:30:00Z')
    expect(todayInTimeZone('Asia/Tokyo', instant)).toBe('2026-03-02')
    expect(todayInTimeZone('America/Los_Angeles', instant)).toBe('2026-03-01')
    expect(instantToLocalDate('2026-03-01T16:30:00Z', 'Asia/Tokyo')).toBe('2026-03-02')
  })

  it('converts local wall-clock time to the right instant, including DST', () => {
    expect(zonedToInstant('2026-11-10', '09:00', 'Asia/Tokyo').toISOString()).toBe('2026-11-10T00:00:00.000Z')
    // New York switches to EDT on 2026-03-08.
    expect(zonedToInstant('2026-03-07', '12:00', 'America/New_York').toISOString()).toBe('2026-03-07T17:00:00.000Z')
    expect(zonedToInstant('2026-03-09', '12:00', 'America/New_York').toISOString()).toBe('2026-03-09T16:00:00.000Z')
  })

  it('measures overnight flights between different zones', () => {
    // BKK 22:30 (UTC+7) → HND 06:40 next day (UTC+9) = 6 h 10 min
    expect(durationBetweenLocal('2026-11-09T22:30', 'Asia/Bangkok', '2026-11-10T06:40', 'Asia/Tokyo')).toBe(370)
    // Westbound: arrives at an earlier local clock time but later instant.
    // 16:50 JST = 07:50Z, 21:40 ICT = 14:40Z → 6 h 50 min
    expect(durationBetweenLocal('2026-11-14T16:50', 'Asia/Tokyo', '2026-11-14T21:40', 'Asia/Bangkok')).toBe(410)
  })

  it('labels GMT offsets', () => {
    const at = new Date('2026-07-01T00:00:00Z')
    expect(gmtOffsetLabel('Asia/Tokyo', at)).toBe('GMT+9')
    expect(gmtOffsetLabel('Asia/Kolkata', at)).toBe('GMT+5:30')
    expect(gmtOffsetLabel('UTC', at)).toBe('GMT')
    expect(gmtOffsetLabel('America/New_York', at)).toBe('GMT-4')
  })
})

describe('trip display status', () => {
  const trip = { startDate: '2026-11-10', endDate: '2026-11-14', timezone: 'Asia/Tokyo' }

  it('follows the calendar in the trip time zone', () => {
    expect(getDisplayStatus({ ...trip, status: 'planning' }, new Date('2026-11-01T00:00:00Z'))).toBe('planning')
    expect(getDisplayStatus({ ...trip, status: 'upcoming' }, new Date('2026-11-01T00:00:00Z'))).toBe('upcoming')
    // 2026-11-09T15:30Z is already 2026-11-10 00:30 in Tokyo.
    expect(getDisplayStatus({ ...trip, status: 'planning' }, new Date('2026-11-09T15:30:00Z'))).toBe('ongoing')
    expect(getDisplayStatus({ ...trip, status: 'planning' }, new Date('2026-11-20T00:00:00Z'))).toBe('completed')
  })

  it('never overrides a manual archived or completed status', () => {
    expect(getDisplayStatus({ ...trip, status: 'archived' }, new Date('2026-11-11T00:00:00Z'))).toBe('archived')
    expect(getDisplayStatus({ ...trip, status: 'completed' }, new Date('2026-11-01T00:00:00Z'))).toBe('completed')
  })
})
