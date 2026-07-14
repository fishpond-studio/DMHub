<script setup lang="ts">
import { ref } from 'vue';
import api from '@/lib/axios';
import { useSetupStore } from '@/stores/setup';
import { Loader2, CheckCircle2, XCircle } from 'lucide-vue-next';
import { Button } from '@/components/ui/button';

const emit = defineEmits<{
  next: [];
  back: [];
}>();

const store = useSetupStore();
const migrating = ref(false);
const result = ref<'success' | 'error' | null>(null);
const error = ref('');

async function runMigration() {
  migrating.value = true;
  result.value = null;
  try {
    await api.post('/setup/database/migrate');
    result.value = 'success';
    store.tablesMigrated = true;
    setTimeout(() => emit('next'), 1500);
  } catch (e: unknown) {
    result.value = 'error';
    const err = e as { response?: { data?: { message?: string } } };
    error.value = err.response?.data?.message || '迁移失败';
  } finally {
    migrating.value = false;
  }
}
</script>

<template>
  <div class="space-y-6">
    <div>
      <h2 class="text-xl font-semibold tracking-tight">创建数据表</h2>
      <p class="text-sm text-muted-foreground mt-1">系统将在数据库中创建所需的数据表结构</p>
    </div>

    <div v-if="result === 'error'" class="rounded-md bg-destructive/10 p-3 text-sm text-destructive flex items-center gap-2">
      <XCircle class="h-4 w-4 shrink-0" />
      {{ error }}
    </div>

    <div v-if="result === 'success'" class="rounded-md bg-primary/10 p-4 text-sm text-primary flex items-center gap-2">
      <CheckCircle2 class="h-5 w-5 shrink-0" />
      数据表创建成功！正在进入下一步...
    </div>

    <div v-if="result !== 'success'" class="flex flex-col items-center py-8">
      <Button @click="runMigration" :disabled="migrating" class="h-12 px-8">
        <Loader2 v-if="migrating" class="mr-2 h-5 w-5 animate-spin" />
        {{ migrating ? '正在创建数据表...' : '开始创建数据表' }}
      </Button>
      <p class="text-sm text-muted-foreground mt-3">此操作可能需要几秒钟</p>
    </div>

    <div class="flex justify-between pt-4 border-t">
      <Button variant="outline" @click="emit('back')">
        上一步
      </Button>
      <div />
    </div>
  </div>
</template>
