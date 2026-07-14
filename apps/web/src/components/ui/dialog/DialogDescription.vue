<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { DialogDescription as DialogDescriptionPrimitive } from 'radix-vue'
import { cn } from '@/lib/utils'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()
</script>

<template>
  <DialogDescriptionPrimitive
    :class="cn('text-sm text-muted-foreground', props.class)"
  >
    <slot />
  </DialogDescriptionPrimitive>
</template>
