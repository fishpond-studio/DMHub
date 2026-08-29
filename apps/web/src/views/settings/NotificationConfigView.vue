<template>
  <div>
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-2xl font-bold text-foreground">通知配置</h1>
      <Button @click="openAddForm">
        <Plus class="h-4 w-4 mr-1" />
        添加通知
      </Button>
    </div>

      <div v-if="store.configs.length === 0 && !showForm" class="text-center py-16">
        <Bell class="mx-auto h-12 w-12 text-muted-foreground" />
        <p class="mt-4 text-muted-foreground">尚未配置任何通知渠道</p>
        <Button class="mt-4" @click="openAddForm">添加第一个通知配置</Button>
      </div>

      <div v-else class="space-y-4">
        <Card v-for="cfg in store.configs" :key="cfg.id">
          <CardContent class="p-5">
            <div class="flex items-center justify-between">
              <div>
                <div class="flex items-center gap-2">
                  <Badge :class="channelBadgeClass(cfg.channel)">{{ channelLabel(cfg.channel) }}</Badge>
                  <h3 class="text-base font-semibold text-foreground">{{ cfg.name }}</h3>
                  <Badge v-if="!cfg.enabled" variant="secondary">已禁用</Badge>
                </div>
                <div class="mt-1 flex flex-wrap gap-1">
                  <Badge v-for="evt in cfg.events" :key="evt" variant="outline">{{ eventLabel(evt) }}</Badge>
                </div>
              </div>
              <div class="flex items-center gap-2">
                <Switch :checked="cfg.enabled" @update:checked="toggleEnabled(cfg)" />
                <Button variant="outline" size="sm" @click="openEditForm(cfg)">编辑</Button>
                <Button variant="outline" size="sm" class="text-destructive hover:text-destructive hover:bg-destructive/10" @click="handleDelete(cfg)">删除</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog :open="showForm" @update:open="showForm = $event">
        <DialogContent class="max-w-lg">
          <DialogHeader>
            <DialogTitle>{{ editingId ? '编辑通知配置' : '添加通知配置' }}</DialogTitle>
          </DialogHeader>
          <div class="space-y-5 max-h-[60vh] overflow-y-auto pr-2">
            <div>
              <Label class="mb-1 block">通知渠道</Label>
              <Select v-model="form.channel">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="web">站内通知</SelectItem>
                  <SelectItem value="email">邮件</SelectItem>
                  <SelectItem value="dingtalk">钉钉</SelectItem>
                  <SelectItem value="feishu">飞书</SelectItem>
                  <SelectItem value="webhook">Webhook</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label class="mb-1 block">配置名称</Label>
              <Input v-model="form.name" type="text" placeholder="例: 运维通知群" />
            </div>

            <div v-if="form.channel === 'email'">
              <Label class="mb-1 block">收件人列表</Label>
              <Textarea v-model="emailRecipients" rows="3" placeholder="每行一个邮箱地址" />
            </div>

            <div v-if="form.channel === 'dingtalk' || form.channel === 'feishu' || form.channel === 'webhook'">
              <Label class="mb-1 block">Webhook URL</Label>
              <Input v-model="webhookUrl" type="url" placeholder="https://..." />
            </div>

            <div v-if="form.channel === 'dingtalk' || form.channel === 'feishu'">
              <Label class="mb-1 block">签名密钥（可选）</Label>
              <Input v-model="dingtalkFeishuSecret" type="text" placeholder="用于生成签名验证请求来源" />
            </div>

            <div v-if="form.channel === 'webhook'">
              <Label class="mb-1 block">Secret（可选）</Label>
              <Input v-model="webhookSecret" type="text" placeholder="用于签名 Webhook 请求" />
            </div>

            <div>
              <Label class="mb-2 block">监听事件</Label>
              <div class="space-y-2 max-h-48 overflow-y-auto">
                <div
                  v-for="evt in allEvents"
                  :key="evt.value"
                  class="flex items-center space-x-2"
                >
                  <Checkbox
                    :checked="form.events.includes(evt.value)"
                    @update:checked="toggleEvent(evt.value, $event)"
                  />
                  <Label class="cursor-pointer" @click="toggleEvent(evt.value, !form.events.includes(evt.value))">{{ evt.label }}</Label>
                </div>
              </div>
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
            <AlertDialogTitle>{{ confirmDelete.action === 'delete' ? '确认删除通知配置' : '确认禁用通知配置' }}</AlertDialogTitle>
            <AlertDialogDescription>{{ confirmDelete.message }}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel @click="confirmDelete.open = false">取消</AlertDialogCancel>
            <AlertDialogAction @click="proceedDelete">确认</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog :open="confirmSave.open">
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认修改通知配置</AlertDialogTitle>
            <AlertDialogDescription>修改后相关事件的推送渠道将变更，确认修改？</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel @click="confirmSave.open = false">取消</AlertDialogCancel>
            <AlertDialogAction @click="confirmSave.open = false; doSave()">确认</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { NOTIFICATION_EVENTS } from '@dmhub/shared';
import { useNotificationStore, type NotificationConfig } from '@/stores/notification';
import { Plus, Bell } from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

const store = useNotificationStore();
const showForm = ref(false);
const editingId = ref<string | null>(null);
const saving = ref(false);

const form = reactive({
  channel: 'web' as string,
  name: '',
  events: [] as string[],
});

