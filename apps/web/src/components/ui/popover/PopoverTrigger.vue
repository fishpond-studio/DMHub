<script setup lang="ts">
import { PopoverTrigger as PopoverTriggerPrimitive } from 'radix-vue'
</script>

<template>
  <PopoverTriggerPrimitive as-child>
    <slot />
  </PopoverTriggerPrimitive>
</template>
