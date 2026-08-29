<template>
  <div class="min-h-screen bg-background">
    <div class="mx-auto max-w-5xl px-4 py-8">
      <PageHeader
        title="我的域名"
        description="管理员指派给你的域名与可管理的子域名范围"
        back-to="/dashboard"
        show-back
      >
        <template #actions>
          <Button variant="outline" size="sm" @click="$router.push('/assignment-request')">
            申请域名权限
          </Button>
        </template>
      </PageHeader>

      <div v-if="loading" class="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Skeleton v-for="i in 4" :key="i" class="h-40 rounded-xl" />
      </div>

      <EmptyState
        v-else-if="myDomains.length === 0"
        title="暂未分配任何域名"
        description="可以向管理员申请子域名管理权限，或联系管理员进行指派"
        action-label="申请权限"
        secondary-label="返回仪表盘"
        @action="$router.push('/assignment-request')"
        @secondary="$router.push('/dashboard')"
      />

      <div v-else class="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card
          v-for="d in myDomains"
          :key="d.id"
          class="card-hover cursor-pointer"
          @click="$router.push(`/domains/${d.id}`)"
        >
          <CardHeader class="pb-2">
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0">
                <CardTitle class="truncate text-base">{{ d.name }}</CardTitle>
                <p class="mt-0.5 text-xs text-muted-foreground">
                  所属域名 · {{ d.groupName || '未分组' }}
                </p>
              </div>
              <Badge
                :variant="d.permission === 'dns_edit' ? 'default' : 'secondary'"
                class="shrink-0"
              >
                {{ permissionLabel(d.permission) }}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div class="mb-2 text-xs font-medium text-muted-foreground">可管理范围</div>
            <div class="space-y-2">
              <div
                v-for="(scope, idx) in scopesOf(d)"
                :key="scope.id || idx"
                class="rounded-lg border bg-muted/30 px-3 py-2"
              >
                <div class="flex items-start justify-between gap-2">
                  <div class="min-w-0">
                    <div class="truncate font-mono text-sm font-medium text-foreground">
                      {{ formatHostPreview(d.name, scope.subdomainPattern) }}
                    </div>
                    <div class="mt-0.5 text-xs text-muted-foreground">
                      {{ formatScopeLabel(scope.subdomainPattern) }}
                    </div>
                  </div>
                  <Badge
                    variant="outline"
                    class="shrink-0 text-[10px]"
                    :class="scope.permission === 'dns_edit' ? 'border-primary/40 text-primary' : ''"
                  >
                    {{ permissionLabel(scope.permission) }}
                  </Badge>
                </div>
              </div>
            </div>

            <div class="mt-3 flex items-center justify-between text-xs text-muted-foreground">
              <span>
                状态
                <Badge
                  :variant="d.status === 'active' ? 'default' : 'destructive'"
                  class="ml-1 text-[10px]"
                >
                  {{ d.status === 'active' ? '正常' : d.status === 'expired' ? '已过期' : d.status }}
                </Badge>
              </span>
              <span class="flex items-center text-primary">
                管理解析
                <ChevronRight class="ml-0.5 h-3.5 w-3.5" />
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useAssignmentStore, type MyDomain, type MyDomainAssignment } from '@/stores/assignment'
import PageHeader from '@/components/common/PageHeader.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ChevronRight } from 'lucide-vue-next'
import {
  formatHostPreview,
  formatScopeLabel,
  permissionLabel,
} from '@/lib/subdomain-scope'

const store = useAssignmentStore()
const loading = ref(true)
const myDomains = computed(() => store.myDomains)

function scopesOf(d: MyDomain): MyDomainAssignment[] {
  if (d.assignments && d.assignments.length > 0) return d.assignments
  return [
    {
      id: d.assignmentId,
      subdomainPattern: d.subdomainPattern || '*',
      permission: d.permission,
    },
  ]
}

onMounted(async () => {
  try {
    await store.fetchMyDomains()
  } finally {
    loading.value = false
  }
})
</script>
