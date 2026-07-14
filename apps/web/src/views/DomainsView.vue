<template>
  <div class="min-h-screen bg-background">
    <div class="max-w-7xl mx-auto px-4 py-6 md:py-8">
      <div class="flex items-center mb-4 md:mb-6">
        <Button variant="ghost" size="icon" @click="$router.push('/dashboard')">
          <ArrowLeft class="h-5 w-5" />
        </Button>
        <h1 class="text-xl md:text-2xl font-bold text-foreground">域名管理</h1>
        <Button
          v-if="isAdmin"
          @click="showAddDialog = true"
          class="ml-auto"
          size="sm"
        >
          添加域名
        </Button>
      </div>

      <div class="md:hidden mb-4">
        <Button variant="outline" size="sm" class="w-full" @click="showFilters = !showFilters">
          <Filter class="mr-1 h-4 w-4" />
          {{ showFilters ? '收起筛选' : '展开筛选' }}
          <span v-if="groupFilter || selectedTags.length" class="ml-1 text-xs text-primary">({{ [groupFilter, ...selectedTags].filter(Boolean).length }})</span>
        </Button>
      </div>

      <div v-if="showFilters" class="md:hidden mb-4 space-y-3">
        <Card>
          <CardHeader class="pb-2 pt-3 px-4">
            <CardTitle class="text-xs font-semibold text-muted-foreground uppercase">分组</CardTitle>
          </CardHeader>
          <CardContent class="px-2 pb-3">
            <div class="flex flex-wrap gap-1">
              <Button
                @click="groupFilter = ''; fetchList()"
                :variant="!groupFilter ? 'secondary' : 'ghost'"
                size="sm"
              >
                全部
              </Button>
              <Button
                v-for="g in store.groups"
                :key="g.name"
                @click="groupFilter = g.name; fetchList()"
                :variant="groupFilter === g.name ? 'secondary' : 'ghost'"
                size="sm"
              >
                {{ g.name }} <span class="ml-1 text-xs text-muted-foreground">{{ g.count }}</span>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader class="pb-2 pt-3 px-4">
            <CardTitle class="text-xs font-semibold text-muted-foreground uppercase">标签</CardTitle>
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
                {{ t.name }} <span class="ml-1 opacity-60">{{ t.count }}</span>
              </Badge>
              <div v-if="store.tags.length === 0" class="text-xs text-muted-foreground">暂无标签</div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div class="flex gap-6">
        <div class="hidden md:block w-56 flex-shrink-0">
          <Card class="mb-4">
            <CardHeader class="pb-2 pt-4 px-4">
              <CardTitle class="text-xs font-semibold text-muted-foreground uppercase">分组</CardTitle>
            </CardHeader>
            <CardContent class="px-2 pb-3">
              <div class="space-y-1">
                <Button
                  @click="groupFilter = ''; fetchList()"
                  :variant="!groupFilter ? 'secondary' : 'ghost'"
                  size="sm"
                  class="w-full justify-start"
                >
                  全部
                </Button>
                <Button
                  v-for="g in store.groups"
                  :key="g.name"
                  @click="groupFilter = g.name; fetchList()"
                  :variant="groupFilter === g.name ? 'secondary' : 'ghost'"
                  size="sm"
                  class="w-full justify-between"
                >
                  <span class="truncate">{{ g.name }}</span>
                  <span class="text-xs text-muted-foreground">{{ g.count }}</span>
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader class="pb-2 pt-4 px-4">
              <CardTitle class="text-xs font-semibold text-muted-foreground uppercase">标签</CardTitle>
            </CardHeader>
            <CardContent class="px-4 pb-4">
              <div class="flex flex-wrap gap-1.5">
                <Badge
                  v-for="t in store.tags"
                  :key="t.name"
                  :variant="selectedTags.includes(t.name) ? 'default' : 'outline'"
                  class="cursor-pointer"
                  @click="toggleTagFilter(t.name)"
                >
                  {{ t.name }} <span class="ml-1 opacity-60">{{ t.count }}</span>
                </Badge>
                <div v-if="store.tags.length === 0" class="text-xs text-muted-foreground">暂无标签</div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div class="flex-1 min-w-0">
          <div class="flex flex-col sm:flex-row gap-3 mb-4">
            <Input
              v-model="searchQuery"
              type="text"
              placeholder="搜索域名..."
              class="flex-1"
              @input="debouncedFetch"
            />
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
          </div>

          <div v-if="store.loading" class="text-center py-12 text-muted-foreground">加载中...</div>

          <div v-else-if="filteredDomains.length === 0" class="text-center py-16">
            <p class="text-muted-foreground">暂无域名</p>
          </div>

          <div v-else>
            <div class="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>域名</TableHead>
                    <TableHead>服务商</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead>到期时间</TableHead>
                    <TableHead>标签</TableHead>
                    <TableHead>分组</TableHead>
                    <TableHead>记录数</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow
                    v-for="(d, di) in filteredDomains"
                    :key="d.id"
                    class="cursor-pointer animate-fade-in-fast"
                    :class="'stagger-' + Math.min(di + 1, 8)"
                    @click="$router.push(`/domains/${d.id}`)"
                  >
                    <TableCell class="font-medium text-primary">{{ d.name }}</TableCell>
                    <TableCell class="text-muted-foreground">{{ d.providerName || '-' }}</TableCell>
                    <TableCell>
                      <Badge :variant="statusVariant(d.status)">{{ statusLabel(d.status) }}</Badge>
                    </TableCell>
                    <TableCell class="text-muted-foreground">
                      <span v-if="d.expiresAt">{{ formatExpiry(d.expiresAt) }}</span>
                      <span v-else>-</span>
                    </TableCell>
                    <TableCell>
                      <div class="flex gap-1 flex-wrap">
                        <Badge v-for="tag in (d.tags || [])" :key="tag" variant="secondary">{{ tag }}</Badge>
                        <span v-if="!d.tags || d.tags.length === 0" class="text-sm text-muted-foreground">-</span>
                      </div>
                    </TableCell>
                    <TableCell class="text-muted-foreground">{{ d.groupName || '-' }}</TableCell>
                    <TableCell class="text-muted-foreground">{{ d.recordCount }}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>

            <div class="md:hidden space-y-3">
              <Card
                v-for="(d, di) in filteredDomains"
                :key="d.id"
                class="cursor-pointer card-hover"
                :class="'animate-fade-in-fast stagger-' + Math.min(di + 1, 8)"
                @click="$router.push(`/domains/${d.id}`)"
              >
                <CardContent class="p-4">
                  <div class="flex items-center justify-between mb-2">
                    <span class="font-medium text-primary">{{ d.name }}</span>
                    <Badge :variant="statusVariant(d.status)">{{ statusLabel(d.status) }}</Badge>
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
                      <span class="ml-1">{{ d.expiresAt ? formatExpiry(d.expiresAt) : '-' }}</span>
                    </div>
                    <div>
                      <span class="text-muted-foreground">分组:</span>
                      <span class="ml-1">{{ d.groupName || '-' }}</span>
                    </div>
                  </div>
                  <div v-if="d.tags && d.tags.length" class="flex gap-1 flex-wrap mt-2">
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
import { ref, computed, onMounted } from 'vue';
import { useDomainStore } from '@/stores/domain';
import { useAuthStore } from '@/stores/auth';
import AddDomainDialog from '@/components/domain/AddDomainDialog.vue';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { ArrowLeft, Filter } from 'lucide-vue-next';

