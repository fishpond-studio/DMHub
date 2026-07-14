<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { ToastTitle as ToastTitlePrimitive } from 'radix-vue'
import { cn } from '@/lib/utils'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()
</script>

<template>
  <ToastTitlePrimitive
    :class="cn('text-sm font-semibold', props.class)"
  >
    <slot />
  </ToastTitlePrimitive>
</template>
