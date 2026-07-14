<script setup lang="ts">
import { ToastProvider as ToastProviderPrimitive } from 'radix-vue'
import { TOAST_AUTO_CLOSE_MS } from '@dmhub/shared'

withDefaults(defineProps<{
  swipeDirection?: 'right' | 'left' | 'up' | 'down'
  swipeThreshold?: number
  duration?: number
}>(), {
  swipeDirection: 'right',
  swipeThreshold: 50,
  duration: TOAST_AUTO_CLOSE_MS,
})
</script>

<template>
  <ToastProviderPrimitive
    :swipe-direction="swipeDirection"
    :swipe-threshold="swipeThreshold"
    :duration="duration"
    label="Notification"
  >
    <slot />
  </ToastProviderPrimitive>
</template>
