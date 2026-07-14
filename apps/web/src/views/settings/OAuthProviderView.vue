<template>
  <div>
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-2xl font-bold text-foreground">OAuth 提供商配置</h1>
      <Button @click="openAddForm">
        <Plus class="h-4 w-4 mr-1" />
        添加提供商
      </Button>
    </div>

      <div v-if="loading" class="text-center py-12 text-muted-foreground">加载中...</div>

      <div v-else-if="providers.length === 0 && !showForm" class="text-center py-16">
        <Lock class="mx-auto h-12 w-12 text-muted-foreground" />
        <p class="mt-4 text-muted-foreground">尚未配置任何 OAuth 提供商</p>
        <Button class="mt-4" @click="openAddForm">添加第一个提供商</Button>
      </div>

      <div v-else class="space-y-6">
        <Card v-for="provider in providers" :key="provider.id">
          <CardContent class="p-5">
            <div class="flex items-center justify-between">
              <div>
                <div class="flex items-center gap-2">
                  <Badge :class="providerBadgeClass(provider.providerId)">{{ providerDisplayName(provider.providerId) }}</Badge>
                  <Badge v-if="!provider.enabled" variant="destructive">已禁用</Badge>
                </div>
                <p class="mt-1 text-xs text-muted-foreground">
                  Client ID: {{ provider.clientIdMasked }} | 创建于 {{ formatDate(provider.createdAt) }}
                </p>
              </div>
              <div class="flex items-center gap-2">
                <Button variant="outline" size="sm" @click="openEditForm(provider)">编辑</Button>
                <Button variant="outline" size="sm" class="text-destructive hover:text-destructive hover:bg-destructive/10" @click="handleDelete(provider)">删除</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog :open="showForm" @update:open="showForm = $event">
        <DialogContent class="max-w-lg">
          <DialogHeader>
            <DialogTitle>{{ editingId ? '编辑 OAuth 提供商' : '添加 OAuth 提供商' }}</DialogTitle>
          </DialogHeader>
          <div class="space-y-5 max-h-[60vh] overflow-y-auto pr-2">
            <div>
              <Label class="mb-1 block">提供商类型</Label>
              <Select v-model="form.providerId" :disabled="!!editingId">
                <SelectTrigger :disabled="!!editingId">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="avail in availableProviders" :key="avail.id" :value="avail.id">
                    {{ avail.name }} ({{ avail.type.toUpperCase() }})
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label class="mb-1 block">Client ID</Label>
              <Input v-model="form.clientId" type="text" placeholder="输入 OAuth Client ID" />
            </div>

            <div>
              <Label class="mb-1 block">Client Secret</Label>
              <Input v-model="form.clientSecret" type="password" :placeholder="editingId ? '留空则不修改' : '输入 OAuth Client Secret'" />
            </div>

            <div>
              <Label class="mb-1 block">Scope（可选）</Label>
              <Input v-model="form.scope" type="text" :placeholder="'默认: ' + providerDefaultScope(form.providerId)" />
            </div>

            <div v-if="form.providerId" class="rounded-md bg-blue-500/10 p-3 text-xs text-blue-600 dark:text-blue-400">
              {{ providerHelpText(form.providerId) }}
            </div>

            <div v-if="form.providerId === 'gitlab'">
              <Label class="mb-1 block">自定义 GitLab 实例 URL（可选）</Label>
              <Input v-model="form.customAuthorizeUrl" type="text" placeholder="https://gitlab.example.com/oauth/authorize" />
              <p class="mt-1 text-xs text-muted-foreground">自建 GitLab 实例需同时设置自定义 Token URL 和 User Info URL</p>
            </div>

            <template v-if="form.providerId === 'custom'">
              <div>
                <Label class="mb-1 block">Authorize URL <span class="text-destructive">*</span></Label>
                <Input v-model="form.customAuthorizeUrl" type="text" placeholder="https://your-idp.com/authorize" />
              </div>

              <div>
                <Label class="mb-1 block">Token URL</Label>
                <Input v-model="form.customTokenUrl" type="text" placeholder="留空则通过 /.well-known/openid-configuration 自动发现" />
              </div>

              <div>
                <Label class="mb-1 block">User Info URL</Label>
                <Input v-model="form.customUserInfoUrl" type="text" placeholder="留空则通过 /.well-known/openid-configuration 自动发现" />
              </div>
            </template>

            <template v-if="form.providerId !== 'gitlab' && form.providerId !== 'custom'">
              <div>
                <Label class="mb-1 block">自定义 Authorize URL（可选）</Label>
                <Input v-model="form.customAuthorizeUrl" type="text" placeholder="留空使用默认" />
              </div>

              <div>
                <Label class="mb-1 block">自定义 Token URL（可选）</Label>
                <Input v-model="form.customTokenUrl" type="text" placeholder="留空使用默认" />
              </div>

              <div>
                <Label class="mb-1 block">自定义 User Info URL（可选）</Label>
                <Input v-model="form.customUserInfoUrl" type="text" placeholder="留空使用默认" />
              </div>
            </template>

            <div v-if="editingId" class="flex items-center space-x-2">
              <Checkbox id="oauth-enabled" :checked="form.enabled" @update:checked="form.enabled = $event" />
              <Label for="oauth-enabled">启用</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" @click="showForm = false">取消</Button>
            <Button @click="handleSave" :disabled="saving">
              {{ saving ? '保存中...' : '保存' }}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog :open="confirmDelete.open">
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除 OAuth 提供商</AlertDialogTitle>
            <AlertDialogDescription>{{ confirmDelete.message }}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel @click="confirmDelete.open = false">取消</AlertDialogCancel>
            <AlertDialogAction @click="proceedDelete">确认删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, reactive } from 'vue';
