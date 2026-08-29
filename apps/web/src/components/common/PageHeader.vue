<script setup lang="ts">
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-vue-next'
import { useRouter } from 'vue-router'

const props = withDefaults(defineProps<{
  title: string
  description?: string
  backTo?: string
  showBack?: boolean
}>(), {
  showBack: false,
})

const router = useRouter()

function goBack() {
  if (props.backTo) {
    router.push(props.backTo)
  } else {
    router.back()
  }
}
</script>

<template>
  <div class="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
    <div class="flex min-w-0 items-start gap-2">
      <Button
        v-if="showBack || backTo"
        variant="ghost"
        size="icon"
        class="mt-0.5 shrink-0"
        @click="goBack"
      >
        <ArrowLeft class="h-5 w-5" />
      </Button>
      <div class="min-w-0">
        <h1 class="truncate text-xl font-bold tracking-tight text-foreground md:text-2xl">
          {{ title }}
        </h1>
        <p v-if="description" class="mt-1 text-sm text-muted-foreground">
          {{ description }}
        </p>
        <slot name="meta" />
      </div>
    </div>
    <div v-if="$slots.actions" class="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
      <slot name="actions" />
    </div>
  </div>
</template>
