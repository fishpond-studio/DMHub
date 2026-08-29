<script setup lang="ts">
import { computed } from 'vue'
import { Sun, Moon, Monitor } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useTheme } from '@/composables/use-theme'
import { useI18n } from 'vue-i18n'

const { currentTheme, setTheme } = useTheme()
const { t } = useI18n()

const themes = computed(() => [
  { value: 'light' as const, label: t('theme.light'), icon: Sun },
  { value: 'dark' as const, label: t('theme.dark'), icon: Moon },
  { value: 'system' as const, label: t('theme.system'), icon: Monitor },
])
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button variant="ghost" size="icon">
        <Sun class="h-5 w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
        <Moon class="absolute h-5 w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
        <span class="sr-only">切换主题</span>
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      <DropdownMenuItem
        v-for="theme in themes"
        :key="theme.value"
        :class="{ 'bg-accent': currentTheme === theme.value }"
        @click="setTheme(theme.value)"
      >
        <component :is="theme.icon" class="mr-2 h-4 w-4" />
        {{ theme.label }}
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
