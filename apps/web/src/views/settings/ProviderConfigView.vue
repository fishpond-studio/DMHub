<template>
  <div>
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-2xl font-bold text-foreground">DNS 服务商配置</h1>
      <Button @click="openAddForm">
        <Plus class="h-4 w-4 mr-1" />
        添加服务商
      </Button>
    </div>

      <div v-if="store.loading" class="text-center py-12 text-muted-foreground">加载中...</div>

      <div v-else-if="store.providers.length === 0 && !showForm" class="text-center py-16">
        <Server class="mx-auto h-12 w-12 text-muted-foreground" />
        <p class="mt-4 text-muted-foreground">尚未配置任何 DNS 服务商</p>
        <Button class="mt-4" @click="openAddForm">添加第一个服务商</Button>
      </div>

      <div v-else class="space-y-6">
        <Card v-for="provider in store.providers" :key="provider.id">
          <CardContent class="p-5">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div class="flex items-center gap-2">
                  <Badge v-if="provider.providerId === 'cloudflare'" variant="default" class="bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30 hover:bg-orange-500/15">Cloudflare</Badge>
                  <Badge v-else-if="provider.providerId === 'aliyun'" variant="default" class="bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30 hover:bg-blue-500/15">Aliyun</Badge>
                  <Badge v-else-if="provider.providerId === 'tencent'" variant="default" class="bg-green-500/15 text-green-700 dark:text-green-300 border-green-500/30 hover:bg-green-500/15">Tencent</Badge>
                  <h3 class="text-base font-semibold text-foreground">{{ provider.name }}</h3>
                  <Badge v-if="!provider.enabled" variant="secondary">已禁用</Badge>
                </div>
                <p class="mt-1 text-xs text-muted-foreground tnum">
                  创建于 {{ formatDate(provider.createdAt) }}
                </p>
              </div>
              <div class="flex items-center gap-2 flex-wrap">
                <Button variant="outline" size="sm" @click="handleTest(provider.id)" :disabled="testingId === provider.id">
                  {{ testingId === provider.id ? '测试中...' : '测试' }}
                </Button>
                <Button size="sm" class="bg-primary hover:bg-primary/90" @click="handleSync(provider.id)" :disabled="syncingId === provider.id">
                  {{ syncingId === provider.id ? '同步中...' : '同步' }}
                </Button>
                <Button variant="outline" size="sm" @click="openEditForm(provider)">编辑</Button>
                <Button variant="outline" size="sm" class="text-destructive hover:text-destructive hover:bg-destructive/10" @click="handleDelete(provider)">删除</Button>
              </div>
            </div>

            <div v-if="testResult && testResult.id === provider.id" class="mt-3">
              <div v-if="testResult.success" class="rounded-md bg-primary/10 p-3 text-sm text-primary">连接成功</div>
              <div v-else class="rounded-md bg-destructive/10 p-3 text-sm text-destructive">连接失败: {{ testResult.error }}</div>
            </div>

            <div v-if="syncResult && syncResult.id === provider.id" class="mt-3">
              <div class="rounded-md bg-primary/10 p-3 text-sm text-primary tnum">
                同步完成: {{ syncResult.result.syncedDomains }} 个域名, {{ syncResult.result.syncedRecords }} 条记录
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog :open="showForm" @update:open="showForm = $event">
        <DialogContent class="max-w-lg">
          <DialogHeader>
            <DialogTitle>{{ editingId ? '编辑服务商' : '添加服务商' }}</DialogTitle>
          </DialogHeader>
          <div class="space-y-5 max-h-[60vh] overflow-y-auto pr-2">
            <div>
              <Label class="mb-1 block">服务商类型</Label>
              <Select v-model="form.providerId" :disabled="!!editingId">
                <SelectTrigger :disabled="!!editingId">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cloudflare">Cloudflare</SelectItem>
                  <SelectItem value="aliyun">Aliyun（阿里云）</SelectItem>
                  <SelectItem value="tencent">Tencent（腾讯云）</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label class="mb-1 block">配置名称</Label>
              <Input v-model="form.name" type="text" placeholder="例: 我的 Cloudflare 账号" />
            </div>

            <template v-if="form.providerId === 'cloudflare'">
              <CloudflareSetupGuide />
              <div>
                <Label class="mb-1 block">API Token</Label>
                <Input v-model="form.credentials.token" type="password" placeholder="输入 Cloudflare API Token" />
              </div>
            </template>

            <template v-if="form.providerId === 'aliyun'">
              <div>
                <Label class="mb-1 block">AccessKey ID</Label>
                <Input v-model="form.credentials.accessKeyId" type="password" placeholder="输入阿里云 AccessKey ID" />
              </div>
              <div>
                <Label class="mb-1 block">AccessKey Secret</Label>
                <Input v-model="form.credentials.accessKeySecret" type="password" placeholder="输入阿里云 AccessKey Secret" />
              </div>
            </template>

            <template v-if="form.providerId === 'tencent'">
              <div>
                <Label class="mb-1 block">SecretId</Label>
                <Input v-model="form.credentials.secretId" type="password" placeholder="输入腾讯云 SecretId" />
              </div>
              <div>
                <Label class="mb-1 block">SecretKey</Label>
                <Input v-model="form.credentials.secretKey" type="password" placeholder="输入腾讯云 SecretKey" />
              </div>
            </template>
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
            <AlertDialogTitle>确认删除服务商配置</AlertDialogTitle>
            <AlertDialogDescription>{{ confirmDelete.message }}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel @click="cancelDelete">取消</AlertDialogCancel>
            <AlertDialogAction @click="proceedDelete">确认删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, reactive } from 'vue';
