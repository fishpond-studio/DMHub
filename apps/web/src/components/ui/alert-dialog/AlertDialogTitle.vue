<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { AlertDialogTitle as AlertDialogTitlePrimitive } from 'radix-vue'
import { cn } from '@/lib/utils'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()
</script>

<template>
  <AlertDialogTitlePrimitive
    :class="cn('text-lg font-semibold', props.class)"
  >
    <slot />
  </AlertDialogTitlePrimitive>
</template>
