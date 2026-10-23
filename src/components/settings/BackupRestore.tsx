import { useEffect, useRef, useState } from 'react'
import { Download, FileArchive, Share, Upload } from 'lucide-react'
import { useAppSettings } from '@/hooks/useData'
import { useConfirm } from '@/hooks/useConfirm'
import { useI18n } from '@/i18n'
import { errorMessage } from '@/i18n/errors'
import {
  createBackup,
  estimateBackupBytes,
  readBackup,
  restoreBackup,
  type MergeConflictPolicy,
  type ParsedBackup,
  type RestoreResult,
} from '@/services/backupService'
import { showToast } from '@/stores/uiStore'
import { BackupError } from '@/utils/errors'
import { downloadFile, formatBytes, shareOrDownloadFile } from '@/utils/files'
import { Button } from '../ui/Button'
import { Card, ProgressBar, SegmentedControl } from '../ui/Primitives'

/** Practical size above which an iPhone may run out of memory while zipping or restoring. */
export const LARGE_BACKUP_BYTES = 250 * 1024 * 1024

/** A system timestamp shown in the device's own time zone. */
function formatTimestamp(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso))
}

export function BackupSection() {
  const i18n = useI18n()
  const { t, locale } = i18n
  const settings = useAppSettings()
  const [estimate, setEstimate] = useState<number | null>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const [file, setFile] = useState<File | null>(null)

  useEffect(() => {
    void estimateBackupBytes().then(setEstimate)
  }, [])

  const create = async () => {
    setProgress(0)
    setFile(null)
    try {
      const result = await createBackup((p) => setProgress(p))
      setFile(result.file)
      showToast(t('backup.ready'), { tone: 'success' })
    } catch (err) {
      showToast(errorMessage(err, i18n), { tone: 'error' })
    } finally {
      setProgress(null)
    }
  }

  const save = async () => {
    if (!file) return
    const outcome = await shareOrDownloadFile(file)
    if (outcome !== 'cancelled') showToast(t('backup.saved'))
  }

  const meta = settings?.backupMeta
  return (
    <Card className="flex flex-col gap-3 p-4">
      <p className="text-[14px] leading-relaxed text-muted">{t('backup.description')}</p>
      <p className="text-[13px] text-muted">
        {meta ? t('backup.last', { date: formatTimestamp(meta.lastBackupAt, locale), size: formatBytes(meta.lastBackupBytes) }) : t('backup.never')}
        {estimate !== null && ` · ${t('backup.estimate', { size: formatBytes(estimate) })}`}
      </p>
      {estimate !== null && estimate > LARGE_BACKUP_BYTES && <p className="text-[13px] text-warning">{t('backup.largeWarning')}</p>}
      {progress !== null && <ProgressBar value={progress / 100} label={t('backup.creating')} />}
      {file ? (
        <div className="flex flex-col gap-2 rounded-xl bg-surface-2 p-3">
          <p className="flex items-center gap-2 text-[14px] font-medium">
            <FileArchive className="size-4 shrink-0" aria-hidden />
            <span className="truncate">{file.name}</span>
            <span className="ml-auto shrink-0 text-muted">{formatBytes(file.size)}</span>
          </p>
          <Button icon={Share} block onClick={() => void save()}>
            {t('backup.saveToFiles')}
          </Button>
          <Button icon={Download} variant="secondary" block onClick={() => downloadFile(file)}>
            {t('backup.download')}
          </Button>
        </div>
      ) : (
        <Button icon={FileArchive} block loading={progress !== null} onClick={() => void create()}>
          {t('backup.create')}
        </Button>
      )}
      <p className="text-[12px] text-subtle">{t('backup.userManaged')}</p>
    </Card>
  )
}

type Mode = 'merge' | 'replace'

