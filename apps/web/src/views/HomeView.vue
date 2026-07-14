<template>
  <div class="min-h-screen bg-background">
    <div class="max-w-6xl mx-auto px-4 py-8">
      <div class="flex items-center justify-between mb-6">
        <h1 class="text-2xl font-bold text-foreground">仪表盘</h1>
      </div>

      <div v-if="store.loading && !store.stats" class="text-center py-12 text-muted-foreground">加载中...</div>

      <template v-else>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <Card v-for="(card, i) in statCards" :key="card.label" class="animate-fade-in" :class="'stagger-' + (i + 1)">
            <CardHeader class="pb-2">
              <CardDescription>{{ card.label }}</CardDescription>
            </CardHeader>
            <CardContent>
              <div class="text-3xl font-bold tabular-nums">{{ card.value }}</div>
              <div v-if="card.sub" class="mt-1 text-xs text-muted-foreground" v-html="card.sub"></div>
            </CardContent>
          </Card>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <Card class="animate-fade-in stagger-5">
            <CardHeader>
              <CardTitle class="text-base">到期日历</CardTitle>
              <CardDescription>域名到期日期分布</CardDescription>
            </CardHeader>
            <CardContent>
              <div class="space-y-3">
                <div class="flex items-center justify-between">
                  <Button variant="ghost" size="sm" @click="calendarMonth--; if (calendarMonth < 0) { calendarMonth = 11; calendarYear--; }">
                    ←
                  </Button>
                  <span class="text-sm font-medium">{{ calendarYear }} 年 {{ calendarMonth + 1 }} 月</span>
                  <Button variant="ghost" size="sm" @click="calendarMonth++; if (calendarMonth > 11) { calendarMonth = 0; calendarYear++; }">
                    →
                  </Button>
                </div>
                <div class="grid grid-cols-7 gap-1 text-center">
                  <div v-for="day in ['日','一','二','三','四','五','六']" :key="day" class="text-xs text-muted-foreground py-1">{{ day }}</div>
                  <div
                    v-for="cell in calendarCells"
                    :key="cell.key"
                    class="relative aspect-square flex items-center justify-center text-sm rounded-md"
                    :class="cell.isCurrentMonth ? 'text-foreground' : 'text-muted-foreground/40'"
                  >
                    <span
                      :class="cell.hasExpiry ? 'font-bold' : ''"
                      :style="cell.hasExpiry ? { color: cell.daysUntil !== null && cell.daysUntil <= 7 ? 'var(--destructive)' : cell.daysUntil !== null && cell.daysUntil <= 30 ? 'var(--primary)' : '' } : ''"
                    >{{ cell.day }}</span>
                    <span v-if="cell.hasExpiry" class="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full" :class="cell.daysUntil !== null && cell.daysUntil <= 7 ? 'bg-destructive' : 'bg-primary'"></span>
                  </div>
                </div>
                <div class="flex items-center gap-4 text-xs text-muted-foreground pt-1">
                  <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-destructive"></span>7天内到期</span>
                  <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-primary"></span>30天内到期</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card class="animate-fade-in stagger-6">
            <CardHeader>
              <CardTitle class="text-base">即将过期的域名</CardTitle>
              <CardDescription>30天内到期</CardDescription>
            </CardHeader>
            <CardContent>
              <div v-if="store.expiring.length === 0" class="py-6 text-center text-sm text-muted-foreground">暂无即将过期的域名</div>
              <Table v-else>
                <TableBody>
                  <TableRow
                    v-for="(d, di) in store.expiring"
                    :key="d.domainId"
                    class="cursor-pointer animate-fade-in-fast"
                    :class="'stagger-' + Math.min(di + 1, 8)"
                    @click="$router.push(`/domains/${d.domainId}`)"
                  >
                    <TableCell class="font-medium">{{ d.domain }}</TableCell>
                    <TableCell class="text-muted-foreground text-xs">{{ formatDate(d.expiresAt) }}</TableCell>
                    <TableCell class="text-right">
                      <Badge :variant="urgencyVariant(d.daysRemaining)">{{ d.daysRemaining }} 天</Badge>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card class="animate-fade-in stagger-7">
            <CardHeader>
              <CardTitle class="text-base">最近活动</CardTitle>
            </CardHeader>
            <CardContent>
              <div v-if="store.activity.length === 0" class="py-6 text-center text-sm text-muted-foreground">暂无活动记录</div>
              <ul v-else class="divide-y divide-border">
                <li v-for="(a, i) in store.activity" :key="i" class="py-3 first:pt-0 last:pb-0 animate-fade-in-fast" :class="'stagger-' + Math.min(i + 1, 8)">
                  <div class="flex items-start gap-3">
                    <span class="mt-0.5 flex-shrink-0">
                      <CheckCircle2 :class="actionColor(a.action)" class="h-4 w-4" />
                    </span>
                    <div class="min-w-0 flex-1">
                      <p class="text-sm">
                        <span class="font-medium">{{ a.userName }}</span>
                        <span class="text-muted-foreground mx-1">{{ actionLabel(a.action) }}</span>
                        <span class="font-medium text-foreground">{{ a.targetName }}</span>
                      </p>
                      <p class="text-xs text-muted-foreground mt-0.5">{{ timeAgo(a.createdAt) }}</p>
                    </div>
                  </div>
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>

        <Card class="animate-fade-in stagger-8">
          <CardHeader>
            <CardTitle class="text-base">DNS 记录类型分布</CardTitle>
          </CardHeader>
          <CardContent>
            <div v-if="!store.distribution || store.distribution.labels.length === 0" class="py-6 text-center text-sm text-muted-foreground">暂无记录数据</div>
            <div v-else class="space-y-3">
              <div v-for="(label, i) in store.distribution.labels" :key="label" class="flex items-center gap-3">
                <span class="w-16 text-sm font-medium text-foreground text-right">{{ label }}</span>
                <div class="flex-1 bg-muted rounded-full h-5 overflow-hidden">
                  <div
                    class="h-full rounded-full transition-all duration-700 ease-out"
                    :class="barColor(i)"
                    :style="{ width: barWidth(i) + '%' }"
                  ></div>
                </div>
                <span class="w-12 text-sm text-muted-foreground text-right">{{ store.distribution.data[i] }}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useDashboardStore } from '@/stores/dashboard';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableRow, TableCell } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { CheckCircle2 } from 'lucide-vue-next';

