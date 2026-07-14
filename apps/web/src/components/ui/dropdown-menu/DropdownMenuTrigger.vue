<script setup lang="ts">
import { DropdownMenuTrigger as DropdownMenuTriggerPrimitive } from 'radix-vue'
</script>

<template>
  <DropdownMenuTriggerPrimitive as-child>
    <slot />
  </DropdownMenuTriggerPrimitive>
</template>
