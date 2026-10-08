<script setup lang="ts">
import { ref, reactive, watch } from 'vue';
import api from '@/lib/axios';
import { useSetupStore } from '@/stores/setup';
import { setupDatabaseSchema } from '@dmhub/shared';
import { Loader2, CheckCircle2, XCircle, ChevronDown, ChevronUp } from 'lucide-vue-next';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const emit = defineEmits<{
  next: [];
  back: [];
}>();

const store = useSetupStore();

const form = reactive({
  dbType: 'postgresql' as 'postgresql' | 'mariadb' | 'mysql',
  host: 'localhost',
  port: '5432',
  username: '',
  password: '',
  database: '',
  redisUrl: '',
});

const errors = ref<Record<string, string>>({});
const testing = ref(false);
const testResult = ref<'success' | 'error' | null>(null);
const testError = ref('');
const testHint = ref('');
const saving = ref(false);
const showDbHelp = ref(false);

watch(() => form.dbType, (type) => {
  if (type === 'postgresql') form.port = '5432';
  else form.port = '3306';
});

function validate(): boolean {
  errors.value = {};
  const result = setupDatabaseSchema.safeParse({
    ...form,
    port: Number(form.port) || 0,
  });
  if (!result.success) {
    for (const issue of result.error.issues) {
      const key = issue.path.join('.');
      if (!errors.value[key]) errors.value[key] = issue.message;
    }
    return false;
  }
  return true;
}

async function testConnection() {
  if (!validate()) return;
  testing.value = true;
  testResult.value = null;
  testError.value = '';
  testHint.value = '';
  try {
    const { data } = await api.post('/setup/database/test', { ...form, port: Number(form.port) });
    if (data?.success) {
      testResult.value = 'success';
    } else {
      testResult.value = 'error';
      testError.value = data?.error || '连接失败';
      testHint.value = data?.hint || '';
    }
  } catch (e: unknown) {
    testResult.value = 'error';
    const err = e as { response?: { data?: { error?: string; message?: string; hint?: string } } };
    testError.value = err.response?.data?.error || err.response?.data?.message || '连接失败';
    testHint.value = err.response?.data?.hint || '';
  } finally {
    testing.value = false;
  }
}

async function saveAndNext() {
  if (!validate()) return;
  saving.value = true;
  try {
    const { data } = await api.post('/setup/database', { ...form, port: Number(form.port) });
    store.dbConfigured = true;
    if (data?.restartRequired) {
      restartRequired.value = true;
      return;
    }
    emit('next');
  } catch (e: unknown) {
    const err = e as { response?: { data?: { error?: string; message?: string } } };
    errors.value._form = err.response?.data?.error || err.response?.data?.message || '保存失败';
  } finally {
    saving.value = false;
  }
}

const restartRequired = ref(false);
</script>

