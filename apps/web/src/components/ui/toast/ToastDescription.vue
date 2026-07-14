<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { ToastDescription as ToastDescriptionPrimitive } from 'radix-vue'
import { cn } from '@/lib/utils'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()
</script>

<template>
  <ToastDescriptionPrimitive
    :class="cn('text-sm opacity-90', props.class)"
  >
    <slot />
  </ToastDescriptionPrimitive>
</template>
