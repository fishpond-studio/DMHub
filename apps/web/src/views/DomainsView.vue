<template>
  <div class="min-h-screen bg-background">
    <div class="mx-auto max-w-7xl px-4 py-6 md:py-8">
      <PageHeader
        title="域名管理"
        description="管理团队域名、分组、标签与到期状态"
        back-to="/dashboard"
        show-back
      >
        <template #actions>
          <Button
            size="sm"
            :variant="onlyFavorites ? 'secondary' : 'outline'"
            @click="onlyFavorites = !onlyFavorites"
          >
            <Star class="mr-1.5 h-4 w-4" :class="onlyFavorites ? 'fill-yellow-400 text-yellow-500' : ''" />
            收藏
          </Button>
          <Button v-if="isAdmin" variant="outline" size="sm" :disabled="batchChecking" @click="handleBatchExpiry">
            <RefreshCw class="mr-1.5 h-4 w-4" :class="batchChecking ? 'animate-spin' : ''" />
            {{ batchChecking ? '检查中…' : '批量查到期' }}
          </Button>
          <Button v-if="isAdmin" variant="outline" size="sm" @click="handleExport">
            <Download class="mr-1.5 h-4 w-4" />
            导出
          </Button>
          <Button v-if="isAdmin" variant="outline" size="sm" @click="$router.push('/import')">
            <Upload class="mr-1.5 h-4 w-4" />
            导入
          </Button>
          <Button v-if="isAdmin" size="sm" @click="showAddDialog = true">
            <Plus class="mr-1.5 h-4 w-4" />
            添加域名
          </Button>
        </template>
      </PageHeader>

      <div class="mb-4 md:hidden">
        <Button variant="outline" size="sm" class="w-full" @click="showFilters = !showFilters">
          <Filter class="mr-1 h-4 w-4" />
          {{ showFilters ? '收起筛选' : '展开筛选' }}
          <span v-if="activeFilterCount" class="ml-1 text-xs text-primary">({{ activeFilterCount }})</span>
        </Button>
      </div>

      <div v-if="showFilters" class="mb-4 space-y-3 md:hidden">
        <Card>
          <CardHeader class="px-4 pb-2 pt-3">
            <CardTitle class="text-xs font-semibold uppercase text-muted-foreground">分组</CardTitle>
          </CardHeader>
          <CardContent class="px-2 pb-3">
            <div class="flex flex-wrap gap-1">
              <Button
                size="sm"
                :variant="!groupFilter ? 'secondary' : 'ghost'"
                @click="groupFilter = ''; fetchList()"
              >
                全部
              </Button>
              <Button
                v-for="g in store.groups"
                :key="g.name"
                size="sm"
                :variant="groupFilter === g.name ? 'secondary' : 'ghost'"
                @click="groupFilter = g.name; fetchList()"
              >
                {{ g.name }}
                <span class="ml-1 text-xs text-muted-foreground">{{ g.count }}</span>
              </Button>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader class="px-4 pb-2 pt-3">
            <CardTitle class="text-xs font-semibold uppercase text-muted-foreground">标签</CardTitle>
          </CardHeader>
          <CardContent class="px-3 pb-3">
            <div class="flex flex-wrap gap-1.5">
              <Badge
                v-for="t in store.tags"
                :key="t.name"
                :variant="selectedTags.includes(t.name) ? 'default' : 'outline'"
                class="cursor-pointer"
                @click="toggleTagFilter(t.name)"
              >
                {{ t.name }}
                <span class="ml-1 opacity-60">{{ t.count }}</span>
              </Badge>
              <div v-if="store.tags.length === 0" class="text-xs text-muted-foreground">暂无标签</div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div class="flex gap-6">
        <aside class="hidden w-56 shrink-0 md:block">
          <Card class="mb-4 sticky top-20">
            <CardHeader class="px-4 pb-2 pt-4">
              <CardTitle class="text-xs font-semibold uppercase text-muted-foreground">分组</CardTitle>
            </CardHeader>
            <CardContent class="space-y-1 px-2 pb-3">
              <Button
                size="sm"
                class="w-full justify-start"
                :variant="!groupFilter ? 'secondary' : 'ghost'"
                @click="groupFilter = ''; fetchList()"
              >
                全部
              </Button>
              <Button
                v-for="g in store.groups"
                :key="g.name"
                size="sm"
                class="w-full justify-between"
                :variant="groupFilter === g.name ? 'secondary' : 'ghost'"
                @click="groupFilter = g.name; fetchList()"
              >
                <span class="truncate">{{ g.name }}</span>
                <span class="text-xs text-muted-foreground">{{ g.count }}</span>
              </Button>
            </CardContent>
          </Card>

          <Card class="sticky top-[22rem]">
            <CardHeader class="px-4 pb-2 pt-4">
              <CardTitle class="text-xs font-semibold uppercase text-muted-foreground">标签</CardTitle>
            </CardHeader>
            <CardContent class="px-4 pb-4">
              <div class="flex flex-wrap gap-1.5">
                <Badge
                  v-for="t in store.tags"
                  :key="t.name"
                  :variant="selectedTags.includes(t.name) ? 'default' : 'outline'"
                  class="cursor-pointer transition-colors"
                  @click="toggleTagFilter(t.name)"
                >
                  {{ t.name }}
                  <span class="ml-1 opacity-60">{{ t.count }}</span>
                </Badge>
                <div v-if="store.tags.length === 0" class="text-xs text-muted-foreground">暂无标签</div>
              </div>
            </CardContent>
          </Card>
        </aside>

        <div class="min-w-0 flex-1">
          <div class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <div class="relative flex-1">
              <Search class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                v-model="searchQuery"
                type="text"
                placeholder="搜索域名..."
                class="pl-9"
                @input="debouncedFetch"
              />
            </div>
            <Select v-model="statusFilter" @update:model-value="fetchList">
              <SelectTrigger class="w-full sm:w-[140px]">
                <SelectValue placeholder="全部状态" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部状态</SelectItem>
                <SelectItem value="active">正常</SelectItem>
                <SelectItem value="expired">已过期</SelectItem>
                <SelectItem value="transferred">已转移</SelectItem>
              </SelectContent>
            </Select>
            <Select v-model="sortBy">
              <SelectTrigger class="w-full sm:w-[150px]">
                <SelectValue placeholder="排序" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="name">按名称</SelectItem>
                <SelectItem value="expiry">按到期时间</SelectItem>
                <SelectItem value="records">按记录数</SelectItem>
                <SelectItem value="updated">按更新时间</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div v-if="activeFilterCount" class="mb-3 flex flex-wrap items-center gap-2">
            <span class="text-xs text-muted-foreground">已筛选</span>
            <Badge v-if="groupFilter" variant="secondary" class="gap-1">
              分组: {{ groupFilter }}
              <button class="opacity-60 hover:opacity-100" @click="groupFilter = ''; fetchList()">×</button>
            </Badge>
            <Badge v-for="t in selectedTags" :key="t" variant="secondary" class="gap-1">
              {{ t }}
              <button class="opacity-60 hover:opacity-100" @click="toggleTagFilter(t)">×</button>
            </Badge>
            <Button variant="ghost" size="sm" class="h-6 text-xs" @click="clearFilters">清除</Button>
          </div>

          <div v-if="store.loading" class="space-y-3">
            <Skeleton v-for="i in 6" :key="i" class="h-14 w-full rounded-lg" />
          </div>

          <EmptyState
            v-else-if="filteredDomains.length === 0"
            :icon="Globe"
            :title="hasAnyFilter ? '没有匹配的域名' : '还没有域名'"
            :description="hasAnyFilter ? '试试调整搜索或筛选条件' : '添加第一个域名，开始统一管理解析与到期提醒'"
            :action-label="isAdmin && !hasAnyFilter ? '添加域名' : undefined"
            :secondary-label="hasAnyFilter ? '清除筛选' : undefined"
            @action="showAddDialog = true"
            @secondary="clearFilters"
          />

          <div v-else>
            <div class="mb-2 flex items-center justify-between text-xs text-muted-foreground">
              <span>共 {{ filteredDomains.length }} 个域名</span>
            </div>

            <div class="hidden overflow-hidden rounded-xl border md:block">
              <Table>
                <TableHeader>
                  <TableRow class="bg-muted/40 hover:bg-muted/40">
                    <TableHead>域名</TableHead>
                    <TableHead>服务商</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead>到期时间</TableHead>
                    <TableHead>标签</TableHead>
                    <TableHead>分组</TableHead>
                    <TableHead class="text-right">记录</TableHead>
                    <TableHead class="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow
                    v-for="(d, di) in filteredDomains"
                    :key="d.id"
                    class="group cursor-pointer animate-fade-in-fast"
                    :class="'stagger-' + Math.min(di + 1, 8)"
                    @click="$router.push(`/domains/${d.id}`)"
                  >
                    <TableCell>
                      <div class="min-w-0">
                        <div class="flex items-center gap-1.5">
                          <button
                            type="button"
                            class="shrink-0 text-muted-foreground hover:text-yellow-500"
                            title="收藏"
                            @click.stop="toggleFav(d.id)"
                          >
                            <Star class="h-3.5 w-3.5" :class="favSet.has(d.id) ? 'fill-yellow-400 text-yellow-500' : ''" />
                          </button>
                          <span class="font-medium text-primary">{{ d.name }}</span>
                        </div>
                        <div
                          v-if="!isAdmin && d.assignments?.length"
                          class="mt-0.5 flex flex-wrap gap-1"
                        >
                          <span
                            v-for="scope in d.assignments"
                            :key="scope.id"
                            class="inline-flex max-w-[200px] truncate rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
                            :title="formatScopeLabel(scope.subdomainPattern)"
                          >
                            {{ formatHostPreview(d.name, scope.subdomainPattern) }}
                          </span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell class="text-muted-foreground">{{ d.providerName || '-' }}</TableCell>
                    <TableCell>
                      <Badge :variant="statusVariant(d.status)">{{ statusLabel(d.status) }}</Badge>
                    </TableCell>
                    <TableCell>
                      <span v-if="d.expiresAt" :class="expiryClass(d.expiresAt)">
                        {{ formatExpiry(d.expiresAt) }}
                      </span>
                      <span v-else class="text-muted-foreground">-</span>
                    </TableCell>
                    <TableCell>
                      <div class="flex max-w-[160px] flex-wrap gap-1">
                        <Badge v-for="tag in (d.tags || []).slice(0, 3)" :key="tag" variant="secondary" class="text-xs">
                          {{ tag }}
                        </Badge>
                        <span v-if="(d.tags?.length || 0) > 3" class="text-xs text-muted-foreground">
                          +{{ d.tags!.length - 3 }}
                        </span>
                        <span v-if="!d.tags || d.tags.length === 0" class="text-sm text-muted-foreground">-</span>
                      </div>
                    </TableCell>
                    <TableCell class="text-muted-foreground">{{ d.groupName || '-' }}</TableCell>
                    <TableCell class="text-right tabular-nums text-muted-foreground">{{ d.recordCount }}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        class="h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100"
                        title="复制域名"
                        @click.stop="copyText(d.name, '域名已复制')"
                      >
                        <Copy class="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>

            <div class="space-y-3 md:hidden">
              <Card
                v-for="(d, di) in filteredDomains"
                :key="d.id"
                class="cursor-pointer card-hover"
                :class="'animate-fade-in-fast stagger-' + Math.min(di + 1, 8)"
                @click="$router.push(`/domains/${d.id}`)"
              >
                <CardContent class="p-4">
                  <div class="mb-2 flex items-center justify-between gap-2">
                    <span class="truncate font-medium text-primary">{{ d.name }}</span>
                    <div class="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        class="h-7 w-7"
                        @click.stop="copyText(d.name, '域名已复制')"
                      >
                        <Copy class="h-3.5 w-3.5" />
                      </Button>
                      <Badge :variant="statusVariant(d.status)">{{ statusLabel(d.status) }}</Badge>
                    </div>
                  </div>
                  <div
                    v-if="!isAdmin && d.assignments?.length"
                    class="mb-2 flex flex-wrap gap-1"
                  >
                    <Badge
                      v-for="scope in d.assignments"
                      :key="scope.id"
                      variant="outline"
                      class="max-w-full truncate font-mono text-[10px]"
                    >
                      {{ formatHostPreview(d.name, scope.subdomainPattern) }}
                    </Badge>
                  </div>
                  <div class="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span class="text-muted-foreground">服务商:</span>
                      <span class="ml-1">{{ d.providerName || '-' }}</span>
                    </div>
                    <div>
                      <span class="text-muted-foreground">记录数:</span>
                      <span class="ml-1">{{ d.recordCount }}</span>
                    </div>
                    <div>
                      <span class="text-muted-foreground">到期:</span>
                      <span class="ml-1" :class="d.expiresAt ? expiryClass(d.expiresAt) : ''">
                        {{ d.expiresAt ? formatExpiry(d.expiresAt) : '-' }}
                      </span>
                    </div>
                    <div>
                      <span class="text-muted-foreground">分组:</span>
                      <span class="ml-1">{{ d.groupName || '-' }}</span>
                    </div>
                  </div>
                  <div v-if="d.tags?.length" class="mt-2 flex flex-wrap gap-1">
                    <Badge v-for="tag in d.tags" :key="tag" variant="secondary" class="text-xs">{{ tag }}</Badge>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </div>

    <AddDomainDialog
      v-if="showAddDialog"
      @close="showAddDialog = false"
      @created="handleCreated"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useDomainStore } from '@/stores/domain'
