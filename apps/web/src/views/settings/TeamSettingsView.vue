<template>
  <div>
    <h1 class="text-2xl font-bold text-foreground mb-6">团队设置</h1>

      <div v-if="loading" class="text-center py-12 text-muted-foreground">加载中...</div>

      <div v-else class="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>基本信息</CardTitle>
          </CardHeader>
          <CardContent class="space-y-5">
            <div>
              <Label class="mb-1 block">团队 Logo</Label>
              <div
                class="relative w-24 h-24 border-2 border-dashed border-input rounded-lg flex items-center justify-center cursor-pointer hover:border-blue-400 transition-colors"
                @click="fileInput?.click()"
                @dragover.prevent="isDragging = true"
                @dragleave="isDragging = false"
                @drop.prevent="handleDrop"
                :class="{ 'border-blue-400 bg-blue-500/10': isDragging }"
              >
                <img v-if="form.logoUrl" :src="form.logoUrl" class="w-full h-full object-cover rounded-lg" alt="Logo" />
                <Upload v-else class="h-8 w-8 text-muted-foreground" />
              </div>
              <input ref="fileInput" type="file" accept=".png,.jpg,.jpeg,.svg" class="hidden" @change="handleFileChange" />
              <p class="text-xs text-muted-foreground mt-1">支持 PNG、JPG、SVG，最大 1MB，推荐 128×128px</p>
            </div>

            <div>
              <Label class="mb-1 block">团队名称</Label>
              <Input v-model="form.name" type="text" placeholder="输入团队名称" />
            </div>

            <div>
              <Label class="mb-1 block">团队描述</Label>
              <Textarea v-model="form.description" rows="3" placeholder="输入团队描述" />
            </div>

            <div>
              <Label class="mb-1 block">站点 URL</Label>
              <Input v-model="form.siteUrl" type="url" placeholder="https://example.com" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>SMTP 邮件配置</CardTitle>
          </CardHeader>
          <CardContent class="space-y-5">
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label class="mb-1 block">SMTP 主机</Label>
                <Input v-model="form.smtpHost" type="text" placeholder="smtp.example.com" />
              </div>
              <div>
                <Label class="mb-1 block">端口</Label>
                <Input :model-value="form.smtpPort ?? ''" @update:model-value="form.smtpPort = $event ? Number($event) : null" type="number" placeholder="587" />
              </div>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label class="mb-1 block">用户名</Label>
                <Input v-model="form.smtpUser" type="text" placeholder="user@example.com" />
              </div>
              <div>
                <Label class="mb-1 block">密码</Label>
                <Input v-model="form.smtpPassword" type="password" placeholder="留空则不修改" />
              </div>
            </div>

            <div>
              <Label class="mb-1 block">发件人地址</Label>
              <Input v-model="form.smtpFrom" type="text" placeholder="noreply@example.com" />
            </div>

            <div class="flex items-center space-x-2">
              <Checkbox id="smtpSecure" :checked="form.smtpSecure" @update:checked="form.smtpSecure = $event" />
              <Label for="smtpSecure">使用 SSL/TLS</Label>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>注册与邀请</CardTitle>
            <CardDescription>控制新用户注册方式</CardDescription>
          </CardHeader>
          <CardContent class="space-y-5">
            <div class="flex items-center justify-between">
              <div>
                <Label>允许注册</Label>
                <p class="text-xs text-muted-foreground mt-0.5">关闭后新用户无法注册账号</p>
              </div>
              <Switch :checked="form.registrationEnabled" @update:checked="form.registrationEnabled = $event" />
            </div>
            <div class="flex items-center justify-between">
              <div>
                <Label>邀请码注册</Label>
                <p class="text-xs text-muted-foreground mt-0.5">开启后，新用户注册时需要输入邀请码</p>
              </div>
              <Switch :checked="form.inviteCodeEnabled" @update:checked="form.inviteCodeEnabled = $event" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>审计与日志</CardTitle>
            <CardDescription>操作日志保留策略与缓存配置</CardDescription>
          </CardHeader>
          <CardContent class="space-y-5">
            <div>
              <Label class="mb-1 block">日志保留天数</Label>
              <Input
                :model-value="form.logRetentionDays ?? ''"
                @update:model-value="form.logRetentionDays = $event ? Number($event) : null"
                type="number"
                placeholder="0 或留空表示永久保留"
              />
              <p class="text-xs text-muted-foreground mt-1">超过该天数的操作日志与监控历史将被定时清理（每天 03:00 执行）</p>
            </div>
            <div>
              <Label class="mb-1 block">Redis 连接地址</Label>
              <Input v-model="form.redisUrl" type="text" placeholder="redis://localhost:6379" />
              <p class="text-xs text-muted-foreground mt-1">留空使用进程内存缓存；配置后需重启服务生效，用于验证码、限流等共享状态</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>站外公告</CardTitle>
            <CardDescription>在登录页面向未登录用户展示公告</CardDescription>
          </CardHeader>
          <CardContent class="space-y-5">
            <div>
              <Label class="mb-1 block">公告内容</Label>
              <Textarea v-model="form.announcement" rows="4" placeholder="输入公告内容..." />
              <p class="text-xs text-muted-foreground mt-1">留空则不显示公告</p>
            </div>
            <div>
              <Label class="mb-1 block">公告格式</Label>
              <div class="flex items-center gap-4">
                <label class="flex items-center gap-1.5 text-sm cursor-pointer">
                  <input type="radio" v-model="form.announcementFormat" value="markdown" class="accent-primary" />
                  Markdown
                </label>
                <label class="flex items-center gap-1.5 text-sm cursor-pointer">
                  <input type="radio" v-model="form.announcementFormat" value="html" class="accent-primary" />
                  HTML
                </label>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>主页设置</CardTitle>
            <CardDescription>配置站外主页 (/landing) 的显示内容</CardDescription>
          </CardHeader>
          <CardContent class="space-y-5">
            <div>
              <Label class="mb-1 block">副标题</Label>
              <Input v-model="form.landingSubtitle" placeholder="域名协作管理工具" />
            </div>

            <div>
              <Label class="mb-1 block">背景图片</Label>
              <div
                class="relative w-full h-32 border-2 border-dashed border-input rounded-lg flex items-center justify-center cursor-pointer hover:border-blue-400 transition-colors overflow-hidden"
                @click="bgFileInput?.click()"
                :class="{ 'border-blue-400 bg-blue-500/10': isBgDragging }"
                @dragover.prevent="isBgDragging = true"
                @dragleave="isBgDragging = false"
                @drop.prevent="handleBgDrop"
              >
                <img v-if="form.landingBackgroundUrl" :src="form.landingBackgroundUrl" class="w-full h-full object-cover" alt="Background" />
                <div v-else class="flex flex-col items-center text-muted-foreground">
                  <ImageIcon class="h-8 w-8 mb-1" />
                  <span class="text-xs">点击或拖拽上传</span>
                </div>
              </div>
              <input ref="bgFileInput" type="file" accept=".png,.jpg,.jpeg,.webp,.gif" class="hidden" @change="handleBgFileChange" />
              <p class="text-xs text-muted-foreground mt-1">支持 PNG、JPG、WEBP、GIF，最大 5MB</p>
            </div>

            <div>
              <Label class="mb-1 block">底栏内容</Label>
              <Textarea v-model="form.footerContent" rows="4" placeholder="输入底栏内容..." />
              <p class="text-xs text-muted-foreground mt-1">支持 HTML 和 Markdown 代码，用于自定义底栏显示内容</p>
            </div>
            <div>
              <Label class="mb-1 block">底栏格式</Label>
              <div class="flex items-center gap-4">
                <label class="flex items-center gap-1.5 text-sm cursor-pointer">
                  <input type="radio" v-model="form.footerFormat" value="markdown" class="accent-primary" />
                  Markdown
                </label>
                <label class="flex items-center gap-1.5 text-sm cursor-pointer">
                  <input type="radio" v-model="form.footerFormat" value="html" class="accent-primary" />
                  HTML
                </label>
              </div>
            </div>
          </CardContent>
        </Card>

        <div v-if="warnings.length > 0" class="rounded-lg border border-warning/25 bg-warning/15 p-4">
          <ul class="text-sm text-warning list-disc list-inside">
            <li v-for="(w, i) in warnings" :key="i">{{ w }}</li>
          </ul>
        </div>

        <div class="flex justify-end">
          <Button @click="handleSave" :disabled="saving">
            {{ saving ? '保存中...' : '保存设置' }}
          </Button>
        </div>
      </div>

      <AlertDialog :open="confirmSiteUrl">
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认修改站点 URL</AlertDialogTitle>
            <AlertDialogDescription>站点 URL 变更会影响 OAuth 回调地址和 Cookie 域名设置，确定继续吗？</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel @click="cancelSave">取消</AlertDialogCancel>
            <AlertDialogAction @click="proceedSave">确认修改</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog :open="confirmSmtp">
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认修改 SMTP 配置</AlertDialogTitle>
            <AlertDialogDescription>SMTP 配置变更后建议重新验证邮件发送是否正常，确定继续吗？</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel @click="cancelSave">取消</AlertDialogCancel>
            <AlertDialogAction @click="proceedSave">确认修改</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, reactive } from 'vue';
