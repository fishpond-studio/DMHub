<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { DropdownMenuItem as DropdownMenuItemPrimitive } from 'radix-vue'
import { cn } from '@/lib/utils'

const props = defineProps<{
  class?: HTMLAttributes['class']
  disabled?: boolean
}>()
</script>

<template>
  <DropdownMenuItemPrimitive
    :disabled="disabled"
    :class="cn(
      'relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
      props.class,
    )"
  >
    <slot />
  </DropdownMenuItemPrimitive>
</template>
