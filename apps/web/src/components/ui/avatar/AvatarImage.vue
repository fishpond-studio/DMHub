<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { AvatarImage } from 'radix-vue'
import { cn } from '@/lib/utils'

const props = defineProps<{
  src: string
  alt?: string
  class?: HTMLAttributes['class']
}>()
</script>

<template>
  <AvatarImage
    :src="src"
    :alt="alt"
    :class="cn('aspect-square h-full w-full', props.class)"
  />
</template>
