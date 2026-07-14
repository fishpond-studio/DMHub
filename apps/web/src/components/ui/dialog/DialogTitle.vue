<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { DialogTitle as DialogTitlePrimitive } from 'radix-vue'
import { cn } from '@/lib/utils'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()
</script>

<template>
  <DialogTitlePrimitive
    :class="cn('text-lg font-semibold leading-none tracking-tight', props.class)"
  >
    <slot />
  </DialogTitlePrimitive>
</template>