import { useAuthStore } from '@/stores/auth'
import AddDomainDialog from '@/components/domain/AddDomainDialog.vue'
import PageHeader from '@/components/common/PageHeader.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { copyText } from '@/lib/copy'
import { toastError, toastSuccess } from '@/lib/toast-helpers'
import { formatHostPreview, formatScopeLabel } from '@/lib/subdomain-scope'
import api from '@/lib/axios'
import { Filter, Plus, Search, Copy, Download, Upload, Globe, Star, RefreshCw } from 'lucide-vue-next'
import { getFavoriteDomainIds, toggleFavoriteDomain } from '@/lib/favorites'

const store = useDomainStore()
const authStore = useAuthStore()
const route = useRoute()
const router = useRouter()

const isAdmin = computed(() => authStore.user?.role === 'admin')
const searchQuery = ref('')
const statusFilter = ref('all')
const groupFilter = ref('')
const selectedTags = ref<string[]>([])
const sortBy = ref('name')
const showAddDialog = ref(false)
const showFilters = ref(false)
const onlyFavorites = ref(false)
const favSet = ref(new Set(getFavoriteDomainIds()))
const batchChecking = ref(false)
let debounceTimer: ReturnType<typeof setTimeout> | null = null

const hasAnyFilter = computed(
  () =>
    !!searchQuery.value ||
    statusFilter.value !== 'all' ||
    !!groupFilter.value ||
    selectedTags.value.length > 0 ||
    onlyFavorites.value,
)

