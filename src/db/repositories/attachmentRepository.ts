import { db } from '../database'
import type { Attachment, AttachmentOwnerType } from '@/types/entities'

export async function getAttachment(id: string): Promise<Attachment | undefined> {
  return db.attachments.get(id)
}

export async function listAttachmentsByOwner(
  ownerType: AttachmentOwnerType,
  ownerId: string,
): Promise<Attachment[]> {
  const items = await db.attachments.where('[ownerType+ownerId]').equals([ownerType, ownerId]).toArray()
  return items.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}
