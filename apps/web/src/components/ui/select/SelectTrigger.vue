<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { SelectIcon, SelectTrigger as SelectTriggerPrimitive } from 'radix-vue'
import { ChevronDown } from 'lucide-vue-next'
import { cn } from '@/lib/utils'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()
</script>

<template>
  <SelectTriggerPrimitive
    :class="cn(
      'flex h-9 w-full items-center justify-between rounded-md border border-input bg-field px-3 py-1.5 text-sm shadow-sm transition-colors ring-offset-background data-[placeholder]:text-muted-foreground/70 focus:outline-none focus:border-ring focus:ring-2 focus:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60 [&>span]:line-clamp-1',
      props.class,
    )"
  >
    <slot />
    <SelectIcon as-child>
      <ChevronDown class="h-4 w-4 opacity-50" />
    </SelectIcon>
  </SelectTriggerPrimitive>
</template>
