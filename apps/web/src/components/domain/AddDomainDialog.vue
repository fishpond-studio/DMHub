<template>
  <Dialog :open="true" @update:open="(v) => { if (!v) $emit('close') }">
    <DialogContent class="max-w-lg max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>添加域名</DialogTitle>
      </DialogHeader>

      <div class="space-y-4">
        <div>
          <Label class="mb-1">域名 <span class="text-destructive">*</span></Label>
          <Input
            v-model="form.name"
            type="text"
            placeholder="例: example.com"
          />
        </div>

        <div>
          <Label class="mb-1">DNS 服务商</Label>
          <Select v-model="form.providerConfigId">
            <SelectTrigger>
              <SelectValue placeholder="不关联服务商" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">不关联服务商</SelectItem>
              <SelectItem v-for="p in providers" :key="p.id" :value="p.id">{{ p.name }} ({{ p.providerId }})</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label class="mb-1 flex items-center gap-2">
            到期时间
            <Button
              v-if="form.name.trim()"
              variant="link"
              size="sm"
              class="h-auto p-0 text-xs"
              :disabled="fetchingExpiry"
              @click="fetchExpiry"
            >
              {{ fetchingExpiry ? '查询中...' : 'WHOIS 自动获取' }}
            </Button>
          </Label>
          <Input
            v-model="form.expiresAt"
            type="date"
          />
        </div>

        <div>
          <Label class="mb-1">标签</Label>
          <Input
            v-model="tagsInput"
            type="text"
            placeholder="多个标签用逗号分隔"
          />
        </div>

        <div>
          <Label class="mb-1">分组</Label>
          <Input
            v-model="form.groupName"
            type="text"
            placeholder="例: 生产环境, 测试环境"
          />
        </div>

        <div class="flex items-center gap-2">
          <Checkbox v-model:checked="form.autoSync" id="autoSync" />
          <Label for="autoSync">关联服务商后自动同步记录</Label>
        </div>
      </div>

      <DialogFooter>
        <Button @click="$emit('close')" variant="outline">取消</Button>
        <Button @click="handleSave" :disabled="saving">
          {{ saving ? '添加中...' : '添加域名' }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { useDomainStore } from '@/stores/domain';
import { useProviderStore, type ProviderConfig } from '@/stores/provider';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import api from '@/lib/axios';

const emit = defineEmits<{
  close: [];
  created: [];
}>();

const domainStore = useDomainStore();
const providerStore = useProviderStore();
const providers = ref<ProviderConfig[]>([]);
const saving = ref(false);
const fetchingExpiry = ref(false);
const tagsInput = ref('');

const form = reactive({
  name: '',
  providerConfigId: 'none',
  expiresAt: '',
  groupName: '',
  autoSync: false,
});

onMounted(async () => {
  await providerStore.fetchProviders();
  providers.value = providerStore.providers;
});

async function fetchExpiry() {
  const name = form.name.trim();
  if (!name) return;

  fetchingExpiry.value = true;
  try {
    const { data } = await api.post('/domains/check-expiry-preview', { domain: name });
    if (data.expiresAt) {
      form.expiresAt = new Date(data.expiresAt).toISOString().split('T')[0];
    } else {
      alert('无法查询到该域名的到期时间');
    }
  } catch (err: any) {
    alert(err.response?.data?.error || 'WHOIS 查询失败');
  } finally {
    fetchingExpiry.value = false;
  }
}

async function handleSave() {
  if (!form.name.trim()) {
    alert('请输入域名');
    return;
  }

  saving.value = true;
  try {
    const tags = tagsInput.value
      ? tagsInput.value.split(',').map((t) => t.trim()).filter(Boolean)
      : undefined;

    const result = await domainStore.createDomain({
      name: form.name.trim(),
      providerConfigId: form.providerConfigId === 'none' ? undefined : form.providerConfigId || undefined,
      expiresAt: form.expiresAt || undefined,
      tags,
      groupName: form.groupName.trim() || undefined,
    });

    if (form.autoSync && form.providerConfigId && result.id) {
      try {
        await domainStore.syncRecords(result.id);
      } catch {
      }
    }

    emit('created');
  } catch (err: any) {
    alert(err.response?.data?.error || '添加失败');
  } finally {
    saving.value = false;
  }
}
</script>
