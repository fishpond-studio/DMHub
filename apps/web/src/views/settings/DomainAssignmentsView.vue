<template>
  <div>
    <div class="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 class="text-2xl font-bold text-foreground">域名分配管理</h1>
        <p class="mt-1 text-sm text-muted-foreground">
          给成员分配子域名范围，并观测其名下解析记录状态
        </p>
      </div>
      <div class="flex gap-2">
        <Button
          size="sm"
          :variant="tab === 'overview' ? 'default' : 'outline'"
          @click="switchTab('overview')"
        >
          状态总览
        </Button>
        <Button
          size="sm"
          :variant="tab === 'member' ? 'default' : 'outline'"
          @click="switchTab('member')"
        >
          按成员分配
        </Button>
      </div>
    </div>

    <!-- ========== 状态总览 ========== -->
    <template v-if="tab === 'overview'">
      <div v-if="overviewLoading" class="py-12 text-center text-muted-foreground">加载中...</div>
      <template v-else>
        <div class="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Card v-for="s in summaryCards" :key="s.label">
            <CardContent class="p-3">
              <div class="text-xs text-muted-foreground">{{ s.label }}</div>
              <div class="mt-1 text-2xl font-bold tabular-nums" :class="s.class">{{ s.value }}</div>
            </CardContent>
          </Card>
        </div>

        <div class="mb-4 flex flex-wrap gap-2">
          <Input
            v-model="overviewFilter"
            class="max-w-xs"
            placeholder="筛选成员 / 域名 / 主机…"
          />
          <Select v-model="statusFilter">
            <SelectTrigger class="w-[140px]">
              <SelectValue placeholder="全部状态" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部状态</SelectItem>
              <SelectItem value="active">有记录</SelectItem>
              <SelectItem value="empty">无记录</SelectItem>
              <SelectItem value="member_disabled">成员停用</SelectItem>
              <SelectItem value="domain_issue">域名异常</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" :disabled="overviewLoading" @click="loadOverview">
            刷新
          </Button>
        </div>

        <Card>
          <div class="hidden md:block overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead class="w-8"></TableHead>
                  <TableHead>成员</TableHead>
                  <TableHead>可管理主机</TableHead>
                  <TableHead>权限</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>记录</TableHead>
                  <TableHead>CDN</TableHead>
                  <TableHead>最近更新</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow v-if="filteredOverview.length === 0">
                  <TableCell colspan="8" class="py-10 text-center text-sm text-muted-foreground">
                    暂无分配，或筛选无结果
                  </TableCell>
                </TableRow>
                <template v-for="a in filteredOverview" :key="a.id">
                  <TableRow class="cursor-pointer hover:bg-muted/40" @click="toggleExpand(a.id)">
                    <TableCell class="text-muted-foreground">
                      {{ expandedId === a.id ? '▾' : '▸' }}
                    </TableCell>
                    <TableCell>
                      <div class="font-medium">{{ a.displayName || a.username }}</div>
                      <div class="text-xs text-muted-foreground">@{{ a.username }}</div>
                    </TableCell>
                    <TableCell>
                      <div class="font-mono text-sm">{{ a.host }}</div>
                      <div class="text-xs text-muted-foreground">
                        {{ a.domainName }} · {{ a.subdomainPattern }}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge :variant="a.permission === 'dns_edit' ? 'default' : 'secondary'">
                        {{ a.permission === 'dns_edit' ? '可编辑' : '只读' }}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge :variant="scopeBadgeVariant(a.scopeStatus)">
                        {{ scopeStatusLabel(a.scopeStatus) }}
                      </Badge>
                    </TableCell>
                    <TableCell class="tabular-nums">
                      {{ a.recordCount }}
                      <span v-if="typeSummary(a)" class="text-xs text-muted-foreground ml-1">
                        {{ typeSummary(a) }}
                      </span>
                    </TableCell>
                    <TableCell class="tabular-nums text-muted-foreground">
                      {{ a.proxiedCount ? `${a.proxiedCount} 开` : '—' }}
                    </TableCell>
                    <TableCell class="text-xs text-muted-foreground whitespace-nowrap">
                      {{ a.lastRecordUpdatedAt ? formatDateTime(a.lastRecordUpdatedAt) : '—' }}
                    </TableCell>
                  </TableRow>
                  <TableRow v-if="expandedId === a.id">
                    <TableCell colspan="8" class="bg-muted/30 p-0">
                      <div class="p-4 space-y-3">
                        <div class="flex flex-wrap items-center justify-between gap-2">
                          <p class="text-sm text-muted-foreground">
                            范围内 DNS 记录（最多展示 50 条）
                          </p>
                          <Button
                            size="sm"
                            variant="outline"
                            @click.stop="$router.push(`/domains/${a.domainId}`)"
                          >
                            打开域名
                          </Button>
                        </div>
                        <div v-if="!a.records.length" class="text-sm text-muted-foreground py-4 text-center">
                          该范围内暂无解析记录
                        </div>
                        <div v-else class="overflow-x-auto rounded-lg border bg-background">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>类型</TableHead>
                                <TableHead>主机</TableHead>
                                <TableHead>值</TableHead>
                                <TableHead>TTL</TableHead>
                                <TableHead>CDN</TableHead>
                                <TableHead>更新</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              <TableRow v-for="r in a.records" :key="r.id">
                                <TableCell><Badge variant="secondary">{{ r.recordType }}</Badge></TableCell>
                                <TableCell class="font-mono text-xs">{{ r.name }}</TableCell>
                                <TableCell class="font-mono text-xs max-w-[14rem] truncate" :title="r.value">
                                  {{ r.value }}
                                </TableCell>
                                <TableCell class="tabular-nums text-muted-foreground">{{ r.ttl }}</TableCell>
                                <TableCell>
                                  <span v-if="r.proxied" class="text-orange-500 text-xs font-medium">已代理</span>
                                  <span v-else class="text-muted-foreground text-xs">—</span>
                                </TableCell>
                                <TableCell class="text-xs text-muted-foreground whitespace-nowrap">
                                  {{ formatDateTime(r.updatedAt) }}
                                </TableCell>
                              </TableRow>
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                </template>
              </TableBody>
            </Table>
          </div>

          <!-- mobile overview -->
          <div class="md:hidden divide-y">
            <div v-if="filteredOverview.length === 0" class="py-10 text-center text-sm text-muted-foreground">
              暂无分配
            </div>
            <div
              v-for="a in filteredOverview"
              :key="a.id"
              class="p-4 space-y-2"
              @click="toggleExpand(a.id)"
            >
              <div class="flex items-start justify-between gap-2">
                <div>
                  <div class="font-medium">{{ a.displayName || a.username }}</div>
                  <div class="font-mono text-sm">{{ a.host }}</div>
                </div>
                <Badge :variant="scopeBadgeVariant(a.scopeStatus)">
                  {{ scopeStatusLabel(a.scopeStatus) }}
                </Badge>
              </div>
              <div class="text-xs text-muted-foreground">
                {{ a.recordCount }} 条记录
                <span v-if="a.proxiedCount"> · CDN {{ a.proxiedCount }}</span>
              </div>
              <div v-if="expandedId === a.id && a.records.length" class="space-y-1 pt-2 border-t">
                <div
                  v-for="r in a.records.slice(0, 8)"
                  :key="r.id"
                  class="text-xs font-mono text-muted-foreground"
                >
                  {{ r.recordType }} {{ r.name }} → {{ r.value }}
                </div>
              </div>
            </div>
          </div>
        </Card>
      </template>
    </template>

    <!-- ========== 按成员分配（原逻辑） ========== -->
    <template v-else>
      <div class="mb-6">
        <Label class="mb-1 block">选择成员</Label>
        <Select v-model="selectedMemberId" @update:model-value="handleMemberChange">
          <SelectTrigger class="w-full max-w-xs">
            <SelectValue placeholder="-- 选择成员 --" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem v-for="m in members" :key="m.id" :value="m.id">
              {{ m.displayName || m.username }}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div v-if="loading" class="text-center py-12 text-muted-foreground">加载中...</div>

      <template v-else-if="selectedMemberId">
        <Card class="mb-6">
          <CardHeader>
            <CardTitle>添加分配</CardTitle>
          </CardHeader>
          <CardContent>
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <Label class="mb-1 block">域名</Label>
                <Select v-model="form.domainId">
                  <SelectTrigger>
                    <SelectValue placeholder="选择域名" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem v-for="d in domainList" :key="d.id" :value="d.id">{{ d.name }}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label class="mb-1 block">子域名模式</Label>
                <Input v-model="form.subdomainPattern" type="text" placeholder="* / blog / *.dev / @" />
                <p v-if="selectedDomainName" class="mt-1 text-xs text-muted-foreground">
                  成员将看到：
                  <span class="font-mono text-foreground">{{ formatHostPreview(selectedDomainName, form.subdomainPattern) }}</span>
                  · {{ formatScopeLabel(form.subdomainPattern) }}
                </p>
              </div>
              <div>
                <Label class="mb-1 block">权限</Label>
                <Select v-model="form.permission">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dns_edit">可编辑</SelectItem>
                    <SelectItem value="dns_readonly">只读</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div class="mt-4 flex justify-end">
              <Button @click="handleAddAssignment" :disabled="!form.domainId || submitting">
                {{ submitting ? '添加中...' : '添加分配' }}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <div class="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>域名</TableHead>
                  <TableHead>子域名模式</TableHead>
                  <TableHead>权限</TableHead>
                  <TableHead>分配时间</TableHead>
                  <TableHead class="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow v-if="assignments.length === 0">
                  <TableCell colspan="5" class="py-8 text-center text-sm text-muted-foreground">暂无分配记录</TableCell>
                </TableRow>
                <TableRow v-for="a in assignments" :key="a.id">
                  <TableCell class="font-medium">{{ a.domainName }}</TableCell>
                  <TableCell>
                    <div class="font-mono text-sm">{{ formatHostPreview(a.domainName || '', a.subdomainPattern) }}</div>
                    <div class="text-xs text-muted-foreground">{{ a.subdomainPattern }} · {{ formatScopeLabel(a.subdomainPattern) }}</div>
                  </TableCell>
                  <TableCell>
                    <Badge v-if="a.permission === 'dns_edit'" variant="default">可编辑</Badge>
                    <Badge v-else variant="secondary">只读</Badge>
                  </TableCell>
                  <TableCell class="text-muted-foreground">{{ formatDate(a.createdAt) }}</TableCell>
                  <TableCell class="text-right">
                    <Button variant="ghost" size="sm" class="text-destructive hover:text-destructive" @click="pendingDelete = a">
                      移除
                    </Button>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>

          <div class="md:hidden divide-y">
            <div v-if="assignments.length === 0" class="py-8 text-center text-sm text-muted-foreground">暂无分配记录</div>
            <div v-for="a in assignments" :key="a.id" class="p-4">
              <div class="flex items-center justify-between mb-2">
                <span class="font-medium">{{ a.domainName }}</span>
                <Badge v-if="a.permission === 'dns_edit'" variant="default">可编辑</Badge>
                <Badge v-else variant="secondary">只读</Badge>
              </div>
              <div class="font-mono text-sm">{{ formatHostPreview(a.domainName || '', a.subdomainPattern) }}</div>
              <Button variant="ghost" size="sm" class="text-destructive mt-2 -ml-2" @click="pendingDelete = a">移除</Button>
            </div>
          </div>
        </Card>
      </template>
    </template>

    <AlertDialog :open="!!wildcardConfirm">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>确认通配符分配</AlertDialogTitle>
          <AlertDialogDescription>
            通配符子域名模式将匹配该域名下所有层级的子域名，确定继续吗？
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel @click="wildcardConfirm = null">取消</AlertDialogCancel>
          <AlertDialogAction @click="proceedWildcardAdd">确认分配</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <AlertDialog :open="!!pendingDelete">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>确认移除分配</AlertDialogTitle>
          <AlertDialogDescription>确定要移除 {{ pendingDelete?.domainName }} 的分配吗？</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel @click="pendingDelete = null">取消</AlertDialogCancel>
          <AlertDialogAction @click="proceedDelete">确认移除</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useTeamStore } from '@/stores/team'
