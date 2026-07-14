<template>
  <div class="min-h-screen bg-background">
    <div class="max-w-4xl mx-auto px-4 py-8">
      <div class="flex items-center mb-6">
        <Button variant="ghost" size="icon" @click="$router.push('/dashboard')">
          <ArrowLeft class="h-5 w-5" />
        </Button>
        <h1 class="text-2xl font-bold text-foreground">我的域名</h1>
      </div>

      <div v-if="loading" class="text-center py-12 text-muted-foreground">加载中...</div>

      <div v-else-if="myDomains.length === 0" class="text-center py-12 text-muted-foreground">暂未分配任何域名</div>

      <div v-else class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card v-for="d in myDomains" :key="d.id">
          <CardHeader class="pb-2">
            <div class="flex items-center justify-between">
              <CardTitle class="text-base">{{ d.name }}</CardTitle>
              <Badge :variant="d.permission === 'dns_edit' ? 'default' : 'secondary'">
                {{ d.permission === 'dns_edit' ? '可编辑' : '只读' }}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div class="space-y-1 text-sm text-muted-foreground">
              <div>子域名模式: {{ d.subdomainPattern || '-' }}</div>
              <div class="flex items-center gap-2">
                状态: <Badge :variant="d.status === 'active' ? 'default' : 'destructive'" class="text-xs">
                  {{ d.status === 'active' ? '正常' : d.status === 'expired' ? '已过期' : d.status }}
                </Badge>
              </div>
              <div>分组: {{ d.groupName || '-' }}</div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useAssignmentStore } from '@/stores/assignment';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-vue-next';

const store = useAssignmentStore();
const loading = ref(true);
const myDomains = computed(() => store.myDomains);

onMounted(async () => {
  try {
    await store.fetchMyDomains();
  } finally {
    loading.value = false;
  }
});
</script>
