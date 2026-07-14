<template>
  <div>
    <h1 class="text-2xl font-bold text-foreground mb-6">备用码重置请求</h1>

      <div v-if="loading" class="text-center py-12 text-muted-foreground">加载中...</div>

      <div v-else-if="pendingRequests.length === 0" class="text-center py-12 text-muted-foreground">暂无待审核的请求</div>

      <div v-else class="space-y-4">
        <Card v-for="r in pendingRequests" :key="r.requestId">
          <CardContent class="p-6">
            <div class="flex items-start justify-between">
              <div>
                <div class="text-sm text-muted-foreground mb-1">
                  用户 <span class="font-medium text-foreground">{{ r.username }}</span> 请求重置备用验证码
                </div>
                <div class="text-sm text-muted-foreground">
                  备用邮箱：<span class="text-foreground">{{ r.alternateEmail }}</span>
                </div>
                <div class="text-xs text-muted-foreground mt-1">{{ formatDate(r.createdAt) }}</div>
              </div>
              <div class="flex space-x-2 ml-4">
                <Button variant="destructive" size="sm" @click="openRejectDialog(r.requestId)">拒绝</Button>
                <Button size="sm" @click="handleApprove(r.requestId)" :disabled="approving === r.requestId">
                  {{ approving === r.requestId ? '处理中...' : '批准' }}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog :open="!!rejectDialogId" @update:open="rejectDialogId = $event ? rejectDialogId : null">
        <DialogContent>
          <DialogHeader>
            <DialogTitle>拒绝重置请求</DialogTitle>
          </DialogHeader>
          <Textarea v-model="rejectReason" rows="3" placeholder="拒绝理由（可选）" />
          <p v-if="actionError" class="text-sm text-destructive">{{ actionError }}</p>
          <DialogFooter>
            <Button variant="outline" @click="rejectDialogId = null">取消</Button>
            <Button variant="destructive" @click="handleReject" :disabled="rejecting">
              {{ rejecting ? '处理中...' : '确认拒绝' }}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import api from '@/lib/axios';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const loading = ref(true);
const pendingRequests = ref<{ requestId: string; userId: string; username: string; alternateEmail: string; createdAt: string }[]>([]);
const approving = ref('');
const rejectDialogId = ref<string | null>(null);
const rejectReason = ref('');
const rejecting = ref(false);
const actionError = ref('');

function formatDate(t: string): string {
  return new Date(t).toLocaleString('zh-CN');
}

async function fetchPending() {
  loading.value = true;
  try {
    const { data } = await api.get('/2fa/backup-codes/admin-reset/pending');
    pendingRequests.value = data.requests;
  } catch {
    pendingRequests.value = [];
  } finally {
    loading.value = false;
  }
}

onMounted(fetchPending);

async function handleApprove(requestId: string) {
  approving.value = requestId;
  actionError.value = '';
  try {
    await api.post(`/2fa/backup-codes/admin-reset/${requestId}/approve`);
    await fetchPending();
  } catch (err: any) {
    actionError.value = err.response?.data?.error || '审批失败';
  } finally {
    approving.value = '';
  }
}

function openRejectDialog(requestId: string) {
  rejectDialogId.value = requestId;
  rejectReason.value = '';
  actionError.value = '';
}

async function handleReject() {
  if (!rejectDialogId.value) return;
  rejecting.value = true;
  actionError.value = '';
  try {
    await api.post(`/2fa/backup-codes/admin-reset/${rejectDialogId.value}/reject`, {
      reason: rejectReason.value || undefined,
    });
    rejectDialogId.value = null;
    await fetchPending();
  } catch (err: any) {
    actionError.value = err.response?.data?.error || '拒绝失败';
  } finally {
    rejecting.value = false;
  }
}
</script>
