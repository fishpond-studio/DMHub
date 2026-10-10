<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '@/lib/utils'

/**
 * 品牌标识：中心节点 + 四向连接点，对应"Hub"。
 * 用 currentColor 绘制，容器用 bg-primary，因此自动跟随主题与深色模式。
 */
const props = defineProps<{
  class?: HTMLAttributes['class']
}>()
</script>

<template>
  <span
    :class="cn(
      'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-primary text-primary-foreground shadow-sm',
      props.class,
    )"
    aria-hidden="true"
  >
    <svg viewBox="0 0 24 24" fill="none" class="h-[62%] w-[62%]">
      <circle cx="12" cy="12" r="2.6" fill="currentColor" />
      <path
        d="M12 4.6v4.8M12 14.6v4.8M4.6 12h4.8M14.6 12h4.8"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
      />
      <circle cx="12" cy="3.4" r="1.4" fill="currentColor" />
      <circle cx="12" cy="20.6" r="1.4" fill="currentColor" />
      <circle cx="3.4" cy="12" r="1.4" fill="currentColor" />
      <circle cx="20.6" cy="12" r="1.4" fill="currentColor" />
    </svg>
  </span>
</template>