<template>
  <div class="space-y-6">
    <div>
      <h2 class="text-xl font-semibold tracking-tight">数据库配置</h2>
      <p class="text-sm text-muted-foreground mt-1">配置数据库连接信息，系统将使用此连接存储数据。如指定的数据库不存在，将自动创建</p>
    </div>

    <div v-if="errors._form" class="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
      {{ errors._form }}
    </div>

    <div class="space-y-4">
      <div class="space-y-2">
        <Label>数据库类型</Label>
        <Select v-model="form.dbType">
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="postgresql">PostgreSQL（推荐）</SelectItem>
            <SelectItem value="mariadb">MariaDB</SelectItem>
            <SelectItem value="mysql">MySQL</SelectItem>
          </SelectContent>
        </Select>
        <p v-if="form.dbType !== 'postgresql'" class="text-xs text-warning">
          ⚠️ 选择 MariaDB/MySQL 后，保存配置时需要重启服务才能让 schema 切换生效。Docker 环境请执行 <code>docker compose restart app</code>。
        </p>
      </div>

      <div class="grid grid-cols-3 gap-4">
        <div class="col-span-2 space-y-2">
          <Label>主机地址</Label>
          <Input v-model="form.host" placeholder="localhost" />
          <p v-if="errors.host" class="text-sm text-destructive">{{ errors.host }}</p>
        </div>
        <div class="space-y-2">
          <Label>端口</Label>
          <Input v-model="form.port" type="number" placeholder="5432" />
          <p v-if="errors.port" class="text-sm text-destructive">{{ errors.port }}</p>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-4">
        <div class="space-y-2">
          <Label>用户名</Label>
          <Input v-model="form.username" placeholder="root" />
          <p v-if="errors.username" class="text-sm text-destructive">{{ errors.username }}</p>
        </div>
        <div class="space-y-2">
          <Label>密码</Label>
          <Input v-model="form.password" type="password" placeholder="••••••" />
        </div>
      </div>

      <div class="space-y-2">
        <Label>数据库名</Label>
        <Input v-model="form.database" placeholder="dmhub" />
        <p v-if="errors.database" class="text-sm text-destructive">{{ errors.database }}</p>
      </div>

      <div class="rounded-md border bg-muted/50">
        <button
          type="button"
          class="flex w-full items-center justify-between px-3 py-2 text-sm font-medium text-foreground hover:bg-muted/80 transition-colors"
          @click="showDbHelp = !showDbHelp"
        >
          <span>如何创建数据库？</span>
          <ChevronDown v-if="!showDbHelp" class="h-4 w-4" />
          <ChevronUp v-else class="h-4 w-4" />
        </button>
        <div v-if="showDbHelp" class="px-3 pb-3 text-sm text-muted-foreground space-y-2">
          <p>如果数据库不存在，系统会自动创建。您也可以手动创建：</p>
          <div class="space-y-1">
            <p class="font-medium text-foreground">PostgreSQL：</p>
            <code class="block rounded bg-background px-2 py-1 text-xs">CREATE DATABASE dmhub;</code>
          </div>
          <div class="space-y-1">
            <p class="font-medium text-foreground">MariaDB / MySQL：</p>
            <code class="block rounded bg-background px-2 py-1 text-xs">CREATE DATABASE dmhub CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;</code>
          </div>
        </div>
      </div>

      <div class="space-y-2">
        <Label>
          Redis URL
          <span class="text-muted-foreground font-normal">（可选）</span>
        </Label>
        <Input v-model="form.redisUrl" placeholder="redis://localhost:6379" />
        <p class="text-xs text-muted-foreground">Redis 为可选加速组件，不确定是什么可以跳过</p>
        <p v-if="errors.redisUrl" class="text-sm text-destructive">{{ errors.redisUrl }}</p>
      </div>
    </div>

    <div class="flex items-center gap-3">
      <Button variant="outline" @click="testConnection" :disabled="testing">
        <Loader2 v-if="testing" class="mr-2 h-4 w-4 animate-spin" />
        <component
          :is="testResult === 'success' ? CheckCircle2 : testResult === 'error' ? XCircle : null"
          v-if="testResult && !testing"
          class="mr-2 h-4 w-4"
          :class="testResult === 'success' ? 'text-primary' : 'text-destructive'"
        />
        {{ testing ? '测试中...' : '测试连接' }}
      </Button>
      <span v-if="testResult === 'success' && !testing" class="text-sm text-primary">连接成功</span>
      <span v-if="testResult === 'error' && !testing" class="text-sm text-destructive">{{ testError }}</span>
    </div>
    <p v-if="testResult === 'error' && testHint && !testing" class="text-xs text-muted-foreground -mt-2">{{ testHint }}</p>

    <div class="flex justify-between pt-4 border-t">
      <div />
      <Button @click="saveAndNext" :disabled="saving">
        <Loader2 v-if="saving" class="mr-2 h-4 w-4 animate-spin" />
        {{ saving ? '保存中...' : '保存并继续' }}
      </Button>
    </div>

    <div v-if="restartRequired" class="rounded-md border border-warning/25 bg-warning/15 p-4 mt-4">
      <p class="text-sm font-medium text-warning">需要重启服务</p>
      <p class="text-sm text-warning mt-1">
        数据库配置已保存。由于切换了数据库方言（PostgreSQL ↔ MariaDB/MySQL），需要重启服务让 schema 加载对应方言。
      </p>
      <p class="text-sm text-warning mt-2">
        Docker 部署执行：<code class="px-1.5 py-0.5 rounded bg-warning/15">docker compose restart app</code>
      </p>
      <p class="text-sm text-warning mt-1">
        本地开发执行：先按 Ctrl+C 终止当前进程，再 <code class="px-1.5 py-0.5 rounded bg-warning/15">pnpm dev:server</code>
      </p>
      <p class="text-sm text-warning mt-2">
        重启后，刷新此页面即可继续后续引导步骤。
      </p>
    </div>
  </div>
</template>
