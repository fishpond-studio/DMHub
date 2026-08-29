<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useDomainStore } from '@/stores/domain'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  LayoutDashboard,
  Globe,
  ScrollText,
  Settings,
  Upload,
  KeyRound,
  Search,
  Plus,
  User,
  Shield,
  FileKey,
} from 'lucide-vue-next'

const open = ref(false)
const query = ref('')
const activeIndex = ref(0)
const router = useRouter()
const authStore = useAuthStore()
const domainStore = useDomainStore()

const isAdmin = computed(() => authStore.user?.role === 'admin')

interface CommandItem {
  id: string
  label: string
  description?: string
  icon: any
  group: string
  keywords?: string
  action: () => void
}

const staticCommands = computed<CommandItem[]>(() => {
  const items: CommandItem[] = [
    {
      id: 'nav-dashboard',
      label: '仪表盘',
      description: '查看域名统计与到期提醒',
      icon: LayoutDashboard,
      group: '导航',
      keywords: 'dashboard home 首页',
      action: () => router.push('/dashboard'),
    },
    {
      id: 'nav-domains',
      label: '域名管理',
      description: '浏览与管理全部域名',
      icon: Globe,
      group: '导航',
      keywords: 'domains dns',
      action: () => router.push('/domains'),
    },
    {
      id: 'nav-search',
      label: '全局搜索',
      description: '搜索 DNS 主机、记录值、类型',
      icon: Search,
      group: '导航',
      keywords: 'search dig find 记录',
      action: () => router.push('/search'),
    },
    {
      id: 'nav-my-domains',
      label: '我的域名',
      description: '查看指派给我的域名',
      icon: KeyRound,
      group: '导航',
      keywords: 'my assigned',
      action: () => router.push('/my-domains'),
    },
    {
      id: 'nav-logs',
      label: '操作日志',
      description: '审计团队操作记录',
      icon: ScrollText,
      group: '导航',
      keywords: 'logs audit',
      action: () => router.push('/logs'),
    },
    {
      id: 'nav-settings',
      label: '系统设置',
      description: '团队与个人设置',
      icon: Settings,
      group: '导航',
      keywords: 'settings',
      action: () => router.push('/settings/team'),
    },
    {
      id: 'nav-profile',
      label: '个人资料',
      icon: User,
      group: '快捷',
      keywords: 'profile account',
      action: () => router.push('/settings/profile'),
    },
    {
      id: 'nav-2fa',
      label: '双因素认证',
      icon: Shield,
      group: '快捷',
      keywords: '2fa totp security',
      action: () => router.push('/settings/2fa'),
    },
    {
      id: 'nav-tokens',
      label: '我的令牌',
      icon: FileKey,
      group: '快捷',
      keywords: 'token api',
      action: () => router.push('/settings/user-tokens'),
    },
  ]

  if (isAdmin.value) {
    items.push(
      {
        id: 'nav-import',
        label: '批量导入',
        description: 'CSV 导入域名与解析记录',
        icon: Upload,
        group: '导航',
        keywords: 'import csv',
        action: () => router.push('/import'),
      },
      {
        id: 'action-add-domain',
        label: '添加域名',
        description: '创建新域名并关联 DNS 服务商',
        icon: Plus,
        group: '操作',
        keywords: 'add create domain',
        action: () => router.push({ path: '/domains', query: { add: '1' } }),
      },
      {
        id: 'nav-providers',
        label: 'DNS 服务商',
        icon: Globe,
        group: '快捷',
        keywords: 'cloudflare aliyun tencent provider',
        action: () => router.push('/settings/providers'),
      },
      {
        id: 'nav-members',
        label: '成员管理',
        icon: User,
        group: '快捷',
        keywords: 'members team',
        action: () => router.push('/settings/members'),
      },
    )
  }

  return items
})

const domainCommands = computed<CommandItem[]>(() =>
  domainStore.domains.slice(0, 50).map((d) => ({
    id: `domain-${d.id}`,
    label: d.name,
    description: [d.groupName, d.status === 'expired' ? '已过期' : null, d.providerName]
      .filter(Boolean)
      .join(' · ') || '查看域名详情',
    icon: Globe,
    group: '域名',
    keywords: `${d.name} ${(d.tags || []).join(' ')} ${d.groupName || ''}`,
    action: () => router.push(`/domains/${d.id}`),
  })),
)

