import { ref } from 'vue'

export type ToastVariant = 'default' | 'destructive'

export interface Toast {
  id: string
  title?: string
  description?: string
  variant?: ToastVariant
  action?: {
    label: string
    onClick: () => void
  }
  duration?: number
}

const TOAST_LIMIT = 5
const TOAST_DEFAULT_DURATION = 120000

let count = 0

function genId() {
  count = (count + 1) % Number.MAX_SAFE_INTEGER
  return count.toString()
}

const toasts = ref<Toast[]>([])

const timeouts = new Map<string, ReturnType<typeof setTimeout>>()

function scheduleRemove(toastId: string, delay: number) {
  if (timeouts.has(toastId)) {
    clearTimeout(timeouts.get(toastId)!)
  }
  const timeout = setTimeout(() => {
    timeouts.delete(toastId)
    toasts.value = toasts.value.filter(t => t.id !== toastId)
  }, delay)
  timeouts.set(toastId, timeout)
}

export function toast(props: Omit<Toast, 'id'>) {
  const id = genId()

  toasts.value = [
    ...toasts.value,
    { id, ...props },
  ].slice(-TOAST_LIMIT)

  const duration = props.duration ?? TOAST_DEFAULT_DURATION
  if (duration > 0) {
    scheduleRemove(id, duration)
  }

  return id
}

export function dismissToast(toastId?: string) {
  if (toastId) {
    scheduleRemove(toastId, 0)
  }
  else {
    toasts.value.forEach(t => scheduleRemove(t.id, 0))
  }
}

export function useToast() {
  return {
    toasts,
    toast,
    dismiss: dismissToast,
  }
}
