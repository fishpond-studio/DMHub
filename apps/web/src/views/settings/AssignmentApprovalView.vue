<template>
  <div>
    <h1 class="text-2xl font-bold text-foreground mb-6">申请审批</h1>

      <div v-if="loading" class="text-center py-12 text-muted-foreground">加载中...</div>

      <div v-else-if="pendingRequests.length === 0" class="text-center py-12 text-muted-foreground">暂无待审批的申请</div>

      <div v-else class="space-y-4">
        <Card v-for="r in pendingRequests" :key="r.id">
          <CardContent class="p-6">
            <div class="flex items-start justify-between">
              <div>
                <div class="text-sm text-muted-foreground mb-1">
                  <span class="font-medium text-foreground">{{ r.displayName || r.username }}</span> 申请访问
                  <span class="font-medium text-foreground">{{ r.domainName }}</span>
                </div>
                <div class="text-sm text-muted-foreground">
                  子域名模式: <span class="text-foreground">{{ r.subdomainPattern }}</span> |
                  权限: <span :class="r.permission === 'dns_edit' ? 'text-primary' : 'text-info'" class="font-medium">{{ r.permission === 'dns_edit' ? '可编辑' : '只读' }}</span>
                </div>
                <div class="text-sm text-muted-foreground mt-1">理由: <span class="text-foreground">{{ r.reason }}</span></div>
                <div class="text-xs text-muted-foreground mt-1 tnum">{{ formatDate(r.createdAt) }}</div>
              </div>
              <div class="flex space-x-2 ml-4">
                <Button variant="destructive" size="sm" @click="handleAction(r.id, 'reject')">拒绝</Button>
                <Button size="sm" @click="handleAction(r.id, 'approve')">批准</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog :open="!!rejectDialog" @update:open="rejectDialog = $event ? rejectDialog : null">
        <DialogContent>
          <DialogHeader>
            <DialogTitle>拒绝申请</DialogTitle>
          </DialogHeader>
          <Textarea v-model="reviewComment" rows="3" placeholder="拒绝理由（可选）" />
          <DialogFooter>
            <Button variant="outline" @click="rejectDialog = null">取消</Button>
            <Button variant="destructive" @click="proceedReject">确认拒绝</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog :open="!!approveDialog" @update:open="approveDialog = $event ? approveDialog : null">
        <DialogContent>
          <DialogHeader>
            <DialogTitle>批准申请</DialogTitle>
          </DialogHeader>
          <Textarea v-model="reviewComment" rows="3" placeholder="审批备注（可选）" />
          <div v-if="approveWildcard" class="rounded border border-warning/25 bg-warning/15 p-3 mb-2 text-sm text-warning">
            通配符子域名模式将匹配该域名下所有层级的子域名（如 *.dev 匹配 a.dev 和 x.y.dev），请确认此操作。
          </div>
          <DialogFooter>
            <Button variant="outline" @click="approveDialog = null">取消</Button>
            <Button @click="proceedApprove">确认批准</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useAssignmentStore } from '@/stores/assignment';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const store = useAssignmentStore();
const loading = ref(true);
const rejectDialog = ref<string | null>(null);
const approveDialog = ref<string | null>(null);
const reviewComment = ref('');
const approveWildcard = ref(false);

const pendingRequests = computed(() => store.pendingRequests);

onMounted(async () => {
  try {
    await store.fetchPendingRequests();
  } finally {
    loading.value = false;
  }
});

function handleAction(id: string, action: 'approve' | 'reject') {
  reviewComment.value = '';
  if (action === 'reject') {
    rejectDialog.value = id;
  } else {
    const req = pendingRequests.value.find((r) => r.id === id);
    approveWildcard.value = req?.subdomainPattern.includes('*') ?? false;
    approveDialog.value = id;
  }
}

async function proceedReject() {
  if (!rejectDialog.value) return;
  try {
    await store.reviewRequest(rejectDialog.value, { action: 'reject', reviewComment: reviewComment.value || undefined });
    await store.fetchPendingRequests();
  } catch (err: any) {
    alert(err.response?.data?.error || '操作失败');
  }
  rejectDialog.value = null;
}

async function proceedApprove() {
  if (!approveDialog.value) return;
  try {
    const result = await store.reviewRequest(approveDialog.value, {
      action: 'approve',
      reviewComment: reviewComment.value || undefined,
      confirmed: approveWildcard.value ? true : undefined,
    });
    if (result.requiresConfirmation) {
      approveWildcard.value = true;
      return;
    }
    await store.fetchPendingRequests();
  } catch (err: any) {
    alert(err.response?.data?.error || '操作失败');
  }
  approveDialog.value = null;
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('zh-CN');
}
</script>