import { useProviderStore, type ProviderConfig } from '@/stores/provider';
import { Plus, Server } from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import CloudflareSetupGuide from '@/components/provider/CloudflareSetupGuide.vue';

const store = useProviderStore();
const showForm = ref(false);
const editingId = ref<string | null>(null);
const saving = ref(false);
const testingId = ref<string | null>(null);
const syncingId = ref<string | null>(null);

const testResult = ref<{ id: string; success: boolean; error?: string } | null>(null);
const syncResult = ref<{ id: string; result: { syncedDomains: number; syncedRecords: number } } | null>(null);

const confirmDelete = reactive({
  open: false,
  message: '',
  id: '',
  domainCount: 0,
});

const form = reactive({
  name: '',
  providerId: 'cloudflare',
  credentials: {
    token: '',
    accessKeyId: '',
    accessKeySecret: '',
    secretId: '',
    secretKey: '',
  },
});

onMounted(() => {
  store.fetchProviders();
});

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('zh-CN');
}

function openAddForm() {
  editingId.value = null;
  form.name = '';
  form.providerId = 'cloudflare';
  form.credentials.token = '';
  form.credentials.accessKeyId = '';
  form.credentials.accessKeySecret = '';
  form.credentials.secretId = '';
  form.credentials.secretKey = '';
  testResult.value = null;
  syncResult.value = null;
  showForm.value = true;
}

function openEditForm(provider: ProviderConfig) {
  editingId.value = provider.id;
  form.name = provider.name;
  form.providerId = provider.providerId;
  form.credentials.token = '';
  form.credentials.accessKeyId = '';
  form.credentials.accessKeySecret = '';
  form.credentials.secretId = '';
  form.credentials.secretKey = '';
  testResult.value = null;
  syncResult.value = null;
  showForm.value = true;
}

async function handleSave() {
  if (!form.name.trim()) {
    alert('请输入配置名称');
    return;
  }

  let credentials: Record<string, string> = {};
  if (form.providerId === 'cloudflare') {
    if (!form.credentials.token && !editingId.value) {
      alert('请输入 API Token');
      return;
    }
    if (form.credentials.token) credentials = { token: form.credentials.token };
  } else if (form.providerId === 'aliyun') {
    if (!editingId.value && (!form.credentials.accessKeyId || !form.credentials.accessKeySecret)) {
      alert('请输入 AccessKey ID 和 AccessKey Secret');
      return;
    }
    if (form.credentials.accessKeyId) credentials.accessKeyId = form.credentials.accessKeyId;
    if (form.credentials.accessKeySecret) credentials.accessKeySecret = form.credentials.accessKeySecret;
  } else if (form.providerId === 'tencent') {
    if (!editingId.value && (!form.credentials.secretId || !form.credentials.secretKey)) {
      alert('请输入 SecretId 和 SecretKey');
      return;
    }
    if (form.credentials.secretId) credentials.secretId = form.credentials.secretId;
    if (form.credentials.secretKey) credentials.secretKey = form.credentials.secretKey;
  }

  saving.value = true;
  try {
    if (editingId.value) {
      const updateInput: { name?: string; credentials?: Record<string, string> } = {};
      if (form.name) updateInput.name = form.name;
      if (Object.keys(credentials).length > 0) updateInput.credentials = credentials;
      await store.updateProvider(editingId.value, updateInput);
    } else {
      await store.createProvider({
        name: form.name,
        providerId: form.providerId,
        credentials,
      });
    }
    showForm.value = false;
  } catch (err: any) {
    alert(err.response?.data?.error || '保存失败');
  } finally {
    saving.value = false;
  }
}

async function handleTest(id: string) {
  testingId.value = id;
  testResult.value = null;
  try {
    const result = await store.testConnection(id);
    testResult.value = { id, ...result };
  } catch (err: any) {
    testResult.value = { id, success: false, error: err.response?.data?.error || '测试失败' };
  } finally {
    testingId.value = null;
  }
}

async function handleSync(id: string) {
  syncingId.value = id;
  syncResult.value = null;
  try {
    const result = await store.syncDomains(id);
    syncResult.value = { id, result };
  } catch (err: any) {
    alert(err.response?.data?.error || '同步失败');
  } finally {
    syncingId.value = null;
  }
}

async function handleDelete(provider: ProviderConfig) {
  try {
    const result = await store.deleteProvider(provider.id, false);
    if (result.requiresConfirmation) {
      confirmDelete.open = true;
      confirmDelete.message = result.warning ?? '确定要删除该服务商配置吗？';
      confirmDelete.id = provider.id;
      confirmDelete.domainCount = result.domainCount ?? 0;
    }
  } catch (err: any) {
    alert(err.response?.data?.error || '删除失败');
  }
}

async function proceedDelete() {
  try {
    await store.deleteProvider(confirmDelete.id, true);
  } catch (err: any) {
    alert(err.response?.data?.error || '删除失败');
  } finally {
    confirmDelete.open = false;
  }
}

function cancelDelete() {
  confirmDelete.open = false;
}
</script>
