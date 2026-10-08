<template>
  <div>
    <h1 class="text-2xl font-bold text-foreground mb-6">两步验证设置</h1>

      <div v-if="status === 'idle'" class="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>当前状态</CardTitle>
          </CardHeader>
          <CardContent>
            <p class="text-sm text-muted-foreground">
              两步验证：
              <Badge v-if="twoFactorEnabled" variant="default" class="bg-primary/15 text-primary border-primary/30 hover:bg-primary/15">已启用</Badge>
              <Badge v-else variant="secondary">未启用</Badge>
            </p>
            <div v-if="twoFactorEnabled && twoFactorMethods.length > 0" class="mt-2">
              <p class="text-sm text-muted-foreground">已启用的方式：</p>
              <div class="mt-1 flex gap-1">
                <Badge v-for="m in twoFactorMethods" :key="m" variant="outline">{{ methodLabel(m) }}</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card v-if="!twoFactorEnabled">
          <CardHeader>
            <CardTitle>设置 TOTP 验证器</CardTitle>
            <CardDescription>使用身份验证器应用（如 Google Authenticator、Microsoft Authenticator）扫描二维码完成设置。</CardDescription>
          </CardHeader>
          <CardContent>
            <Button @click="startSetup" :disabled="setupLoading">
              {{ setupLoading ? '生成中...' : '开始设置' }}
            </Button>
          </CardContent>
        </Card>

        <Tabs v-if="twoFactorEnabled" default-value="totp">
          <TabsList class="w-full">
            <TabsTrigger value="totp" class="flex-1">TOTP 验证器</TabsTrigger>
            <TabsTrigger value="passkey" class="flex-1">通行密钥</TabsTrigger>
            <TabsTrigger value="email" class="flex-1">邮箱验证</TabsTrigger>
          </TabsList>

          <TabsContent value="totp">
            <Card>
              <CardHeader>
                <CardTitle>TOTP 验证器</CardTitle>
                <CardDescription>TOTP 验证器已启用，您可以使用身份验证器应用生成登录验证码。</CardDescription>
              </CardHeader>
              <CardContent v-if="!twoFactorMethods.includes('totp')">
                <Button @click="startSetup" :disabled="setupLoading">
                  {{ setupLoading ? '生成中...' : '设置 TOTP' }}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="passkey">
            <Card>
              <CardHeader>
                <CardTitle>通行密钥</CardTitle>
                <CardDescription>注册通行密钥可使用指纹、面部识别或设备 PIN 快速完成两步验证。</CardDescription>
              </CardHeader>
              <CardContent class="space-y-4">
                <div v-if="passkeys.length > 0" class="space-y-2">
                  <div v-for="pk in passkeys" :key="pk.id" class="flex items-center justify-between rounded-md border px-3 py-2">
                    <div>
                      <p class="text-sm font-medium text-foreground">{{ pk.deviceName || '未命名设备' }}</p>
                      <p class="text-xs text-muted-foreground tnum">{{ formatTime(pk.lastUsedAt || pk.createdAt) }}</p>
                    </div>
                    <Button variant="ghost" size="sm" class="text-destructive hover:text-destructive" @click="handleDeletePasskey(pk.id)">删除</Button>
                  </div>
                </div>

                <Button @click="handleRegisterPasskey" :disabled="passkeyLoading">
                  {{ passkeyLoading ? '注册中...' : '注册通行密钥' }}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="email">
            <Card>
              <CardHeader>
                <CardTitle>邮箱验证码</CardTitle>
                <CardDescription>登录时发送6位验证码到您的邮箱。</CardDescription>
              </CardHeader>
              <CardContent>
                <div v-if="!userEmail || !userEmailVerified" class="text-sm text-warning">
                  {{ !userEmail ? '请先设置邮箱' : '请先验证邮箱' }}
                </div>
                <template v-else>
                  <div v-if="!email2FAEnabled" class="space-y-3">
                    <div v-if="!emailSetupSent" class="flex space-x-3">
                      <Button @click="handleEmailSetupSend" :disabled="emailSetupSending">
                        {{ emailSetupSending ? '发送中...' : '启用邮箱验证' }}
                      </Button>
                    </div>
                    <div v-else class="space-y-3">
                      <p class="text-sm text-primary">验证码已发送到 {{ userEmail }}</p>
                      <div class="flex space-x-3">
                        <Input
                          v-model="emailSetupCode"
                          type="text"
                          maxlength="6"
                          inputmode="numeric"
                          class="flex-1 text-center text-lg tracking-widest"
                          placeholder="000000"
                        />
                        <Button @click="handleEmailSetupVerify" :disabled="emailSetupVerifying || emailSetupCode.length !== 6">
                          {{ emailSetupVerifying ? '验证中...' : '验证' }}
                        </Button>
                      </div>
                      <p v-if="emailSetupError" class="text-sm text-destructive">{{ emailSetupError }}</p>
                    </div>
                  </div>
                  <p v-else class="text-sm text-primary font-medium">邮箱验证已启用</p>
                </template>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <template v-if="!twoFactorEnabled">
          <Card>
            <CardHeader>
              <CardTitle>通行密钥</CardTitle>
              <CardDescription>注册通行密钥可使用指纹、面部识别或设备 PIN 快速完成两步验证。</CardDescription>
            </CardHeader>
            <CardContent class="space-y-4">
              <div v-if="passkeys.length > 0" class="space-y-2">
                <div v-for="pk in passkeys" :key="pk.id" class="flex items-center justify-between rounded-md border px-3 py-2">
                  <div>
                    <p class="text-sm font-medium text-foreground">{{ pk.deviceName || '未命名设备' }}</p>
                    <p class="text-xs text-muted-foreground tnum">{{ formatTime(pk.lastUsedAt || pk.createdAt) }}</p>
                  </div>
                  <Button variant="ghost" size="sm" class="text-destructive hover:text-destructive" @click="handleDeletePasskey(pk.id)">删除</Button>
                </div>
              </div>
              <Button @click="handleRegisterPasskey" :disabled="passkeyLoading">
                {{ passkeyLoading ? '注册中...' : '注册通行密钥' }}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>邮箱验证码</CardTitle>
              <CardDescription>登录时发送6位验证码到您的邮箱。</CardDescription>
            </CardHeader>
            <CardContent>
              <div v-if="!userEmail || !userEmailVerified" class="text-sm text-warning">
                {{ !userEmail ? '请先设置邮箱' : '请先验证邮箱' }}
              </div>
              <template v-else>
                <div v-if="!email2FAEnabled" class="space-y-3">
                  <div v-if="!emailSetupSent" class="flex space-x-3">
                    <Button @click="handleEmailSetupSend" :disabled="emailSetupSending">
                      {{ emailSetupSending ? '发送中...' : '启用邮箱验证' }}
                    </Button>
                  </div>
                  <div v-else class="space-y-3">
                    <p class="text-sm text-primary">验证码已发送到 {{ userEmail }}</p>
                    <div class="flex space-x-3">
                      <Input
                        v-model="emailSetupCode"
                        type="text"
                        maxlength="6"
                        inputmode="numeric"
                        class="flex-1 text-center text-lg tracking-widest"
                        placeholder="000000"
                      />
                      <Button @click="handleEmailSetupVerify" :disabled="emailSetupVerifying || emailSetupCode.length !== 6">
                        {{ emailSetupVerifying ? '验证中...' : '验证' }}
                      </Button>
                    </div>
                    <p v-if="emailSetupError" class="text-sm text-destructive">{{ emailSetupError }}</p>
                  </div>
                </div>
                <p v-else class="text-sm text-primary font-medium">邮箱验证已启用</p>
              </template>
            </CardContent>
          </Card>
        </template>

        <Card v-if="twoFactorEnabled">
          <CardHeader>
            <CardTitle>备用验证码</CardTitle>
            <CardDescription>备用验证码可在无法使用验证器时登录。</CardDescription>
          </CardHeader>
          <CardContent>
            <div class="flex space-x-3">
              <Button variant="outline" @click="confirmDownloadRegenerate = true">
                <Download class="h-4 w-4 mr-1" />
                重新生成并下载
              </Button>
              <Button variant="outline" class="text-destructive hover:text-destructive hover:bg-destructive/10" @click="confirmRegenerate = true">
                <RefreshCw class="h-4 w-4 mr-1" />
                重新生成
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <TotpSetup
        v-if="status === 'setup'"
        :otpauth-uri="otpauthUri!"
        :secret="totpSecret!"
        @verified="onTotpVerified"
        @cancel="status = 'idle'"
      />

      <BackupCodesDisplay
        v-if="status === 'codes'"
        :codes="backupCodes"
        @done="onCodesDone"
      />

      <AlertDialog :open="confirmRegenerate">
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认重新生成</AlertDialogTitle>
            <AlertDialogDescription>重新生成会使现有备用码全部失效，确定继续吗？</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel @click="confirmRegenerate = false">取消</AlertDialogCancel>
            <AlertDialogAction @click="handleRegenerate" :disabled="regenerateLoading">
              {{ regenerateLoading ? '生成中...' : '确认' }}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog :open="confirmDownloadRegenerate">
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>重新生成并下载</AlertDialogTitle>
            <AlertDialogDescription>下载会重新生成新的备用码，当前备用码将全部失效。确定继续吗？</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel @click="confirmDownloadRegenerate = false">取消</AlertDialogCancel>
            <AlertDialogAction @click="handleDownloadRegenerate" :disabled="regenerateLoading">
              {{ regenerateLoading ? '生成中...' : '确认下载' }}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog :open="!!confirmDeletePasskey">
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除通行密钥</AlertDialogTitle>
            <AlertDialogDescription>确定要删除此通行密钥吗？{{ isLastMethod ? '这是最后一个验证方式，删除后将禁用两步验证。' : '' }}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel @click="confirmDeletePasskey = null">取消</AlertDialogCancel>
            <AlertDialogAction @click="confirmDeletePasskeyAction" :disabled="deletePasskeyLoading">
              {{ deletePasskeyLoading ? '删除中...' : '确认删除' }}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import api from '@/lib/axios';
