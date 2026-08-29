<template>
  <Dialog :open="true" @update:open="(v) => { if (!v) $emit('close') }">
    <DialogContent class="max-w-lg max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{{ isEdit ? '编辑记录' : defaults ? '克隆记录' : '添加记录' }}</DialogTitle>
        <DialogDescription v-if="domainName">
          域名 {{ domainName }}
        </DialogDescription>
      </DialogHeader>

      <div
        v-if="allowedPatterns && allowedPatterns.length > 0"
        class="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs"
      >
        <p class="font-medium text-foreground">你只能操作以下范围内的主机记录：</p>
        <ul class="mt-1.5 space-y-1 text-muted-foreground">
          <li v-for="(p, i) in allowedPatterns" :key="i" class="font-mono">
            {{ formatHostPreview(domainName, p) }}
            <span class="ml-1 font-sans text-[11px] opacity-80">（{{ formatScopeLabel(p) }}）</span>
          </li>
        </ul>
      </div>

      <div class="space-y-4">
        <div>
          <Label class="mb-1">记录类型</Label>
          <Select v-model="form.recordType" :disabled="isEdit">
            <SelectTrigger :disabled="isEdit">
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
          <p v-if="hostPreview" class="mt-1 text-xs text-muted-foreground">
            完整主机：
            <span class="font-mono text-foreground">{{ hostPreview }}</span>
          </p>
          <p v-if="nameOutOfScope" class="mt-1 text-xs text-destructive">
            当前主机不在你的指派范围内，保存会被拒绝
          </p>
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

        <div v-if="showProxied" class="space-y-1.5 rounded-lg border border-orange-500/20 bg-orange-500/5 px-3 py-2">
          <div class="flex items-center gap-2">
            <Switch v-model:checked="form.proxied" id="proxied" />
            <Label for="proxied" class="font-medium">{{ cdnLabel }}</Label>
          </div>
          <p class="text-xs text-muted-foreground pl-0.5">{{ cdnDescription }}</p>
        </div>
        <p v-else-if="cdnUnsupportedHint" class="text-xs text-muted-foreground">
          {{ cdnUnsupportedHint }}
        </p>

        <div>
          <Label class="mb-1">备注（可选）</Label>
          <Input
            v-model="form.notes"
            type="text"
            maxlength="200"
            placeholder="例如：官网 CDN、邮件、验证记录…"
          />
        </div>
      </div>

      <DialogFooter>
        <Button @click="$emit('close')" variant="outline">取消</Button>
        <Button @click="handleSave" :disabled="saving || nameOutOfScope">
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { formatHostPreview, formatScopeLabel, normalizePattern } from '@/lib/subdomain-scope';
import { toastError } from '@/lib/toast-helpers';

const props = defineProps<{
  domainId: string;
  domainName?: string;
  record: DnsRecord | null;
  /** 克隆时预填（创建模式，不走 update） */
  defaults?: Partial<{
    recordType: string;
    name: string;
    value: string;
    ttl: number;
    priority?: number | null;
    proxied?: boolean;
    notes?: string | null;
  }> | null;
  /** 可写的子域名模式；为空表示管理员/无限制 */
  allowedPatterns?: string[];
  /** 服务商是否支持 DNS 层 CDN 代理 */
  cdnSupported?: boolean;
  cdnProxyTypes?: string[];
  cdnLabel?: string;
  cdnDescription?: string;
}>();

const emit = defineEmits<{
  close: [];
  saved: [];
}>();

const store = useDomainStore();
const saving = ref(false);
const recordTypes = DNS_RECORD_TYPES;

const seed = props.record ?? props.defaults ?? null;
const isEdit = computed(() => !!props.record);

const form = reactive({
  recordType: seed?.recordType ?? 'A',
  name: seed?.name ?? '',
  value: seed?.value ?? '',
  ttl: seed?.ttl ?? 3600,
  priority: seed?.priority ?? undefined as number | undefined,
  proxied: seed?.proxied ?? false,
  notes: seed?.notes ?? '',
});

