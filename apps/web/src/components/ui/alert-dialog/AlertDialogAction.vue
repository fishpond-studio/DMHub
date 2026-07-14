<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { AlertDialogAction as AlertDialogActionPrimitive } from 'radix-vue'
import { cn } from '@/lib/utils'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()
</script>

<template>
  <AlertDialogActionPrimitive
    :class="cn(
      'inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground ring-offset-background transition-colors hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
      props.class,
    )"
  >
    <slot />
  </AlertDialogActionPrimitive>
</template>
