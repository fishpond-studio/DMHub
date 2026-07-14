<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { AlertDialogCancel as AlertDialogCancelPrimitive } from 'radix-vue'
import { cn } from '@/lib/utils'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()
</script>

<template>
  <AlertDialogCancelPrimitive
    :class="cn(
      'inline-flex h-10 items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-semibold ring-offset-background transition-colors hover:bg-accent hover:text-accent-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 mt-2 sm:mt-0',
      props.class,
    )"
  >
    <slot />
  </AlertDialogCancelPrimitive>
</template>