const selectedTypeInfo = computed(() =>
  recordTypes.find((t) => t.type === form.recordType),
);
const selectedTypeDesc = computed(() => selectedTypeInfo.value?.description);
const selectedExample = computed(() => selectedTypeInfo.value?.example);

const showPriority = computed(() =>
  ['MX', 'SRV'].includes(form.recordType),
);

const proxyTypes = computed(() =>
  props.cdnProxyTypes?.length ? props.cdnProxyTypes : ['A', 'AAAA', 'CNAME'],
);

const cdnLabel = computed(() => props.cdnLabel || 'CDN 保护');
const cdnDescription = computed(
  () =>
    props.cdnDescription ||
    '开启后流量经服务商 CDN/反代，可隐藏源站 IP（仅部分服务商支持，如 Cloudflare）',
);

/** 仅当服务商支持且记录类型允许时显示 CDN 开关 */
const showProxied = computed(
  () =>
    props.cdnSupported === true &&
    proxyTypes.value.includes(form.recordType),
);

const cdnUnsupportedHint = computed(() => {
  if (props.cdnSupported === true) {
    if (!proxyTypes.value.includes(form.recordType)) {
      return `当前记录类型 ${form.recordType} 不支持 CDN 代理（支持：${proxyTypes.value.join(' / ')}）`;
    }
    return '';
  }
  if (props.cdnSupported === false) {
    return '当前域名接入商不支持在 DNS 记录上直接开启 CDN 保护（如阿里云/腾讯云请使用其 CDN 产品）';
  }
  return '';
});

const domainName = computed(() => props.domainName || '');

const hostPreview = computed(() => {
  if (!domainName.value) return '';
  const n = normalizePattern(form.name);
  if (n === '@' || n === '') return domainName.value;
  return `${n}.${domainName.value}`;
});

/** 与后端 matchesSubdomainPattern 对齐的前端校验 */
function matchesPattern(recordName: string, pattern: string): boolean {
  const name = normalizePattern(recordName);
  const pat = normalizePattern(pattern);
  const nameKey = name === '@' ? '' : name;
  const patKey = pat === '@' ? '' : pat;

  if (patKey === '*') return true;
  if (patKey === '') return nameKey === '';
  if (patKey.startsWith('*.')) {
    const suffix = patKey.slice(2);
    if (!suffix) return nameKey !== '';
    return nameKey.endsWith('.' + suffix);
  }
  return nameKey === patKey;
}

const nameOutOfScope = computed(() => {
  const patterns = props.allowedPatterns;
  if (!patterns || patterns.length === 0) return false;
  if (!form.name.trim() && form.name !== '@') {
    // 空主机按 @ 处理，允许用户输入空或 @
  }
  return !patterns.some((p) => matchesPattern(form.name, p));
});

async function handleSave() {
  const name = form.name.trim() === '' ? '@' : form.name.trim();
  if (!form.value.trim()) {
    toastError('请填写记录值');
    return;
  }
  if (nameOutOfScope.value) {
    toastError('主机不在指派范围内', '请按上方可管理范围填写主机记录');
    return;
  }

  saving.value = true;
  try {
    const notes = form.notes?.trim() || null;
    const proxied = showProxied.value ? form.proxied : false;
    if (isEdit.value && props.record) {
      await store.updateRecord(props.domainId, props.record.id, {
        recordType: form.recordType,
        name,
        value: form.value,
        ttl: form.ttl,
        priority: showPriority.value ? form.priority : undefined,
        proxied,
        notes,
      });
    } else {
      await store.createRecord(props.domainId, {
        recordType: form.recordType,
        name,
        value: form.value,
        ttl: form.ttl,
        priority: showPriority.value ? form.priority : undefined,
        proxied,
        notes,
      });
    }
    emit('saved');
  } catch (err: any) {
    toastError('保存失败', err.response?.data?.error || err.message);
  } finally {
    saving.value = false;
  }
}
</script>
