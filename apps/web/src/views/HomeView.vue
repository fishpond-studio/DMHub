<template>
  <div class="min-h-screen bg-background ">
    <div class="app-container py-6 md:py-8">
      <PageHeader
        title="仪表盘"
        description="域名健康、到期风险与团队动态一览"
      >
        <template #actions>
          <Button variant="outline" size="sm" @click="refresh" :disabled="store.loading">
            <RefreshCw class="mr-1.5 h-4 w-4" :class="store.loading ? 'animate-spin' : ''" />
            刷新
          </Button>
          <Button v-if="isAdmin" size="sm" @click="$router.push({ path: '/domains', query: { add: '1' } })">
            <Plus class="mr-1.5 h-4 w-4" />
            添加域名
          </Button>
        </template>
      </PageHeader>

      <div v-if="store.loading && !store.stats" class="space-y-6">
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Skeleton v-for="i in 4" :key="i" class="h-28 rounded-xl" />
        </div>
        <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Skeleton class="h-80 rounded-xl" />
          <Skeleton class="h-80 rounded-xl" />
        </div>
      </div>

      <template v-else>
        <div class="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card
            v-for="(card, i) in statCards"
            :key="card.label"
            class="card-hover animate-fade-in overflow-hidden"
            :class="'stagger-' + (i + 1)"
          >
            <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardDescription class="text-[13px] font-medium">{{ card.label }}</CardDescription>
              <div class="flex h-8 w-8 items-center justify-center rounded-lg" :class="card.iconBg">
                <component :is="card.icon" class="h-4 w-4" :class="card.iconColor" />
              </div>
            </CardHeader>
            <CardContent>
              <div class="tnum text-[28px] font-semibold leading-none tracking-tight">{{ card.value }}</div>
              <div v-if="card.subHtml" class="mt-1.5 text-xs text-muted-foreground" v-html="card.subHtml" />
              <p v-else-if="card.hint" class="mt-1.5 text-xs text-muted-foreground">{{ card.hint }}</p>
            </CardContent>
          </Card>
        </div>

        <div class="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Button
            v-for="action in quickActions"
            :key="action.label"
            variant="outline"
            class="h-auto justify-start gap-3 px-3 py-3"
            @click="action.run()"
          >
            <div class="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
              <component :is="action.icon" class="h-4 w-4" />
            </div>
            <div class="text-left">
              <div class="text-sm font-medium">{{ action.label }}</div>
              <div class="text-[11px] text-muted-foreground">{{ action.desc }}</div>
            </div>
          </Button>
        </div>

        <div v-if="recentDomains.length" class="mb-6">
          <div class="mb-2 flex items-center justify-between">
            <h2 class="text-sm font-medium text-muted-foreground">最近访问</h2>
            <Button variant="ghost" size="sm" class="h-7 text-xs" @click="clearRecent">清空</Button>
          </div>
          <div class="flex flex-wrap gap-2">
            <Button
              v-for="d in recentDomains"
              :key="d.id"
              variant="secondary"
              size="sm"
              class="h-8"
              @click="router.push(`/domains/${d.id}`)"
            >
              <Clock class="mr-1.5 h-3.5 w-3.5 text-muted-foreground" />
              {{ d.name }}
            </Button>
          </div>
        </div>

        <Card v-if="store.healthSummary" class="mb-8 animate-fade-in">
          <CardHeader class="pb-3">
            <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle class="text-base">域名健康</CardTitle>
                <CardDescription>综合到期、记录与服务商绑定评估</CardDescription>
              </div>
              <div class="flex items-center gap-3 text-sm">
                <span class="tabular-nums">
                  均分 <strong class="text-lg">{{ store.healthSummary.avgScore }}</strong>
                </span>
                <Badge variant="default">健康 {{ store.healthSummary.healthy }}</Badge>
                <Badge variant="secondary">关注 {{ store.healthSummary.warning }}</Badge>
                <Badge variant="destructive">风险 {{ store.healthSummary.critical }}</Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <EmptyState
              v-if="!store.healthDomains.length"
              class="!border-0 !bg-transparent !py-6"
              title="暂无域名"
              description="添加域名后即可查看健康评分"
            />
            <div v-else class="space-y-2">
              <button
                v-for="d in store.healthDomains.slice(0, 8)"
                :key="d.domainId"
                type="button"
                class="flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors hover:bg-muted/50"
                @click="router.push(`/domains/${d.domainId}`)"
              >
                <div
                  class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold tabular-nums"
                  :class="healthScoreClass(d.level)"
                >
                  {{ d.score }}
                </div>
                <div class="min-w-0 flex-1">
                  <div class="truncate font-record font-medium">{{ d.name }}</div>
                  <div class="truncate tnum text-xs text-muted-foreground">
                    {{ d.issues[0] || '状态良好' }}
                    <span v-if="d.daysRemaining != null"> · {{ d.daysRemaining }} 天到期</span>
                    · {{ d.recordCount }} 条记录
                  </div>
                </div>
                <Badge :variant="healthBadgeVariant(d.level)" class="shrink-0">
                  {{ healthLevelLabel(d.level) }}
                </Badge>
              </button>
            </div>
          </CardContent>
        </Card>

        <div class="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card class="animate-fade-in stagger-5">
            <CardHeader>
              <CardTitle class="text-base">到期日历</CardTitle>
              <CardDescription>域名到期日期分布</CardDescription>
            </CardHeader>
            <CardContent>
              <div class="space-y-3">
                <div class="flex items-center justify-between">
                  <Button
                    variant="ghost"
                    size="sm"
                    @click="calendarMonth--; if (calendarMonth < 0) { calendarMonth = 11; calendarYear-- }"
                  >
                    ←
                  </Button>
                  <span class="text-sm font-medium">{{ calendarYear }} 年 {{ calendarMonth + 1 }} 月</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    @click="calendarMonth++; if (calendarMonth > 11) { calendarMonth = 0; calendarYear++ }"
                  >
                    →
                  </Button>
                </div>
                <div class="grid grid-cols-7 gap-1 text-center">
                  <div
                    v-for="day in ['日', '一', '二', '三', '四', '五', '六']"
                    :key="day"
                    class="py-1 text-xs text-muted-foreground"
                  >
                    {{ day }}
                  </div>
                  <div
                    v-for="cell in calendarCells"
                    :key="cell.key"
                    class="relative flex aspect-square items-center justify-center rounded-md text-sm transition-colors"
                    :class="[
                      cell.isCurrentMonth ? 'text-foreground' : 'text-muted-foreground/40',
                      cell.hasExpiry ? 'bg-primary/5 hover:bg-primary/10 cursor-default' : '',
                      cell.isToday ? 'ring-1 ring-primary/40' : '',
                    ]"
                    :title="cell.hasExpiry ? `有域名 ${cell.daysUntil} 天后到期` : undefined"
                  >
                    <span :class="cell.hasExpiry ? 'font-bold' : ''" :style="expiryDayStyle(cell)">
                      {{ cell.day }}
                    </span>
                    <span
                      v-if="cell.hasExpiry"
                      class="absolute bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full"
                      :class="cell.daysUntil !== null && cell.daysUntil <= 7 ? 'bg-destructive' : 'bg-primary'"
                    />
                  </div>
                </div>
                <div class="flex items-center gap-4 pt-1 text-xs text-muted-foreground">
                  <span class="flex items-center gap-1">
                    <span class="h-2 w-2 rounded-full bg-destructive" />
                    7天内到期
                  </span>
                  <span class="flex items-center gap-1">
                    <span class="h-2 w-2 rounded-full bg-primary" />
                    30天内到期
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card class="animate-fade-in stagger-6">
            <CardHeader class="flex flex-row items-center justify-between">
              <div>
                <CardTitle class="text-base">即将过期的域名</CardTitle>
                <CardDescription>30 天内到期，优先处理</CardDescription>
              </div>
              <Button variant="ghost" size="sm" class="text-xs" @click="$router.push('/domains?status=active')">
                查看全部
              </Button>
            </CardHeader>
            <CardContent>
              <EmptyState
                v-if="store.expiring.length === 0"
                class="!border-0 !bg-transparent !py-8"
                title="暂无即将过期域名"
                description="继续保持，记得定期检查 WHOIS 到期时间"
              />
              <Table v-else>
                <TableBody>
                  <TableRow
                    v-for="(d, di) in store.expiring"
                    :key="d.domainId"
                    class="cursor-pointer animate-fade-in-fast"
                    :class="'stagger-' + Math.min(di + 1, 8)"
                    @click="$router.push(`/domains/${d.domainId}`)"
                  >
                    <TableCell class="font-record font-medium">{{ d.domain }}</TableCell>
                    <TableCell class="tnum text-xs text-muted-foreground">{{ formatDate(d.expiresAt) }}</TableCell>
                    <TableCell class="text-right">
                      <Badge :variant="urgencyVariant(d.daysRemaining)">{{ d.daysRemaining }} 天</Badge>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card class="animate-fade-in stagger-7 lg:col-span-2">
            <CardHeader class="flex flex-row items-center justify-between">
              <div>
                <CardTitle class="text-base">最近活动</CardTitle>
                <CardDescription>团队成员的最新操作</CardDescription>
              </div>
              <Button variant="ghost" size="sm" class="text-xs" @click="$router.push('/logs')">
                全部日志
              </Button>
            </CardHeader>
            <CardContent>
              <EmptyState
                v-if="store.activity.length === 0"
                class="!border-0 !bg-transparent !py-8"
                title="暂无活动记录"
                description="添加域名或修改解析后，这里会显示动态"
              />
              <ul v-else class="divide-y divide-border">
                <li
                  v-for="(a, i) in store.activity"
                  :key="i"
                  class="flex items-start gap-3 py-3 first:pt-0 last:pb-0 animate-fade-in-fast"
                  :class="'stagger-' + Math.min(i + 1, 8)"
                >
                  <span class="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
                    <CheckCircle2 :class="actionColor(a.action)" class="h-4 w-4" />
                  </span>
                  <div class="min-w-0 flex-1">
                    <p class="text-sm">
                      <span class="font-medium">{{ a.userName }}</span>
                      <span class="mx-1 text-muted-foreground">{{ actionLabel(a.action) }}</span>
                      <span class="font-medium text-foreground">{{ a.targetName }}</span>
                    </p>
                    <p class="mt-0.5 text-xs text-muted-foreground">{{ timeAgo(a.createdAt) }}</p>
                  </div>
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>

        <Card class="animate-fade-in stagger-8">
          <CardHeader>
            <CardTitle class="text-base">DNS 记录类型分布</CardTitle>
            <CardDescription>当前团队解析记录构成</CardDescription>
          </CardHeader>
          <CardContent>
            <EmptyState
              v-if="!store.distribution || store.distribution.labels.length === 0"
              class="!border-0 !bg-transparent !py-8"
              title="暂无记录数据"
              description="同步或添加 DNS 记录后即可看到分布"
            />
            <div v-else class="space-y-3">
              <div
                v-for="(label, i) in store.distribution.labels"
                :key="label"
                class="flex items-center gap-3"
              >
                <span class="w-16 text-right text-sm font-medium text-foreground">{{ label }}</span>
                <div class="h-5 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    class="h-full rounded-full transition-all duration-700 ease-out"
                    :class="barColor(i)"
                    :style="{ width: barWidth(i) + '%' }"
                  />
                </div>
                <span class="w-12 text-right text-sm tabular-nums text-muted-foreground">
                  {{ store.distribution.data[i] }}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useDashboardStore } from '@/stores/dashboard'