import { useTeamStore } from '@/stores/team';
import api from '@/lib/axios';
import { Upload, ImageIcon } from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

const store = useTeamStore();
const loading = ref(true);
const saving = ref(false);
const isDragging = ref(false);
const isBgDragging = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);
const bgFileInput = ref<HTMLInputElement | null>(null);
const warnings = ref<string[]>([]);
const confirmSiteUrl = ref(false);
const confirmSmtp = ref(false);
const oldSiteUrl = ref<string | null>(null);
const oldSmtpHost = ref<string | null>(null);
const oldSmtpPort = ref<number | null>(null);
const oldSmtpUser = ref<string | null>(null);
const oldSmtpFrom = ref<string | null>(null);
const oldSmtpSecure = ref<boolean | null>(null);

const form = reactive({
  name: '',
  description: '',
  logoUrl: '' as string | null,
  siteUrl: '',
  smtpHost: '',
  smtpPort: null as number | null,
  smtpUser: '',
  smtpPassword: '',
  smtpFrom: '',
  smtpSecure: false,
  inviteCodeEnabled: true,
  registrationEnabled: true,
  announcement: '',
  announcementFormat: 'markdown',
  landingSubtitle: '',
  landingBackgroundUrl: '' as string | null,
  footerContent: '',
  footerFormat: 'markdown',
  logRetentionDays: null as number | null,
  redisUrl: '',
});

