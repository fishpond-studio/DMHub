<template>
  <div class="flex min-h-screen flex-col items-center justify-center bg-background px-6 py-6 md:py-8">
    <router-link to="/" class="mb-6 flex items-center gap-2.5">
      <BrandMark class="h-8 w-8" />
      <span class="text-sm font-semibold tracking-tight">DMHub</span>
    </router-link>
    <Card class="w-full max-w-sm">
      <CardHeader class="text-center">
        <CardTitle class="text-2xl font-bold">两步验证</CardTitle>
        <CardDescription>请选择验证方式完成登录</CardDescription>
      </CardHeader>

      <CardContent>
        <Tabs v-model="activeTab" class="w-full">
          <TabsList class="w-full">
            <TabsTrigger
              v-for="tab in availableTabs"
              :key="tab.key"
              :value="tab.key"
              class="flex-1"
            >
              {{ tab.label }}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="passkey" class="space-y-4 mt-4">
            <p class="text-sm text-muted-foreground text-center">使用已注册的通行密钥完成验证</p>
            <p v-if="passkeyError" class="text-sm text-destructive">{{ passkeyError }}</p>
            <Button @click="handlePasskeyVerify" :disabled="passkeyLoading" class="w-full">
              <Loader2 v-if="passkeyLoading" class="mr-2 h-4 w-4 animate-spin" />
              {{ passkeyLoading ? '验证中...' : '使用通行密钥验证' }}
            </Button>
          </TabsContent>

          <TabsContent value="email" class="space-y-4 mt-4">
            <div v-if="!emailCodeSent" class="text-center">
              <p class="text-sm text-muted-foreground mb-4">发送验证码到您的邮箱</p>
              <Button @click="handleSendEmailCode" :disabled="emailSending" class="w-full">
                <Loader2 v-if="emailSending" class="mr-2 h-4 w-4 animate-spin" />
                {{ emailSending ? '发送中...' : '发送验证码' }}
              </Button>
              <p v-if="emailSendError" class="text-sm text-destructive mt-2">{{ emailSendError }}</p>
            </div>
            <template v-else>
              <p class="text-sm text-muted-foreground text-center">验证码已发送到您的邮箱</p>
              <div class="space-y-2">
                <Label>6位验证码</Label>
                <Input
                  v-model="emailCode"
                  type="text"
                  maxlength="6"
                  inputmode="numeric"
                  pattern="[0-9]*"
                  autocomplete="one-time-code"
                  class="text-center text-lg tracking-widest"
                  placeholder="000000"
                />
              </div>
              <div class="flex items-center justify-between">
                <Button
                  variant="link"
                  size="sm"
                  @click="handleSendEmailCode"
                  :disabled="emailSending || emailCooldown > 0"
                  class="px-0 tnum"
                >
                  {{ emailCooldown > 0 ? `${emailCooldown}s 后重发` : '重新发送' }}
                </Button>
              </div>
              <p v-if="emailError" class="text-sm text-destructive">{{ emailError }}</p>
              <Button @click="handleEmailVerify" :disabled="emailLoading || emailCode.length !== 6" class="w-full">
                <Loader2 v-if="emailLoading" class="mr-2 h-4 w-4 animate-spin" />
                {{ emailLoading ? '验证中...' : '验证' }}
              </Button>
            </template>
          </TabsContent>

          <TabsContent value="totp" class="space-y-4 mt-4">
            <form class="space-y-4" @submit.prevent="handleVerify">
              <div class="space-y-2">
                <Label>6位验证码</Label>
                <Input
                  v-model="totpCode"
                  type="text"
                  maxlength="6"
                  inputmode="numeric"
                  pattern="[0-9]*"
                  autocomplete="one-time-code"
                  class="text-center text-lg tracking-widest"
                  placeholder="000000"
                />
              </div>
              <p v-if="error" class="text-sm text-destructive">{{ error }}</p>
              <Button type="submit" :disabled="loading" class="w-full">
                <Loader2 v-if="loading" class="mr-2 h-4 w-4 animate-spin" />
                {{ loading ? '验证中...' : '验证' }}
              </Button>
            </form>
          </TabsContent>

          <TabsContent value="backup" class="space-y-4 mt-4">
            <form class="space-y-4" @submit.prevent="handleVerify">
              <div class="space-y-2">
                <Label>备用验证码</Label>
                <Input
                  v-model="backupCode"
                  type="text"
                  maxlength="9"
                  class="text-center text-lg tracking-widest"
                  placeholder="XXXX-XXXX"
                  @input="formatBackupCode"
                />
              </div>
              <p v-if="error" class="text-sm text-destructive">{{ error }}</p>
              <Button type="submit" :disabled="loading" class="w-full">
                <Loader2 v-if="loading" class="mr-2 h-4 w-4 animate-spin" />
                {{ loading ? '验证中...' : '验证' }}
              </Button>
            </form>
          </TabsContent>
        </Tabs>

        <div v-if="backupCodesWarning && !backupCodesExhausted" class="mt-4 rounded-md border border-warning/25 bg-warning/15 p-3">
          <p class="text-sm text-warning">{{ backupCodesWarning }}</p>
        </div>

        <div class="mt-4 text-center">
          <Button variant="link" size="sm" @click="startAdminHelp" class="text-primary">
            请求管理员帮助
          </Button>
        </div>
      </CardContent>

      <CardFooter v-if="adminHelpStep !== 'none'" class="flex-col items-stretch">
        <Separator class="mb-4" />

        <div class="flex items-center mb-4">
          <Button variant="ghost" size="icon" @click="cancelAdminHelp" class="mr-2">
            <ArrowLeft class="h-4 w-4" />
          </Button>
          <span class="text-lg font-semibold">请求管理员帮助重置备用码</span>
        </div>

        <div v-if="adminHelpStep === 'select'">
          <p class="text-sm text-muted-foreground mb-3">选择一位管理员并发送重置请求：</p>
          <div v-if="adminListLoading" class="text-sm text-muted-foreground">加载中...</div>
          <div v-else-if="adminList.length === 0" class="text-sm text-warning">没有可联系的管理员</div>
          <div v-else class="space-y-2 mb-4">
            <Button
              v-for="admin in adminList"
              :key="admin.id"
              :variant="selectedAdminId === admin.id ? 'default' : 'outline'"
              class="w-full justify-start"
              @click="selectedAdminId = admin.id"
            >
              {{ admin.nickname || admin.username }}
            </Button>
          </div>
          <div v-if="adminList.length > 0" class="space-y-3">
            <div class="space-y-2">
              <Label>备用邮箱地址</Label>
              <Input v-model="alternateEmail" type="email" placeholder="your@email.com" />
            </div>
            <p v-if="adminHelpError" class="text-sm text-destructive">{{ adminHelpError }}</p>
            <Button
              @click="handleAdminResetRequest"
              :disabled="!selectedAdminId || !alternateEmail || adminHelpLoading"
              class="w-full"
            >
              <Loader2 v-if="adminHelpLoading" class="mr-2 h-4 w-4 animate-spin" />
              {{ adminHelpLoading ? '提交中...' : '提交请求' }}
            </Button>
          </div>
        </div>

        <div v-if="adminHelpStep === 'verify-email'">
          <p class="text-sm text-muted-foreground mb-3">验证码已发送到 {{ alternateEmail }}，请输入6位验证码：</p>
          <div class="space-y-3">
            <Input v-model="adminHelpEmailCode" type="text" maxlength="6" inputmode="numeric" pattern="[0-9]*" class="text-center text-lg tracking-widest" placeholder="000000" />
            <p v-if="adminHelpError" class="text-sm text-destructive">{{ adminHelpError }}</p>
            <Button @click="handleAdminResetVerifyEmail" :disabled="adminHelpEmailCode.length !== 6 || adminHelpLoading" class="w-full">
              <Loader2 v-if="adminHelpLoading" class="mr-2 h-4 w-4 animate-spin" />
              {{ adminHelpLoading ? '验证中...' : '验证' }}
            </Button>
          </div>
        </div>

        <div v-if="adminHelpStep === 'waiting'">
          <p class="text-sm text-muted-foreground mb-3">请求已发送给管理员，批准后重置码将发送到 {{ alternateEmail }}</p>
          <div class="space-y-3 mt-4">
            <div class="space-y-2">
              <Label>输入收到的重置码</Label>
              <Input v-model="adminResetCode" type="text" class="text-center text-lg tracking-widest" placeholder="XXXXXXXX" />
            </div>
            <p v-if="adminHelpError" class="text-sm text-destructive">{{ adminHelpError }}</p>
            <Button @click="handleAdminResetApply" :disabled="!adminResetCode || adminHelpLoading" class="w-full">
              <Loader2 v-if="adminHelpLoading" class="mr-2 h-4 w-4 animate-spin" />
              {{ adminHelpLoading ? '提交中...' : '重置备用码' }}
            </Button>
          </div>
        </div>

        <div v-if="adminHelpStep === 'success'">
          <p class="text-sm text-primary font-medium mb-3">备用验证码已重置！请妥善保存以下备用码：</p>
          <div class="grid grid-cols-2 gap-2 mb-4">
            <Badge v-for="(code, i) in newBackupCodes" :key="i" variant="secondary" class="justify-center font-record py-1">
              {{ code }}
            </Badge>
          </div>
          <p class="text-sm text-muted-foreground mb-3">您可以使用新的备用码完成登录验证</p>
          <Button @click="useNewBackupCode" class="w-full">
            返回登录验证
          </Button>
        </div>
      </CardFooter>
    </Card>

    <AlertDialog :open="backupCodesExhausted">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>备用码已用完</AlertDialogTitle>
          <AlertDialogDescription>所有备用码已用完，请立即重新生成备用码，否则丢失 2FA 设备后将无法恢复账户访问。</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction @click="backupCodesWarning = ''">我知道了</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import api from '@/lib/axios';
