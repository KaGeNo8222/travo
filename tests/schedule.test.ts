// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type { Activity, TripDay } from '@/types/entities'
import { compareActivities, endsNextDay, findCurrentOrNext, findOverlaps, splitSchedule } from '@/utils/schedule'

const ts = '2026-01-01T00:00:00.000Z'
const day = (id: string, date: string, dayOrder: number): TripDay => ({ id, tripId: 't', date, dayOrder, createdAt: ts, updatedAt: ts })
const act = (id: string, tripDayId: string, startTime?: string, endTime?: string, extra: Partial<Activity> = {}): Activity => ({
  id,
  tripId: 't',
  tripDayId,
  title: id,
  startTime,
  endTime,
  sortOrder: 0,
  status: 'planned',
  createdAt: ts,
  updatedAt: ts,
  ...extra,
})

describe('schedule', () => {
  it('orders scheduled activities by time and keeps unscheduled ones separate', () => {
    const list = [act('c', 'd1'), act('b', 'd1', '13:00'), act('a', 'd1', '09:00'), act('d', 'd1', undefined, undefined, { sortOrder: -1 })]
    const { scheduled, unscheduled } = splitSchedule(list)
    expect(scheduled.map((a) => a.id)).toEqual(['a', 'b'])
    expect(unscheduled.map((a) => a.id)).toEqual(['d', 'c'])
    expect([...list].sort(compareActivities).map((a) => a.id)).toEqual(['a', 'b', 'd', 'c'])
  })

  it('detects overlapping times, including activities that pass midnight', () => {
    const overlaps = findOverlaps([
      act('a', 'd1', '09:00', '11:00'),
      act('b', 'd1', '10:30', '12:00'),
      act('c', 'd1', '12:00', '13:00'),
      act('d', 'd1', '23:00', '01:00'),
      act('e', 'd1', '23:30'),
      act('f', 'd2', '10:00', '11:00'),
      act('g', 'd1', '09:30', '10:00', { status: 'skipped' }),
    ])
    expect(overlaps.get('a')).toEqual(['b'])
    expect(overlaps.get('b')).toEqual(['a'])
    expect(overlaps.has('c')).toBe(false) // touching end/start is fine
    expect(overlaps.get('d')).toEqual(['e'])
    expect(overlaps.has('f')).toBe(false) // other day
    expect(overlaps.has('g')).toBe(false) // skipped activities are ignored
    expect(endsNextDay({ startTime: '23:00', endTime: '01:00' })).toBe(true)
  })

  it('finds the current or next activity in the trip time zone', () => {
    const days = [day('d1', '2026-11-10', 1), day('d2', '2026-11-11', 2)]
    const list = [
      act('breakfast', 'd1', '08:00', '09:00'),
      act('temple', 'd1', '10:00', '12:00'),
      act('done', 'd1', '09:30', '10:30', { status: 'completed' }),
      act('tomorrow', 'd2', '09:00'),
    ]
    // 10:30 in Tokyo = 01:30Z
    const now = findCurrentOrNext(days, list, 'Asia/Tokyo', new Date('2026-11-10T01:30:00Z'))
    expect(now?.activity.id).toBe('temple')
    expect(now?.isCurrent).toBe(true)
    // 13:00 in Tokyo → next is tomorrow's activity
    const later = findCurrentOrNext(days, list, 'Asia/Tokyo', new Date('2026-11-10T04:00:00Z'))
    expect(later?.activity.id).toBe('tomorrow')
    expect(later?.isCurrent).toBe(false)
  })
})
