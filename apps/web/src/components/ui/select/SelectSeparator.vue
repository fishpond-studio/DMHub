<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { SelectSeparator as SelectSeparatorPrimitive } from 'radix-vue'
import { cn } from '@/lib/utils'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()
</script>

<template>
  <SelectSeparatorPrimitive
    :class="cn('-mx-1 my-1 h-px bg-muted', props.class)"
  />
</template>
