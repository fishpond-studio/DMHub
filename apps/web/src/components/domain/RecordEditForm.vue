<template>
  <Dialog :open="true" @update:open="(v) => { if (!v) $emit('close') }">
    <DialogContent class="max-w-lg max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{{ record ? '编辑记录' : '添加记录' }}</DialogTitle>
      </DialogHeader>

      <div class="space-y-4">
        <div>
          <Label class="mb-1">记录类型</Label>
          <Select v-model="form.recordType" :disabled="!!record">
            <SelectTrigger :disabled="!!record">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="t in recordTypes" :key="t.type" :value="t.type">{{ t.type }} - {{ t.description }}</SelectItem>
            </SelectContent>
          </Select>
          <p v-if="selectedTypeDesc" class="mt-1 text-xs text-muted-foreground">{{ selectedTypeDesc }}</p>
        </div>

        <div>
          <Label class="mb-1">主机记录</Label>
          <Input
            v-model="form.name"
            type="text"
            placeholder="例: www, @, subdomain"
          />
        </div>

        <div>
          <Label class="mb-1">记录值</Label>
          <Input
            v-model="form.value"
            type="text"
            :placeholder="selectedExample || '请输入记录值'"
          />
        </div>

        <div class="grid grid-cols-2 gap-4">
          <div>
            <Label class="mb-1">TTL</Label>
            <Select :model-value="String(form.ttl)" @update:model-value="(v: string) => form.ttl = Number(v)">
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="60">1 分钟</SelectItem>
                <SelectItem value="300">5 分钟</SelectItem>
                <SelectItem value="900">15 分钟</SelectItem>
                <SelectItem value="1800">30 分钟</SelectItem>
                <SelectItem value="3600">1 小时</SelectItem>
                <SelectItem value="21600">6 小时</SelectItem>
                <SelectItem value="43200">12 小时</SelectItem>
                <SelectItem value="86400">1 天</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div v-if="showPriority">
            <Label class="mb-1">优先级</Label>
            <Input
              v-model.number="form.priority"
              type="number"
              min="0"
              max="65535"
              placeholder="10"
            />
          </div>
        </div>

        <div v-if="showProxied" class="flex items-center gap-2">
          <Switch v-model:checked="form.proxied" id="proxied" />
          <Label for="proxied">启用代理 (CDN)</Label>
        </div>
      </div>

      <DialogFooter>
        <Button @click="$emit('close')" variant="outline">取消</Button>
        <Button @click="handleSave" :disabled="saving">
          {{ saving ? '保存中...' : '保存' }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, reactive, computed } from 'vue';
import { useDomainStore, type DnsRecord } from '@/stores/domain';
import { DNS_RECORD_TYPES } from '@dmhub/shared/constants';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';

const props = defineProps<{
  domainId: string;
  record: DnsRecord | null;
}>();

const emit = defineEmits<{
  close: [];
  saved: [];
}>();

const store = useDomainStore();
const saving = ref(false);
const recordTypes = DNS_RECORD_TYPES;

const form = reactive({
  recordType: props.record?.recordType ?? 'A',
  name: props.record?.name ?? '',
  value: props.record?.value ?? '',
  ttl: props.record?.ttl ?? 3600,
  priority: props.record?.priority ?? undefined as number | undefined,
  proxied: props.record?.proxied ?? false,
});

const selectedTypeInfo = computed(() =>
  recordTypes.find((t) => t.type === form.recordType),
);
const selectedTypeDesc = computed(() => selectedTypeInfo.value?.description);
const selectedExample = computed(() => selectedTypeInfo.value?.example);

const showPriority = computed(() =>
  ['MX', 'SRV'].includes(form.recordType),
);

const showProxied = computed(() =>
  ['A', 'AAAA', 'CNAME'].includes(form.recordType),
);

async function handleSave() {
  if (!form.name.trim() || !form.value.trim()) {
    alert('请填写主机记录和记录值');
    return;
  }

  saving.value = true;
  try {
    if (props.record) {
      await store.updateRecord(props.domainId, props.record.id, {
        recordType: form.recordType,
        name: form.name,
        value: form.value,
        ttl: form.ttl,
        priority: showPriority.value ? form.priority : undefined,
        proxied: showProxied.value ? form.proxied : undefined,
      });
    } else {
      await store.createRecord(props.domainId, {
        recordType: form.recordType,
        name: form.name,
        value: form.value,
        ttl: form.ttl,
        priority: showPriority.value ? form.priority : undefined,
        proxied: showProxied.value ? form.proxied : undefined,
      });
    }
    emit('saved');
  } catch (err: any) {
    alert(err.response?.data?.error || '保存失败');
  } finally {
    saving.value = false;
  }
}
</script>
