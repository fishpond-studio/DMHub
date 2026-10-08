<template>
  <div class="min-h-screen bg-background">
    <div class="app-container py-6 md:py-8">
      <div class="flex items-center mb-6 gap-2">
        <Button variant="ghost" size="icon" @click="$router.push('/dashboard')">
          <ArrowLeft class="h-5 w-5" />
        </Button>
        <div class="min-w-0 flex-1">
          <h1 class="text-2xl font-bold text-foreground">操作日志</h1>
          <p class="text-sm text-muted-foreground mt-0.5">审计域名、解析与团队相关操作</p>
        </div>
        <Button variant="outline" size="sm" :disabled="exporting" @click="handleExport">
          <Download class="mr-1.5 h-4 w-4" />
          {{ exporting ? '导出中…' : '导出 CSV' }}
        </Button>
      </div>

      <div class="flex flex-wrap gap-3 mb-4">
        <Select v-model="filters.action" @update:model-value="fetchData">
          <SelectTrigger class="w-full sm:w-[150px]">
            <SelectValue placeholder="全部操作" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部操作</SelectItem>
            <SelectItem value="domain.add">添加域名</SelectItem>
            <SelectItem value="domain.delete">删除域名</SelectItem>
            <SelectItem value="record.create">创建记录</SelectItem>
            <SelectItem value="record.update">更新记录</SelectItem>
            <SelectItem value="record.delete">删除记录</SelectItem>
            <SelectItem value="member.invite">邀请成员</SelectItem>
            <SelectItem value="member.remove">移除成员</SelectItem>
            <SelectItem value="member.role_change">角色变更</SelectItem>
            <SelectItem value="team_settings.update">团队设置</SelectItem>
            <SelectItem value="login">登录</SelectItem>
            <SelectItem value="login_2fa">2FA 登录</SelectItem>
          </SelectContent>
        </Select>

        <Select v-model="filters.userId" @update:model-value="fetchData">
          <SelectTrigger class="w-full sm:w-[150px]">
            <SelectValue placeholder="全部用户" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部用户</SelectItem>
            <SelectItem v-for="u in users" :key="u.id" :value="u.id">{{ u.username }}</SelectItem>
          </SelectContent>
        </Select>

        <Select v-model="filters.domainId" @update:model-value="fetchData">
          <SelectTrigger class="w-full sm:w-[150px]">
            <SelectValue placeholder="全部域名" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部域名</SelectItem>
            <SelectItem v-for="d in domainList" :key="d.id" :value="d.id">{{ d.name }}</SelectItem>
          </SelectContent>
        </Select>

        <Input
          v-model="filters.startDate"
          type="date"
          class="w-auto"
          placeholder="开始日期"
          @change="fetchData"
        />
        <Input
          v-model="filters.endDate"
          type="date"
          class="w-auto"
          placeholder="结束日期"
          @change="fetchData"
        />
      </div>

      <div v-if="store.loading" class="space-y-2 py-2">
        <div v-for="i in 6" :key="i" class="h-12 animate-pulse rounded-lg bg-muted" />
      </div>

      <div v-else-if="store.logs.length === 0" class="rounded-xl border border-dashed bg-muted/20 py-16 text-center">
        <p class="font-medium text-foreground">暂无操作日志</p>
        <p class="mt-1 text-sm text-muted-foreground">调整筛选条件，或等待团队产生新的操作记录</p>
      </div>

      <div v-else>
        <div class="hidden md:block overflow-hidden rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow class="bg-muted/40 hover:bg-muted/40">
                <TableHead>时间</TableHead>
                <TableHead>用户</TableHead>
                <TableHead>操作</TableHead>
                <TableHead>目标</TableHead>
                <TableHead>详情</TableHead>
                <TableHead>IP</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <template v-for="log in store.logs" :key="log.id">
                <TableRow class="cursor-pointer transition-colors hover:bg-muted/40" @click="toggleExpand(log.id)">
                  <TableCell class="text-muted-foreground whitespace-nowrap tnum">{{ formatTime(log.createdAt) }}</TableCell>
                  <TableCell class="font-medium whitespace-nowrap">{{ log.username || log.userId.slice(0, 8) }}</TableCell>
                  <TableCell class="whitespace-nowrap">
                    <Badge :variant="actionBadgeVariant(log.action)">{{ actionLabel(log.action) }}</Badge>
                  </TableCell>
                  <TableCell class="text-muted-foreground whitespace-nowrap">{{ targetLabel(log) }}</TableCell>
                  <TableCell class="text-muted-foreground max-w-xs truncate">{{ detailPreview(log) }}</TableCell>
                  <TableCell class="text-muted-foreground font-record whitespace-nowrap">{{ log.ipAddress || '-' }}</TableCell>
                </TableRow>
                <TableRow v-if="expandedId === log.id && log.detail">
                  <TableCell colspan="6" class="bg-muted/50">
                    <pre class="text-xs whitespace-pre-wrap break-all">{{ JSON.stringify(log.detail, null, 2) }}</pre>
                  </TableCell>
                </TableRow>
              </template>
            </TableBody>
          </Table>
        </div>

        <div class="md:hidden space-y-3">
          <Card
            v-for="log in store.logs"
            :key="log.id"
            class="cursor-pointer"
            @click="toggleExpand(log.id)"
          >
            <CardContent class="p-3">
              <div class="flex items-center justify-between mb-1">
                <Badge :variant="actionBadgeVariant(log.action)">{{ actionLabel(log.action) }}</Badge>
                <span class="text-xs text-muted-foreground tnum">{{ formatTimeShort(log.createdAt) }}</span>
              </div>
              <div class="text-sm font-medium">{{ log.username || log.userId.slice(0, 8) }}</div>
              <div class="text-xs text-muted-foreground">{{ targetLabel(log) }}</div>
              <div v-if="log.ipAddress" class="text-xs text-muted-foreground font-record mt-1">IP: {{ log.ipAddress }}</div>
              <div v-if="expandedId === log.id && log.detail" class="mt-2 pt-2 border-t">
                <pre class="text-xs whitespace-pre-wrap break-all">{{ JSON.stringify(log.detail, null, 2) }}</pre>
              </div>
            </CardContent>
          </Card>
        </div>

        <div class="flex flex-col sm:flex-row items-center justify-between mt-4 gap-3">
          <p class="text-sm text-muted-foreground tnum">共 {{ store.total }} 条记录</p>
          <div class="flex gap-2 items-center">
            <Button
              :disabled="currentPage <= 1"
              @click="goPage(currentPage - 1)"
              variant="outline"
              size="sm"
            >
              上一页
            </Button>
            <span class="text-sm text-muted-foreground tnum">{{ currentPage }} / {{ totalPages }}</span>
            <Button
              :disabled="currentPage >= totalPages"
              @click="goPage(currentPage + 1)"
              variant="outline"
              size="sm"
            >
              下一页
            </Button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useLogStore } from '@/stores/log';
