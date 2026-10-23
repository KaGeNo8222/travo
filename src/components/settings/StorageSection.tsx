import { useCallback, useEffect, useState } from 'react'
import { HardDrive, ShieldCheck, Wrench } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/database'
import { useI18n } from '@/i18n'
import { errorMessage } from '@/i18n/errors'
import { checkIntegrity, isReportClean, type IntegrityReport } from '@/services/integrityService'
import { showToast } from '@/stores/uiStore'
import { formatBytes } from '@/utils/files'
import { getStorageInfo, requestPersistentStorage, type StorageInfo } from '@/utils/storage'
import { Button } from '../ui/Button'
import { Card, ProgressBar } from '../ui/Primitives'

export function StorageSection() {
  const i18n = useI18n()
  const { t } = i18n
  const [info, setInfo] = useState<StorageInfo | null>(null)
  const counts = useLiveQuery(async () => {
    let attachmentBytes = 0
    await db.attachments.each((a) => {
      attachmentBytes += a.size
    })
    return {
      trips: await db.trips.count(),
      attachments: await db.attachments.count(),
      attachmentBytes,
    }
  }, [])

  const refresh = useCallback(() => void getStorageInfo().then(setInfo), [])
  useEffect(refresh, [refresh])

  const persist = async () => {
    const granted = await requestPersistentStorage()
    showToast(granted ? t('storage.persistGranted') : t('storage.persistDenied'), { tone: granted ? 'success' : 'default' })
    refresh()
  }

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-center gap-3">
        <HardDrive className="size-5 text-primary" aria-hidden />
        <p className="text-[15px] font-medium">
          {info?.usage != null
            ? t('storage.usage', { used: formatBytes(info.usage), quota: info.quota != null ? formatBytes(info.quota) : '—' })
            : t('storage.unknown')}
        </p>
      </div>
      {info?.usage != null && info.quota ? <ProgressBar value={info.usage / info.quota} label={t('storage.title')} /> : null}
      {counts && (
        <p className="text-[13px] text-muted">
          {t('storage.counts', { trips: counts.trips, files: counts.attachments, size: formatBytes(counts.attachmentBytes) })}
        </p>
      )}
      <div className="flex items-center gap-2 rounded-xl bg-surface-2 p-3 text-[13px]">
        <ShieldCheck className={info?.persisted ? 'size-5 text-success' : 'size-5 text-warning'} aria-hidden />
        <span className="flex-1">
          {info?.persisted ? t('storage.persisted') : info?.persisted === false ? t('storage.notPersisted') : t('storage.persistUnknown')}
        </span>
        {info?.persisted === false && (
          <Button size="sm" variant="secondary" onClick={() => void persist()}>
            {t('storage.requestPersist')}
          </Button>
        )}
      </div>
      <p className="text-[12px] leading-relaxed text-subtle">{t('storage.iosNote')}</p>
    </Card>
  )
}

function reportLines(r: IntegrityReport, t: ReturnType<typeof useI18n>['t']): string[] {
  const lines: string[] = []
  if (r.orphanRecords) lines.push(t('integrity.orphanRecords', { count: r.orphanRecords }))
  if (r.orphanAttachments) lines.push(t('integrity.orphanAttachments', { count: r.orphanAttachments }))
  if (r.danglingLinks) lines.push(t('integrity.danglingLinks', { count: r.danglingLinks }))
  if (r.homelessActivities) lines.push(t('integrity.homelessActivities', { count: r.homelessActivities }))
  if (r.missingDays) lines.push(t('integrity.missingDays', { count: r.missingDays }))
  if (r.missingSettings) lines.push(t('integrity.missingSettings', { count: r.missingSettings }))
  return lines
}

export function IntegritySection() {
  const i18n = useI18n()
  const { t } = i18n
  const [report, setReport] = useState<IntegrityReport | null>(null)
  const [busy, setBusy] = useState(false)

  const run = async (repair: boolean) => {
    setBusy(true)
    try {
      const r = await checkIntegrity(repair)
      setReport(repair ? await checkIntegrity(false) : r)
      if (repair) showToast(t('integrity.repaired'), { tone: 'success' })
    } catch (err) {
      showToast(errorMessage(err, i18n), { tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const lines = report ? reportLines(report, t) : []
  return (
    <Card className="flex flex-col gap-3 p-4">
      <p className="text-[14px] text-muted">{t('integrity.description')}</p>
      {report && (
        <div className={isReportClean(report) ? 'rounded-xl bg-success-soft p-3 text-[14px] text-success' : 'rounded-xl bg-warning-soft p-3 text-[14px] text-warning'}>
          {isReportClean(report) ? t('integrity.clean') : <ul>{lines.map((l) => <li key={l}>• {l}</li>)}</ul>}
        </div>
      )}
      <div className="flex gap-2">
        <Button variant="secondary" block loading={busy} icon={ShieldCheck} onClick={() => void run(false)}>
          {t('integrity.check')}
        </Button>
        {report && !isReportClean(report) && (
          <Button block loading={busy} icon={Wrench} onClick={() => void run(true)}>
            {t('integrity.repair')}
          </Button>
        )}
      </div>
    </Card>
  )
}
