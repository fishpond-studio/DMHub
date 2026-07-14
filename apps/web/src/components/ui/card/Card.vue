<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '@/lib/utils'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()
</script>

<template>
  <div :class="cn('rounded-lg border bg-card text-card-foreground shadow-sm transition-shadow duration-200 hover:shadow-md', props.class)">
    <slot />
  </div>
</template>
