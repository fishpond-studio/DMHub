<template>
  <div>
      <div class="flex items-center justify-between mb-6">
        <h1 class="text-2xl font-bold text-foreground">API 密钥管理</h1>
        <Button @click="showCreateDialog = true">
          <Plus class="h-4 w-4 mr-1" />
          生成新密钥
        </Button>
      </div>

      <div v-if="store.loading" class="text-center py-12 text-muted-foreground">加载中...</div>
      <div v-else-if="store.keys.length === 0" class="text-center py-12 text-muted-foreground">
        暂无 API 密钥，点击上方按钮生成
      </div>
      <Card v-else>
        <div class="hidden md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>名称</TableHead>
                <TableHead>密钥前缀</TableHead>
                <TableHead>权限</TableHead>
                <TableHead>最后使用</TableHead>
                <TableHead>创建时间</TableHead>
                <TableHead class="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="key in store.keys" :key="key.id">
                <TableCell class="font-medium">{{ key.name }}</TableCell>
                <TableCell class="font-record text-muted-foreground">{{ key.keyPrefix }}...</TableCell>
                <TableCell>
                  <div class="flex gap-1 flex-wrap">
                    <Badge v-for="perm in key.permissions" :key="perm" variant="secondary">
                      {{ permissionLabel(perm) }}
                    </Badge>
                  </div>
                </TableCell>
                <TableCell class="text-muted-foreground tnum">
                  {{ key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleString('zh-CN') : '从未使用' }}
                </TableCell>
                <TableCell class="text-muted-foreground tnum">
                  {{ new Date(key.createdAt).toLocaleString('zh-CN') }}
                </TableCell>
                <TableCell class="text-right">
                  <Button variant="ghost" size="sm" class="text-destructive hover:text-destructive" @click="handleRevoke(key.id, key.name)">
                    吊销
                  </Button>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>

        <div class="md:hidden divide-y">
          <div v-for="key in store.keys" :key="key.id" class="p-4">
            <div class="flex items-center justify-between mb-2">
              <span class="font-medium">{{ key.name }}</span>
              <Button variant="ghost" size="sm" class="text-destructive hover:text-destructive" @click="handleRevoke(key.id, key.name)">
                吊销
              </Button>
            </div>
            <div class="font-record text-muted-foreground mb-2">{{ key.keyPrefix }}...</div>
            <div class="flex gap-1 flex-wrap mb-2">
              <Badge v-for="perm in key.permissions" :key="perm" variant="secondary" class="text-xs">
                {{ permissionLabel(perm) }}
              </Badge>
            </div>
            <div class="text-xs text-muted-foreground tnum">
              创建: {{ new Date(key.createdAt).toLocaleString('zh-CN') }} ·
              {{ key.lastUsedAt ? '最后使用: ' + new Date(key.lastUsedAt).toLocaleString('zh-CN') : '从未使用' }}
            </div>
          </div>
        </div>
      </Card>

      <Dialog :open="showCreateDialog" @update:open="showCreateDialog = $event">
        <DialogContent>
          <DialogHeader>
            <DialogTitle>生成新 API 密钥</DialogTitle>
          </DialogHeader>
          <div class="space-y-4">
            <div>
              <Label class="mb-1 block">名称</Label>
              <Input v-model="newKeyName" type="text" placeholder="密钥名称" />
            </div>
            <div>
              <Label class="mb-1 block">权限</Label>
              <div class="space-y-2">
                <div v-for="perm in availablePermissions" :key="perm.value" class="flex items-center space-x-2">
                  <Checkbox
                    :checked="newKeyPermissions.includes(perm.value)"
                    @update:checked="togglePermission(perm.value, $event)"
                  />
                  <Label class="cursor-pointer" @click="togglePermission(perm.value, !newKeyPermissions.includes(perm.value))">{{ perm.label }}</Label>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" @click="showCreateDialog = false">取消</Button>
            <Button @click="handleGenerate" :disabled="!newKeyName || newKeyPermissions.length === 0">生成</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog :open="!!store.generatedKey" @update:open="!$event && store.clearGeneratedKey()">
        <DialogContent>
          <DialogHeader>
            <DialogTitle>API 密钥已生成</DialogTitle>
          </DialogHeader>
          <div class="rounded-md border border-warning/25 bg-warning/15 p-3 mb-4">
            <p class="text-sm text-warning font-medium">请立即复制并妥善保存此密钥，关闭后将无法再次查看！</p>
          </div>
          <div class="rounded-md bg-muted p-3 mb-4 break-all font-record select-all">
            {{ store.generatedKey?.key }}
          </div>
          <div class="text-sm text-muted-foreground mb-4">
            <p>名称: {{ store.generatedKey?.name }}</p>
            <p>权限: {{ store.generatedKey?.permissions.map(permissionLabel).join(', ') }}</p>
          </div>
          <DialogFooter>
            <Button variant="outline" @click="copyKey">
              <Copy class="h-4 w-4 mr-1" />
              {{ copied ? '已复制' : '复制密钥' }}
            </Button>
            <Button @click="store.clearGeneratedKey()">我已保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog :open="!!revokeKeyId">
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认吊销密钥</AlertDialogTitle>
            <AlertDialogDescription>确定要吊销密钥「{{ revokeKeyName }}」吗？此操作不可撤销。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel @click="revokeKeyId = ''; revokeKeyName = ''">取消</AlertDialogCancel>
            <AlertDialogAction @click="proceedRevoke">确认吊销</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useApiKeyStore } from '@/stores/api-key';
import { Plus, Copy } from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

const store = useApiKeyStore();
const showCreateDialog = ref(false);
const newKeyName = ref('');
const newKeyPermissions = ref<string[]>(['domains:read', 'records:read']);
const copied = ref(false);
const revokeKeyId = ref('');
const revokeKeyName = ref('');

const availablePermissions = [
  { value: 'domains:read', label: '读取域名' },
  { value: 'records:read', label: '读取记录' },
  { value: 'records:write', label: '写入记录' },
  { value: '*', label: '全部权限' },
];

function permissionLabel(perm: string) {
  const map: Record<string, string> = {
    'domains:read': '读取域名',
    'records:read': '读取记录',
    'records:write': '写入记录',
    '*': '全部权限',
  };
  return map[perm] || perm;
}

function togglePermission(value: string, checked: boolean) {
  if (checked) {
    if (!newKeyPermissions.value.includes(value)) newKeyPermissions.value.push(value);
  } else {
    newKeyPermissions.value = newKeyPermissions.value.filter((p) => p !== value);
  }
}

async function handleGenerate() {
  if (!newKeyName.value || newKeyPermissions.value.length === 0) return;
  try {
    await store.generateKey(newKeyName.value, newKeyPermissions.value);
    showCreateDialog.value = false;
    newKeyName.value = '';
    newKeyPermissions.value = ['domains:read', 'records:read'];
  } catch (err: any) {
    alert(err.response?.data?.error || '生成失败');
  }
}

function handleRevoke(keyId: string, name: string) {
  revokeKeyId.value = keyId;
  revokeKeyName.value = name;
}

async function proceedRevoke() {
  if (!revokeKeyId.value) return;
  try {
    await store.revokeKey(revokeKeyId.value);
  } catch (err: any) {
    alert(err.response?.data?.error || '吊销失败');
  }
  revokeKeyId.value = '';
  revokeKeyName.value = '';
}

async function copyKey() {
  if (store.generatedKey) {
    await navigator.clipboard.writeText(store.generatedKey.key);
    copied.value = true;
    setTimeout(() => { copied.value = false; }, 2000);
  }
}

onMounted(() => {
  store.fetchKeys();
});
</script>
