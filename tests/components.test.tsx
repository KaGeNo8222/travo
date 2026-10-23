import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ShoppingCard } from '@/components/shopping/ShoppingParts'
import { TripFormSheet } from '@/components/trip/TripFormSheet'
import { db } from '@/db/database'
import { I18nProvider, createI18n } from '@/i18n'
import { en } from '@/i18n/en'
import { th } from '@/i18n/th'
import type { ShoppingItem } from '@/types/entities'

afterEach(cleanup)

describe('i18n', () => {
  it('has an English string for every Thai key and interpolates params', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(th).sort())
    expect(createI18n('th').t('trip.dayOf', { day: 2, total: 5 })).toBe('วันที่ 2 จาก 5')
    expect(createI18n('en').t('trip.dayOf', { day: 2, total: 5 })).toBe('Day 2 of 5')
    expect(createI18n('th').tx('not.a.key')).toBe('not.a.key')
  })
})

describe('TripFormSheet', () => {
  it('shows validation errors in Thai and does not save an invalid trip', async () => {
    const onClose = vi.fn()
    render(
      <I18nProvider lang="th">
        <TripFormSheet open onClose={onClose} />
      </I18nProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'บันทึก' }))
    expect(await screen.findAllByText('จำเป็นต้องกรอก')).not.toHaveLength(0)
    expect(onClose).not.toHaveBeenCalled()
    expect(await db.trips.count()).toBe(0)
  })

  it('creates a trip with generated days', async () => {
    const onClose = vi.fn()
    render(
      <I18nProvider lang="th">
        <TripFormSheet open onClose={onClose} />
      </I18nProvider>,
    )
    fireEvent.change(screen.getByLabelText('ชื่อทริป'), { target: { value: 'Seoul spring' } })
    fireEvent.change(screen.getByLabelText('ประเทศ'), { target: { value: 'เกาหลีใต้' } })
    fireEvent.change(screen.getByLabelText('วันเริ่ม'), { target: { value: '2027-04-01' } })
    fireEvent.change(screen.getByLabelText('วันกลับ'), { target: { value: '2027-04-03' } })
    fireEvent.click(screen.getByRole('button', { name: 'บันทึก' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    const [trip] = await db.trips.toArray()
    expect(trip).toMatchObject({ name: 'Seoul spring', timezone: 'Asia/Seoul', startDate: '2027-04-01' })
    expect(await db.trip_days.where('tripId').equals(trip.id).count()).toBe(3)
    expect((await db.trip_settings.get(trip.id))?.baseCurrency).toBe('KRW')
  })
})

describe('ShoppingCard', () => {
  const ts = '2026-01-01T00:00:00.000Z'
  const item: ShoppingItem = {
    id: 's1',
    tripId: 't',
    name: 'Matcha KitKat',
    quantity: 3,
    purchasedQuantity: 1,
    estimatedUnitPrice: 650,
    currency: 'JPY',
    recipient: 'แม่',
    priority: 'high',
    status: 'to_buy',
    createdAt: ts,
    updatedAt: ts,
  }

  it('shows partial purchase state, recipient and store, and quick-check works', () => {
    const onCheck = vi.fn()
    render(
      <I18nProvider lang="th">
        <ShoppingCard item={item} storeName="Don Quijote" onOpen={vi.fn()} onCheck={onCheck} onImage={vi.fn()} />
      </I18nProvider>,
    )
    expect(screen.getByText('ซื้อแล้ว 1/3')).toBeTruthy()
    expect(screen.getByText('แม่')).toBeTruthy()
    expect(screen.getByText('Don Quijote')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'ทำเครื่องหมายว่าซื้อแล้ว' }))
    expect(onCheck).toHaveBeenCalledOnce()
  })
})