const store = useDomainStore();
const authStore = useAuthStore();

const isAdmin = computed(() => authStore.user?.role === 'admin');
const searchQuery = ref('');
const statusFilter = ref('all');
const groupFilter = ref('');
const selectedTags = ref<string[]>([]);
const showAddDialog = ref(false);
const showFilters = ref(false);
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

const filteredDomains = computed(() => {
  if (selectedTags.value.length === 0) return store.domains;
  return store.domains.filter((d) => {
    if (!d.tags) return false;
    return selectedTags.value.some((t) => d.tags!.includes(t));
  });
});

function toggleTagFilter(tag: string) {
  const idx = selectedTags.value.indexOf(tag);
  if (idx !== -1) {
    selectedTags.value.splice(idx, 1);
  } else {
    selectedTags.value.push(tag);
  }
}

function debouncedFetch() {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(fetchList, 300);
}

function fetchList() {
  store.fetchDomains({
    search: searchQuery.value || undefined,
    status: statusFilter.value === 'all' ? undefined : statusFilter.value || undefined,
    group: groupFilter.value || undefined,
  });
}

function statusVariant(status: string): 'default' | 'destructive' | 'secondary' | 'outline' {
  if (status === 'active') return 'default';
  if (status === 'expired') return 'destructive';
  if (status === 'transferred') return 'secondary';
  return 'outline';
}

function statusLabel(status: string) {
  if (status === 'active') return '正常';
  if (status === 'expired') return '已过期';
  if (status === 'transferred') return '已转移';
  return status;
}

function formatExpiry(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = d.getTime() - now.getTime();
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
  const formatted = d.toLocaleDateString('zh-CN');
  if (days < 0) return `${formatted} (已过期)`;
  if (days <= 30) return `${formatted} (${days}天后到期)`;
  return formatted;
}

function handleCreated() {
  showAddDialog.value = false;
  fetchList();
  store.fetchGroups();
  store.fetchTags();
}

onMounted(async () => {
  try {
    await Promise.all([fetchList(), store.fetchGroups(), store.fetchTags()]);
  } catch {}
});
</script>