import { useAuthStore } from '@/stores/auth'
import PageHeader from '@/components/common/PageHeader.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableRow, TableCell } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import {
  CheckCircle2,
  Globe,
  FileText,
  Users,
  Activity,
  Plus,
  RefreshCw,
  Upload,
  ScrollText,
  Settings,
  Clock,
} from 'lucide-vue-next'
import { clearRecentDomains, getRecentDomains, type RecentDomain } from '@/lib/recent-domains'

const store = useDashboardStore()
const authStore = useAuthStore()
const router = useRouter()
const isAdmin = computed(() => authStore.user?.role === 'admin')
const recentDomains = ref<RecentDomain[]>([])

function refreshRecent() {
  recentDomains.value = getRecentDomains()
}

function clearRecent() {
  clearRecentDomains()
  refreshRecent()
}

function healthScoreClass(level: string) {
  if (level === 'healthy') return 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
  if (level === 'warning') return 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
  return 'bg-destructive/15 text-destructive'
}

function healthBadgeVariant(level: string): 'default' | 'secondary' | 'destructive' {
  if (level === 'healthy') return 'default'
  if (level === 'warning') return 'secondary'
  return 'destructive'
}

function healthLevelLabel(level: string) {
  if (level === 'healthy') return '健康'
  if (level === 'warning') return '关注'
  return '风险'
}

