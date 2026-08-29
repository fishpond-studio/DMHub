<template>
  <div class="min-h-screen bg-background">
    <div class="mx-auto max-w-5xl px-4 py-8">
      <PageHeader
        title="全局搜索"
        description="搜索主机、记录值、备注；输入 IP 可反查指向它的记录"
        back-to="/dashboard"
        show-back
      />

      <div class="mb-6 flex flex-col gap-3 sm:flex-row">
        <div class="relative flex-1">
          <Search class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            v-model="q"
            class="pl-9"
            placeholder="例如：www、1.2.3.4（反查 IP）、CDN、MX"
            autofocus
            @keydown.enter="runSearch"
          />
        </div>
        <Button :disabled="loading || !q.trim()" @click="runSearch">
          <Loader2 v-if="loading" class="mr-2 h-4 w-4 animate-spin" />
          搜索
        </Button>
      </div>

      <div v-if="error" class="mb-4 text-sm text-destructive">{{ error }}</div>

      <div v-if="searched && !loading && results.length === 0" class="py-16 text-center text-muted-foreground">
        没有匹配的记录
      </div>

      <div v-else-if="results.length" class="overflow-hidden rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow class="bg-muted/40 hover:bg-muted/40">
              <TableHead>域名</TableHead>
              <TableHead>类型</TableHead>
              <TableHead>主机</TableHead>
              <TableHead>记录值</TableHead>
              <TableHead>备注</TableHead>
              <TableHead class="w-20"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow
              v-for="r in results"
              :key="r.id"
              class="cursor-pointer"
              @click="$router.push(`/domains/${r.domainId}`)"
            >
              <TableCell class="font-medium text-primary">{{ r.domainName }}</TableCell>
              <TableCell><Badge variant="secondary">{{ r.recordType }}</Badge></TableCell>
              <TableCell class="font-mono text-xs">{{ r.name }}</TableCell>
              <TableCell class="max-w-xs truncate font-mono text-xs text-muted-foreground" :title="r.value">
                {{ r.value }}
              </TableCell>
              <TableCell class="max-w-[8rem] truncate text-xs text-muted-foreground" :title="r.notes || ''">
                {{ r.notes || '—' }}
              </TableCell>
              <TableCell>
                <Button
                  variant="ghost"
                  size="sm"
                  class="h-7"
                  @click.stop="copyText(r.value, '已复制记录值')"
                >
                  复制
                </Button>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
        <p class="border-t px-3 py-2 text-xs text-muted-foreground">共 {{ results.length }} 条（最多 50）</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import api from '@/lib/axios'
import PageHeader from '@/components/common/PageHeader.vue'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { copyText } from '@/lib/copy'
import { Search, Loader2 } from 'lucide-vue-next'

interface SearchHit {
  id: string
  domainId: string
  domainName: string
  recordType: string
  name: string
  value: string
  notes?: string | null
  fqdn?: string
}

const route = useRoute()
const router = useRouter()
const q = ref('')
const loading = ref(false)
const searched = ref(false)
const error = ref('')
const results = ref<SearchHit[]>([])

async function runSearch() {
  const query = q.value.trim()
  if (!query) return
  loading.value = true
  error.value = ''
  searched.value = true
  router.replace({ path: '/search', query: { q: query } })
  try {
    const { data } = await api.get('/domains/search/records', { params: { q: query, limit: 50 } })
    results.value = data.results || []
  } catch (err: any) {
    error.value = err.response?.data?.error || '搜索失败'
    results.value = []
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  if (typeof route.query.q === 'string' && route.query.q) {
    q.value = route.query.q
    runSearch()
  }
})

watch(
  () => route.query.q,
  (v) => {
    if (typeof v === 'string' && v !== q.value) {
      q.value = v
      runSearch()
    }
  },
)
</script>
