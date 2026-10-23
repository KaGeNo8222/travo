import { db } from '@/db/database'
import { attachmentSchema } from '@/db/schema'
import { validate } from '@/db/validate'
import type { Attachment, AttachmentOwnerType } from '@/types/entities'
import { NotFoundError } from '@/utils/errors'
import { newId, nowIso } from '@/utils/id'

/** A file ready to be stored (already validated / compressed by imageService). */
export interface NewFile {
  blob: Blob
  filename: string
  mimeType: string
  size: number
}

/** What to do with an entity's single image (trip cover, product photo). */
export type ImageChange = { kind: 'keep' } | { kind: 'remove' } | { kind: 'replace'; file: NewFile }

export const KEEP_IMAGE: ImageChange = { kind: 'keep' }

export function buildAttachment(
  tripId: string,
  ownerType: AttachmentOwnerType,
  ownerId: string,
  file: NewFile,
): Attachment {
  return validate(attachmentSchema, {
    id: newId(),
    tripId,
    ownerType,
    ownerId,
    filename: file.filename,
    mimeType: file.mimeType,
    size: file.blob.size,
    blob: file.blob,
    createdAt: nowIso(),
  })
}

/**
 * Applies an ImageChange and returns the image id to store on the owner. Deletes the
 * replaced image so no orphan is left behind. Call inside a transaction that includes
 * db.attachments.
 */
export async function applyImageChange(params: {
  tripId: string
  ownerType: AttachmentOwnerType
  ownerId: string
  currentId: string | null | undefined
  change: ImageChange
}): Promise<string | null> {
  const { tripId, ownerType, ownerId, currentId, change } = params
  if (change.kind === 'keep') return currentId ?? null
  if (currentId) await db.attachments.delete(currentId)
  if (change.kind === 'remove') return null
  const attachment = buildAttachment(tripId, ownerType, ownerId, change.file)
  await db.attachments.add(attachment)
  return attachment.id
}

/** Deletes every attachment of an owner. Call inside a transaction with db.attachments. */
export async function deleteOwnerAttachments(ownerType: AttachmentOwnerType, ownerId: string): Promise<void> {
  await db.attachments.where('[ownerType+ownerId]').equals([ownerType, ownerId]).delete()
}

/** Adds documents (tickets, confirmations) to a booking without modifying them. */
export async function addBookingFiles(bookingId: string, files: NewFile[]): Promise<Attachment[]> {
  return db.transaction('rw', [db.bookings, db.attachments], async () => {
    const booking = await db.bookings.get(bookingId)
    if (!booking) throw new NotFoundError('booking')
    const attachments = files.map((f) => buildAttachment(booking.tripId, 'booking', booking.id, f))
    await db.attachments.bulkAdd(attachments)
    return attachments
  })
}

export async function deleteAttachment(id: string): Promise<void> {
  await db.transaction('rw', [db.attachments, db.trips, db.shopping_items], async () => {
    const attachment = await db.attachments.get(id)
    if (!attachment) return
    // Clear single-image references so nothing points at a deleted file.
    if (attachment.ownerType === 'trip') {
      await db.trips.where('id').equals(attachment.ownerId).modify((t) => {
        if (t.coverImageId === id) t.coverImageId = null
      })
    } else if (attachment.ownerType === 'shopping') {
      await db.shopping_items.where('id').equals(attachment.ownerId).modify((s) => {
        if (s.imageId === id) s.imageId = null
      })
    }
    await db.attachments.delete(id)
  })
}
