<script setup lang="ts">
import { TooltipProvider as TooltipProviderPrimitive } from 'radix-vue'

withDefaults(defineProps<{
  delayDuration?: number
}>(), {
  delayDuration: 200,
})
</script>

<template>
  <TooltipProviderPrimitive :delay-duration="delayDuration">
    <slot />
  </TooltipProviderPrimitive>
</template>
