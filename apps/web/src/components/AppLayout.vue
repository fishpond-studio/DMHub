<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useTheme } from '@/composables/use-theme'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import ThemeToggle from '@/components/ThemeToggle.vue'
import { LayoutDashboard, Globe, Settings, ScrollText, KeyRound, LogOut, User, Menu, X } from 'lucide-vue-next'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const { initTheme } = useTheme()

initTheme()

const mobileMenuOpen = ref(false)

const publicPages = new Set(['landing', 'login', 'register', '2fa-verify', 'setup', 'oauth-callback'])
const showNav = computed(() => !publicPages.has(route.name as string) && !!authStore.token)

const navItems = [
  { label: '仪表盘', icon: LayoutDashboard, to: '/dashboard' },
  { label: '域名', icon: Globe, to: '/domains' },
  { label: '日志', icon: ScrollText, to: '/logs' },
  { label: '我的域名', icon: KeyRound, to: '/my-domains' },
  { label: '设置', icon: Settings, to: '/settings/team' },
]

function isActive(path: string) {
  if (path === '/dashboard') return route.path === '/dashboard'
  return route.path.startsWith(path)
}

function handleLogout() {
  authStore.clearAuth()
  router.push('/login')
}

watch(route, () => {
  mobileMenuOpen.value = false
})
</script>

<template>
  <div class="min-h-screen bg-background">
    <header v-if="showNav" class="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div class="mx-auto w-full max-w-screen-2xl px-4 flex h-14 items-center justify-between">
        <div class="flex items-center">
          <router-link to="/dashboard" class="mr-4 flex items-center space-x-2 md:mr-6">
            <Globe class="h-6 w-6 text-primary" />
            <span class="hidden font-bold sm:inline-block">DMHub</span>
          </router-link>
          <nav class="hidden md:flex items-center space-x-1 text-sm font-medium">
            <router-link
              v-for="item in navItems"
              :key="item.to"
              :to="item.to"
              :class="[
                'relative flex items-center px-3 py-2 rounded-md text-sm font-medium transition-all duration-200',
                isActive(item.to)
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground'
              ]"
            >
              <component :is="item.icon" class="mr-1.5 h-4 w-4 transition-transform duration-200 hover:scale-110" />
              <span>{{ item.label }}</span>
              <span
                v-if="isActive(item.to)"
                class="absolute bottom-0 left-1/2 -translate-x-1/2 h-0.5 w-4 rounded-full bg-primary transition-all duration-300"
              />
            </router-link>
          </nav>
        </div>
        <div class="flex items-center space-x-2">
          <ThemeToggle />
          <DropdownMenu>
            <DropdownMenuTrigger as-child>
              <Button variant="ghost" class="relative h-8 w-8 rounded-full">
                <Avatar class="h-8 w-8">
                  <AvatarFallback>
                    <User class="h-4 w-4" />
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" class="w-56">
              <div class="flex items-center justify-start gap-2 p-2">
                <div class="flex flex-col space-y-1 leading-none">
                  <p class="font-medium">{{ authStore.user?.username || '用户' }}</p>
                  <p class="text-xs text-muted-foreground">{{ authStore.user?.role || '' }}</p>
                </div>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem @click="router.push('/settings/account-binding')">
                <User class="mr-2 h-4 w-4" />
                账号绑定
              </DropdownMenuItem>
              <DropdownMenuItem @click="router.push('/settings/2fa')">
                <KeyRound class="mr-2 h-4 w-4" />
                2FA 设置
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem @click="handleLogout">
                <LogOut class="mr-2 h-4 w-4" />
                退出登录
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="ghost"
            size="icon"
            class="md:hidden"
            @click="mobileMenuOpen = !mobileMenuOpen"
          >
            <X v-if="mobileMenuOpen" class="h-5 w-5" />
            <Menu v-else class="h-5 w-5" />
          </Button>
        </div>
      </div>
    </header>

    <div
      v-if="mobileMenuOpen && showNav"
      class="fixed inset-0 top-14 z-40 bg-background/95 backdrop-blur md:hidden"
    >
      <nav class="flex flex-col p-4 space-y-1">
        <router-link
          v-for="item in navItems"
          :key="item.to"
          :to="item.to"
          :class="[
            'flex items-center px-4 py-3 rounded-md text-base font-medium transition-all duration-200',
            isActive(item.to)
              ? 'bg-accent text-accent-foreground'
              : 'text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground'
          ]"
          @click="mobileMenuOpen = false"
        >
          <component :is="item.icon" class="mr-3 h-5 w-5" />
          {{ item.label }}
        </router-link>
      </nav>
    </div>

    <main>
      <router-view v-slot="{ Component, route: r }">
        <transition name="page" mode="out-in">
          <component :is="Component" :key="r.path" />
        </transition>
      </router-view>
    </main>
  </div>
</template>
