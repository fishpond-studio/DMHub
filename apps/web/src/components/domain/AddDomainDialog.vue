<template>
  <Dialog :open="true" @update:open="(v) => { if (!v) $emit('close') }">
    <DialogContent class="max-w-lg max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{{ $t('添加域名') }}</DialogTitle>
      </DialogHeader>

      <div class="space-y-4">
        <div>
          <Label class="mb-1">{{ $t('域名') }} <span class="text-destructive">*</span></Label>
          <Input
            v-model="form.name"
            type="text"
            :placeholder="$t('例: example․com')"
          />
        </div>

        <div>
          <Label class="mb-1">{{ $t('DNS 服务商') }}</Label>
          <Select v-model="form.providerConfigId">
            <SelectTrigger>
              <SelectValue :placeholder="$t('不关联服务商')" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{{ $t('不关联服务商') }}</SelectItem>
              <SelectItem v-for="p in providers" :key="p.id" :value="p.id">{{ p.name }} ({{ p.providerId }})</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label class="mb-1 flex items-center gap-2">
            {{ $t('到期时间') }}
            <Button
              v-if="form.name.trim()"
              variant="link"
              size="sm"
              class="h-auto p-0 text-xs"
              :disabled="fetchingExpiry"
              @click="fetchExpiry"
            >
              {{ fetchingExpiry ? $t('查询中․․․') : $t('WHOIS 自动获取') }}
            </Button>
          </Label>
          <Input
            v-model="form.expiresAt"
            type="date"
          />
        </div>

        <div>
          <Label class="mb-1">{{ $t('标签') }}</Label>
          <Input
            v-model="tagsInput"
            type="text"
            :placeholder="$t('多个标签用逗号分隔')"
          />
        </div>

        <div>
          <Label class="mb-1">{{ $t('分组') }}</Label>
          <Input
            v-model="form.groupName"
            type="text"
            :placeholder="$t('例: 生产环境, 测试环境')"
          />
        </div>

        <div class="flex items-center gap-2">
          <Checkbox v-model:checked="form.autoSync" id="autoSync" />
          <Label for="autoSync">{{ $t('关联服务商后自动同步记录') }}</Label>
        </div>
      </div>

      <DialogFooter>
        <Button @click="$emit('close')" variant="outline">{{ $t('取消') }}</Button>
        <Button @click="handleSave" :disabled="saving">
          {{ saving ? $t('添加中․․․') : $t('添加域名') }}
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

import { useI18n } from 'vue-i18n';
const { t } = useI18n();

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
      alert(t('无法查询到该域名的到期时间'));
    }
  } catch (err: any) {
    alert(err.response?.data?.error || t('WHOIS 查询失败'));
  } finally {
    fetchingExpiry.value = false;
  }
}

async function handleSave() {
  if (!form.name.trim()) {
    alert(t('请输入域名'));
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
    alert(err.response?.data?.error || t('添加失败'));
  } finally {
    saving.value = false;
  }
}
</script>