import {
  useAssignmentStore,
  type DomainAssignment,
  type AssignmentOverviewItem,
} from '@/stores/assignment'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { formatHostPreview, formatScopeLabel } from '@/lib/subdomain-scope'

const teamStore = useTeamStore()
const store = useAssignmentStore()
const loading = ref(false)
const overviewLoading = ref(false)
const submitting = ref(false)
const selectedMemberId = ref('')
const wildcardConfirm = ref<typeof form.value | null>(null)
const pendingDelete = ref<DomainAssignment | null>(null)
const tab = ref<'overview' | 'member'>('overview')
const expandedId = ref<string | null>(null)
const overviewFilter = ref('')
const statusFilter = ref('all')

const form = ref({ domainId: '', subdomainPattern: '*', permission: 'dns_edit' as const })
const members = computed(() => teamStore.members)
const assignments = computed(() => store.memberAssignments)
const domainList = computed(() => store.domains)
const selectedDomainName = computed(
  () => domainList.value.find((d) => d.id === form.value.domainId)?.name || '',
)

const summaryCards = computed(() => {
  const s = store.overviewSummary
  return [
    { label: '总指派', value: s?.total ?? 0, class: '' },
    { label: '有记录', value: s?.active ?? 0, class: 'text-primary' },
    { label: '无记录', value: s?.empty ?? 0, class: 'text-amber-600 dark:text-amber-400' },
    { label: '成员停用', value: s?.memberDisabled ?? 0, class: 'text-destructive' },
    { label: '域名异常', value: s?.domainIssue ?? 0, class: 'text-destructive' },
    { label: '覆盖记录数', value: s?.totalRecords ?? 0, class: '' },
  ]
})

