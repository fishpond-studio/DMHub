<script setup lang="ts">
import { ref, reactive, watch } from 'vue';
import api from '@/lib/axios';
import { useSetupStore } from '@/stores/setup';
import { setupSmtpSchema, SMTP_PRESETS } from '@dmhub/shared';
import { Loader2, CheckCircle2, XCircle } from 'lucide-vue-next';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const emit = defineEmits<{
  next: [];
  back: [];
  skip: [];
}>();

const store = useSetupStore();
const selectedPreset = ref('');
const form = reactive({
  host: '',
  port: '',
  user: '',
  password: '',
  from: '',
  secure: true,
});

const errors = ref<Record<string, string>>({});
const testing = ref(false);
const testResult = ref<'success' | 'error' | null>(null);
const testError = ref('');
const saving = ref(false);

watch(selectedPreset, (name) => {
  if (!name || name === '自定义') return;
  const preset = [...SMTP_PRESETS].find((p) => p.name === name);
  if (preset) {
    form.host = preset.host;
    form.port = String(preset.port);
    form.secure = preset.port === 465;
  }
});

watch(() => form.user, (val) => {
  if (val && !form.from) {
    form.from = val;
  }
});

function validate(): boolean {
  errors.value = {};
  const result = setupSmtpSchema.safeParse({
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

async function testSmtp() {
  if (!validate()) return;
  testing.value = true;
  testResult.value = null;
  try {
    await api.post('/setup/smtp/test', { ...form, port: Number(form.port) });
    testResult.value = 'success';
  } catch (e: unknown) {
    testResult.value = 'error';
    const err = e as { response?: { data?: { message?: string } } };
    testError.value = err.response?.data?.message || '测试失败';
  } finally {
    testing.value = false;
  }
}

async function saveAndNext() {
  if (!validate()) return;
  saving.value = true;
  try {
    await api.post('/setup/smtp', { ...form, port: Number(form.port) });
    store.smtpConfigured = true;
    emit('next');
  } catch (e: unknown) {
    const err = e as { response?: { data?: { message?: string } } };
    errors.value._form = err.response?.data?.message || '保存失败';
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="space-y-6">
    <div>
      <h2 class="text-xl font-semibold tracking-tight">配置 SMTP（可选）</h2>
      <p class="text-sm text-muted-foreground mt-1">
        用于系统通知和验证邮件。可跳过，登录后在「设置 → 通知」中再配置。
      </p>
    </div>

    <div v-if="errors._form" class="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
      {{ errors._form }}
    </div>

    <div class="space-y-4">
      <div class="space-y-2">
        <Label>预设</Label>
        <Select v-model="selectedPreset">
          <SelectTrigger>
            <SelectValue placeholder="请选择..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="自定义">自定义</SelectItem>
            <SelectItem v-for="preset in SMTP_PRESETS" :key="preset.name" :value="preset.name">
              {{ preset.name }}
            </SelectItem>
          </SelectContent>
        </Select>
        <p v-if="selectedPreset && selectedPreset !== '自定义'" class="text-sm text-muted-foreground">
          {{ [...SMTP_PRESETS].find(p => p.name === selectedPreset)?.note }}
        </p>
      </div>

      <div class="grid grid-cols-3 gap-4">
        <div class="col-span-2 space-y-2">
          <Label>SMTP主机</Label>
          <Input v-model="form.host" placeholder="smtp.example.com" />
          <p v-if="errors.host" class="text-sm text-destructive">{{ errors.host }}</p>
        </div>
        <div class="space-y-2">
          <Label>端口</Label>
          <Input v-model="form.port" type="number" placeholder="465" />
          <p v-if="errors.port" class="text-sm text-destructive">{{ errors.port }}</p>
          <p class="text-xs text-muted-foreground">465 = SSL 加密（推荐） | 587 = TLS 加密 | 25 = 不加密（云服务器通常封禁 25 端口，建议使用 465 或 80）</p>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-4">
        <div class="space-y-2">
          <Label>用户名</Label>
          <Input v-model="form.user" placeholder="user@example.com" />
          <p v-if="errors.user" class="text-sm text-destructive">{{ errors.user }}</p>
        </div>
        <div class="space-y-2">
          <Label>密码</Label>
          <Input v-model="form.password" type="password" placeholder="••••••" />
          <p v-if="errors.password" class="text-sm text-destructive">{{ errors.password }}</p>
          <p class="text-xs text-muted-foreground">QQ/163 邮箱请填写授权码而非登录密码</p>
        </div>
      </div>

      <div class="space-y-2">
        <Label>发件邮箱</Label>
        <Input v-model="form.from" placeholder="noreply@example.com" />
        <p v-if="errors.from" class="text-sm text-destructive">{{ errors.from }}</p>
        <p class="text-xs text-muted-foreground">默认与 SMTP 用户名相同</p>
      </div>
    </div>

    <div class="flex items-center gap-3">
      <Button variant="outline" @click="testSmtp" :disabled="testing">
        <Loader2 v-if="testing" class="mr-2 h-4 w-4 animate-spin" />
        <component
          :is="testResult === 'success' ? CheckCircle2 : testResult === 'error' ? XCircle : null"
          v-if="testResult && !testing"
          class="mr-2 h-4 w-4"
          :class="testResult === 'success' ? 'text-primary' : 'text-destructive'"
        />
        {{ testing ? '测试中...' : '测试连接' }}
      </Button>
      <span v-if="testResult === 'success' && !testing" class="text-sm text-primary">发送成功</span>
      <span v-if="testResult === 'error' && !testing" class="text-sm text-destructive">{{ testError }}</span>
    </div>

    <div class="flex justify-between pt-4 border-t gap-2">
      <Button variant="outline" @click="emit('back')">
        上一步
      </Button>
      <div class="flex gap-2">
        <Button variant="ghost" @click="emit('skip')">
          跳过
        </Button>
        <Button @click="saveAndNext" :disabled="saving">
          <Loader2 v-if="saving" class="mr-2 h-4 w-4 animate-spin" />
          {{ saving ? '保存中...' : '保存并继续' }}
        </Button>
      </div>
    </div>
  </div>
</template>