const activeFilterCount = computed(() => {
  let n = 0
  if (groupFilter.value) n++
  n += selectedTags.value.length
  if (onlyFavorites.value) n++
  return n
})

const filteredDomains = computed(() => {
  let list = store.domains
  if (selectedTags.value.length > 0) {
    list = list.filter((d) => d.tags && selectedTags.value.some((t) => d.tags!.includes(t)))
  }
  if (onlyFavorites.value) {
    list = list.filter((d) => favSet.value.has(d.id))
  }

  const sorted = [...list]
  sorted.sort((a, b) => {
    // 收藏优先
    const af = favSet.value.has(a.id) ? 0 : 1
    const bf = favSet.value.has(b.id) ? 0 : 1
    if (af !== bf && sortBy.value === 'name') return af - bf
    if (sortBy.value === 'expiry') {
      const ae = a.expiresAt ? new Date(a.expiresAt).getTime() : Number.MAX_SAFE_INTEGER
      const be = b.expiresAt ? new Date(b.expiresAt).getTime() : Number.MAX_SAFE_INTEGER
      return ae - be
    }
    if (sortBy.value === 'records') return (b.recordCount || 0) - (a.recordCount || 0)
    if (sortBy.value === 'updated') {
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    }
    return a.name.localeCompare(b.name)
  })
  return sorted
})