const calendarYear = ref(new Date().getFullYear())
const calendarMonth = ref(new Date().getMonth())
const today = new Date()

const quickActions = computed(() => {
  const actions = [
    {
      label: '域名列表',
      desc: '管理全部域名',
      icon: Globe,
      run: () => router.push('/domains'),
    },
    {
      label: '操作日志',
      desc: '审计变更记录',
      icon: ScrollText,
      run: () => router.push('/logs'),
    },
    {
      label: '系统设置',
      desc: '团队与通知',
      icon: Settings,
      run: () => router.push('/settings/team'),
    },
  ]
  if (isAdmin.value) {
    actions.splice(1, 0, {
      label: '批量导入',
      desc: 'CSV 导入域名',
      icon: Upload,
      run: () => router.push('/import'),
    })
  } else {
    actions.splice(1, 0, {
      label: '我的域名',
      desc: '指派给我的',
      icon: Globe,
      run: () => router.push('/my-domains'),
    })
  }
  return actions.slice(0, 4)
})

const expiryMap = computed(() => {
  const map = new Map<string, number>()
  for (const d of store.expiring) {
    const date = new Date(d.expiresAt)
    const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
    const existing = map.get(key)
    if (existing === undefined || d.daysRemaining < existing) {
      map.set(key, d.daysRemaining)
    }
  }
  return map
})

