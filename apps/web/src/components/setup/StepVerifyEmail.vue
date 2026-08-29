<script setup lang="ts">
import { ref, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import api from '@/lib/axios';
import { useSetupStore } from '@/stores/setup';
import { Loader2, CheckCircle2, Mail, Send } from 'lucide-vue-next';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

const emit = defineEmits<{
  next: [];
  back: [];
}>();

const store = useSetupStore();
const router = useRouter();
const email = ref('');
const emailBound = ref(false);
const code = ref('');
const sending = ref(false);
const binding = ref(false);
const verifying = ref(false);
const verified = ref(false);
const error = ref('');
const countdown = ref(0);
let timer: number | undefined;

function startCountdown() {
  countdown.value = 60;
  timer = window.setInterval(() => {
    countdown.value--;
    if (countdown.value <= 0 && timer !== undefined) {
      window.clearInterval(timer);
      timer = undefined;
    }
  }, 1000);
}

async function bindEmail() {
  if (!email.value) return;
  binding.value = true;
  error.value = '';
  try {
    await api.post('/setup/admin/email', { email: email.value });
    emailBound.value = true;
  } catch (e: unknown) {
    const err = e as { response?: { data?: { message?: string } } };
    error.value = err.response?.data?.message || '绑定邮箱失败';
  } finally {
    binding.value = false;
  }
}

async function sendEmail() {
  sending.value = true;
  error.value = '';
  try {
    await api.post('/setup/verify-email/send');
    startCountdown();
  } catch (e: unknown) {
    const err = e as { response?: { data?: { message?: string } } };
    error.value = err.response?.data?.message || '发送失败';
  } finally {
    sending.value = false;
  }
}

function onCodeInput(val: string | number) {
  code.value = String(val).replace(/\D/g, '');
}

async function verify() {
  if (code.value.length !== 6) return;
  verifying.value = true;
  error.value = '';
  try {
    await api.post('/setup/verify-email', { code: code.value });
    verified.value = true;
    await store.finishSetup();
    setTimeout(() => {
      router.push('/login');
    }, 1500);
  } catch (e: unknown) {
    const err = e as { response?: { data?: { message?: string } } };
    error.value = err.response?.data?.message || '验证失败';
  } finally {
    verifying.value = false;
  }
}

async function skipAndFinish() {
  error.value = '';
  verifying.value = true;
  try {
    await store.finishSetup();
    verified.value = true;
    setTimeout(() => {
      router.push('/login');
    }, 800);
  } catch (e: unknown) {
    const err = e as { response?: { data?: { message?: string; error?: string } } };
    error.value = err.response?.data?.error || err.response?.data?.message || '完成失败';
  } finally {
    verifying.value = false;
  }
}

onUnmounted(() => {
  if (timer !== undefined) window.clearInterval(timer);
});
</script>

<template>
  <div class="space-y-6">
    <div v-if="!verified">
      <h2 class="text-xl font-semibold tracking-tight">验证邮箱（可选）</h2>
      <p class="text-sm text-muted-foreground mt-1">
        可跳过。未配置 SMTP 时请直接完成初始化；邮箱可登录后在个人资料中绑定。
      </p>
    </div>

    <div v-if="error" class="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
      {{ error }}
    </div>

    <div v-if="verified" class="flex flex-col items-center py-8 space-y-4">
      <div class="w-16 h-16 rounded-full bg-primary/15 flex items-center justify-center">
        <CheckCircle2 class="h-10 w-10 text-primary" />
      </div>
      <h2 class="text-2xl font-bold">初始化完成！</h2>
      <p class="text-sm text-muted-foreground">系统已成功初始化，正在跳转到登录页面...</p>
      <Loader2 class="h-5 w-5 animate-spin text-muted-foreground" />
    </div>

    <template v-else>
      <template v-if="!emailBound">
        <div class="space-y-4">
          <div class="space-y-2">
            <Label>管理员邮箱</Label>
            <Input v-model="email" type="email" placeholder="admin@example.com" />
            <p class="text-xs text-muted-foreground">用于接收系统通知和验证邮件</p>
          </div>
          <Button @click="bindEmail" :disabled="binding || !email">
            <Loader2 v-if="binding" class="mr-2 h-4 w-4 animate-spin" />
            {{ binding ? '绑定中...' : '绑定邮箱' }}
          </Button>
        </div>
      </template>

      <template v-else>
        <div class="flex flex-col items-center py-4 space-y-4">
          <div class="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Mail class="h-6 w-6 text-primary" />
          </div>

          <p class="text-sm text-muted-foreground text-center">验证邮件将发送至 {{ email }}</p>

          <Button variant="outline" @click="sendEmail" :disabled="sending || countdown > 0">
            <Loader2 v-if="sending" class="mr-2 h-4 w-4 animate-spin" />
            <Send v-else class="mr-2 h-4 w-4" />
            <template v-if="sending">发送中...</template>
            <template v-else-if="countdown > 0">{{ countdown }}秒后可重新发送</template>
            <template v-else>发送验证邮件</template>
          </Button>
        </div>

        <div class="space-y-2">
          <Label>验证码</Label>
          <Input
            :model-value="code"
            @update:model-value="onCodeInput"
            class="text-center text-lg tracking-widest"
            placeholder="000000"
            maxlength="6"
          />
          <p class="text-sm text-muted-foreground">请输入6位数字验证码</p>
        </div>
      </template>

      <div class="flex justify-between pt-4 border-t gap-2">
        <Button variant="outline" @click="emit('back')">
          上一步
        </Button>
        <div class="flex gap-2">
          <Button variant="secondary" @click="skipAndFinish" :disabled="verifying">
            跳过并完成初始化
          </Button>
          <Button v-if="emailBound" @click="verify" :disabled="verifying || code.length !== 6">
            <Loader2 v-if="verifying" class="mr-2 h-4 w-4 animate-spin" />
            {{ verifying ? '验证中...' : '验证并完成' }}
          </Button>
        </div>
      </div>
    </template>
  </div>
</template>
