<template>
  <div>
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold text-foreground">我的令牌</h1>
        <p class="text-sm text-muted-foreground mt-1">管理您的个人访问令牌，用于API调用和系统鉴权</p>
      </div>
      <Button @click="showCreateDialog = true">
        <Plus class="h-4 w-4 mr-1" />
        生成新令牌
      </Button>
    </div>

    <div v-if="loading" class="text-center py-12 text-muted-foreground">加载中...</div>
    <div v-else-if="tokens.length === 0" class="text-center py-12 text-muted-foreground">
      暂无令牌，点击上方按钮生成
    </div>
    <Card v-else>
      <div class="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>名称</TableHead>
              <TableHead>令牌前缀</TableHead>
              <TableHead>权限</TableHead>
              <TableHead>最后使用</TableHead>
              <TableHead>创建时间</TableHead>
              <TableHead class="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="token in tokens" :key="token.id">
              <TableCell class="font-medium">{{ token.name }}</TableCell>
              <TableCell class="font-mono text-muted-foreground">{{ token.tokenPrefix }}...</TableCell>
              <TableCell>
                <div class="flex gap-1 flex-wrap">
                  <Badge v-for="perm in token.permissions" :key="perm" variant="secondary">
                    {{ permissionLabel(perm) }}
                  </Badge>
                </div>
              </TableCell>
              <TableCell class="text-muted-foreground">
                {{ token.lastUsedAt ? new Date(token.lastUsedAt).toLocaleString('zh-CN') : '从未使用' }}
              </TableCell>
              <TableCell class="text-muted-foreground">
                {{ new Date(token.createdAt).toLocaleString('zh-CN') }}
              </TableCell>
              <TableCell class="text-right">
                <Button variant="ghost" size="sm" class="text-destructive hover:text-destructive" @click="handleRevoke(token.id, token.name)">
                  吊销
                </Button>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>

      <div class="md:hidden divide-y">
        <div v-for="token in tokens" :key="token.id" class="p-4">
          <div class="flex items-center justify-between mb-2">
            <span class="font-medium">{{ token.name }}</span>
            <Button variant="ghost" size="sm" class="text-destructive hover:text-destructive" @click="handleRevoke(token.id, token.name)">
              吊销
            </Button>
          </div>
          <div class="text-xs font-mono text-muted-foreground mb-2">{{ token.tokenPrefix }}...</div>
          <div class="flex gap-1 flex-wrap mb-2">
            <Badge v-for="perm in token.permissions" :key="perm" variant="secondary" class="text-xs">
              {{ permissionLabel(perm) }}
            </Badge>
          </div>
          <div class="text-xs text-muted-foreground">
            创建: {{ new Date(token.createdAt).toLocaleString('zh-CN') }} ·
            {{ token.lastUsedAt ? '最后使用: ' + new Date(token.lastUsedAt).toLocaleString('zh-CN') : '从未使用' }}
          </div>
        </div>
      </div>
    </Card>

    <Dialog :open="showCreateDialog" @update:open="showCreateDialog = $event">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>生成新个人令牌</DialogTitle>
        </DialogHeader>
        <div class="space-y-4">
          <div>
            <Label class="mb-1 block">名称</Label>
            <Input v-model="newTokenName" type="text" placeholder="令牌名称" />
          </div>
          <div>
            <Label class="mb-1 block">权限</Label>
            <div class="space-y-2">
              <div v-for="perm in availablePermissions" :key="perm.value" class="flex items-center space-x-2">
                <Checkbox
                  :checked="newTokenPermissions.includes(perm.value)"
                  @update:checked="togglePermission(perm.value, $event)"
                />
                <Label class="cursor-pointer" @click="togglePermission(perm.value, !newTokenPermissions.includes(perm.value))">{{ perm.label }}</Label>
              </div>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="showCreateDialog = false">取消</Button>
          <Button @click="handleGenerate" :disabled="!newTokenName || newTokenPermissions.length === 0">生成</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog :open="!!generatedToken" @update:open="!$event && (generatedToken = null)">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>个人令牌已生成</DialogTitle>
        </DialogHeader>
        <div class="rounded-md bg-yellow-500/10 p-3 mb-4">
          <p class="text-sm text-yellow-700 dark:text-yellow-300 font-medium">请立即复制并妥善保存此令牌，关闭后将无法再次查看！</p>
        </div>
        <div class="rounded-md bg-muted p-3 mb-4 break-all font-mono text-sm select-all">
          {{ generatedToken?.token }}
        </div>
        <div class="text-sm text-muted-foreground mb-4">
          <p>名称: {{ generatedToken?.name }}</p>
          <p>权限: {{ generatedToken?.permissions.map(permissionLabel).join(', ') }}</p>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="copyToken">
            <Copy class="h-4 w-4 mr-1" />
            {{ copied ? '已复制' : '复制令牌' }}
          </Button>
          <Button @click="generatedToken = null">我已保存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <AlertDialog :open="!!revokeTokenId">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>确认吊销令牌</AlertDialogTitle>
          <AlertDialogDescription>确定要吊销令牌「{{ revokeTokenName }}」吗？此操作不可撤销。</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel @click="revokeTokenId = ''; revokeTokenName = ''">取消</AlertDialogCancel>
          <AlertDialogAction @click="proceedRevoke">确认吊销</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import api from '@/lib/axios';
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

interface UserToken {
  id: string;
  name: string;
  tokenPrefix: string;
  permissions: string[];
  lastUsedAt: string | null;
  createdAt: string;
}

const tokens = ref<UserToken[]>([]);
const loading = ref(true);
const showCreateDialog = ref(false);
const newTokenName = ref('');
const newTokenPermissions = ref<string[]>(['domains:read', 'records:read']);
const copied = ref(false);
const revokeTokenId = ref('');
const revokeTokenName = ref('');
const generatedToken = ref<{ token: string; name: string; permissions: string[] } | null>(null);

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
    if (!newTokenPermissions.value.includes(value)) newTokenPermissions.value.push(value);
  } else {
    newTokenPermissions.value = newTokenPermissions.value.filter((p) => p !== value);
  }
}

async function fetchTokens() {
  loading.value = true;
  try {
    const { data } = await api.get('/auth/me/tokens');
    tokens.value = data.tokens;
  } finally {
    loading.value = false;
  }
}

async function handleGenerate() {
  if (!newTokenName.value || newTokenPermissions.value.length === 0) return;
  try {
    const { data } = await api.post('/auth/me/tokens', {
      name: newTokenName.value,
      permissions: newTokenPermissions.value,
    });
    generatedToken.value = data;
    showCreateDialog.value = false;
    newTokenName.value = '';
    newTokenPermissions.value = ['domains:read', 'records:read'];
    await fetchTokens();
  } catch (err: any) {
    alert(err.response?.data?.error || '生成失败');
  }
}

function handleRevoke(id: string, name: string) {
  revokeTokenId.value = id;
  revokeTokenName.value = name;
}

async function proceedRevoke() {
  if (!revokeTokenId.value) return;
  try {
    await api.delete(`/auth/me/tokens/${revokeTokenId.value}`);
    await fetchTokens();
  } catch (err: any) {
    alert(err.response?.data?.error || '吊销失败');
  }
  revokeTokenId.value = '';
  revokeTokenName.value = '';
}

async function copyToken() {
  if (generatedToken.value) {
    await navigator.clipboard.writeText(generatedToken.value.token);
    copied.value = true;
    setTimeout(() => { copied.value = false; }, 2000);
  }
}

onMounted(() => {
  fetchTokens();
});
</script>
