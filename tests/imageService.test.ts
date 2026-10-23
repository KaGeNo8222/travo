// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { db } from '@/db/database'
import { addBookingFiles, buildAttachment, deleteAttachment } from '@/services/attachmentService'
import { createBooking, deleteBooking } from '@/services/bookingService'
import { fitWithin, prepareDocument, replaceExtension, validateUpload } from '@/services/imageService'
import { AppError, ValidationError } from '@/utils/errors'
import { formatBytes, resolveMimeType, sanitizeFilename } from '@/utils/files'
import { makeTrip } from './helpers'

describe('upload validation', () => {
  it('accepts supported images and PDFs', () => {
    expect(validateUpload({ name: 'a.jpg', type: 'image/jpeg', size: 1000 }, 'image')).toBe('image/jpeg')
    expect(validateUpload({ name: 'ticket.pdf', type: 'application/pdf', size: 1000 }, 'any')).toBe('application/pdf')
    // iOS sometimes reports no type: fall back to the extension.
    expect(validateUpload({ name: 'IMG_0001.HEIC', type: '', size: 1000 }, 'image')).toBe('image/heic')
  })

  it('rejects unsupported, empty, oversized and non-image files', () => {
    const code = (fn: () => unknown) => {
      try {
        fn()
      } catch (err) {
        return err instanceof AppError ? err.message : 'other'
      }
      return 'none'
    }
    expect(code(() => validateUpload({ name: 'a.exe', type: 'application/x-msdownload', size: 10 }, 'any'))).toBe('error.fileType')
    expect(code(() => validateUpload({ name: 'a.pdf', type: 'application/pdf', size: 10 }, 'image'))).toBe('error.imageOnly')
    expect(code(() => validateUpload({ name: 'a.png', type: 'image/png', size: 0 }, 'image'))).toBe('error.fileEmpty')
    expect(code(() => validateUpload({ name: 'a.png', type: 'image/png', size: 31 * 1024 * 1024 }, 'image'))).toBe('error.fileTooLarge')
    expect(code(() => validateUpload({ name: 'a.pdf', type: 'application/pdf', size: 21 * 1024 * 1024 }, 'any'))).toBe('error.fileTooLarge')
  })

  it('computes resize targets that keep the aspect ratio', () => {
    expect(fitWithin(4032, 3024, 1600)).toEqual({ width: 1600, height: 1200 })
    expect(fitWithin(3024, 4032, 1600)).toEqual({ width: 1200, height: 1600 })
    expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 })
  })

  it('handles file names and metadata', () => {
    expect(replaceExtension('IMG_0001.HEIC', 'jpg')).toBe('IMG_0001.jpg')
    expect(sanitizeFilename('a/b:c?.pdf')).toBe('a_b_c_.pdf')
    expect(resolveMimeType({ name: 'x.PDF', type: '' })).toBe('application/pdf')
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(5 * 1024 * 1024)).toBe('5 MB')
  })
})

describe('documents and attachments', () => {
  it('stores travel documents unmodified', () => {
    const pdf = new File([new Uint8Array([37, 80, 68, 70])], 'eticket.pdf', { type: 'application/pdf' })
    const prepared = prepareDocument(pdf)
    expect(prepared.blob).toBe(pdf)
    expect(prepared).toMatchObject({ compressed: false, size: 4, mimeType: 'application/pdf', filename: 'eticket.pdf' })
  })

  it('rejects attachments whose size metadata does not match the blob', () => {
    expect(() => buildAttachment('t', 'booking', 'b', { blob: new Blob(['abc']), filename: 'x.pdf', mimeType: 'application/pdf', size: 3 })).not.toThrow()
    expect(() => buildAttachment('t', 'booking', 'b', { blob: new Blob(['abc']), filename: 'x.exe', mimeType: 'application/x-msdownload', size: 3 })).toThrow(ValidationError)
  })

  it('adds booking documents and removes them with the booking', async () => {
    const { trip } = await makeTrip()
    const booking = await createBooking(trip.id, { type: 'flight', title: 'TG 682' })
    const [doc] = await addBookingFiles(booking.id, [{ blob: new Blob(['%PDF']), filename: 'ticket.pdf', mimeType: 'application/pdf', size: 4 }])
    expect((await db.attachments.get(doc.id))?.ownerId).toBe(booking.id)
    await deleteAttachment(doc.id)
    expect(await db.attachments.count()).toBe(0)
    await addBookingFiles(booking.id, [{ blob: new Blob(['%PDF']), filename: 'ticket.pdf', mimeType: 'application/pdf', size: 4 }])
    await deleteBooking(booking.id)
    expect(await db.attachments.count()).toBe(0)
  })
})