import TotpSetup from '@/components/twofa/TotpSetup.vue';
import BackupCodesDisplay from '@/components/twofa/BackupCodesDisplay.vue';
import { startRegistration } from '@simplewebauthn/browser';
import type { TwoFactorMethod } from '@dmhub/shared';
import { Download, RefreshCw } from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

const status = ref<'idle' | 'setup' | 'codes'>('idle');
const twoFactorEnabled = ref(false);
const twoFactorMethods = ref<TwoFactorMethod[]>([]);
const otpauthUri = ref<string | null>(null);
const totpSecret = ref<string | null>(null);
const backupCodes = ref<string[]>([]);
const setupLoading = ref(false);
const confirmRegenerate = ref(false);
const confirmDownloadRegenerate = ref(false);
const regenerateLoading = ref(false);

const passkeys = ref<{ id: string; deviceName: string | null; deviceType: string | null; createdAt: string; lastUsedAt: string | null }[]>([]);
const passkeyLoading = ref(false);
const confirmDeletePasskey = ref<string | null>(null);
const deletePasskeyLoading = ref(false);

const userEmail = ref<string | null>(null);
const userEmailVerified = ref(false);
const email2FAEnabled = ref(false);
const emailSetupSent = ref(false);
const emailSetupCode = ref('');
const emailSetupSending = ref(false);
const emailSetupVerifying = ref(false);
const emailSetupError = ref('');

