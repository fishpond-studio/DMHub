<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { TabsContent as TabsContentPrimitive } from 'radix-vue'
import { cn } from '@/lib/utils'

const props = defineProps<{
  class?: HTMLAttributes['class']
  value: string
}>()
</script>

<template>
  <TabsContentPrimitive
    :value="value"
    :class="cn(
      'mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
      props.class,
    )"
  >
    <slot />
  </TabsContentPrimitive>
</template>