onMounted(async () => {
  await store.fetchSettings();
  if (store.settings) {
    form.name = store.settings.name ?? '';
    form.description = store.settings.description ?? '';
    form.logoUrl = store.settings.logoUrl;
    form.siteUrl = store.settings.siteUrl ?? '';
    form.smtpHost = store.settings.smtpHost ?? '';
    form.smtpPort = store.settings.smtpPort;
    form.smtpUser = store.settings.smtpUser ?? '';
    form.smtpFrom = store.settings.smtpFrom ?? '';
    form.smtpSecure = store.settings.smtpSecure ?? false;
    form.inviteCodeEnabled = store.settings.inviteCodeEnabled ?? true;
    form.registrationEnabled = (store.settings as any).registrationEnabled ?? true;
    form.announcement = store.settings.announcement ?? '';
    form.announcementFormat = store.settings.announcementFormat ?? 'markdown';
    form.landingSubtitle = store.settings.landingSubtitle ?? '';
    form.landingBackgroundUrl = store.settings.landingBackgroundUrl ?? null;
    form.footerContent = store.settings.footerContent ?? '';
    form.footerFormat = store.settings.footerFormat ?? 'markdown';
    form.logRetentionDays = (store.settings as any).logRetentionDays ?? null;
    form.redisUrl = (store.settings as any).redisUrl ?? '';
    oldSiteUrl.value = store.settings.siteUrl ?? '';
    oldSmtpHost.value = store.settings.smtpHost ?? '';
    oldSmtpPort.value = store.settings.smtpPort ?? null;
    oldSmtpUser.value = store.settings.smtpUser ?? '';
    oldSmtpFrom.value = store.settings.smtpFrom ?? '';
    oldSmtpSecure.value = store.settings.smtpSecure ?? false;
  }
  loading.value = false;
});

