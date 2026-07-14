<template>
  <Card>
    <CardContent class="p-0">
      <div v-if="!diff" class="py-8 text-center text-muted-foreground">选择版本后点击"比较"查看差异</div>

      <div v-else class="p-4 space-y-4">
        <div class="flex items-center gap-4">
          <span class="text-sm text-muted-foreground">
            <span class="inline-block w-3 h-3 rounded bg-primary/40 mr-1"></span>新增 {{ diff.added.length }}
          </span>
          <span class="text-sm text-muted-foreground">
            <span class="inline-block w-3 h-3 rounded bg-destructive/40 mr-1"></span>删除 {{ diff.removed.length }}
          </span>
          <span class="text-sm text-muted-foreground">
            <span class="inline-block w-3 h-3 rounded bg-yellow-500/40 mr-1"></span>修改 {{ diff.modified.length }}
          </span>
          <div class="ml-auto">
            <Button
              @click="viewMode = viewMode === 'unified' ? 'side-by-side' : 'unified'"
              variant="link"
              size="sm"
            >
              {{ viewMode === 'unified' ? '并排视图' : '统一视图' }}
            </Button>
          </div>
        </div>

        <div v-if="diff.added.length === 0 && diff.removed.length === 0 && diff.modified.length === 0" class="py-8 text-center text-muted-foreground">
          两个版本没有差异
        </div>

        <template v-else>
          <div v-if="viewMode === 'unified'" class="space-y-2">
            <div
              v-for="(r, i) in diff.added"
              :key="'a-' + i"
              class="rounded border border-primary/30 bg-primary/10 p-3"
            >
              <div class="flex items-center gap-2">
                <span class="text-xs font-medium text-primary">+ 新增</span>
                <Badge variant="secondary" class="bg-primary/15 text-primary">{{ r.recordType }}</Badge>
                <span class="text-sm">{{ r.name }}</span>
              </div>
              <div class="mt-1 text-sm text-muted-foreground pl-16">{{ r.value }} · TTL: {{ r.ttl }}<span v-if="r.priority"> · 优先级: {{ r.priority }}</span><span v-if="r.proxied"> · 已代理</span></div>
            </div>

            <div
              v-for="(r, i) in diff.removed"
              :key="'r-' + i"
              class="rounded border border-destructive/40 bg-destructive/10 p-3"
            >
              <div class="flex items-center gap-2">
                <span class="text-xs font-medium text-destructive">- 删除</span>
                <Badge variant="secondary" class="bg-destructive/15 text-destructive">{{ r.recordType }}</Badge>
                <span class="text-sm line-through">{{ r.name }}</span>
              </div>
              <div class="mt-1 text-sm text-muted-foreground pl-16 line-through">{{ r.value }} · TTL: {{ r.ttl }}<span v-if="r.priority"> · 优先级: {{ r.priority }}</span><span v-if="r.proxied"> · 已代理</span></div>
            </div>

            <div
              v-for="(m, i) in diff.modified"
              :key="'m-' + i"
              class="rounded border border-yellow-500/30 bg-yellow-500/10 p-3"
            >
              <div class="flex items-center gap-2">
                <span class="text-xs font-medium text-yellow-600 dark:text-yellow-400">~ 修改</span>
                <Badge variant="secondary" class="bg-yellow-500/15 text-yellow-700 dark:text-yellow-300">{{ m.before.recordType }}</Badge>
                <span class="text-sm">{{ m.before.name }}</span>
              </div>
              <div class="mt-1 pl-16 space-y-1">
                <div v-for="(vals, field) in m.changes" :key="field" class="text-sm">
                  <span class="text-muted-foreground">{{ fieldLabel(field as string) }}:</span>
                  <span class="line-through text-destructive ml-1">{{ vals[0] ?? '-' }}</span>
                  <span class="mx-1">→</span>
                  <span class="text-primary">{{ vals[1] ?? '-' }}</span>
                </div>
              </div>
            </div>
          </div>

          <div v-else class="grid grid-cols-2 gap-4">
            <div>
              <h4 class="text-xs font-medium text-muted-foreground mb-2">旧版本</h4>
              <div class="space-y-2">
                <div
                  v-for="(r, i) in diff.removed"
                  :key="'r-' + i"
                  class="rounded border border-destructive/40 bg-destructive/10 p-2 text-sm"
                >
                  <span class="font-medium text-destructive">{{ r.recordType }}</span> {{ r.name }} → {{ r.value }}
                </div>
                <div
                  v-for="(m, i) in diff.modified"
                  :key="'mb-' + i"
                  class="rounded border border-yellow-500/30 bg-yellow-500/10 p-2 text-sm"
                >
                  <span class="font-medium text-yellow-600 dark:text-yellow-400">{{ m.before.recordType }}</span> {{ m.before.name }} → <span v-for="(vals, field) in m.changes" :key="field" class="line-through text-destructive">{{ vals[0] }} </span>
                </div>
              </div>
            </div>
            <div>
              <h4 class="text-xs font-medium text-muted-foreground mb-2">新版本</h4>
              <div class="space-y-2">
                <div
                  v-for="(r, i) in diff.added"
                  :key="'a-' + i"
                  class="rounded border border-primary/30 bg-primary/10 p-2 text-sm"
                >
                  <span class="font-medium text-primary">{{ r.recordType }}</span> {{ r.name }} → {{ r.value }}
                </div>
                <div
                  v-for="(m, i) in diff.modified"
                  :key="'ma-' + i"
                  class="rounded border border-yellow-500/30 bg-yellow-500/10 p-2 text-sm"
                >
                  <span class="font-medium text-yellow-600 dark:text-yellow-400">{{ m.after.recordType }}</span> {{ m.after.name }} → <span v-for="(vals, field) in m.changes" :key="field" class="text-primary">{{ vals[1] }} </span>
                </div>
              </div>
            </div>
          </div>
        </template>
      </div>
    </CardContent>
  </Card>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import type { SnapshotDiff } from '@/stores/domain';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

defineProps<{
  diff: SnapshotDiff | null;
}>();

const viewMode = ref<'unified' | 'side-by-side'>('unified');

function fieldLabel(field: string) {
  const labels: Record<string, string> = {
    value: '记录值',
    ttl: 'TTL',
    priority: '优先级',
    proxied: '代理',
  };
  return labels[field] || field;
}
</script>