import type { TwoFactorMethod } from '@dmhub/shared';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import BrandMark from '@/components/BrandMark.vue';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogAction } from '@/components/ui/alert-dialog';
import { Loader2, ArrowLeft } from 'lucide-vue-next';

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();

type TabKey = 'totp' | 'backup' | 'passkey' | 'email';

const activeTab = ref<TabKey>('totp');
const totpCode = ref('');
const backupCode = ref('');
const loading = ref(false);
const error = ref('');
const backupCodesWarning = ref('');
const backupCodesExhausted = computed(() => backupCodesWarning.value.includes('已用完'));

const passkeyLoading = ref(false);
const passkeyError = ref('');

const emailCodeSent = ref(false);
const emailCode = ref('');
const emailSending = ref(false);
const emailLoading = ref(false);
const emailError = ref('');
const emailSendError = ref('');
const emailCooldown = ref(0);
let cooldownTimer: ReturnType<typeof setInterval> | null = null;

const adminHelpStep = ref<'none' | 'select' | 'verify-email' | 'waiting' | 'success'>('none');
const adminList = ref<{ id: string; username: string; nickname: string | null }[]>([]);
const adminListLoading = ref(false);
const selectedAdminId = ref('');
const alternateEmail = ref('');
const adminHelpError = ref('');
const adminHelpLoading = ref(false);
const adminHelpRequestId = ref('');
const adminHelpEmailCode = ref('');
const adminResetCode = ref('');
const newBackupCodes = ref<string[]>([]);

