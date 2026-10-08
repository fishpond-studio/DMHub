<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ArrowLeft, Settings, Users, KeyRound, Globe, Shield, Bell, Link, FileKey, UserCheck, LayoutDashboard, User, Key, ChevronDown, ChevronRight } from 'lucide-vue-next'

const route = useRoute()
const authStore = useAuthStore()

const isAdmin = computed(() => authStore.user?.role === 'admin')
const sidebarOpen = ref(false)

const adminItems = [
  { label: '团队设置', icon: Settings, to: '/settings/team' },
  { label: '成员管理', icon: Users, to: '/settings/members' },
  { label: '邀请码', icon: KeyRound, to: '/settings/invite-codes' },
  { label: '域名分配', icon: Globe, to: '/settings/domain-assignments' },
  { label: '分配审核', icon: UserCheck, to: '/settings/assignment-approval' },
  { label: 'DNS 服务商', icon: LayoutDashboard, to: '/settings/providers' },
  { label: 'OAuth/OIDC', icon: Link, to: '/settings/oauth-providers' },
  { label: '通知设置', icon: Bell, to: '/settings/notifications' },
  { label: 'API 密钥', icon: FileKey, to: '/settings/api-keys' },
  { label: '密码重置请求', icon: Shield, to: '/settings/admin-reset-requests' },
]

const userItems = [
  { label: '个人资料', icon: User, to: '/settings/profile' },
  { label: '我的令牌', icon: Key, to: '/settings/user-tokens' },
  { label: '账号绑定', icon: Link, to: '/settings/account-binding' },
  { label: '2FA 设置', icon: Shield, to: '/settings/2fa' },
]

function isActive(path: string) {
  return route.path === path
}

const currentLabel = computed(() => {
  const allItems = [...adminItems, ...userItems]
  return allItems.find(i => isActive(i.to))?.label || '系统设置'
})

function navigateOnMobile() {
  sidebarOpen.value = false
}
</script>

<template>
  <div class="min-h-screen bg-background">
    <div class="app-container py-6 md:py-8">
      <div class="flex items-center mb-4 md:mb-6">
        <Button variant="ghost" size="icon" @click="$router.push('/dashboard')" class="mr-3">
          <ArrowLeft class="h-5 w-5" />
        </Button>
        <h1 class="text-xl md:text-2xl font-bold text-foreground">系统设置</h1>
        <Button
          variant="outline"
          size="sm"
          class="ml-auto md:hidden"
          @click="sidebarOpen = !sidebarOpen"
        >
          {{ currentLabel }}
          <ChevronDown v-if="!sidebarOpen" class="ml-1 h-4 w-4" />
          <ChevronRight v-else class="ml-1 h-4 w-4" />
        </Button>
      </div>

      <div class="flex gap-6">
        <div class="hidden md:block w-52 flex-shrink-0 space-y-2">
          <Card v-if="isAdmin">
            <CardContent class="p-3">
              <p class="label-micro mb-2">管理员</p>
              <nav class="space-y-0.5">
                <router-link
                  v-for="item in adminItems"
                  :key="item.to"
                  :to="item.to"
                  :class="[
                    'flex items-center px-3 py-2 rounded-md text-sm transition-all duration-200',
                    isActive(item.to)
                      ? 'bg-accent text-accent-foreground font-medium'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  ]"
                >
                  <component :is="item.icon" class="mr-2 h-4 w-4" />
                  {{ item.label }}
                </router-link>
              </nav>
            </CardContent>
          </Card>

          <Card>
            <CardContent class="p-3">
              <p class="label-micro mb-2">个人</p>
              <nav class="space-y-0.5">
                <router-link
                  v-for="item in userItems"
                  :key="item.to"
                  :to="item.to"
                  :class="[
                    'flex items-center px-3 py-2 rounded-md text-sm transition-all duration-200',
                    isActive(item.to)
                      ? 'bg-accent text-accent-foreground font-medium'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  ]"
                >
                  <component :is="item.icon" class="mr-2 h-4 w-4" />
                  {{ item.label }}
                </router-link>
              </nav>
            </CardContent>
          </Card>
        </div>

        <div v-if="sidebarOpen" class="md:hidden w-full mb-4">
          <Card>
            <CardContent class="p-3">
              <nav v-if="isAdmin" class="space-y-0.5 mb-3">
                <p class="label-micro mb-2">管理员</p>
                <router-link
                  v-for="item in adminItems"
                  :key="item.to"
                  :to="item.to"
                  :class="[
                    'flex items-center px-3 py-2 rounded-md text-sm transition-all duration-200',
                    isActive(item.to)
                      ? 'bg-accent text-accent-foreground font-medium'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  ]"
                  @click="navigateOnMobile"
                >
                  <component :is="item.icon" class="mr-2 h-4 w-4" />
                  {{ item.label }}
                </router-link>
              </nav>
              <nav class="space-y-0.5">
                <p class="label-micro mb-2">个人</p>
                <router-link
                  v-for="item in userItems"
                  :key="item.to"
                  :to="item.to"
                  :class="[
                    'flex items-center px-3 py-2 rounded-md text-sm transition-all duration-200',
                    isActive(item.to)
                      ? 'bg-accent text-accent-foreground font-medium'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  ]"
                  @click="navigateOnMobile"
                >
                  <component :is="item.icon" class="mr-2 h-4 w-4" />
                  {{ item.label }}
                </router-link>
              </nav>
            </CardContent>
          </Card>
        </div>

        <div class="flex-1 min-w-0 animate-fade-in">
          <router-view />
        </div>
      </div>
    </div>
  </div>
</template>
