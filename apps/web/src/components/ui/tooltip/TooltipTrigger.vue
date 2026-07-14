<script setup lang="ts">
import { TooltipTrigger as TooltipTriggerPrimitive } from 'radix-vue'
</script>

<template>
  <TooltipTriggerPrimitive as-child>
    <slot />
  </TooltipTriggerPrimitive>
</template>
