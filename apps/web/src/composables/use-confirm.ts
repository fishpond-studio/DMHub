import { ref, shallowRef } from 'vue'
import i18n from '@/i18n';

export interface ConfirmOptions {
  title?: string
  description: string
  confirmText?: string
  cancelText?: string
  variant?: 'default' | 'destructive'
}

const open = ref(false)
const options = shallowRef<ConfirmOptions>({ description: '' })
let resolver: ((value: boolean) => void) | null = null

export function confirmDialog(opts: ConfirmOptions): Promise<boolean> {
  options.value = {
    title: opts.title ?? i18n.global.t('确认操作'),
    description: opts.description,
    confirmText: opts.confirmText ?? i18n.global.t('确认'),
    cancelText: opts.cancelText ?? i18n.global.t('取消'),
    variant: opts.variant ?? 'default',
  }
  open.value = true
  return new Promise((resolve) => {
    resolver = resolve
  })
}

export function useConfirmState() {
  function resolve(value: boolean) {
    open.value = false
    resolver?.(value)
    resolver = null
  }

  return {
    open,
    options,
    confirm: resolve.bind(null, true),
    cancel: resolve.bind(null, false),
  }
}