interface CalendarCell {
  key: string
  day: number
  isCurrentMonth: boolean
  hasExpiry: boolean
  daysUntil: number | null
  isToday: boolean
}

const calendarCells = computed(() => {
  const year = calendarYear.value
  const month = calendarMonth.value
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const prevDays = new Date(year, month, 0).getDate()
  const cells: CalendarCell[] = []

  for (let i = firstDay - 1; i >= 0; i--) {
    const day = prevDays - i
    const m = month === 0 ? 11 : month - 1
    const y = month === 0 ? year - 1 : year
    const key = `${y}-${m}-${day}`
    const daysUntil = expiryMap.value.get(key) ?? null
    cells.push({
      key,
      day,
      isCurrentMonth: false,
      hasExpiry: daysUntil !== null,
      daysUntil,
      isToday: false,
    })
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const key = `${year}-${month}-${day}`
    const daysUntil = expiryMap.value.get(key) ?? null
    cells.push({
      key,
      day,
      isCurrentMonth: true,
      hasExpiry: daysUntil !== null,
      daysUntil,
      isToday:
        year === today.getFullYear() && month === today.getMonth() && day === today.getDate(),
    })
  }

  const remaining = 42 - cells.length
  for (let day = 1; day <= remaining; day++) {
    const m = month === 11 ? 0 : month + 1
    const y = month === 11 ? year + 1 : year
    const key = `${y}-${m}-${day}`
    const daysUntil = expiryMap.value.get(key) ?? null
    cells.push({
      key,
      day,
      isCurrentMonth: false,
      hasExpiry: daysUntil !== null,
      daysUntil,
      isToday: false,
    })
  }

  return cells
})