const isLastMethod = computed(() => {
  return twoFactorMethods.value.length === 1 && twoFactorMethods.value[0] === 'passkey';
});

function methodLabel(m: TwoFactorMethod): string {
  const labels: Record<string, string> = { totp: 'TOTP 验证器', passkey: '通行密钥', email: '邮箱验证' };
  return labels[m] || m;
}

function formatTime(t: string | null): string {
  if (!t) return '';
  const d = new Date(t);
  return d.toLocaleString('zh-CN');
}

async function fetchStatus() {
  try {
    const { data } = await api.get('/auth/me');
    twoFactorEnabled.value = data.user.twoFactorEnabled ?? false;
    twoFactorMethods.value = data.user.twoFactorMethods ?? [];
    userEmail.value = data.user.email ?? null;
    userEmailVerified.value = data.user.emailVerified ?? false;
    email2FAEnabled.value = twoFactorMethods.value.includes('email');
  } catch {
    twoFactorEnabled.value = false;
    twoFactorMethods.value = [];
  }
}

async function fetchPasskeys() {
  try {
    const { data } = await api.get('/2fa/passkeys');
    passkeys.value = data.passkeys;
  } catch {
    passkeys.value = [];
  }
}

onMounted(() => {
  fetchStatus();
  fetchPasskeys();
});