const filteredOverview = computed(() => {
  let list = store.overview as AssignmentOverviewItem[]
  if (statusFilter.value !== 'all') {
    list = list.filter((a) => a.scopeStatus === statusFilter.value)
  }
  const q = overviewFilter.value.trim().toLowerCase()
  if (q) {
    list = list.filter(
      (a) =>
        a.username.toLowerCase().includes(q) ||
        (a.displayName || '').toLowerCase().includes(q) ||
        a.domainName.toLowerCase().includes(q) ||
        a.host.toLowerCase().includes(q) ||
        a.subdomainPattern.toLowerCase().includes(q),
    )
  }
  return list
})

onMounted(async () => {
  await teamStore.fetchMembers()
  await store.fetchDomains()
  await loadOverview()
})

async function loadOverview() {
  overviewLoading.value = true
  try {
    await store.fetchOverview()
  } finally {
    overviewLoading.value = false
  }
}

function switchTab(t: 'overview' | 'member') {
  tab.value = t
  if (t === 'overview') loadOverview()
}

function toggleExpand(id: string) {
  expandedId.value = expandedId.value === id ? null : id
}

function scopeStatusLabel(s: string) {
  const map: Record<string, string> = {
    active: '有记录',
    empty: '无记录',
    member_disabled: '成员停用',
    domain_issue: '域名异常',
  }
  return map[s] || s
}

