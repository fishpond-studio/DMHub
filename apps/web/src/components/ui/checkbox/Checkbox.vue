<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { CheckboxRoot, CheckboxIndicator, type CheckboxRootEmits } from 'radix-vue'
import { Check } from 'lucide-vue-next'
import { cn } from '@/lib/utils'
import { computed } from 'vue'

const props = defineProps<{
  class?: HTMLAttributes['class']
  defaultChecked?: boolean
  checked?: boolean | 'indeterminate'
  disabled?: boolean
}>()

const emits = defineEmits<CheckboxRootEmits>()

const delegatedProps = computed(() => {
  const { class: _, ...delegated } = props
  return delegated
})
</script>

<template>
  <CheckboxRoot
    v-bind="delegatedProps"
    :class="cn(
      'peer h-4 w-4 shrink-0 rounded-[5px] border border-input bg-field shadow-sm transition-colors ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground data-[state=indeterminate]:border-primary data-[state=indeterminate]:bg-primary data-[state=indeterminate]:text-primary-foreground',
      props.class,
    )"
    @update:checked="emits('update:checked', $event)"
  >
    <CheckboxIndicator class="flex items-center justify-center text-current">
      <Check class="h-3.5 w-3.5" stroke-width="3" />
    </CheckboxIndicator>
  </CheckboxRoot>
</template>