async function handleFileChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (file) await uploadLogo(file);
}

async function handleDrop(e: DragEvent) {
  isDragging.value = false;
  const file = e.dataTransfer?.files[0];
  if (file) await uploadLogo(file);
}

async function uploadLogo(file: File) {
  try {
    await store.uploadLogo(file);
    form.logoUrl = store.settings?.logoUrl ?? null;
  } catch (err: any) {
    alert(err.response?.data?.error || '上传失败');
  }
}

async function handleBgFileChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (file) await uploadBackground(file);
}

async function handleBgDrop(e: DragEvent) {
  isBgDragging.value = false;
  const file = e.dataTransfer?.files[0];
  if (file) await uploadBackground(file);
}

async function uploadBackground(file: File) {
  try {
    const formData = new FormData();
    formData.append('file', file);
    const { data } = await api.post('/team/background', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    form.landingBackgroundUrl = data.landingBackgroundUrl;
  } catch (err: any) {
    alert(err.response?.data?.error || '上传背景失败');
  }
}

function handleSave() {
  const siteUrlChanged = form.siteUrl !== oldSiteUrl.value;
  const smtpChanged = form.smtpHost !== oldSmtpHost.value
    || form.smtpPort !== oldSmtpPort.value
    || form.smtpUser !== oldSmtpUser.value
    || form.smtpPassword !== ''
    || form.smtpFrom !== oldSmtpFrom.value
    || form.smtpSecure !== oldSmtpSecure.value;

  if (siteUrlChanged) {
    confirmSiteUrl.value = true;
    return;
  }
  if (smtpChanged) {
    confirmSmtp.value = true;
    return;
  }
  doSave();
}

function proceedSave() {
  confirmSiteUrl.value = false;
  confirmSmtp.value = false;
  doSave();
}

function cancelSave() {
  confirmSiteUrl.value = false;
  confirmSmtp.value = false;
}

async function doSave() {
  saving.value = true;
  try {
    const result = await store.updateSettings({
      name: form.name || undefined,
      description: form.description || undefined,
      siteUrl: form.siteUrl || undefined,
      smtpHost: form.smtpHost || undefined,
      smtpPort: form.smtpPort ?? undefined,
      smtpUser: form.smtpUser || undefined,
      smtpPassword: form.smtpPassword || undefined,
      smtpFrom: form.smtpFrom || undefined,
      smtpSecure: form.smtpSecure,
      inviteCodeEnabled: form.inviteCodeEnabled,
      registrationEnabled: form.registrationEnabled,
      announcement: form.announcement,
      announcementFormat: form.announcementFormat,
      landingSubtitle: form.landingSubtitle,
      footerContent: form.footerContent,
      footerFormat: form.footerFormat,
      logRetentionDays: form.logRetentionDays,
      redisUrl: form.redisUrl || null,
    });
    warnings.value = result.warnings;
    oldSiteUrl.value = form.siteUrl;
    oldSmtpHost.value = form.smtpHost;
    oldSmtpPort.value = form.smtpPort;
    oldSmtpUser.value = form.smtpUser;
    oldSmtpFrom.value = form.smtpFrom;
    oldSmtpSecure.value = form.smtpSecure;
    form.smtpPassword = '';
  } catch (err: any) {
    alert(err.response?.data?.error || '保存失败');
  } finally {
    saving.value = false;
  }
}
</script>
