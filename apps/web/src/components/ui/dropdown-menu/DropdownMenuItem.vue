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
      'relative flex cursor-default select-none items-center gap-2 rounded-md px-2.5 py-1.5 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:shrink-0',
      props.class,
    )"
  >
    <slot />
  </DropdownMenuItemPrimitive>
</template>