const store = useDashboardStore();

const calendarYear = ref(new Date().getFullYear());
const calendarMonth = ref(new Date().getMonth());

const expiryMap = computed(() => {
  const map = new Map<string, number>();
  for (const d of store.expiring) {
    const date = new Date(d.expiresAt);
    const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    const existing = map.get(key);
    if (existing === undefined || d.daysRemaining < existing) {
      map.set(key, d.daysRemaining);
    }
  }
  return map;
});

interface CalendarCell {
  key: string;
  day: number;
  isCurrentMonth: boolean;
  hasExpiry: boolean;
  daysUntil: number | null;
}

const calendarCells = computed(() => {
  const year = calendarYear.value;
  const month = calendarMonth.value;
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevDays = new Date(year, month, 0).getDate();
  const cells: CalendarCell[] = [];

  for (let i = firstDay - 1; i >= 0; i--) {
    const day = prevDays - i;
    const m = month === 0 ? 11 : month - 1;
    const y = month === 0 ? year - 1 : year;
    const key = `${y}-${m}-${day}`;
    const daysUntil = expiryMap.value.get(key) ?? null;
    cells.push({ key, day, isCurrentMonth: false, hasExpiry: daysUntil !== null, daysUntil });
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const key = `${year}-${month}-${day}`;
    const daysUntil = expiryMap.value.get(key) ?? null;
    cells.push({ key, day, isCurrentMonth: true, hasExpiry: daysUntil !== null, daysUntil });
  }

  const remaining = 42 - cells.length;
  for (let day = 1; day <= remaining; day++) {
    const m = month === 11 ? 0 : month + 1;
    const y = month === 11 ? year + 1 : year;
    const key = `${y}-${m}-${day}`;
    const daysUntil = expiryMap.value.get(key) ?? null;
    cells.push({ key, day, isCurrentMonth: false, hasExpiry: daysUntil !== null, daysUntil });
  }

  return cells;
});

function urgencyVariant(days: number): 'destructive' | 'outline' | 'secondary' {
  if (days <= 7) return 'destructive';
  if (days <= 14) return 'outline';
  return 'secondary';
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('zh-CN');
}

function actionLabel(action: string) {
  if (action === 'domain.add') return '添加了域名';
  if (action === 'domain.delete') return '删除了域名';
  if (action === 'record.create') return '创建了记录';
  if (action === 'record.update') return '更新了记录';
  if (action === 'record.delete') return '删除了记录';
  if (action === 'record.sync') return '同步了记录';
  if (action === 'import.domains') return '批量导入了域名';
  if (action === 'import.records') return '批量导入了记录';
  return action;
}

function actionColor(action: string) {
  if (action.includes('add') || action.includes('create') || action.includes('import')) return 'text-primary';
  if (action.includes('delete')) return 'text-destructive';
  if (action.includes('update')) return 'text-blue-500 dark:text-blue-400';
  if (action.includes('sync')) return 'text-purple-500 dark:text-purple-400';
  return 'text-muted-foreground';
}

function timeAgo(dateStr: string) {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}小时前`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}天前`;
  return new Date(dateStr).toLocaleDateString('zh-CN');
}

const barColors = ['bg-blue-500/100', 'bg-primary/100', 'bg-purple-500', 'bg-orange-500', 'bg-pink-500', 'bg-teal-500', 'bg-indigo-500', 'bg-yellow-500/100'];

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const statCards = computed(() => [
  {
    label: '域名总数',
    value: store.stats?.totalDomains ?? 0,
    sub: `<span class="text-primary">${escapeHtml(String(store.stats?.activeDomains ?? 0))} 正常</span><span class="mx-1">/</span><span class="text-destructive">${escapeHtml(String(store.stats?.expiredDomains ?? 0))} 已过期</span>`,
  },
  {
    label: 'DNS 记录',
    value: store.stats?.totalRecords ?? 0,
    sub: Object.entries(store.stats?.recordsByType ?? {}).map(([t, c]) => `<span class="inline-block mr-1.5 text-xs bg-secondary rounded px-1.5 py-0.5">${escapeHtml(t)}: ${escapeHtml(String(c))}</span>`).join(''),
  },
  {
    label: '团队成员',
    value: store.stats?.totalMembers ?? 0,
    sub: '',
  },
  {
    label: '近7天变更',
    value: store.stats?.recentChanges ?? 0,
    sub: '',
  },
]);

function barColor(i: number) {
  return barColors[i % barColors.length];
}

function barWidth(i: number) {
  if (!store.distribution) return 0;
  const max = Math.max(...store.distribution.data, 1);
  return (store.distribution.data[i] / max) * 100;
}

onMounted(() => {
  store.fetchAll();
});
</script>
