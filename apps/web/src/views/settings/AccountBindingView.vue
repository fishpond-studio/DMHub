<template>
  <div>
    <h1 class="text-2xl font-bold text-foreground mb-2">账号绑定</h1>
    <p class="mb-6 text-sm text-muted-foreground">
      将外部 OIDC / OAuth2 账号绑定到当前用户，便于单点登录
    </p>

    <div v-if="loading" class="py-12 text-center text-muted-foreground">加载中…</div>

    <div v-else class="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle class="text-base">已绑定</CardTitle>
          <CardDescription>可通过以下方式登录本系统</CardDescription>
        </CardHeader>
        <CardContent class="space-y-3">
          <div
            v-if="bindings.length === 0"
            class="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground"
          >
            暂未绑定任何外部账号
          </div>
          <div
            v-for="binding in bindings"
            :key="binding.id"
            class="flex items-center justify-between rounded-lg border p-4"
          >
            <div class="flex items-center gap-3 min-w-0">
              <Avatar>
                <AvatarImage v-if="binding.providerAvatar" :src="binding.providerAvatar" />
                <AvatarFallback>{{ binding.providerDisplayName.charAt(0) }}</AvatarFallback>
              </Avatar>
              <div class="min-w-0">
                <div class="flex items-center gap-2">
                  <span class="text-sm font-medium">{{ binding.providerDisplayName }}</span>
                  <Badge variant="secondary" class="text-[10px]">{{ binding.providerId }}</Badge>
                </div>
                <p class="truncate text-xs text-muted-foreground">
                  {{ binding.providerName || binding.providerEmail || '已绑定' }}
                  <span v-if="binding.providerEmail && binding.providerName">
                    · {{ binding.providerEmail }}
                  </span>
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              class="text-destructive hover:text-destructive shrink-0"
              :disabled="unbindingId === binding.providerId"
              @click="handleUnbind(binding)"
            >
              {{ unbindingId === binding.providerId ? '解绑中…' : '解绑' }}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card v-if="availableProviders.length > 0">
        <CardHeader>
          <CardTitle class="text-base">绑定新提供商</CardTitle>
          <CardDescription>将跳转到对应身份提供商完成授权</CardDescription>
        </CardHeader>
        <CardContent class="space-y-2">
          <button
            v-for="prov in availableProviders"
            :key="prov.providerId"
            type="button"
            class="flex w-full items-center gap-3 rounded-lg border p-4 text-left transition-colors hover:bg-accent"
            :disabled="bindingProviderId === prov.providerId"
            @click="handleBind(prov.providerId)"
          >
            <Avatar>
              <AvatarFallback>{{ prov.name.charAt(0) }}</AvatarFallback>
            </Avatar>
            <div class="min-w-0 flex-1">
              <p class="text-sm font-medium">{{ prov.name }}</p>
              <p class="text-xs text-muted-foreground">{{ prov.type.toUpperCase() }}</p>
            </div>
            <span class="text-sm text-primary">
              {{ bindingProviderId === prov.providerId ? '跳转中…' : '绑定' }}
            </span>
          </button>
        </CardContent>
      </Card>

      <p v-if="bindError" class="text-sm text-destructive">{{ bindError }}</p>
    </div>

    <AlertDialog :open="confirmUnbind.open">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>确认解绑</AlertDialogTitle>
          <AlertDialogDescription>{{ confirmUnbind.message }}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel @click="confirmUnbind.open = false">取消</AlertDialogCancel>
          <AlertDialogAction @click="proceedUnbind">确认解绑</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import api from '@/lib/axios'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

interface Binding {
  id: string
  providerId: string
  providerEmail: string | null
  providerName: string | null
  providerAvatar: string | null
  providerDisplayName: string
  createdAt: string
}

interface ProviderInfo {
  providerId: string
  name: string
  type: string
}

const bindings = ref<Binding[]>([])
const availableProviders = ref<ProviderInfo[]>([])
const loading = ref(false)
const unbindingId = ref<string | null>(null)
const bindingProviderId = ref<string | null>(null)
const bindError = ref('')

const confirmUnbind = reactive({
  open: false,
  message: '',
  providerId: '',
})

onMounted(() => {
  refresh()
})

async function refresh() {
  loading.value = true
  try {
    await fetchBindings()
    await fetchAvailableProviders()
  } finally {
    loading.value = false
  }
}

async function fetchBindings() {
  const { data } = await api.get('/auth/oauth/bindings')
  bindings.value = data.bindings || []
}

async function fetchAvailableProviders() {
  try {
    const { data } = await api.get('/auth/oauth/providers')
    const boundIds = new Set(bindings.value.map((b) => b.providerId))
    availableProviders.value = (data.providers || []).filter(
      (p: ProviderInfo) => !boundIds.has(p.providerId),
    )
  } catch {
    availableProviders.value = []
  }
}

/** 正确的绑定流程：先向后端申请 bind state，再跳转 IdP */
async function handleBind(providerId: string) {
  bindError.value = ''
  bindingProviderId.value = providerId
  try {
    const { data } = await api.post(`/auth/oauth/${providerId}/bind/start`)
    if (!data.authorizeUrl) {
      throw new Error('未返回授权地址')
    }
    window.location.href = data.authorizeUrl
  } catch (err: any) {
    bindError.value = err.response?.data?.error || err.message || '发起绑定失败'
    bindingProviderId.value = null
  }
}

function handleUnbind(binding: Binding) {
  confirmUnbind.open = true
  confirmUnbind.providerId = binding.providerId
  confirmUnbind.message = `确定解绑 ${binding.providerDisplayName} 吗？解绑后将无法通过该方式登录。`
}

async function proceedUnbind() {
  unbindingId.value = confirmUnbind.providerId
  try {
    await api.delete(`/auth/oauth/unbind/${confirmUnbind.providerId}`)
    await refresh()
  } catch (err: any) {
    alert(err.response?.data?.error || '解绑失败')
  } finally {
    unbindingId.value = null
    confirmUnbind.open = false
  }
}
</script>
