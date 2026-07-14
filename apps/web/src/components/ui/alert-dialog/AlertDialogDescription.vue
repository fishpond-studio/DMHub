<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { AlertDialogDescription as AlertDialogDescriptionPrimitive } from 'radix-vue'
import { cn } from '@/lib/utils'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()
</script>

<template>
  <AlertDialogDescriptionPrimitive
    :class="cn('text-sm text-muted-foreground', props.class)"
  >
    <slot />
  </AlertDialogDescriptionPrimitive>
</template>
