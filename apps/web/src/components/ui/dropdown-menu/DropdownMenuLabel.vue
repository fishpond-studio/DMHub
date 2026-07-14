<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { DropdownMenuLabel as DropdownMenuLabelPrimitive } from 'radix-vue'
import { cn } from '@/lib/utils'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()
</script>

<template>
  <DropdownMenuLabelPrimitive
    :class="cn('px-2 py-1.5 text-sm font-semibold', props.class)"
  >
    <slot />
  </DropdownMenuLabelPrimitive>
</template>
