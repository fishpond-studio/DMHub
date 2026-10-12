<script setup lang="ts">
import { ref, computed, onBeforeUnmount } from 'vue';
import { useI18n } from 'vue-i18n';
import { DialogRoot, DialogPortal, DialogOverlay, DialogContent, DialogTitle, DialogDescription } from 'radix-vue';
import { MailCheck, Loader2 } from 'lucide-vue-next';
import { useAuthStore } from '@/stores/auth';
import api from '@/lib/axios';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { toastSuccess } from '@/lib/toast-helpers';

const { t } = useI18n();
const authStore = useAuthStore();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const email = ref('');
const password = ref('');
const code = ref('');
const codeSent = ref(false);
const sending = ref(false);
const verifying = ref(false);
const countdown = ref(0);
const error = ref('');
const smtpMissing = ref(false);
let timer: ReturnType<typeof setInterval> | null = null;

const dismissed = ref(false);
const visible = computed(() => !!authStore.user && !authStore.user.email && !dismissed.value);
const canSend = computed(() => !sending.value && countdown.value === 0 && EMAIL_RE.test(email.value.trim()) && password.value.length > 0);

function startCountdown() {
  countdown.value = 60;
  timer = setInterval(() => {
    countdown.value--;
    if (countdown.value <= 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  }, 1000);
}

async function sendCode() {
  error.value = '';
  if (!EMAIL_RE.test(email.value.trim())) {
    error.value = t('auth.emailInvalid');
    return;
  }
  if (!password.value) {
    error.value = t('auth.fillRequired');
    return;
  }
  sending.value = true;
  try {
    const { data } = await api.post('/me/email/verify/send', {
      email: email.value.trim(),
      password: password.value,
    });
    codeSent.value = true;
    toastSuccess(t('emailVerify.codeSentTo', { email: data.sentTo }));
    startCountdown();
  } catch (err: any) {
    const msg = err.response?.data?.error || err.message || '';
    error.value = msg;
    // SMTP 未配置时允许暂时跳过，避免把用户锁死在弹窗里
    // 服务端固定返回中文原文，这里必须用原文比较，不能用 t()
    smtpMissing.value = typeof msg === 'string' && msg.includes('邮件服务未配置');
  } finally {
    sending.value = false;
  }
}

async function verify() {
  error.value = '';
  if (!code.value.trim()) {
    error.value = t('emailVerify.fillCode');
    return;
  }
  verifying.value = true;
  try {
    const { data } = await api.post('/me/email/verify', { code: code.value.trim(), scope: 'email-change' });
    authStore.user = data.user;
    toastSuccess(t('emailVerify.verifySuccess'));
    code.value = '';
    password.value = '';
    codeSent.value = false;
  } catch (err: any) {
    error.value = err.response?.data?.error || err.message;
  } finally {
    verifying.value = false;
  }
}

onBeforeUnmount(() => {
  if (timer) clearInterval(timer);
});
</script>

<template>
  <DialogRoot :open="visible">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px]" />
      <DialogContent
        class="fixed left-1/2 top-1/2 z-50 grid w-full max-w-md -translate-x-1/2 -translate-y-1/2 gap-4 border bg-card p-6 shadow-xl sm:rounded-xl"
        @escape-key-down.prevent
        @interact-outside.prevent
        @focus-outside.prevent
      >
        <div class="flex items-center gap-3">
          <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <MailCheck class="h-5 w-5" />
          </div>
          <div>
            <DialogTitle class="text-base font-semibold leading-none">
              {{ t('emailVerify.title') }}
            </DialogTitle>
            <DialogDescription class="mt-1 text-xs text-muted-foreground">
              {{ t('emailVerify.desc') }}
            </DialogDescription>
          </div>
        </div>

        <div class="space-y-3">
          <div class="space-y-1.5">
            <Label for="force-email">{{ t('emailVerify.emailLabel') }}</Label>
            <Input id="force-email" v-model="email" type="email" autocomplete="email" :placeholder="t('auth.emailPlaceholder')" />
          </div>
          <div class="space-y-1.5">
            <Label for="force-password">{{ t('auth.password') }}</Label>
            <Input id="force-password" v-model="password" type="password" autocomplete="current-password" :placeholder="t('auth.passwordPlaceholder')" />
          </div>
          <div class="space-y-1.5">
            <div class="flex items-center justify-between">
              <Label for="force-code">{{ t('emailVerify.codeLabel') }}</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                class="h-7 px-2 text-xs"
                :disabled="!canSend"
                @click="sendCode"
              >
                <Loader2 v-if="sending" class="mr-1 h-3.5 w-3.5 animate-spin" />
                {{ sending ? t('emailVerify.sending') : (countdown > 0 ? t('emailVerify.resendIn', { seconds: countdown }) : t('emailVerify.sendCode')) }}
              </Button>
            </div>
            <Input id="force-code" v-model="code" type="text" inputmode="numeric" maxlength="6" :placeholder="t('emailVerify.codePlaceholder')" />
          </div>

          <p v-if="error" class="text-sm text-destructive">{{ error }}</p>

          <Button class="w-full" :disabled="verifying || !codeSent" @click="verify">
            <Loader2 v-if="verifying" class="mr-2 h-4 w-4 animate-spin" />
            {{ verifying ? t('emailVerify.verifying') : t('emailVerify.verify') }}
          </Button>
          <Button v-if="smtpMissing" variant="ghost" class="w-full" @click="dismissed = true">
            {{ t('emailVerify.skip') }}
          </Button>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
