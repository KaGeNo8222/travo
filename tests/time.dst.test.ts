// @vitest-environment node
import { describe, expect, it } from 'vitest'

// Date-only arithmetic must not drift when the *device* observes DST.
process.env.TZ = 'America/New_York'

describe('date arithmetic on a device with DST', () => {
  it('enumerates days across the spring-forward and fall-back changes', async () => {
    const { enumerateDates, daysBetween } = await import('@/utils/time')
    expect(enumerateDates('2026-03-07', '2026-03-10')).toEqual(['2026-03-07', '2026-03-08', '2026-03-09', '2026-03-10'])
    expect(enumerateDates('2026-10-31', '2026-11-03')).toEqual(['2026-10-31', '2026-11-01', '2026-11-02', '2026-11-03'])
    expect(daysBetween('2026-03-01', '2026-03-31')).toBe(30)
  })
})
