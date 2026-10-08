<template>
  <div class="space-y-6">
    <Card>
      <CardHeader>
        <CardTitle>第一步：扫描二维码</CardTitle>
        <CardDescription>使用身份验证器应用扫描下方二维码，或手动输入密钥。</CardDescription>
      </CardHeader>
      <CardContent>
        <div class="flex flex-col items-center space-y-4">
          <p class="text-sm text-muted-foreground text-center">推荐使用 Google Authenticator、Microsoft Authenticator 或 Authy</p>
          <div class="bg-white p-3 rounded-lg border shadow-sm">
            <QrcodeVue :value="otpauthUri" :size="200" level="M" />
          </div>
          <div class="w-full">
            <Label class="mb-1">手动密钥</Label>
            <div class="flex items-center space-x-2">
              <code class="flex-1 rounded-md bg-muted px-3 py-2 font-record select-all break-all">{{ secret }}</code>
              <Button @click="copySecret" variant="outline" size="sm">
                {{ copied ? '已复制' : '复制' }}
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>第二步：输入验证码</CardTitle>
        <CardDescription>输入验证器应用中显示的6位数字。</CardDescription>
      </CardHeader>
      <CardContent>
        <form class="space-y-4" @submit.prevent="handleVerify">
          <Input
            v-model="code"
            type="text"
            maxlength="6"
            inputmode="numeric"
            pattern="[0-9]*"
            autocomplete="one-time-code"
            class="text-center text-lg tracking-widest"
            placeholder="000000"
          />

          <p v-if="error" class="text-sm text-destructive">{{ error }}</p>

          <div class="flex space-x-3">
            <Button
              type="button"
              @click="$emit('cancel')"
              variant="outline"
              class="flex-1"
            >
              取消
            </Button>
            <Button
              type="submit"
              :disabled="loading || code.length !== 6"
              class="flex-1"
            >
              {{ loading ? '验证中...' : '验证' }}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import QrcodeVue from 'qrcode.vue';
import api from '@/lib/axios';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const props = defineProps<{
  otpauthUri: string;
  secret: string;
}>();

const emit = defineEmits<{
  verified: [codes: string[]];
  cancel: [];
}>();

const code = ref('');
const loading = ref(false);
const error = ref('');
const copied = ref(false);

async function copySecret() {
  try {
    await navigator.clipboard.writeText(props.secret);
    copied.value = true;
    setTimeout(() => { copied.value = false; }, 2000);
  } catch {
    const input = document.createElement('input');
    input.value = props.secret;
    document.body.appendChild(input);
    input.select();
    document.execCommand('copy');
    document.body.removeChild(input);
    copied.value = true;
    setTimeout(() => { copied.value = false; }, 2000);
  }
}

async function handleVerify() {
  error.value = '';
  if (code.value.length !== 6) return;
  loading.value = true;
  try {
    const { data } = await api.post('/2fa/totp/verify', { code: code.value });
    emit('verified', data.backupCodes);
  } catch (err: any) {
    error.value = err.response?.data?.error || '验证失败';
  } finally {
    loading.value = false;
  }
}
</script>
