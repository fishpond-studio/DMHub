<script setup lang="ts">
import { computed } from 'vue'
import { Languages } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useI18n } from 'vue-i18n'
import { setLocale, getLocale } from '@/i18n'

const { t, locale } = useI18n()

const current = computed(() => getLocale())

const locales = computed(() => [
  { value: 'zh-CN', label: t('language.zhCN') },
  { value: 'en', label: t('language.en') },
])

function change(value: string) {
  setLocale(value)
  locale.value = value
}
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button variant="ghost" size="icon">
        <Languages class="h-5 w-5" />
        <span class="sr-only">{{ t('language.label') }}</span>
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      <DropdownMenuItem
        v-for="locale in locales"
        :key="locale.value"
        :class="{ 'bg-accent': current === locale.value }"
        @click="change(locale.value)"
      >
        {{ locale.label }}
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
