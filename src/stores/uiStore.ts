import { create } from 'zustand'

// Transient UI state only — persistent data lives in IndexedDB.

export type ToastTone = 'default' | 'success' | 'error'

export interface Toast {
  id: number
  message: string
  tone: ToastTone
  action?: { label: string; onClick: () => void }
}

export interface DialogAction {
  id: string
  label: string
  tone?: 'default' | 'primary' | 'danger'
}

export interface DialogRequest {
  id: number
  title: string
  message?: string
  details?: string[]
  actions: DialogAction[]
  cancelLabel: string
  resolve: (actionId: string | null) => void
}

interface UiState {
  toasts: Toast[]
  dialogs: DialogRequest[]
  pushToast: (toast: Omit<Toast, 'id'>) => number
  dismissToast: (id: number) => void
  pushDialog: (dialog: Omit<DialogRequest, 'id'>) => void
  closeDialog: (id: number, actionId: string | null) => void
}

let seq = 0

export const useUiStore = create<UiState>()((set, get) => ({
  toasts: [],
  dialogs: [],
  pushToast: (toast) => {
    const id = ++seq
    set((s) => ({ toasts: [...s.toasts.slice(-2), { ...toast, id }] }))
    return id
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  pushDialog: (dialog) => set((s) => ({ dialogs: [...s.dialogs, { ...dialog, id: ++seq }] })),
  closeDialog: (id, actionId) => {
    const dialog = get().dialogs.find((d) => d.id === id)
    set((s) => ({ dialogs: s.dialogs.filter((d) => d.id !== id) }))
    dialog?.resolve(actionId)
  },
}))

export function showToast(message: string, options: { tone?: ToastTone; action?: Toast['action'] } = {}): void {
  useUiStore.getState().pushToast({ message, tone: options.tone ?? 'default', action: options.action })
}

/** Shows a dialog and resolves with the chosen action id, or null when cancelled. */
export function askDialog(options: Omit<DialogRequest, 'id' | 'resolve'>): Promise<string | null> {
  return new Promise((resolve) => useUiStore.getState().pushDialog({ ...options, resolve }))
}
