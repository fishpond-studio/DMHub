<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useNotificationStore } from '@/stores/notification'
import { useTheme } from '@/composables/use-theme'
import { useI18n } from 'vue-i18n'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Badge } from '@/components/ui/badge'
import ThemeToggle from '@/components/ThemeToggle.vue'
import LanguageSwitcher from '@/components/LanguageSwitcher.vue'
import NotificationBell from '@/components/NotificationBell.vue'
import {
  LayoutDashboard,
  Globe,
  Settings,
  ScrollText,
  KeyRound,
  LogOut,
  User,
  Menu,
  X,
  Upload,
  Search,
  Shield,
  FileKey,
} from 'lucide-vue-next'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const notificationStore = useNotificationStore()
const { initTheme } = useTheme()
const { t } = useI18n()

initTheme()

const mobileMenuOpen = ref(false)

const publicPages = new Set(['landing', 'login', 'register', '2fa-verify', 'setup', 'oauth-callback'])
const showNav = computed(() => !publicPages.has(route.name as string) && !!authStore.token)
const isAdmin = computed(() => authStore.user?.role === 'admin')

// 登录后连接站内信 SSE
watch(
  () => authStore.token,
  (token) => {
    if (token) {
      notificationStore.start()
    } else {
      notificationStore.disconnect()
    }
  },
  { immediate: true },
)

const navItems = computed(() => {
  const items = [
    { label: t('nav.dashboard'), icon: LayoutDashboard, to: '/dashboard' },
    { label: t('nav.domains'), icon: Globe, to: '/domains' },
    { label: t('nav.search'), icon: Search, to: '/search' },
    { label: t('nav.myDomains'), icon: KeyRound, to: '/my-domains' },
    { label: t('nav.logs'), icon: ScrollText, to: '/logs' },
  ]
  if (isAdmin.value) {
    items.push({ label: t('common.import'), icon: Upload, to: '/import' })
  }
  items.push({ label: t('nav.settings'), icon: Settings, to: '/settings/team' })
  return items
})

const roleLabel = computed(() => {
  const role = authStore.user?.role
  if (role === 'admin') return t('settings.admin')
  if (role === 'member') return role
  if (role === 'guest') return role
  return role || ''
})

function isActive(path: string) {
  if (path === '/dashboard') return route.path === '/dashboard'
  if (path === '/settings/team') return route.path.startsWith('/settings')
  return route.path === path || route.path.startsWith(path + '/')
}

function handleLogout() {
  notificationStore.disconnect()
  authStore.clearAuth()
  router.push('/login')
}

function openCommandPalette() {
  window.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }),
  )
}

watch(route, () => {
  mobileMenuOpen.value = false
})
</script>

<template>
  <div class="min-h-screen bg-background">
    <header
      v-if="showNav"
      class="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur-md supports-[backdrop-filter]:bg-background/70"
    >
      <div class="mx-auto flex h-14 w-full max-w-screen-2xl items-center justify-between px-4">
        <div class="flex min-w-0 items-center">
          <router-link to="/dashboard" class="mr-4 flex items-center space-x-2 md:mr-6">
            <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <Globe class="h-4.5 w-4.5 text-primary" />
            </div>
            <span class="hidden font-bold tracking-tight sm:inline-block">DMHub</span>
          </router-link>
          <nav class="hidden items-center gap-0.5 text-sm font-medium md:flex">
            <router-link
              v-for="item in navItems"
              :key="item.to"
              :to="item.to"
              :class="[
                'relative flex items-center rounded-md px-3 py-2 text-sm font-medium transition-all duration-200',
                isActive(item.to)
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground',
              ]"
            >
              <component :is="item.icon" class="mr-1.5 h-4 w-4" />
              <span>{{ item.label }}</span>
            </router-link>
          </nav>
        </div>

        <div class="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            class="hidden h-8 gap-2 text-muted-foreground lg:inline-flex"
            @click="openCommandPalette"
          >
            <Search class="h-3.5 w-3.5" />
            <span class="text-xs">搜索</span>
            <kbd class="pointer-events-none ml-1 hidden h-5 select-none items-center gap-0.5 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium sm:inline-flex">
              ⌘K
            </kbd>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            class="h-8 w-8 lg:hidden"
            title="搜索 (Ctrl+K)"
            @click="openCommandPalette"
          >
            <Search class="h-4 w-4" />
          </Button>

          <NotificationBell />
          <LanguageSwitcher />
          <ThemeToggle />

          <DropdownMenu>
            <DropdownMenuTrigger as-child>
              <Button variant="ghost" class="relative h-8 w-8 rounded-full">
                <Avatar class="h-8 w-8">
                  <AvatarFallback class="bg-primary/10 text-primary text-xs font-semibold">
                    {{ (authStore.user?.username || 'U').slice(0, 1).toUpperCase() }}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" class="w-60">
              <DropdownMenuLabel class="font-normal">
                <div class="flex flex-col space-y-1">
                  <p class="text-sm font-medium leading-none">{{ authStore.user?.username || '用户' }}</p>
                  <div class="flex items-center gap-2 pt-1">
                    <p class="text-xs text-muted-foreground truncate">{{ authStore.user?.email || '' }}</p>
                    <Badge v-if="roleLabel" variant="secondary" class="text-[10px] px-1.5 py-0">
                      {{ roleLabel }}
                    </Badge>
                  </div>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem @click="router.push('/settings/profile')">
                <User class="mr-2 h-4 w-4" />
                个人资料
              </DropdownMenuItem>
              <DropdownMenuItem @click="router.push('/settings/2fa')">
                <Shield class="mr-2 h-4 w-4" />
                2FA 设置
              </DropdownMenuItem>
              <DropdownMenuItem @click="router.push('/settings/user-tokens')">
                <FileKey class="mr-2 h-4 w-4" />
                我的令牌
              </DropdownMenuItem>
              <DropdownMenuItem @click="router.push('/settings/account-binding')">
                <KeyRound class="mr-2 h-4 w-4" />
                账号绑定
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem class="text-destructive focus:text-destructive" @click="handleLogout">
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
      <nav class="flex flex-col space-y-1 p-4">
        <router-link
          v-for="item in navItems"
          :key="item.to"
          :to="item.to"
          :class="[
            'flex items-center rounded-md px-4 py-3 text-base font-medium transition-all duration-200',
            isActive(item.to)
              ? 'bg-accent text-accent-foreground'
              : 'text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground',
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