function expiryDayStyle(cell: CalendarCell) {
  if (!cell.hasExpiry || cell.daysUntil === null) return undefined
  if (cell.daysUntil <= 7) return { color: 'hsl(var(--destructive))' }
  if (cell.daysUntil <= 30) return { color: 'hsl(var(--primary))' }
  return undefined
}

function urgencyVariant(days: number): 'destructive' | 'outline' | 'secondary' {
  if (days <= 7) return 'destructive'
  if (days <= 14) return 'outline'
  return 'secondary'
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('zh-CN')
}

function actionLabel(action: string) {
  const map: Record<string, string> = {
    'domain.add': '添加了域名',
    'domain.delete': '删除了域名',
    'record.create': '创建了记录',
    'record.update': '更新了记录',
    'record.delete': '删除了记录',
    'record.sync': '同步了记录',
    'import.domains': '批量导入了域名',
    'import.records': '批量导入了记录',
  }
  return map[action] || action
}

function actionColor(action: string) {
  if (action.includes('add') || action.includes('create') || action.includes('import')) return 'text-success'
  if (action.includes('delete')) return 'text-destructive'
  if (action.includes('update')) return 'text-info'
  if (action.includes('sync')) return 'text-chart-3'
  return 'text-muted-foreground'
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes}分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}小时前`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}天前`
  return new Date(dateStr).toLocaleDateString('zh-CN')
}

// 图表色走 chart-1..5 令牌，浅色/深色各有一套取值，避免写死 Tailwind 调色板
const barColors = ['bg-chart-1', 'bg-chart-2', 'bg-chart-3', 'bg-chart-4', 'bg-chart-5']

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const statCards = computed(() => [
  {
    label: '域名总数',
    value: store.stats?.totalDomains ?? 0,
    icon: Globe,
    iconBg: 'bg-chart-1/15',
    iconColor: 'text-chart-1',
    subHtml: `<span class="text-primary">${escapeHtml(String(store.stats?.activeDomains ?? 0))} 正常</span><span class="mx-1">/</span><span class="text-destructive">${escapeHtml(String(store.stats?.expiredDomains ?? 0))} 已过期</span>`,
    hint: '',
  },
  {
    label: 'DNS 记录',
    value: store.stats?.totalRecords ?? 0,
    icon: FileText,
    iconBg: 'bg-chart-2/15',
    iconColor: 'text-chart-2',
    subHtml: Object.entries(store.stats?.recordsByType ?? {})
      .slice(0, 4)
      .map(
        ([t, c]) =>
          `<span class="inline-block mr-1.5 text-xs bg-secondary rounded px-1.5 py-0.5">${escapeHtml(t)}: ${escapeHtml(String(c))}</span>`,
      )
      .join(''),
    hint: '',
  },
  {
    label: '团队成员',
    value: store.stats?.totalMembers ?? 0,
    icon: Users,
    iconBg: 'bg-chart-4/15',
    iconColor: 'text-chart-4',
    subHtml: '',
    hint: '当前团队规模',
  },
  {
    label: '近7天变更',
    value: store.stats?.recentChanges ?? 0,
    icon: Activity,
    iconBg: 'bg-chart-3/15',
    iconColor: 'text-chart-3',
    subHtml: '',
    hint: '解析与域名相关操作',
  },
])

function barColor(i: number) {
  return barColors[i % barColors.length]
}

function barWidth(i: number) {
  if (!store.distribution) return 0
  const max = Math.max(...store.distribution.data, 1)
  return (store.distribution.data[i] / max) * 100
}

function refresh() {
  store.fetchAll()
}

onMounted(() => {
  refreshRecent()
  store.fetchAll()
})
</script>
