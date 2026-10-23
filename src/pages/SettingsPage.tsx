import { useState } from 'react'
import { useNavigate } from 'react-router'
import { FlaskConical, Info, Lock, Smartphone } from 'lucide-react'
import { PageBody, PageHeader } from '@/components/layout/PageHeader'
import { BackupSection, RestoreSection } from '@/components/settings/BackupRestore'
import { CategoryManager } from '@/components/settings/CategoryManager'
import { IntegritySection, StorageSection } from '@/components/settings/StorageSection'
import { CurrencyOptions } from '@/components/trip/TripFormSheet'
import { Button } from '@/components/ui/Button'
import { Field, Select, SwitchRow } from '@/components/ui/Field'
import { Card, PageLoader, SectionTitle, SegmentedControl } from '@/components/ui/Primitives'
import { setSetting, type Language, type SettingKey, type SettingValues, type Theme } from '@/db/repositories/settingsRepository'
import { useConfirm } from '@/hooks/useConfirm'
import { useAppSettings, useTrips } from '@/hooks/useData'
import { useI18n } from '@/i18n'
import { errorMessage } from '@/i18n/errors'
import { setActiveTrip } from '@/services/tripService'
import { showToast } from '@/stores/uiStore'
import { isStandalone } from '@/utils/storage'

export function SettingsPage() {
  const i18n = useI18n()
  const { t } = i18n
  const navigate = useNavigate()
  const settings = useAppSettings()
  const trips = useTrips()
  const confirm = useConfirm()
  const [sampleBusy, setSampleBusy] = useState(false)

  if (!settings || !trips) return <PageLoader />

  const save = async <K extends SettingKey>(key: K, value: SettingValues[K]) => {
    try {
      await setSetting(key, value)
    } catch (err) {
      showToast(errorMessage(err, i18n), { tone: 'error' })
    }
  }

  const addSample = async () => {
    if (!(await confirm({ title: t('sample.confirmTitle'), message: t('sample.confirmMessage'), confirmLabel: t('sample.add') }))) return
    setSampleBusy(true)
    try {
      const { createSampleTrip } = await import('@/dev/sampleData')
      const trip = await createSampleTrip()
      showToast(t('sample.created'), { tone: 'success' })
      navigate(`/trip/${trip.id}`)
    } catch (err) {
      showToast(errorMessage(err, i18n), { tone: 'error' })
    } finally {
      setSampleBusy(false)
    }
  }

  const back = settings.activeTripId ? `/trip/${settings.activeTripId}/more` : '/trips'
  return (
    <>
      <PageHeader title={t('settings.title')} back={back} />
      <PageBody>
        <div className="flex flex-col gap-7">
          <section>
            <SectionTitle>{t('settings.general')}</SectionTitle>
            <Card className="flex flex-col gap-5 p-4">
              <Field label={t('settings.theme')}>
                <SegmentedControl<Theme>
                  label={t('settings.theme')}
                  value={settings.theme}
                  onChange={(v) => void save('theme', v)}
                  options={[
                    { value: 'system', label: t('settings.themeSystem') },
                    { value: 'light', label: t('settings.themeLight') },
                    { value: 'dark', label: t('settings.themeDark') },
                  ]}
                />
              </Field>
              <Field label={t('settings.language')}>
                <SegmentedControl<Language>
                  label={t('settings.language')}
                  value={settings.language}
                  onChange={(v) => void save('language', v)}
                  options={[
                    { value: 'th', label: 'ไทย' },
                    { value: 'en', label: 'English' },
                  ]}
                />
              </Field>
              <Field label={t('settings.activeTrip')} htmlFor="active-trip">
                <Select
                  id="active-trip"
                  value={settings.activeTripId ?? ''}
                  onChange={(e) => {
                    const id = e.target.value || null
                    void setActiveTrip(id).then(() => id && navigate(`/trip/${id}`))
                  }}
                >
                  <option value="">—</option>
                  {trips.map((trip) => (
                    <option key={trip.id} value={trip.id}>
                      {trip.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t('settings.defaultCurrency')} htmlFor="default-currency" hint={t('settings.defaultCurrencyHint')}>
                <Select id="default-currency" value={settings.defaultCurrency} onChange={(e) => void save('defaultCurrency', e.target.value)}>
                  <CurrencyOptions />
                </Select>
              </Field>
              <SwitchRow label={t('settings.hideRefs')} description={t('settings.hideRefsHint')} checked={settings.hideBookingRefs} onChange={(v) => void save('hideBookingRefs', v)} />
            </Card>
          </section>

          <section>
            <SectionTitle>{t('settings.backup')}</SectionTitle>
            <BackupSection />
          </section>
          <section>
            <SectionTitle>{t('settings.restore')}</SectionTitle>
            <RestoreSection />
          </section>
          <section>
            <SectionTitle>{t('storage.title')}</SectionTitle>
            <div className="flex flex-col gap-3">
              <StorageSection />
              <IntegritySection />
            </div>
          </section>
          <section>
            <SectionTitle>{t('categories.title')}</SectionTitle>
            <CategoryManager />
          </section>
          <section>
            <SectionTitle>{t('sample.title')}</SectionTitle>
            <Card className="flex flex-col gap-3 p-4">
              <p className="text-[14px] text-muted">{t('sample.description')}</p>
              <Button variant="secondary" icon={FlaskConical} loading={sampleBusy} onClick={() => void addSample()}>
                {t('sample.add')}
              </Button>
            </Card>
          </section>
          <section>
            <SectionTitle>{t('settings.about')}</SectionTitle>
            <Card className="flex flex-col gap-3 p-4 text-[14px]">
              <p className="flex items-center gap-2">
                <Info className="size-4 text-primary" aria-hidden />
                TRAVO {t('settings.version', { version: __APP_VERSION__ })}
              </p>
              <p className="flex gap-2 text-muted">
                <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
                {t('settings.privacy')}
              </p>
              {!isStandalone() && (
                <p className="flex gap-2 text-muted">
                  <Smartphone className="mt-0.5 size-4 shrink-0" aria-hidden />
                  {t('settings.installHint')}
                </p>
              )}
              <p className="text-[12px] text-subtle">{t('settings.build', { date: __BUILD_TIME__.slice(0, 10) })}</p>
            </Card>
          </section>
        </div>
      </PageBody>
    </>
  )
}
