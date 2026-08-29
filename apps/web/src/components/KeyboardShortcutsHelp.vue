<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'

const open = ref(false)

const shortcuts = [
  { keys: ['Ctrl', 'K'], desc: '打开命令面板 / 全局搜索入口' },
  { keys: ['?'], desc: '显示本快捷键帮助' },
  { keys: ['Esc'], desc: '关闭对话框 / 命令面板' },
  { keys: ['G', 'D'], desc: '前往域名列表（命令面板内亦可）' },
  { keys: ['G', 'H'], desc: '前往仪表盘' },
]

function onKeydown(e: KeyboardEvent) {
  const target = e.target as HTMLElement | null
  const tag = target?.tagName?.toLowerCase()
  if (tag === 'input' || tag === 'textarea' || target?.isContentEditable) return

  if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey) {
    e.preventDefault()
    open.value = !open.value
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => window.removeEventListener('keydown', onKeydown))

defineExpose({ open: () => { open.value = true } })
</script>

<template>
  <Dialog :open="open" @update:open="(v) => (open = v)">
    <DialogContent class="max-w-md">
      <DialogHeader>
        <DialogTitle>键盘快捷键</DialogTitle>
        <DialogDescription>提高日常操作效率（输入框内不触发）</DialogDescription>
      </DialogHeader>
      <div class="space-y-2">
        <div
          v-for="s in shortcuts"
          :key="s.desc"
          class="flex items-center justify-between gap-3 rounded-lg border px-3 py-2"
        >
          <span class="text-sm text-muted-foreground">{{ s.desc }}</span>
          <div class="flex shrink-0 gap-1">
            <Badge
              v-for="k in s.keys"
              :key="k"
              variant="secondary"
              class="font-mono text-[11px]"
            >
              {{ k }}
            </Badge>
          </div>
        </div>
      </div>
      <p class="text-[11px] text-muted-foreground pt-1">
        提示：命令面板内可用 ↑↓ 选择、Enter 打开、Esc 关闭。
      </p>
    </DialogContent>
  </Dialog>
</template>