const emailRecipients = ref('');
const webhookUrl = ref('');
const webhookSecret = ref('');
const dingtalkFeishuSecret = ref('');

const confirmDelete = reactive({
  open: false,
  message: '',
  id: '',
  action: 'delete' as 'delete' | 'disable',
});

const confirmSave = reactive({
  open: false,
});

const allEvents = NOTIFICATION_EVENTS.map((e) => ({ value: e.event, label: e.label }));

function channelLabel(channel: string) {
  const map: Record<string, string> = {
    web: '站内通知',
    email: '邮件',
    dingtalk: '钉钉',
    feishu: '飞书',
    webhook: 'Webhook',
  };
  return map[channel] ?? channel;
}

function channelBadgeClass(channel: string) {
  const map: Record<string, string> = {
    web: 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30 hover:bg-blue-500/15',
    email: 'bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30 hover:bg-purple-500/15',
    dingtalk: 'bg-cyan-100 text-cyan-800 border-cyan-200 hover:bg-cyan-100',
    feishu: 'bg-indigo-100 text-indigo-800 border-indigo-200 hover:bg-indigo-100',
    webhook: 'bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30 hover:bg-orange-500/15',
  };
  return map[channel] ?? 'bg-muted text-foreground';
}

function eventLabel(evt: string) {
  const found = allEvents.find((e) => e.value === evt);
  return found?.label ?? evt;
}

function toggleEvent(value: string, checked: boolean) {
  if (checked) {
    if (!form.events.includes(value)) form.events.push(value);
  } else {
    form.events = form.events.filter((e) => e !== value);
  }
}

function openAddForm() {
  editingId.value = null;
  form.channel = 'web';
  form.name = '';
  form.events = [];
  emailRecipients.value = '';
  webhookUrl.value = '';
  webhookSecret.value = '';
  dingtalkFeishuSecret.value = '';
  showForm.value = true;
}

function openEditForm(cfg: NotificationConfig) {
  editingId.value = cfg.id;
  form.channel = cfg.channel;
  form.name = cfg.name;
  form.events = [...cfg.events];
  emailRecipients.value = ((cfg.config.recipients as string[]) ?? []).join('\n');
  webhookUrl.value = (cfg.config.webhookUrl as string) ?? '';
  webhookSecret.value = (cfg.config.secret as string) ?? '';
  dingtalkFeishuSecret.value = (cfg.config.secret as string) ?? '';
  showForm.value = true;
}

function buildChannelConfig(): Record<string, unknown> {
  switch (form.channel) {
    case 'email':
      return {
        recipients: emailRecipients.value.split('\n').map((s) => s.trim()).filter(Boolean),
      };
    case 'dingtalk':
    case 'feishu':
      return { webhookUrl: webhookUrl.value, secret: dingtalkFeishuSecret.value || undefined };
    case 'webhook':
      return { webhookUrl: webhookUrl.value, secret: webhookSecret.value || undefined };
    default:
      return {};
  }
}

async function handleSave() {
  if (!form.name.trim()) {
    alert('请输入配置名称');
    return;
  }
  if (form.events.length === 0) {
    alert('请选择至少一个事件');
    return;
  }

  if (editingId.value) {
    confirmSave.open = true;
    return;
  }

  await doSave();
}

async function doSave() {
  saving.value = true;
  try {
    const input = {
      channel: form.channel,
      name: form.name,
      config: buildChannelConfig(),
      events: form.events,
      enabled: true,
    };

    if (editingId.value) {
      await store.updateConfig(editingId.value, input);
    } else {
      await store.createConfig(input);
    }
    showForm.value = false;
  } catch (err: any) {
    alert(err.response?.data?.error || '保存失败');
  } finally {
    saving.value = false;
  }
}

async function toggleEnabled(cfg: NotificationConfig) {
  const newState = !cfg.enabled;
  if (!newState) {
    confirmDelete.open = true;
    confirmDelete.message = `确定要禁用通知配置「${cfg.name}」吗？禁用后将不再收到对应事件的通知`;
    confirmDelete.id = cfg.id;
    confirmDelete.action = 'disable';
    return;
  }
  try {
    await store.updateConfig(cfg.id, {
      channel: cfg.channel,
      name: cfg.name,
      config: cfg.config,
      events: cfg.events,
      enabled: true,
    });
  } catch (err: any) {
    alert(err.response?.data?.error || '操作失败');
  }
}

function handleDelete(cfg: NotificationConfig) {
  confirmDelete.open = true;
  confirmDelete.message = `确定要删除通知配置「${cfg.name}」吗？删除后相关事件的推送渠道将变更`;
  confirmDelete.id = cfg.id;
  confirmDelete.action = 'delete';
}

async function proceedDelete() {
  try {
    if (confirmDelete.action === 'disable') {
      const cfg = store.configs.find(c => c.id === confirmDelete.id);
      if (cfg) {
        await store.updateConfig(cfg.id, {
          channel: cfg.channel,
          name: cfg.name,
          config: cfg.config,
          events: cfg.events,
          enabled: false,
        });
      }
    } else {
      await store.deleteConfig(confirmDelete.id);
    }
  } catch (err: any) {
    alert(err.response?.data?.error || '操作失败');
  } finally {
    confirmDelete.open = false;
  }
}

onMounted(() => {
  store.fetchConfigs();
});
</script>
