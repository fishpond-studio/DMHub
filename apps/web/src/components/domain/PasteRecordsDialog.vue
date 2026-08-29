<template>
  <Dialog :open="open" @update:open="(v) => emit('update:open', v)">
    <DialogContent class="max-w-xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>粘贴批量导入</DialogTitle>
        <DialogDescription>
          每行一条：类型 主机 值 [TTL] [优先级]。支持空格或制表符分隔。
        </DialogDescription>
      </DialogHeader>

      <div class="space-y-3">
        <Textarea
          v-model="text"
          rows="10"
          class="font-mono text-xs"
          placeholder="A www 1.2.3.4 600&#10;CNAME blog cname.example.com 3600&#10;MX @ mail.example.com 3600 10&#10;TXT @ v=spf1 include:_spf.google.com ~all"
        />
        <p class="text-xs text-muted-foreground">
          已解析 <span class="font-medium text-foreground">{{ parsed.length }}</span> 条
          <span v-if="parseErrors.length" class="text-destructive"> · {{ parseErrors.length }} 行无法识别</span>
        </p>
        <div v-if="parsed.length" class="max-h-40 overflow-y-auto rounded-md border text-xs">
          <table class="w-full">
            <thead class="bg-muted/50 sticky top-0">
              <tr>
                <th class="px-2 py-1 text-left font-medium">类型</th>
                <th class="px-2 py-1 text-left font-medium">主机</th>
                <th class="px-2 py-1 text-left font-medium">值</th>
                <th class="px-2 py-1 text-left font-medium">TTL</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(r, i) in parsed.slice(0, 30)" :key="i" class="border-t">
                <td class="px-2 py-1 font-mono">{{ r.recordType }}</td>
                <td class="px-2 py-1 font-mono">{{ r.name }}</td>
                <td class="px-2 py-1 font-mono truncate max-w-[12rem]" :title="r.value">{{ r.value }}</td>
                <td class="px-2 py-1 tabular-nums">{{ r.ttl ?? 3600 }}</td>
              </tr>
            </tbody>
          </table>
          <p v-if="parsed.length > 30" class="px-2 py-1 text-muted-foreground border-t">
            … 另有 {{ parsed.length - 30 }} 条
          </p>
        </div>
        <ul v-if="parseErrors.length" class="text-xs text-destructive space-y-0.5 max-h-20 overflow-y-auto">
          <li v-for="(e, i) in parseErrors.slice(0, 8)" :key="i">{{ e }}</li>
        </ul>
      </div>

      <DialogFooter>
        <Button variant="outline" @click="emit('update:open', false)">取消</Button>
        <Button :disabled="!parsed.length || applying" @click="apply">
          {{ applying ? '导入中…' : `导入 ${parsed.length} 条` }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useDomainStore } from '@/stores/domain'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { toastError, toastSuccess } from '@/lib/toast-helpers'

const props = defineProps<{
  open: boolean
  domainId: string
}>()

const emit = defineEmits<{
  'update:open': [boolean]
  applied: []
}>()

const store = useDomainStore()
const text = ref('')
const applying = ref(false)

const ALLOWED = new Set(['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SRV', 'CAA', 'PTR'])

interface ParsedRow {
  recordType: string
  name: string
  value: string
  ttl?: number
  priority?: number
}

const parseResult = computed(() => {
  const rows: ParsedRow[] = []
  const errors: string[] = []
  const lines = text.value.split(/\r?\n/)
  lines.forEach((line, idx) => {
    const raw = line.trim()
    if (!raw || raw.startsWith('#') || raw.startsWith('//')) return
    const parts = raw.split(/[\s\t]+/).filter(Boolean)
    if (parts.length < 3) {
      errors.push(`第 ${idx + 1} 行字段不足`)
      return
    }
    const recordType = parts[0].toUpperCase()
    if (!ALLOWED.has(recordType)) {
      errors.push(`第 ${idx + 1} 行未知类型 ${parts[0]}`)
      return
    }
    const name = parts[1]
    let value = parts[2]
    let ttl: number | undefined
    let priority: number | undefined

    if (recordType === 'MX' || recordType === 'SRV') {
      // MX name value [ttl] [priority]  or MX name priority value [ttl]
      if (parts.length >= 4 && /^\d+$/.test(parts[2]) && !/^\d+$/.test(parts[3] || '')) {
        // MX @ 10 mail.example.com [ttl]
        priority = Number(parts[2])
        value = parts[3]
        if (parts[4] && /^\d+$/.test(parts[4])) ttl = Number(parts[4])
      } else {
        value = parts[2]
        if (parts[3] && /^\d+$/.test(parts[3])) {
          const n = Number(parts[3])
          if (n <= 65535 && parts[4] && /^\d+$/.test(parts[4])) {
            ttl = n
            priority = Number(parts[4])
          } else if (n > 60) {
            ttl = n
            if (parts[4] && /^\d+$/.test(parts[4])) priority = Number(parts[4])
          } else {
            priority = n
            if (parts[4] && /^\d+$/.test(parts[4])) ttl = Number(parts[4])
          }
        }
      }
    } else if (recordType === 'TXT') {
      // 值可能含空格：从第 3 段起直到遇到纯数字 TTL
      const rest = parts.slice(2)
      let ttlIdx = -1
      for (let i = rest.length - 1; i >= 1; i--) {
        if (/^\d+$/.test(rest[i]) && Number(rest[i]) >= 60) {
          ttlIdx = i
          break
        }
      }
      if (ttlIdx >= 0) {
        ttl = Number(rest[ttlIdx])
        value = rest.slice(0, ttlIdx).join(' ')
      } else {
        value = rest.join(' ')
      }
    } else {
      if (parts[3] && /^\d+$/.test(parts[3])) ttl = Number(parts[3])
    }

    rows.push({
      recordType,
      name,
      value,
      ttl: ttl && ttl > 0 ? ttl : 3600,
      priority,
    })
  })
  return { rows, errors }
})

const parsed = computed(() => parseResult.value.rows)
const parseErrors = computed(() => parseResult.value.errors)

watch(
  () => props.open,
  (v) => {
    if (v) {
      text.value = ''
      applying.value = false
    }
  },
)

async function apply() {
  if (!parsed.value.length) return
  applying.value = true
  try {
    const result = await store.bulkCreateRecords(props.domainId, parsed.value)
    if (result.succeeded === result.total) {
      toastSuccess(`已导入 ${result.succeeded} 条记录`)
    } else {
      toastError(`导入完成：成功 ${result.succeeded}，失败 ${result.total - result.succeeded}`)
    }
    emit('applied')
    emit('update:open', false)
  } catch (err: any) {
    toastError('导入失败', err.response?.data?.error || err.message)
  } finally {
    applying.value = false
  }
}
</script>