const allCommands = computed(() => [...staticCommands.value, ...domainCommands.value])

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return allCommands.value
  const items = allCommands.value.filter((item) => {
    const hay = `${item.label} ${item.description || ''} ${item.keywords || ''} ${item.group}`.toLowerCase()
    return hay.includes(q)
  })
  // 有输入时追加「在全局搜索中查找」
  if (q.length >= 1) {
    items.unshift({
      id: 'action-global-search',
      label: `搜索 DNS：「${query.value.trim()}」`,
      description: '在全部有权限的记录中查找',
      icon: Search,
      group: '搜索',
      action: () => router.push({ path: '/search', query: { q: query.value.trim() } }),
    })
  }
  return items
})

const grouped = computed(() => {
  const map = new Map<string, CommandItem[]>()
  for (const item of filtered.value) {
    if (!map.has(item.group)) map.set(item.group, [])
    map.get(item.group)!.push(item)
  }
  return Array.from(map.entries())
})

const flatFiltered = computed(() => filtered.value)

watch(filtered, () => {
  activeIndex.value = 0
})

function runItem(item: CommandItem) {
  open.value = false
  query.value = ''
  item.action()
}

function onKeydown(e: KeyboardEvent) {
  const isMod = e.metaKey || e.ctrlKey
  if (isMod && e.key.toLowerCase() === 'k') {
    e.preventDefault()
    if (!authStore.token) return
    open.value = !open.value
    return
  }

  if (!open.value) return

  if (e.key === 'ArrowDown') {
    e.preventDefault()
    activeIndex.value = Math.min(activeIndex.value + 1, flatFiltered.value.length - 1)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    activeIndex.value = Math.max(activeIndex.value - 1, 0)
  } else if (e.key === 'Enter') {
    e.preventDefault()
    const item = flatFiltered.value[activeIndex.value]
    if (item) runItem(item)
  } else if (e.key === 'Escape') {
    open.value = false
  }
}

watch(open, async (v) => {
  if (v && domainStore.domains.length === 0) {
    try {
      await domainStore.fetchDomains()
    } catch {
      // ignore
    }
  }
})

onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => window.removeEventListener('keydown', onKeydown))

defineExpose({ open })
</script>

<template>
  <Dialog :open="open" @update:open="(v) => (open = v)">
    <DialogContent class="overflow-hidden p-0 gap-0 max-w-xl top-[20%] translate-y-0">
      <DialogTitle class="sr-only">命令面板</DialogTitle>
      <div class="flex items-center border-b px-3">
        <Search class="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
        <Input
          v-model="query"
          placeholder="搜索页面、域名或操作..."
          class="border-0 shadow-none focus-visible:ring-0 h-12 text-base"
          @keydown.stop
        />
        <kbd class="pointer-events-none hidden h-6 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground sm:inline-flex">
          ESC
        </kbd>
      </div>

      <div class="max-h-[360px] overflow-y-auto p-2">
        <div v-if="flatFiltered.length === 0" class="py-10 text-center text-sm text-muted-foreground">
          没有匹配结果
        </div>

        <div v-for="[group, items] in grouped" :key="group" class="mb-2">
          <p class="px-2 py-1.5 text-xs font-semibold text-muted-foreground">{{ group }}</p>
          <button
            v-for="item in items"
            :key="item.id"
            type="button"
            class="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm transition-colors"
            :class="flatFiltered[activeIndex]?.id === item.id
              ? 'bg-accent text-accent-foreground'
              : 'hover:bg-accent/60'"
            @mouseenter="activeIndex = flatFiltered.findIndex((i) => i.id === item.id)"
            @click="runItem(item)"
          >
            <component :is="item.icon" class="h-4 w-4 shrink-0 text-muted-foreground" />
            <div class="min-w-0 flex-1">
              <div class="truncate font-medium">{{ item.label }}</div>
              <div v-if="item.description" class="truncate text-xs text-muted-foreground">
                {{ item.description }}
              </div>
            </div>
          </button>
        </div>
      </div>

      <div class="flex items-center justify-between border-t bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
        <span>↑↓ 选择 · Enter 打开 · Esc 关闭</span>
        <span>Ctrl/⌘ + K</span>
      </div>
    </DialogContent>
  </Dialog>
</template>