function toggleFav(id: string) {
  toggleFavoriteDomain(id)
  favSet.value = new Set(getFavoriteDomainIds())
}

async function handleBatchExpiry() {
  batchChecking.value = true
  try {
    const data = await store.batchCheckExpiry()
    toastSuccess(
      `批量检查完成`,
      `成功 ${data.succeeded}，失败 ${data.failed}`,
    )
    await fetchList()
  } catch (err: any) {
    toastError('批量检查失败', err.response?.data?.error || err.message)
  } finally {
    batchChecking.value = false
  }
}

function toggleTagFilter(tag: string) {
  const idx = selectedTags.value.indexOf(tag)
  if (idx !== -1) selectedTags.value.splice(idx, 1)
  else selectedTags.value.push(tag)
}

function clearFilters() {
  searchQuery.value = ''
  statusFilter.value = 'all'
  groupFilter.value = ''
  selectedTags.value = []
  fetchList()
}

function debouncedFetch() {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(fetchList, 300)
}

function fetchList() {
  store.fetchDomains({
    search: searchQuery.value || undefined,
    status: statusFilter.value === 'all' ? undefined : statusFilter.value || undefined,
    group: groupFilter.value || undefined,
  })
}

function statusVariant(status: string): 'default' | 'destructive' | 'secondary' | 'outline' {
  if (status === 'active') return 'default'
  if (status === 'expired') return 'destructive'
  if (status === 'transferred') return 'secondary'
  return 'outline'
}

