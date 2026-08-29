import { toast } from '@/components/ui/toast'

export async function copyText(text: string, successMessage = '已复制到剪贴板'): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
    } else {
      const el = document.createElement('textarea')
      el.value = text
      el.style.position = 'fixed'
      el.style.opacity = '0'
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
    }
    toast({ title: successMessage, duration: 2500 })
    return true
  } catch {
    toast({ title: '复制失败', variant: 'destructive', duration: 3000 })
    return false
  }
}