export function RestoreSection() {
  const i18n = useI18n()
  const { t, locale } = i18n
  const confirm = useConfirm()
  const inputRef = useRef<HTMLInputElement>(null)
  const [reading, setReading] = useState(false)
  const [parsed, setParsed] = useState<ParsedBackup | null>(null)
  const [error, setError] = useState<{ message: string; details: string[] } | null>(null)
  const [mode, setMode] = useState<Mode>('merge')
  const [policy, setPolicy] = useState<MergeConflictPolicy>('skip')
  const [restoring, setRestoring] = useState(false)
  const [result, setResult] = useState<RestoreResult | null>(null)

  const pick = async (f: File | undefined) => {
    if (!f) return
    setReading(true)
    setParsed(null)
    setError(null)
    setResult(null)
    try {
      setParsed(await readBackup(f))
    } catch (err) {
      setError({ message: errorMessage(err, i18n), details: err instanceof BackupError ? err.details : [] })
    } finally {
      setReading(false)
    }
  }

  const restore = async () => {
    if (!parsed) return
    if (mode === 'replace') {
      const ok = await confirm({ title: t('restore.replaceConfirmTitle'), message: t('restore.replaceConfirmMessage'), confirmLabel: t('restore.replaceAll'), danger: true })
      if (!ok) return
    }
    setRestoring(true)
    try {
      const res = await restoreBackup(parsed, mode === 'replace' ? { mode } : { mode, onConflict: policy, copySuffix: ` ${t('restore.importedSuffix')}` })
      setResult(res)
      setParsed(null)
      showToast(t('restore.done'), { tone: 'success' })
    } catch (err) {
      setError({ message: t('restore.failed', { reason: errorMessage(err, i18n) }), details: [] })
    } finally {
      setRestoring(false)
    }
  }

  const tripCount = parsed?.tables.trips.length ?? 0
  return (
    <Card className="flex flex-col gap-3 p-4">
      <p className="text-[14px] leading-relaxed text-muted">{t('restore.description')}</p>
      <Button icon={Upload} variant="secondary" block loading={reading} onClick={() => inputRef.current?.click()}>
        {t('restore.choose')}
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept=".zip,application/zip,application/x-zip-compressed"
        className="hidden"
        onChange={(e) => {
          void pick(e.target.files?.[0])
          e.target.value = ''
        }}
      />
      {error && (
        <div role="alert" className="rounded-xl bg-danger-soft p-3 text-[14px] text-danger">
          <p className="font-semibold">{error.message}</p>
          {error.details.length > 0 && (
            <ul className="mt-1.5 max-h-32 overflow-y-auto text-[12px]">
              {error.details.map((d, i) => (
                <li key={i}>{d}</li>
              ))}
            </ul>
          )}
          <p className="mt-1.5 text-[12px]">{t('restore.untouched')}</p>
        </div>
      )}
      {parsed && (
        <div className="flex flex-col gap-3 rounded-xl bg-surface-2 p-3">
          <div className="text-[14px]">
            <p className="font-semibold">{t('restore.valid')}</p>
            <p className="text-muted">
              {t('restore.summary', {
                date: formatTimestamp(parsed.manifest.exportedAt, locale),
                version: parsed.manifest.appVersion,
                trips: tripCount,
                files: parsed.tables.attachments.length,
                size: formatBytes(parsed.attachmentBytes),
              })}
            </p>
            {parsed.tables.trips.length > 0 && (
              <ul className="mt-1.5 text-[13px] text-muted">
                {parsed.tables.trips.slice(0, 8).map((trip) => (
                  <li key={trip.id}>• {trip.name}</li>
                ))}
              </ul>
            )}
            {parsed.warnings.length > 0 && <p className="mt-1.5 text-[12px] text-warning">{t('restore.repaired', { count: parsed.warnings.length })}</p>}
          </div>
          <SegmentedControl
            label={t('restore.mode')}
            value={mode}
            onChange={setMode}
            options={[
              { value: 'merge', label: t('restore.merge') },
              { value: 'replace', label: t('restore.replaceAll') },
            ]}
          />
          {mode === 'merge' ? (
            <div className="flex flex-col gap-2">
              <p className="text-[13px] text-muted">{t('restore.conflictLabel')}</p>
              <SegmentedControl
                label={t('restore.conflictLabel')}
                value={policy}
                onChange={setPolicy}
                options={[
                  { value: 'skip', label: t('restore.skip') },
                  { value: 'replace', label: t('restore.overwrite') },
                  { value: 'copy', label: t('restore.copy') },
                ]}
              />
              <p className="text-[12px] text-subtle">{t(policy === 'skip' ? 'restore.skipHint' : policy === 'replace' ? 'restore.overwriteHint' : 'restore.copyHint')}</p>
            </div>
          ) : (
            <p className="text-[13px] text-danger">{t('restore.replaceHint')}</p>
          )}
          <Button block variant={mode === 'replace' ? 'danger' : 'primary'} loading={restoring} onClick={() => void restore()}>
            {t('restore.start')}
          </Button>
        </div>
      )}
      {result && (
        <p role="status" className="rounded-xl bg-success-soft p-3 text-[14px] text-success">
          {t('restore.result', { imported: result.imported, replaced: result.replaced, copied: result.copied, skipped: result.skipped, files: result.attachments })}
        </p>
      )}
    </Card>
  )
}
