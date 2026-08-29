<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { DNS_TEMPLATES, type DnsTemplate, type DnsTemplateRecord } from '@dmhub/shared'
import { useDomainStore } from '@/stores/domain'
import { toastSuccess, toastError } from '@/lib/toast-helpers'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  Globe,
  Mail,
  Cloud,
  Code,
  Shield,
  LayoutTemplate,
  Loader2,
  ChevronLeft,
} from 'lucide-vue-next'

const props = defineProps<{
  domainId: string
  domainName: string
  open: boolean
}>()

const emit = defineEmits<{
  'update:open': [boolean]
  applied: []
}>()

const store = useDomainStore()
const step = ref<'pick' | 'edit'>('pick')
const selected = ref<DnsTemplate | null>(null)
const applying = ref(false)

interface EditableRecord extends DnsTemplateRecord {
  enabled: boolean
  value: string
}

const records = ref<EditableRecord[]>([])

const iconMap: Record<string, any> = {
  globe: Globe,
  mail: Mail,
  cloud: Cloud,
  code: Code,
  shield: Shield,
}

const templates = DNS_TEMPLATES

const enabledCount = computed(() => records.value.filter((r) => r.enabled && r.value.trim()).length)
const missingValues = computed(() =>
  records.value.some((r) => r.enabled && !r.value.trim()),
)

watch(
  () => props.open,
  (v) => {
    if (v) {
      step.value = 'pick'
      selected.value = null
      records.value = []
    }
  },
)

function pickTemplate(t: DnsTemplate) {
  selected.value = t
  records.value = t.records.map((r) => ({
    ...r,
    enabled: true,
    value: r.value || (r.recordType === 'CNAME' && r.name === 'www' ? props.domainName : r.value),
  }))
  step.value = 'edit'
}

function goBack() {
  step.value = 'pick'
  selected.value = null
}

function close() {
  emit('update:open', false)
}

async function apply() {
  if (!selected.value) return
  const payload = records.value
    .filter((r) => r.enabled && r.value.trim())
    .map((r) => ({
      recordType: r.recordType,
      name: r.name,
      value: r.value.trim(),
      ttl: r.ttl,
      priority: r.priority,
      proxied: r.proxied,
    }))

  if (payload.length === 0) {
    toastError('请至少启用一条有效记录')
    return
  }

  applying.value = true
  try {
    const result = await store.bulkCreateRecords(props.domainId, payload)
    const failed = result.total - result.succeeded
    if (failed > 0) {
      toastError(
        `已添加 ${result.succeeded} 条，失败 ${failed} 条`,
        result.results.find((r) => !r.success)?.error,
      )
    } else {
      toastSuccess(`已应用模板「${selected.value.name}」`, `成功创建 ${result.succeeded} 条记录`)
    }
    emit('applied')
    close()
  } catch (err: any) {
    toastError('应用模板失败', err.response?.data?.error || err.message)
  } finally {
    applying.value = false
  }
}
</script>

<template>
  <Dialog :open="open" @update:open="(v) => emit('update:open', v)">
    <DialogContent class="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2">
          <LayoutTemplate class="h-5 w-5 text-primary" />
          <span v-if="step === 'pick'">DNS 记录模板</span>
          <span v-else>{{ selected?.name }}</span>
        </DialogTitle>
        <DialogDescription>
          <template v-if="step === 'pick'">
            选择常见场景，一键批量添加解析记录到 {{ domainName }}
          </template>
          <template v-else>
            勾选需要的记录，按需修改记录值后应用
          </template>
        </DialogDescription>
      </DialogHeader>

      <div class="flex-1 overflow-y-auto min-h-0 py-2">
        <div v-if="step === 'pick'" class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            v-for="t in templates"
            :key="t.id"
            type="button"
            class="group rounded-xl border bg-card p-4 text-left transition-all hover:border-primary/50 hover:shadow-md hover:bg-accent/30"
            @click="pickTemplate(t)"
          >
            <div class="flex items-start gap-3">
              <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary transition-transform group-hover:scale-105">
                <component :is="iconMap[t.icon] || LayoutTemplate" class="h-5 w-5" />
              </div>
              <div class="min-w-0">
                <div class="font-medium">{{ t.name }}</div>
                <p class="mt-0.5 text-xs text-muted-foreground line-clamp-2">{{ t.description }}</p>
                <Badge variant="secondary" class="mt-2 text-[10px]">
                  {{ t.records.length }} 条记录
                </Badge>
              </div>
            </div>
          </button>
        </div>

        <div v-else class="space-y-3">
          <p class="text-sm text-muted-foreground">{{ selected?.description }}</p>
          <div class="rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead class="w-10"></TableHead>
                  <TableHead class="w-16">类型</TableHead>
                  <TableHead class="w-24">主机</TableHead>
                  <TableHead>记录值</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow v-for="(r, i) in records" :key="i">
                  <TableCell>
                    <Checkbox
                      :checked="r.enabled"
                      @update:checked="(v: boolean) => (r.enabled = v)"
                    />
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{{ r.recordType }}</Badge>
                  </TableCell>
                  <TableCell class="font-mono text-xs">{{ r.name }}</TableCell>
                  <TableCell>
                    <div class="space-y-1">
                      <Input
                        v-model="r.value"
                        :disabled="!r.enabled"
                        class="h-8 font-mono text-xs"
                        :placeholder="r.remark || '记录值'"
                      />
                      <p v-if="r.remark" class="text-[11px] text-muted-foreground">{{ r.remark }}</p>
                    </div>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </div>
      </div>

      <DialogFooter class="gap-2 sm:gap-0">
        <template v-if="step === 'pick'">
          <Button variant="outline" @click="close">关闭</Button>
        </template>
        <template v-else>
          <Button variant="outline" @click="goBack">
            <ChevronLeft class="mr-1 h-4 w-4" />
            返回
          </Button>
          <Button :disabled="applying || enabledCount === 0 || missingValues" @click="apply">
            <Loader2 v-if="applying" class="mr-2 h-4 w-4 animate-spin" />
            应用 {{ enabledCount }} 条记录
          </Button>
        </template>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
