<template>
  <Card class="border-blue-500/30 bg-blue-500/10">
    <CardHeader>
      <div class="flex items-center gap-2">
        <Info class="h-5 w-5 text-blue-600 dark:text-blue-400" />
        <CardTitle class="text-sm text-blue-700 dark:text-blue-300">如何获取 Cloudflare API Token</CardTitle>
      </div>
    </CardHeader>
    <CardContent class="space-y-3">
      <ol class="text-sm text-blue-700 dark:text-blue-300 space-y-2 list-decimal list-inside">
        <li>登录 <a href="https://dash.cloudflare.com/profile/api-tokens" target="_blank" rel="noopener" class="underline hover:text-blue-400 dark:text-blue-400">Cloudflare Dashboard</a></li>
        <li>点击 <strong>"Create Token"</strong></li>
        <li>选择 <strong>"Edit zone DNS"</strong> 模板（推荐），或自定义权限</li>
        <li>在 Zone Resources 中选择 <strong>"All zones"</strong> 或指定域名</li>
        <li>点击 <strong>"Continue to summary"</strong>，然后 <strong>"Create Token"</strong></li>
        <li>复制生成的 Token（仅显示一次，请妥善保存）</li>
      </ol>
      <div class="flex gap-1.5">
        <Badge v-for="i in 6" :key="i" variant="secondary" class="bg-blue-500/15 text-blue-700 dark:text-blue-300">步骤 {{ i }}</Badge>
      </div>
      <p class="text-xs text-blue-600 dark:text-blue-400">Token 权限建议：Zone - DNS - Edit，Zone - Zone - Read</p>
    </CardContent>
  </Card>
</template>

<script setup lang="ts">
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Info } from 'lucide-vue-next';
</script>
