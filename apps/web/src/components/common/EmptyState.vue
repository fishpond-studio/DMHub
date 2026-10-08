<script setup lang="ts">
import type { Component, HTMLAttributes } from 'vue'
import { Inbox } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// icon 的默认值刻意写在模板里（props.icon ?? Inbox）。若放进 withDefaults，Vue 会把
// 函数型默认值当工厂调用，lucide 组件签名是 (props, { slots })，只传一个参数就会抛
// "Cannot destructure property 'slots' of 'undefined'" —— 于是任何不带 icon 的空状态都会白屏。
const props = defineProps<{
  icon?: Component
  title: string
  description?: string
  actionLabel?: string
  secondaryLabel?: string
  class?: HTMLAttributes['class']
}>()

const emit = defineEmits<{
  action: []
  secondary: []
}>()
</script>

<template>
  <div :class="cn('flex flex-col items-center justify-center rounded-xl border border-dashed bg-muted/20 px-6 py-14 text-center animate-fade-in', props.class)">
    <div class="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-sm">
      <component :is="props.icon ?? Inbox" class="h-7 w-7" />
    </div>
    <h3 class="text-base font-semibold text-foreground">{{ title }}</h3>
    <p v-if="description" class="mt-1.5 max-w-sm text-sm text-muted-foreground leading-relaxed">
      {{ description }}
    </p>
    <div v-if="actionLabel || secondaryLabel || $slots.actions" class="mt-5 flex flex-wrap items-center justify-center gap-2">
      <slot name="actions">
        <Button v-if="actionLabel" size="sm" @click="emit('action')">
          {{ actionLabel }}
        </Button>
        <Button v-if="secondaryLabel" size="sm" variant="outline" @click="emit('secondary')">
          {{ secondaryLabel }}
        </Button>
      </slot>
    </div>
  </div>
</template>
