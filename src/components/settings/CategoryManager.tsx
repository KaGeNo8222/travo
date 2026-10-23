import { useId, useState, type FormEvent } from 'react'
import { Lock, Pencil, Plus, Trash2 } from 'lucide-react'
import { useCategories } from '@/hooks/useData'
import { useConfirm } from '@/hooks/useConfirm'
import { useI18n } from '@/i18n'
import { errorMessage, fieldErrors } from '@/i18n/errors'
import { categoryLabel } from '@/i18n/labels'
import { countCategoryUsage, createCategory, deleteCategory, updateCategory } from '@/services/categoryService'
import { showToast } from '@/stores/uiStore'
import type { Category } from '@/types/entities'
import { cn } from '@/utils/cn'
import { CATEGORY_COLORS, CATEGORY_ICONS, categoryIcon } from '../places/categoryIcons'
import { Button } from '../ui/Button'
import { Field, FormError, TextInput } from '../ui/Field'
import { Card } from '../ui/Primitives'
import { Sheet, SheetSubmit } from '../ui/Sheet'

export function CategoryManager() {
  const i18n = useI18n()
  const { t } = i18n
  const categories = useCategories() ?? []
  const confirm = useConfirm()
  const [editing, setEditing] = useState<Category | 'new' | null>(null)

  const remove = async (c: Category) => {
    const used = await countCategoryUsage(c.id)
    const ok = await confirm({
      title: t('categories.deleteTitle', { name: c.name }),
      message: used ? t('categories.deleteUsed', { count: used }) : undefined,
      confirmLabel: t('common.delete'),
      danger: true,
    })
    if (!ok) return
    try {
      await deleteCategory(c.id)
      showToast(t('categories.deleted'))
    } catch (err) {
      showToast(errorMessage(err, i18n), { tone: 'error' })
    }
  }

  return (
    <Card className="overflow-hidden">
      <ul className="divide-y divide-line">
        {categories.map((c) => {
          const Icon = categoryIcon(c.icon)
          return (
            <li key={c.id} className="flex min-h-13 items-center gap-3 px-4 py-2">
              <span className="flex size-8 items-center justify-center rounded-lg" style={{ backgroundColor: `${c.color}1f`, color: c.color }}>
                <Icon className="size-4" aria-hidden />
              </span>
              <span className="flex-1 truncate text-[15px]">{categoryLabel(c, i18n)}</span>
              {c.isSystem ? (
                <Lock className="size-4 text-subtle" aria-label={t('categories.system')} />
              ) : (
                <>
                  <button type="button" onClick={() => setEditing(c)} aria-label={t('common.edit')} className="flex size-9 items-center justify-center rounded-full text-muted active:bg-surface-2">
                    <Pencil className="size-4" aria-hidden />
                  </button>
                  <button type="button" onClick={() => void remove(c)} aria-label={t('common.delete')} className="flex size-9 items-center justify-center rounded-full text-danger active:bg-danger-soft">
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                </>
              )}
            </li>
          )
        })}
      </ul>
      <div className="border-t border-line p-3">
        <Button variant="ghost" icon={Plus} block onClick={() => setEditing('new')}>
          {t('categories.add')}
        </Button>
      </div>
      {editing && <CategoryForm category={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </Card>
  )
}

function CategoryForm({ category, onClose }: { category: Category | null; onClose: () => void }) {
  const i18n = useI18n()
  const { t } = i18n
  const formId = useId()
  const [name, setName] = useState(category?.name ?? '')
  const [icon, setIcon] = useState(category?.icon ?? 'star')
  const [color, setColor] = useState(category?.color ?? CATEGORY_COLORS[0])
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      if (category) await updateCategory(category.id, { name, icon, color })
      else await createCategory({ name, icon, color })
      onClose()
    } catch (err) {
      const fields = fieldErrors(err, i18n)
      if (fields) setErrors(fields)
      else setFormError(errorMessage(err, i18n))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open onClose={onClose} title={category ? t('categories.editTitle') : t('categories.newTitle')} size="auto" footer={<SheetSubmit form={formId} label={t('common.save')} loading={saving} />}>
      <form id={formId} onSubmit={submit} className="flex flex-col gap-5">
        <FormError message={formError} />
        <Field label={t('categories.name')} htmlFor={`${formId}-name`} error={errors.name}>
          <TextInput id={`${formId}-name`} value={name} onChange={(e) => setName(e.target.value)} invalid={!!errors.name} />
        </Field>
        <Field label={t('categories.icon')}>
          <div className="grid grid-cols-6 gap-2">
            {Object.entries(CATEGORY_ICONS).map(([key, Icon]) => (
              <button
                key={key}
                type="button"
                onClick={() => setIcon(key)}
                aria-pressed={icon === key}
                aria-label={key}
                className={cn('flex aspect-square items-center justify-center rounded-xl border', icon === key ? 'border-primary bg-primary-soft text-primary' : 'border-line text-muted')}
              >
                <Icon className="size-5" aria-hidden />
              </button>
            ))}
          </div>
        </Field>
        <Field label={t('categories.color')}>
          <div className="flex flex-wrap gap-2.5">
            {CATEGORY_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                aria-pressed={color === c}
                aria-label={c}
                className={cn('size-9 rounded-full ring-offset-2 ring-offset-surface', color === c && 'ring-2 ring-primary')}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </Field>
      </form>
    </Sheet>
  )
}