function statusLabel(status: string) {
  if (status === 'active') return '正常'
  if (status === 'expired') return '已过期'
  if (status === 'transferred') return '已转移'
  return status
}

function daysUntil(dateStr: string) {
  const d = new Date(dateStr)
  const now = new Date()
  return Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
}

function formatExpiry(dateStr: string) {
  const days = daysUntil(dateStr)
  const formatted = new Date(dateStr).toLocaleDateString('zh-CN')
  if (days < 0) return `${formatted} (已过期)`
  if (days <= 30) return `${formatted} (${days}天后)`
  return formatted
}

function expiryClass(dateStr: string) {
  const days = daysUntil(dateStr)
  if (days < 0) return 'text-destructive font-medium'
  if (days <= 7) return 'text-destructive font-medium'
  if (days <= 30) return 'text-orange-500 dark:text-orange-400 font-medium'
  return 'text-muted-foreground'
}

async function handleExport() {
  try {
    const response = await api.get('/export/domains', { params: { format: 'csv' }, responseType: 'blob' })
    const url = URL.createObjectURL(response.data)
    const link = document.createElement('a')
    link.href = url
    link.download = 'domains.csv'
    link.click()
    URL.revokeObjectURL(url)
    toastSuccess('导出成功')
  } catch (err: any) {
    toastError('导出失败', err.response?.data?.error || err.message)
  }
}

function handleCreated() {
  showAddDialog.value = false
  fetchList()
  store.fetchGroups()
  store.fetchTags()
}

watch(
  () => route.query.add,
  (v) => {
    if (v === '1' && isAdmin.value) {
      showAddDialog.value = true
      router.replace({ path: '/domains', query: {} })
    }
  },
  { immediate: true },
)

onMounted(async () => {
  try {
    await Promise.all([fetchList(), store.fetchGroups(), store.fetchTags()])
  } catch {
    // ignore
  }
})
</script>
