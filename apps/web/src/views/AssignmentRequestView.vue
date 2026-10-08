<template>
  <div class="min-h-screen bg-background">
    <div class="mx-auto w-full max-w-3xl px-6 py-6 md:py-8">
      <div class="flex items-center mb-6">
        <Button variant="ghost" size="icon" @click="$router.push('/dashboard')">
          <ArrowLeft class="h-5 w-5" />
        </Button>
        <h1 class="text-2xl font-bold text-foreground">申请域名访问</h1>
      </div>

      <Card class="mb-6">
        <CardHeader>
          <CardTitle>提交申请</CardTitle>
        </CardHeader>
        <CardContent>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label class="mb-1">域名</Label>
              <Select v-model="form.domainId">
                <SelectTrigger>
                  <SelectValue placeholder="选择域名" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">选择域名</SelectItem>
                  <SelectItem v-for="d in domainList" :key="d.id" :value="d.id">{{ d.name }}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label class="mb-1">子域名模式</Label>
              <Input v-model="form.subdomainPattern" type="text" placeholder="* 或具体子域名" />
            </div>
            <div>
              <Label class="mb-1">权限</Label>
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
            <div>
              <Label class="mb-1">申请理由</Label>
              <Input v-model="form.reason" type="text" placeholder="请填写申请理由" />
            </div>
          </div>
          <div class="mt-4 flex justify-end">
            <Button @click="handleSubmit" :disabled="form.domainId === 'none' || !form.reason || submitting">
              {{ submitting ? '提交中...' : '提交申请' }}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>我的申请</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>域名</TableHead>
                <TableHead>子域名模式</TableHead>
                <TableHead>权限</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>备注</TableHead>
                <TableHead>申请时间</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-if="myRequests.length === 0">
                <TableCell colspan="6" class="text-center text-muted-foreground py-8">暂无申请记录</TableCell>
              </TableRow>
              <TableRow v-for="r in myRequests" :key="r.id">
                <TableCell class="font-medium">{{ r.domainName }}</TableCell>
                <TableCell class="text-muted-foreground">{{ r.subdomainPattern }}</TableCell>
                <TableCell>
                  <Badge :variant="r.permission === 'dns_edit' ? 'default' : 'secondary'">
                    {{ r.permission === 'dns_edit' ? '可编辑' : '只读' }}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge :variant="statusVariant(r.status)">{{ statusLabel(r.status) }}</Badge>
                </TableCell>
                <TableCell class="text-muted-foreground">{{ r.reviewComment || '-' }}</TableCell>
                <TableCell class="text-muted-foreground tnum">{{ formatDate(r.createdAt) }}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useAssignmentStore } from '@/stores/assignment';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { ArrowLeft } from 'lucide-vue-next';

const store = useAssignmentStore();
const submitting = ref(false);
const form = ref({ domainId: 'none', subdomainPattern: '*', permission: 'dns_edit' as const, reason: '' });

const domainList = computed(() => store.domains);
const myRequests = computed(() => store.myRequests);

onMounted(async () => {
  await Promise.all([store.fetchDomains(), store.fetchMyRequests()]);
});

async function handleSubmit() {
  submitting.value = true;
  try {
    await store.createRequest(form.value);
    form.value = { domainId: 'none', subdomainPattern: '*', permission: 'dns_edit', reason: '' };
    await store.fetchMyRequests();
  } catch (err: any) {
    alert(err.response?.data?.error || '提交失败');
  } finally {
    submitting.value = false;
  }
}

function statusLabel(status: string) {
  const labels: Record<string, string> = { pending: '待审核', approved: '已通过', rejected: '已拒绝' };
  return labels[status] ?? status;
}

function statusVariant(status: string): 'default' | 'destructive' | 'secondary' | 'outline' {
  switch (status) {
    case 'pending': return 'outline';
    case 'approved': return 'default';
    case 'rejected': return 'destructive';
    default: return 'secondary';
  }
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('zh-CN');
}
</script>
