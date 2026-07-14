<template>
  <div>
    <h1 class="text-2xl font-bold text-foreground mb-6">域名分配管理</h1>

      <div class="mb-6">
        <Label class="mb-1 block">选择成员</Label>
        <Select v-model="selectedMemberId" @update:model-value="handleMemberChange">
          <SelectTrigger class="w-full max-w-xs">
            <SelectValue placeholder="-- 选择成员 --" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem v-for="m in members" :key="m.id" :value="m.id">{{ m.displayName || m.username }}</SelectItem>
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
                <Input v-model="form.subdomainPattern" type="text" placeholder="* 或具体子域名" />
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
                  <TableCell class="text-muted-foreground">{{ a.subdomainPattern }}</TableCell>
                  <TableCell>
                    <Badge v-if="a.permission === 'dns_edit'" variant="default" class="bg-primary/15 text-primary border-primary/30 hover:bg-primary/15">可编辑</Badge>
                    <Badge v-else variant="secondary">只读</Badge>
                  </TableCell>
                  <TableCell class="text-muted-foreground">{{ formatDate(a.createdAt) }}</TableCell>
                  <TableCell class="text-right">
                    <Button variant="ghost" size="sm" class="text-destructive hover:text-destructive" @click="pendingDelete = a">移除</Button>
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
                <Badge v-if="a.permission === 'dns_edit'" variant="default" class="bg-primary/15 text-primary border-primary/30">可编辑</Badge>
                <Badge v-else variant="secondary">只读</Badge>
              </div>
              <div class="flex items-center justify-between text-sm text-muted-foreground">
                <span>模式: {{ a.subdomainPattern }}</span>
                <span>{{ formatDate(a.createdAt) }}</span>
              </div>
              <Button variant="ghost" size="sm" class="text-destructive hover:text-destructive mt-2 -ml-2" @click="pendingDelete = a">移除</Button>
            </div>
          </div>
        </Card>
      </template>

      <AlertDialog :open="!!wildcardConfirm">
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认通配符分配</AlertDialogTitle>
            <AlertDialogDescription>通配符子域名模式将匹配该域名下所有层级的子域名（如 *.dev 匹配 a.dev 和 x.y.dev），确定继续吗？</AlertDialogDescription>
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
import { ref, computed, onMounted } from 'vue';
import { useTeamStore } from '@/stores/team';
import { useAssignmentStore, type DomainAssignment } from '@/stores/assignment';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

const teamStore = useTeamStore();
const store = useAssignmentStore();
const loading = ref(false);
const submitting = ref(false);
const selectedMemberId = ref('');
const wildcardConfirm = ref<typeof form.value | null>(null);
const pendingDelete = ref<DomainAssignment | null>(null);

const form = ref({ domainId: '', subdomainPattern: '*', permission: 'dns_edit' as const });
const members = computed(() => teamStore.members);
const assignments = computed(() => store.memberAssignments);
const domainList = computed(() => store.domains);

onMounted(async () => {
  await teamStore.fetchMembers();
  await store.fetchDomains();
});

async function handleMemberChange() {
  if (!selectedMemberId.value) return;
  loading.value = true;
  try {
    await store.fetchMemberAssignments(selectedMemberId.value);
  } finally {
    loading.value = false;
  }
  form.value = { domainId: '', subdomainPattern: '*', permission: 'dns_edit' };
}

async function handleAddAssignment() {
  if (!selectedMemberId.value || !form.value.domainId) return;
  submitting.value = true;
  try {
    const result = await store.createAssignment(selectedMemberId.value, form.value);
    if (result.warning) {
      wildcardConfirm.value = { ...form.value };
      submitting.value = false;
      return;
    }
    await store.fetchMemberAssignments(selectedMemberId.value);
    form.value = { domainId: '', subdomainPattern: '*', permission: 'dns_edit' };
  } catch (err: any) {
    alert(err.response?.data?.error || '添加失败');
  } finally {
    submitting.value = false;
  }
}

async function proceedWildcardAdd() {
  if (!wildcardConfirm.value || !selectedMemberId.value) return;
  submitting.value = true;
  try {
    await store.createAssignment(selectedMemberId.value, { ...wildcardConfirm.value });
    await store.fetchMemberAssignments(selectedMemberId.value);
    form.value = { domainId: '', subdomainPattern: '*', permission: 'dns_edit' };
  } catch (err: any) {
    alert(err.response?.data?.error || '添加失败');
  } finally {
    submitting.value = false;
    wildcardConfirm.value = null;
  }
}

async function proceedDelete() {
  if (!pendingDelete.value || !selectedMemberId.value) return;
  try {
    await store.deleteAssignment(selectedMemberId.value, pendingDelete.value.id);
    await store.fetchMemberAssignments(selectedMemberId.value);
  } catch (err: any) {
    alert(err.response?.data?.error || '移除失败');
  }
  pendingDelete.value = null;
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('zh-CN');
}
</script>