const tempToken = (route.query.token as string) || '';

const availableTabs = ref<{ key: TabKey; label: string }[]>([
  { key: 'totp', label: 'TOTP' },
  { key: 'backup', label: '备用码' },
]);

onMounted(async () => {
  try {
    const { data } = await api.get('/2fa/methods', {
      headers: { Authorization: `Bearer ${tempToken}`, 'X-2FA-Auth': 'true' },
    });
    const methods: TwoFactorMethod[] = data.twoFactorMethods || [];
    const tabs: { key: TabKey; label: string }[] = [];
    if (methods.includes('totp')) tabs.push({ key: 'totp', label: 'TOTP' });
    if (methods.includes('passkey')) tabs.push({ key: 'passkey', label: '通行密钥' });
    if (methods.includes('email')) tabs.push({ key: 'email', label: '邮箱验证' });
    tabs.push({ key: 'backup', label: '备用码' });
    availableTabs.value = tabs;
    if (tabs.length > 0) activeTab.value = tabs[0].key;
  } catch {
    availableTabs.value = [
      { key: 'totp', label: 'TOTP' },
      { key: 'backup', label: '备用码' },
    ];
  }
});

onUnmounted(() => {
  if (cooldownTimer) clearInterval(cooldownTimer);
});

function formatBackupCode() {
  const raw = backupCode.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  if (raw.length > 4) {
    backupCode.value = raw.slice(0, 4) + '-' + raw.slice(4, 8);
  } else {
    backupCode.value = raw;
  }
}

async function handleVerify() {
  error.value = '';
  const code = activeTab.value === 'totp' ? totpCode.value : backupCode.value;
  if (!code) {
    error.value = '请输入验证码';
    return;
  }
  if (!tempToken) {
    error.value = '缺少验证令牌，请重新登录';
    return;
  }
  loading.value = true;
  try {
    const method = activeTab.value === 'totp' ? 'totp' as const : 'backup' as const;
    const result = await authStore.verify2FA(tempToken, method, code);
    if (result?.backupCodesWarning) {
      backupCodesWarning.value = result.backupCodesWarning;
    } else {
      router.push('/dashboard');
    }
  } catch (err: any) {
    error.value = err.response?.data?.error || '验证失败';
  } finally {
    loading.value = false;
  }
}

