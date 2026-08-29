<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useNotificationStore, type Notification } from '@/stores/notification'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Bell, CheckCheck, Trash2, ExternalLink, Inbox } from 'lucide-vue-next'

const store = useNotificationStore()
const router = useRouter()
const open = ref(false)

const unread = computed(() => store.unreadCount)
const list = computed(() => store.notifications)

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时前`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days} 天前`
  return new Date(dateStr).toLocaleString('zh-CN')
}

function levelClass(level: string) {
  if (level === 'critical' || level === 'warning') return 'border-l-destructive'
  return 'border-l-primary'
}

async function onOpenItem(n: Notification) {
  if (!n.read) await store.markRead(n.id)
  const meta = n.metadata || {}
  if (meta.domainId && (meta.type === 'assignment' || meta.action === 'create' || meta.action === 'approve')) {
    open.value = false
    router.push(`/domains/${meta.domainId}`)
    return
  }
  if (meta.type === 'assignment_request' && meta.action === 'create') {
    open.value = false
    router.push('/settings/assignment-approval')
  }
}

async function markAll() {
  await store.markAllRead()
}

async function clearAll() {
  await store.clearAll()
}
</script>

<template>
  <Popover v-model:open="open">
    <PopoverTrigger as-child>
      <Button variant="ghost" size="icon" class="relative h-8 w-8" title="站内消息">
        <Bell class="h-4 w-4" />
        <span
          v-if="unread > 0"
          class="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium text-destructive-foreground"
        >
          {{ unread > 99 ? '99+' : unread }}
        </span>
      </Button>
    </PopoverTrigger>
    <PopoverContent align="end" class="w-[360px] p-0 sm:w-[400px]">
      <div class="flex items-center justify-between border-b px-3 py-2.5">
        <div class="flex items-center gap-2">
          <span class="text-sm font-semibold">站内消息</span>
          <Badge v-if="unread > 0" variant="secondary" class="h-5 px-1.5 text-[10px]">
            {{ unread }} 未读
          </Badge>
        </div>
        <div class="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            class="h-7 px-2 text-xs"
            :disabled="unread === 0"
            @click="markAll"
          >
            <CheckCheck class="mr-1 h-3.5 w-3.5" />
            全部已读
          </Button>
          <Button
            variant="ghost"
            size="sm"
            class="h-7 px-2 text-xs text-muted-foreground"
            :disabled="list.length === 0"
            @click="clearAll"
          >
            <Trash2 class="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div class="max-h-[380px] overflow-y-auto">
        <div v-if="list.length === 0" class="flex flex-col items-center justify-center px-4 py-12 text-center">
          <Inbox class="mb-2 h-8 w-8 text-muted-foreground/50" />
          <p class="text-sm text-muted-foreground">暂无消息</p>
          <p class="mt-1 text-xs text-muted-foreground">域名分配、审批结果会显示在这里</p>
        </div>

        <button
          v-for="n in list"
          :key="n.id"
          type="button"
          class="flex w-full gap-2 border-b border-l-2 px-3 py-3 text-left transition-colors last:border-b-0 hover:bg-muted/50"
          :class="[
            levelClass(String(n.level)),
            n.read ? 'bg-background opacity-80' : 'bg-primary/[0.03]',
          ]"
          @click="onOpenItem(n)"
        >
          <div class="min-w-0 flex-1">
            <div class="flex items-start justify-between gap-2">
              <p class="text-sm font-medium leading-snug" :class="n.read ? 'text-muted-foreground' : 'text-foreground'">
                {{ n.title }}
              </p>
              <span v-if="!n.read" class="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
            </div>
            <p class="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
              {{ n.content }}
            </p>
            <div class="mt-1.5 flex items-center justify-between gap-2">
              <span class="text-[11px] text-muted-foreground">{{ timeAgo(n.createdAt) }}</span>
              <span
                v-if="n.metadata?.domainId || n.metadata?.type === 'assignment_request'"
                class="inline-flex items-center text-[11px] text-primary"
              >
                查看
                <ExternalLink class="ml-0.5 h-3 w-3" />
              </span>
            </div>
          </div>
        </button>
      </div>
    </PopoverContent>
  </Popover>
</template>
