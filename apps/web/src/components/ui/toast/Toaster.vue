<script setup lang="ts">
import { useToast } from './use-toast'
import Toast from './Toast.vue'
import ToastAction from './ToastAction.vue'
import ToastClose from './ToastClose.vue'
import ToastDescription from './ToastDescription.vue'
import ToastProvider from './ToastProvider.vue'
import ToastTitle from './ToastTitle.vue'
import ToastViewport from './ToastViewport.vue'

const { toasts } = useToast()
</script>

<template>
  <ToastProvider>
    <Toast
      v-for="t in toasts"
      :key="t.id"
      :open="true"
      :variant="t.variant"
    >
      <div class="grid gap-1">
        <ToastTitle v-if="t.title">
          {{ t.title }}
        </ToastTitle>
        <ToastDescription v-if="t.description">
          {{ t.description }}
        </ToastDescription>
      </div>
      <ToastAction
        v-if="t.action"
        :alt-text="t.action.label"
        @click="t.action.onClick"
      >
        {{ t.action.label }}
      </ToastAction>
      <ToastClose />
    </Toast>
    <ToastViewport />
  </ToastProvider>
</template>
