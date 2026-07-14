<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { DropdownMenuSeparator as DropdownMenuSeparatorPrimitive } from 'radix-vue'
import { cn } from '@/lib/utils'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()
</script>

<template>
  <DropdownMenuSeparatorPrimitive
    :class="cn('-mx-1 my-1 h-px bg-muted', props.class)"
  />
</template>
