<template>
  <div class="flex min-h-screen items-center justify-center bg-background px-4">
    <Card class="w-full max-w-sm animate-scale-in">
      <CardHeader class="text-center">
        <CardTitle class="text-2xl font-bold">DMHub</CardTitle>
        <CardDescription>
          <span v-if="bound">账号绑定成功</span>
          <span v-else-if="needsInvite">完成 OAuth 注册</span>
          <span v-else-if="error">登录失败</span>
          <span v-else>正在完成登录…</span>
        </CardDescription>
      </CardHeader>

      <CardContent>
        <div v-if="error" class="rounded-md border border-destructive/50 bg-destructive/10 p-4">
          <p class="text-sm text-destructive whitespace-pre-wrap">{{ error }}</p>
          <div class="mt-3 flex flex-col gap-2">
            <Button variant="outline" class="w-full" @click="$router.push('/login')">返回登录</Button>
            <Button
              v-if="boundOrBindError"
              variant="ghost"
              class="w-full"
              @click="$router.push('/settings/account-binding')"
            >
              返回账号绑定
            </Button>
          </div>
        </div>

        <div v-else-if="bound" class="space-y-4 text-center">
          <p class="text-sm text-muted-foreground">
            已成功绑定
            <span class="font-medium text-foreground">{{ providerId || 'OAuth' }}</span>
          </p>
          <Button class="w-full" @click="$router.push('/settings/account-binding')">
            查看账号绑定
          </Button>
        </div>

        <div v-else-if="needsInvite" class="space-y-4">
          <div class="text-center">
            <Avatar class="mx-auto h-16 w-16">
              <AvatarImage v-if="avatar" :src="avatar" />
              <AvatarFallback>
                <Globe class="h-6 w-6 text-muted-foreground" />
              </AvatarFallback>
            </Avatar>
            <p class="mt-2 text-sm text-muted-foreground">{{ name || email || '新用户' }}</p>
          </div>
          <p class="text-center text-sm text-muted-foreground">
            首次通过外部账号登录需要邀请码
          </p>

          <div class="space-y-2">
            <Label for="inviteCode">邀请码</Label>
            <Input
              id="inviteCode"
              v-model="inviteCode"
              type="text"
              placeholder="请输入邀请码"
              @keydown.enter="handleRegister"
            />
          </div>

          <p v-if="formError" class="text-sm text-destructive">{{ formError }}</p>

          <Button class="w-full" :disabled="submitting" @click="handleRegister">
            <Loader2 v-if="submitting" class="mr-2 h-4 w-4 animate-spin" />
            {{ submitting ? '注册中…' : '注册并登录' }}
          </Button>
        </div>

        <div v-else class="py-6 text-center">
          <Loader2 class="mx-auto h-8 w-8 animate-spin text-primary" />
          <p class="mt-4 text-sm text-muted-foreground">正在验证身份并登录…</p>
        </div>
      </CardContent>
    </Card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import api from '@/lib/axios'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { Loader2, Globe } from 'lucide-vue-next'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()

const error = ref('')
const needsInvite = ref(false)
const bound = ref(false)
const pendingToken = ref('')
const providerId = ref('')
const email = ref('')
const name = ref('')
const avatar = ref('')
const inviteCode = ref('')
const formError = ref('')
const submitting = ref(false)

const boundOrBindError = computed(
  () => bound.value || /绑定/.test(error.value),
)

async function exchangeTicket(ticket: string) {
  const { data } = await api.post('/auth/oauth/exchange-ticket', { ticket })
  authStore.setAccessToken(data.accessToken)
  if (data.user) {
    authStore.user = data.user
  } else {
    await authStore.fetchUser()
  }
  router.replace('/dashboard')
}

onMounted(async () => {
  const query = route.query

  if (query.error) {
    error.value = String(query.error)
    return
  }

  if (query.bound === '1') {
    bound.value = true
    providerId.value = (query.provider_id as string) || ''
    return
  }

  if (query.needs_invite === 'true') {
    needsInvite.value = true
    pendingToken.value = (query.pending_token as string) || ''
    providerId.value = (query.provider_id as string) || ''
    email.value = (query.email as string) || ''
    name.value = (query.name as string) || ''
    avatar.value = (query.avatar as string) || ''
    return
  }

  // 新流程：ticket
  if (query.ticket) {
    try {
      await exchangeTicket(String(query.ticket))
    } catch (err: any) {
      error.value = err.response?.data?.error || err.message || '登录票据无效'
    }
    return
  }

  // 兼容旧回调 access_token（若仍有缓存链接）
  if (query.access_token) {
    authStore.setAccessToken(query.access_token as string)
    try {
      if (query.user) {
        authStore.user = JSON.parse(query.user as string)
      } else {
        await authStore.fetchUser()
      }
    } catch {
      await authStore.fetchUser()
    }
    router.replace('/dashboard')
    return
  }

  error.value = '未知的回调参数，请从登录页重新发起 OAuth 登录'
})

async function handleRegister() {
  formError.value = ''
  if (!inviteCode.value.trim()) {
    formError.value = '请输入邀请码'
    return
  }

  submitting.value = true
  try {
    const { data } = await api.post(`/auth/oauth/${providerId.value || 'custom'}/register`, {
      pendingToken: pendingToken.value,
      inviteCode: inviteCode.value.trim(),
    })

    authStore.setAccessToken(data.accessToken)
    if (data.user) {
      authStore.user = data.user
    }
    router.replace('/dashboard')
  } catch (err: any) {
    formError.value = err.response?.data?.error || '注册失败'
  } finally {
    submitting.value = false
  }
}
</script>
