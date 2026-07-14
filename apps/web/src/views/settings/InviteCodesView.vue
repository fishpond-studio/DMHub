<template>
  <div>
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-2xl font-bold text-foreground">邀请码管理</h1>
        <div class="flex space-x-3">
          <Button @click="showCreateForm = true">
            <Plus class="h-4 w-4 mr-1" />
            生成新邀请码
          </Button>
          <Button variant="outline" @click="confirmRegenerate = true" class="text-destructive hover:text-destructive hover:bg-destructive/10">
            <RefreshCw class="h-4 w-4 mr-1" />
            重新生成全部
          </Button>
        </div>
      </div>

      <div v-if="loading" class="text-center py-12 text-muted-foreground">加载中...</div>

      <div v-else-if="inviteCodes.length === 0" class="text-center py-8">
        <Card>
          <CardContent class="py-8 text-center text-muted-foreground">暂无邀请码</CardContent>
        </Card>
      </div>

      <div v-else class="space-y-3">
        <Card v-for="code in inviteCodes" :key="code.id">
          <CardContent class="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div class="space-y-1">
              <div class="flex items-center space-x-3">
                <code class="text-lg font-mono font-semibold bg-muted px-3 py-1 rounded">{{ code.code }}</code>
                <Button variant="ghost" size="icon" @click="copyCode(code.code)" class="h-8 w-8" title="复制">
                  <Copy class="h-4 w-4" />
                </Button>
                <Badge v-if="isExpired(code)" variant="destructive" class="sm:hidden">已过期</Badge>
                <Badge v-else-if="code.maxUses > 0 && code.currentUses >= code.maxUses" variant="secondary" class="bg-yellow-500/15 text-yellow-600 dark:text-yellow-400 border-yellow-500/30 sm:hidden">已用完</Badge>
                <Badge v-else variant="default" class="bg-primary/15 text-primary border-primary/30 sm:hidden">可用</Badge>
              </div>
              <div class="flex items-center flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>已使用 {{ code.currentUses }} 次</span>
                <span v-if="code.maxUses > 0">/ 最多 {{ code.maxUses }} 次</span>
                <span v-else>/ 无限次</span>
                <span v-if="code.expiresAt">过期：{{ formatDate(code.expiresAt) }}</span>
                <span v-else>永不过期</span>
              </div>
            </div>
            <div class="hidden sm:block">
              <Badge v-if="isExpired(code)" variant="destructive">已过期</Badge>
              <Badge v-else-if="code.maxUses > 0 && code.currentUses >= code.maxUses" variant="secondary" class="bg-yellow-500/15 text-yellow-600 dark:text-yellow-400 border-yellow-500/30">已用完</Badge>
              <Badge v-else variant="default" class="bg-primary/15 text-primary border-primary/30 hover:bg-primary/15">可用</Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog :open="showCreateForm" @update:open="showCreateForm = $event">
        <DialogContent>
          <DialogHeader>
            <DialogTitle>生成新邀请码</DialogTitle>
          </DialogHeader>
          <div class="space-y-4">
            <div>
              <Label class="mb-1 block">最大使用次数（0 为无限）</Label>
              <Input :model-value="newCode.maxUses" @update:model-value="newCode.maxUses = Number($event)" type="number" min="0" placeholder="0 为无限" />
            </div>
            <div>
              <Label class="mb-1 block">过期时间（留空为永不过期）</Label>
              <Input v-model="newCode.expiresAt" type="datetime-local" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" @click="showCreateForm = false">取消</Button>
            <Button @click="handleCreate" :disabled="creating">
              {{ creating ? '生成中...' : '生成' }}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog :open="confirmRegenerate">
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认重新生成邀请码</AlertDialogTitle>
            <AlertDialogDescription>重新生成会使所有现有邀请码失效，此操作不可撤销。确定继续吗？</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel @click="confirmRegenerate = false">取消</AlertDialogCancel>
            <AlertDialogAction @click="handleRegenerate">确认重新生成</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useTeamStore } from '@/stores/team';
import { Plus, RefreshCw, Copy } from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

const store = useTeamStore();
const loading = ref(true);
const showCreateForm = ref(false);
const creating = ref(false);
const confirmRegenerate = ref(false);
const copiedCode = ref('');

const newCode = ref({
  maxUses: 0,
  expiresAt: '',
});

const inviteCodes = computed(() => store.inviteCodes);

onMounted(async () => {
  try {
    await store.fetchInviteCodes();
  } finally {
    loading.value = false;
  }
});

function isExpired(code: { expiresAt: string | null }) {
  return code.expiresAt ? new Date(code.expiresAt) < new Date() : false;
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleString('zh-CN');
}

async function copyCode(code: string) {
  try {
    await navigator.clipboard.writeText(code);
    copiedCode.value = code;
    setTimeout(() => { copiedCode.value = ''; }, 2000);
  } catch {
    const el = document.createElement('textarea');
    el.value = code;
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
  }
}

async function handleCreate() {
  creating.value = true;
  try {
    await store.createInviteCode(
      newCode.value.maxUses || undefined,
      newCode.value.expiresAt || undefined,
    );
    showCreateForm.value = false;
    newCode.value = { maxUses: 0, expiresAt: '' };
  } catch (err: any) {
    alert(err.response?.data?.error || '创建失败');
  } finally {
    creating.value = false;
  }
}

async function handleRegenerate() {
  confirmRegenerate.value = false;
  try {
    await store.regenerateInviteCodes(true);
  } catch (err: any) {
    alert(err.response?.data?.error || '重新生成失败');
  }
}
</script>
