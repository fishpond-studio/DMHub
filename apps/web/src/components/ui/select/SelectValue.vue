<script setup lang="ts">
import { SelectValue as SelectValuePrimitive } from 'radix-vue'

withDefaults(defineProps<{
  placeholder?: string
}>(), {
  placeholder: '',
})
</script>

<template>
  <SelectValuePrimitive :placeholder="placeholder" />
</template>