import api from '@/lib/axios';
import { Plus, Lock } from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

interface OAuthProviderConfig {
  id: string;
  providerId: string;
  enabled: boolean;
  clientIdMasked: string;
  scope: string | null;
  customAuthorizeUrl: string | null;
  customTokenUrl: string | null;
  customUserInfoUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

interface AvailableProvider {
  id: string;
  name: string;
  type: string;
}

const providers = ref<OAuthProviderConfig[]>([]);
const availableProviders = ref<AvailableProvider[]>([]);
const loading = ref(false);
const showForm = ref(false);
const editingId = ref<string | null>(null);
const saving = ref(false);

const confirmDelete = reactive({
  open: false,
  message: '',
  id: '',
});

const form = reactive({
  providerId: 'github',
  clientId: '',
  clientSecret: '',
  scope: '',
  customAuthorizeUrl: '',
  customTokenUrl: '',
  customUserInfoUrl: '',
  enabled: true,
});

onMounted(() => {
  fetchProviders();
});

async function fetchProviders() {
  loading.value = true;
  try {
    const { data } = await api.get('/oauth/providers');
    providers.value = data.providers;
    availableProviders.value = data.availableProviders || [];
    if (availableProviders.value.length > 0 && !form.providerId) {
      form.providerId = availableProviders.value[0].id;
    }
  } finally {
    loading.value = false;
  }
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('zh-CN');
}

const providerDisplayNames: Record<string, string> = {
  github: 'GitHub',
  gitlab: 'GitLab',
  google: 'Google',
  dingtalk: 'DingTalk',
  feishu: 'Feishu',
  custom: 'Custom OIDC',
};

const providerBadgeClasses: Record<string, string> = {
  github: 'bg-muted text-foreground border-border hover:bg-muted',
  gitlab: 'bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30 hover:bg-orange-500/15',
  google: 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30 hover:bg-blue-500/15',
  dingtalk: 'bg-sky-100 text-sky-800 border-sky-200 hover:bg-sky-100',
  feishu: 'bg-indigo-100 text-indigo-800 border-indigo-200 hover:bg-indigo-100',
  custom: 'bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30 hover:bg-purple-500/15',
};

const providerHelpTexts: Record<string, string> = {
  github: 'GitHub OAuth 应用。默认 Scope: user:email。如需访问私有仓库，可添加 repo 权限。',
  gitlab: 'GitLab OAuth 应用。默认 Scope: read_user。自建 GitLab 实例需填写自定义 URL。',
  google: 'Google OIDC 应用。默认 Scope: openid email profile。需在 Google Cloud Console 创建 OAuth 2.0 凭据。',
  dingtalk: '钉钉 OAuth2 应用。默认 Scope: openid。需在钉钉开放平台创建应用并获取 AppKey 和 AppSecret。',
  feishu: '飞书 OAuth2 应用。默认 Scope: openid。需在飞书开放平台创建应用并获取 App ID 和 App Secret。',
  custom: '自定义 OIDC 提供商。需填写 Authorize URL，Token URL 和 User Info URL 可通过 OpenID Discovery 自动获取。',
};

function providerDisplayName(id: string): string {
  return providerDisplayNames[id] || id;
}

function providerBadgeClass(id: string): string {
  return providerBadgeClasses[id] || 'bg-muted text-foreground';
}

function providerHelpText(id: string): string {
  return providerHelpTexts[id] || `OAuth 提供商: ${id}`;
}

const providerDefaultScopes: Record<string, string> = {
  github: 'user:email',
  gitlab: 'read_user',
  google: 'openid email profile',
  dingtalk: 'openid',
  feishu: 'openid',
  custom: 'openid email profile',
};

function providerDefaultScope(id: string): string {
  return providerDefaultScopes[id] || 'openid email profile';
}

function openAddForm() {
  editingId.value = null;
  form.providerId = availableProviders.value[0]?.id || 'github';
  form.clientId = '';
  form.clientSecret = '';
  form.scope = '';
  form.customAuthorizeUrl = '';
  form.customTokenUrl = '';
  form.customUserInfoUrl = '';
  form.enabled = true;
  showForm.value = true;
}

function openEditForm(provider: OAuthProviderConfig) {
  editingId.value = provider.id;
  form.providerId = provider.providerId;
  form.clientId = '';
  form.clientSecret = '';
  form.scope = provider.scope || '';
  form.customAuthorizeUrl = provider.customAuthorizeUrl || '';
  form.customTokenUrl = provider.customTokenUrl || '';
  form.customUserInfoUrl = provider.customUserInfoUrl || '';
  form.enabled = provider.enabled;
  showForm.value = true;
}

async function handleSave() {
  if (!form.clientId && !editingId.value) {
    alert('请输入 Client ID');
    return;
  }
  if (!form.clientSecret && !editingId.value) {
    alert('请输入 Client Secret');
    return;
  }

  saving.value = true;
  try {
    if (editingId.value) {
      const updateInput: Record<string, any> = {};
      if (form.clientId) updateInput.clientId = form.clientId;
      if (form.clientSecret) updateInput.clientSecret = form.clientSecret;
      if (form.scope !== undefined) updateInput.scope = form.scope;
      if (form.customAuthorizeUrl !== undefined) updateInput.customAuthorizeUrl = form.customAuthorizeUrl;
      if (form.customTokenUrl !== undefined) updateInput.customTokenUrl = form.customTokenUrl;
      if (form.customUserInfoUrl !== undefined) updateInput.customUserInfoUrl = form.customUserInfoUrl;
      updateInput.enabled = form.enabled;
      await api.put(`/oauth/providers/${editingId.value}`, updateInput);
    } else {
      await api.post('/oauth/providers', {
        providerId: form.providerId,
        clientId: form.clientId,
        clientSecret: form.clientSecret,
        scope: form.scope || undefined,
        customAuthorizeUrl: form.customAuthorizeUrl || undefined,
        customTokenUrl: form.customTokenUrl || undefined,
        customUserInfoUrl: form.customUserInfoUrl || undefined,
      });
    }
    showForm.value = false;
    await fetchProviders();
  } catch (err: any) {
    alert(err.response?.data?.error || '保存失败');
  } finally {
    saving.value = false;
  }
}

async function handleDelete(provider: OAuthProviderConfig) {
  try {
    const { data } = await api.delete(`/oauth/providers/${provider.id}`);
    if (data.requiresConfirmation) {
      confirmDelete.open = true;
      confirmDelete.message = data.warning || '确定要删除该 OAuth 提供商吗？';
      confirmDelete.id = provider.id;
      return;
    }
    await fetchProviders();
  } catch (err: any) {
    alert(err.response?.data?.error || '删除失败');
  }
}

async function proceedDelete() {
  try {
    await api.delete(`/oauth/providers/${confirmDelete.id}`, {
      headers: { 'x-confirm-delete': 'true' },
    });
    await fetchProviders();
  } catch (err: any) {
    alert(err.response?.data?.error || '删除失败');
  } finally {
    confirmDelete.open = false;
  }
}
</script>
