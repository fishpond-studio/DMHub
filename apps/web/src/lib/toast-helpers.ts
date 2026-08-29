import { toast } from '@/components/ui/toast'

export function toastSuccess(title: string, description?: string) {
  return toast({ title, description, duration: 3500 })
}

export function toastError(title: string, description?: string) {
  return toast({ title, description, variant: 'destructive', duration: 5000 })
}

export function toastInfo(title: string, description?: string) {
  return toast({ title, description, duration: 3500 })
}