import api from '@/lib/axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { ArrowLeft, Download } from 'lucide-vue-next';
import { toastError, toastSuccess } from '@/lib/toast-helpers';

const store = useLogStore();

const pageSize = 50;
const currentPage = ref(1);
const expandedId = ref<string | null>(null);
const exporting = ref(false);

const filters = ref({
  action: 'all',
  userId: 'all',
  domainId: 'all',
  startDate: '',
  endDate: '',
});

const users = ref<{ id: string; username: string }[]>([]);
const domainList = ref<{ id: string; name: string }[]>([]);

const totalPages = computed(() => Math.max(1, Math.ceil(store.total / pageSize)));

function toggleExpand(id: string) {
  expandedId.value = expandedId.value === id ? null : id;
}

function goPage(page: number) {
  currentPage.value = page;
  fetchPage();
}

function fetchData() {
  currentPage.value = 1;
  expandedId.value = null;
  fetchPage();
}

function fetchPage() {
  expandedId.value = null;
  store.fetchLogs({
    action: filters.value.action === 'all' ? undefined : filters.value.action || undefined,
    userId: filters.value.userId === 'all' ? undefined : filters.value.userId || undefined,
    domainId: filters.value.domainId === 'all' ? undefined : filters.value.domainId || undefined,
    startDate: filters.value.startDate || undefined,
    endDate: filters.value.endDate || undefined,
    page: currentPage.value,
    pageSize,
  });
}

async function handleExport() {
  exporting.value = true;
  try {
    const params: Record<string, string> = {};
    if (filters.value.action !== 'all') params.action = filters.value.action;
    if (filters.value.userId !== 'all') params.userId = filters.value.userId;
    if (filters.value.domainId !== 'all') params.domainId = filters.value.domainId;
    if (filters.value.startDate) params.startDate = filters.value.startDate;
    if (filters.value.endDate) params.endDate = filters.value.endDate;
    const response = await api.get('/logs/export', { params, responseType: 'blob' });
    const url = URL.createObjectURL(response.data);
    const link = document.createElement('a');
    link.href = url;
    link.download = `operation-logs-${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toastSuccess('操作日志已导出');
  } catch (err: any) {
    toastError('导出失败', err.response?.data?.error || err.message);
  } finally {
    exporting.value = false;
  }
}

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleString('zh-CN');
}

function formatTimeShort(dateStr: string) {
  return new Date(dateStr).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

const ACTION_LABELS: Record<string, string> = {
  'domain.add': '添加域名',
  'domain.delete': '删除域名',
  'record.create': '创建记录',
  'record.update': '更新记录',
  'record.delete': '删除记录',
  'record.sync': '同步记录',
  'member.invite': '邀请成员',
  'member.remove': '移除成员',
  'member.role_change': '角色变更',
  'team_settings.update': '更新设置',
  'login': '登录',
  'login_2fa': '2FA 登录',
  'provider.config': '服务商配置',
  'notification.update': '通知配置',
};

function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

function actionBadgeVariant(action: string): 'default' | 'destructive' | 'secondary' | 'outline' {
  if (action.startsWith('domain.')) return 'default';
  if (action.startsWith('record.')) return 'secondary';
  if (action.startsWith('member.')) return 'outline';
  if (action.startsWith('login')) return 'secondary';
  return 'outline';
}

function targetLabel(log: { targetType: string; targetId: string }): string {
  const typeLabels: Record<string, string> = {
    domain: '域名',
    dns_record: 'DNS 记录',
    user: '用户',
    invite_code: '邀请码',
    team_settings: '团队设置',
  };
  const label = typeLabels[log.targetType] ?? log.targetType;
  return `${label} ${log.targetId.slice(0, 8)}`;
}

function detailPreview(log: { detail: Record<string, unknown> | null }): string {
  if (!log.detail) return '-';
  const str = JSON.stringify(log.detail);
  return str.length > 80 ? str.slice(0, 80) + '...' : str;
}

onMounted(async () => {
  store.fetchLogs({ page: 1, pageSize });
  try {
    const [usersRes, domainsRes] = await Promise.all([
      api.get('/team/members'),
      api.get('/domains'),
    ]);
    users.value = (usersRes.data.members || []).map((m: any) => ({ id: m.id, username: m.username }));
    domainList.value = (domainsRes.data.domains || []).map((d: any) => ({ id: d.id, name: d.name }));
  } catch {}
});
</script>