async function startSetup() {
  setupLoading.value = true;
  try {
    const { data } = await api.post('/2fa/totp/setup');
    otpauthUri.value = data.otpauthUri;
    totpSecret.value = data.secret;
    status.value = 'setup';
  } catch (err: any) {
    alert(err.response?.data?.error || '设置失败');
  } finally {
    setupLoading.value = false;
  }
}

function onTotpVerified(codes: string[]) {
  backupCodes.value = codes;
  twoFactorEnabled.value = true;
  twoFactorMethods.value = ['totp'];
  email2FAEnabled.value = false;
  status.value = 'codes';
}

function onCodesDone() {
  status.value = 'idle';
  fetchStatus();
  fetchPasskeys();
}

async function downloadBackupCodes() {
  try {
    const { data } = await api.get('/2fa/backup-codes/download', { responseType: 'blob' });
    const url = URL.createObjectURL(data);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'backup_codes.zip';
    a.click();
    URL.revokeObjectURL(url);
  } catch (err: any) {
    alert(err.response?.data?.error || '下载失败');
  }
}

async function handleDownloadRegenerate() {
  regenerateLoading.value = true;
  try {
    confirmDownloadRegenerate.value = false;
    await downloadBackupCodes();
  } catch (err: any) {
    alert(err.response?.data?.error || '下载失败');
  } finally {
    regenerateLoading.value = false;
  }
}

async function handleRegenerate() {
  regenerateLoading.value = true;
  try {
    const { data } = await api.post('/2fa/backup-codes/regenerate');
    backupCodes.value = data.backupCodes;
    confirmRegenerate.value = false;
    status.value = 'codes';
  } catch (err: any) {
    alert(err.response?.data?.error || '重新生成失败');
  } finally {
    regenerateLoading.value = false;
  }
}

async function handleRegisterPasskey() {
  passkeyLoading.value = true;
  try {
    const { data: options } = await api.post('/2fa/passkey/register-options');
    const credential = await startRegistration({ optionsJSON: options });
    const defaultName = (navigator.platform || '我的设备').slice(0, 32);
    const deviceName = window.prompt('为此通行密钥起一个名字（便于在设备列表中识别）', defaultName) || defaultName;
    const { data: result } = await api.post('/2fa/passkey/register-verify', { response: credential, deviceName });
    if (result.backupCodes && result.backupCodes.length > 0) {
      backupCodes.value = result.backupCodes;
      status.value = 'codes';
    } else {
      await fetchStatus();
      await fetchPasskeys();
    }
  } catch (err: any) {
    if (err.name === 'NotAllowedError') {
      // user cancelled
    } else {
      alert(err.response?.data?.error || err.message || '注册通行密钥失败');
    }
  } finally {
    passkeyLoading.value = false;
  }
}

function handleDeletePasskey(id: string) {
  confirmDeletePasskey.value = id;
}

async function confirmDeletePasskeyAction() {
  if (!confirmDeletePasskey.value) return;
  deletePasskeyLoading.value = true;
  try {
    await api.delete(`/2fa/passkey/${confirmDeletePasskey.value}`);
    confirmDeletePasskey.value = null;
    await fetchStatus();
    await fetchPasskeys();
  } catch (err: any) {
    alert(err.response?.data?.error || '删除失败');
  } finally {
    deletePasskeyLoading.value = false;
  }
}

async function handleEmailSetupSend() {
  emailSetupSending.value = true;
  emailSetupError.value = '';
  try {
    await api.post('/2fa/email/send');
    emailSetupSent.value = true;
  } catch (err: any) {
    emailSetupError.value = err.response?.data?.error || '发送失败';
  } finally {
    emailSetupSending.value = false;
  }
}

async function handleEmailSetupVerify() {
  emailSetupVerifying.value = true;
  emailSetupError.value = '';
  try {
    const { data } = await api.post('/2fa/email/setup-verify', { code: emailSetupCode.value });
    if (data.backupCodes && data.backupCodes.length > 0) {
      backupCodes.value = data.backupCodes;
      status.value = 'codes';
    } else {
      await fetchStatus();
    }
    emailSetupSent.value = false;
    emailSetupCode.value = '';
  } catch (err: any) {
    emailSetupError.value = err.response?.data?.error || '验证失败';
  } finally {
    emailSetupVerifying.value = false;
  }
}
</script>