async function handlePasskeyVerify() {
  passkeyError.value = '';
  if (!tempToken) {
    passkeyError.value = '缺少验证令牌，请重新登录';
    return;
  }
  passkeyLoading.value = true;
  try {
    const result = await authStore.verify2FAPasskey(tempToken);
    if (result?.backupCodesWarning) {
      backupCodesWarning.value = result.backupCodesWarning;
    } else {
      router.push('/dashboard');
    }
  } catch (err: any) {
    passkeyError.value = err.response?.data?.error || err.message || '通行密钥验证失败';
  } finally {
    passkeyLoading.value = false;
  }
}

async function handleSendEmailCode() {
  emailSendError.value = '';
  if (!tempToken) {
    emailSendError.value = '缺少验证令牌，请重新登录';
    return;
  }
  emailSending.value = true;
  try {
    await api.post('/2fa/email/send', null, {
      headers: { Authorization: `Bearer ${tempToken}`, 'X-2FA-Auth': 'true' },
    });
    emailCodeSent.value = true;
    emailCooldown.value = 60;
    cooldownTimer = setInterval(() => {
      emailCooldown.value--;
      if (emailCooldown.value <= 0 && cooldownTimer) {
        clearInterval(cooldownTimer);
        cooldownTimer = null;
      }
    }, 1000);
  } catch (err: any) {
    emailSendError.value = err.response?.data?.error || '发送失败';
  } finally {
    emailSending.value = false;
  }
}

async function handleEmailVerify() {
  emailError.value = '';
  if (!tempToken) {
    emailError.value = '缺少验证令牌，请重新登录';
    return;
  }
  emailLoading.value = true;
  try {
    const result = await authStore.verify2FA(tempToken, 'email', emailCode.value);
    if (result?.backupCodesWarning) {
      backupCodesWarning.value = result.backupCodesWarning;
    } else {
      router.push('/dashboard');
    }
  } catch (err: any) {
    emailError.value = err.response?.data?.error || '验证失败';
  } finally {
    emailLoading.value = false;
  }
}

async function startAdminHelp() {
  adminHelpStep.value = 'select';
  adminHelpError.value = '';
  adminListLoading.value = true;
  try {
    const { data } = await api.get('/2fa/backup-codes/admin-reset/admins', {
      headers: { Authorization: `Bearer ${tempToken}`, 'X-2FA-Auth': 'true' },
    });
    adminList.value = data.admins;
  } catch (err: any) {
    adminHelpError.value = err.response?.data?.error || '获取管理员列表失败';
  } finally {
    adminListLoading.value = false;
  }
}

function cancelAdminHelp() {
  adminHelpStep.value = 'none';
  adminHelpError.value = '';
  selectedAdminId.value = '';
  alternateEmail.value = '';
  adminHelpEmailCode.value = '';
  adminResetCode.value = '';
}

async function handleAdminResetRequest() {
  adminHelpError.value = '';
  adminHelpLoading.value = true;
  try {
    const { data } = await api.post('/2fa/backup-codes/admin-reset/request', {
      adminId: selectedAdminId.value,
      alternateEmail: alternateEmail.value,
    }, {
      headers: { Authorization: `Bearer ${tempToken}`, 'X-2FA-Auth': 'true' },
    });
    adminHelpRequestId.value = data.requestId;
    adminHelpStep.value = 'verify-email';
  } catch (err: any) {
    adminHelpError.value = err.response?.data?.error || '请求失败';
  } finally {
    adminHelpLoading.value = false;
  }
}

async function handleAdminResetVerifyEmail() {
  adminHelpError.value = '';
  adminHelpLoading.value = true;
  try {
    await api.post('/2fa/backup-codes/admin-reset/verify-email', {
      requestId: adminHelpRequestId.value,
      code: adminHelpEmailCode.value,
    }, {
      headers: { Authorization: `Bearer ${tempToken}`, 'X-2FA-Auth': 'true' },
    });
    adminHelpStep.value = 'waiting';
  } catch (err: any) {
    adminHelpError.value = err.response?.data?.error || '验证失败';
  } finally {
    adminHelpLoading.value = false;
  }
}

async function handleAdminResetApply() {
  adminHelpError.value = '';
  adminHelpLoading.value = true;
  try {
    const { data } = await api.post('/2fa/backup-codes/admin-reset/apply', {
      resetCode: adminResetCode.value,
    }, {
      headers: { Authorization: `Bearer ${tempToken}`, 'X-2FA-Auth': 'true' },
    });
    newBackupCodes.value = data.backupCodes;
    adminHelpStep.value = 'success';
  } catch (err: any) {
    adminHelpError.value = err.response?.data?.error || '重置失败';
  } finally {
    adminHelpLoading.value = false;
  }
}

function useNewBackupCode() {
  adminHelpStep.value = 'none';
  activeTab.value = 'backup';
}
</script>