function scopeBadgeVariant(s: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (s === 'active') return 'default'
  if (s === 'empty') return 'secondary'
  return 'destructive'
}

function typeSummary(a: AssignmentOverviewItem) {
  const entries = Object.entries(a.typeCounts || {})
  if (!entries.length) return ''
  return entries
    .slice(0, 3)
    .map(([t, n]) => `${t}:${n}`)
    .join(' ')
}

async function handleMemberChange() {
  if (!selectedMemberId.value) return
  loading.value = true
  try {
    await store.fetchMemberAssignments(selectedMemberId.value)
  } finally {
    loading.value = false
  }
  form.value = { domainId: '', subdomainPattern: '*', permission: 'dns_edit' }
}

async function handleAddAssignment() {
  if (!selectedMemberId.value || !form.value.domainId) return
  submitting.value = true
  try {
    const result = await store.createAssignment(selectedMemberId.value, form.value)
    if (result.warning) {
      wildcardConfirm.value = { ...form.value }
      submitting.value = false
      return
    }
    await store.fetchMemberAssignments(selectedMemberId.value)
    form.value = { domainId: '', subdomainPattern: '*', permission: 'dns_edit' }
  } catch (err: any) {
    alert(err.response?.data?.error || '添加失败')
  } finally {
    submitting.value = false
  }
}

async function proceedWildcardAdd() {
  if (!wildcardConfirm.value || !selectedMemberId.value) return
  submitting.value = true
  try {
    await store.createAssignment(selectedMemberId.value, { ...wildcardConfirm.value })
    await store.fetchMemberAssignments(selectedMemberId.value)
    form.value = { domainId: '', subdomainPattern: '*', permission: 'dns_edit' }
  } catch (err: any) {
    alert(err.response?.data?.error || '添加失败')
  } finally {
    submitting.value = false
    wildcardConfirm.value = null
  }
}

async function proceedDelete() {
  if (!pendingDelete.value || !selectedMemberId.value) return
  try {
    await store.deleteAssignment(selectedMemberId.value, pendingDelete.value.id)
    await store.fetchMemberAssignments(selectedMemberId.value)
  } catch (err: any) {
    alert(err.response?.data?.error || '移除失败')
  }
  pendingDelete.value = null
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('zh-CN')
}

function formatDateTime(dateStr: string) {
  return new Date(dateStr).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}
</script>
