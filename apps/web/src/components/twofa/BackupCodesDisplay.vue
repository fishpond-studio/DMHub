<template>
  <div class="space-y-6">
    <Card>
      <CardHeader>
        <CardTitle>备用验证码</CardTitle>
        <CardDescription class="text-warning">请妥善保存这些备用验证码，它们只会显示一次。每个备用码只能使用一次。</CardDescription>
      </CardHeader>
      <CardContent>
        <div class="grid grid-cols-2 gap-2 mb-4">
          <div
            v-for="(code, i) in codes"
            :key="i"
            class="flex items-center justify-center rounded-md bg-muted border px-3 py-2"
          >
            <code class="font-record tracking-wider select-all">{{ code }}</code>
          </div>
        </div>

        <div class="flex space-x-3">
          <Button
            @click="handleCopy"
            variant="outline"
            class="flex-1"
          >
            {{ copied ? '已复制' : '复制全部' }}
          </Button>
          <Button
            @click="$emit('done')"
            class="flex-1"
          >
            已保存，继续
          </Button>
        </div>
      </CardContent>
    </Card>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const props = defineProps<{
  codes: string[];
}>();

defineEmits<{
  done: [];
}>();

const copied = ref(false);

async function handleCopy() {
  const text = props.codes.map((c, i) => `${i + 1}. ${c}`).join('\n');
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const input = document.createElement('textarea');
    input.value = text;
    document.body.appendChild(input);
    input.select();
    document.execCommand('copy');
    document.body.removeChild(input);
  }
  copied.value = true;
  setTimeout(() => { copied.value = false; }, 2000);
}
</script>
