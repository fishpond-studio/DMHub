<template>
  <Card>
    <CardHeader>
      <CardTitle class="text-base">导入结果</CardTitle>
    </CardHeader>
    <CardContent class="space-y-3">
      <div class="flex gap-6 text-sm">
        <span class="text-primary">成功导入: <strong>{{ result.imported }}</strong></span>
        <span class="text-amber-600">跳过重复: <strong>{{ result.skipped }}</strong></span>
        <span class="text-destructive">错误: <strong>{{ result.errors.length }}</strong></span>
      </div>
      <div v-if="result.errors.length > 0">
        <p class="text-sm font-medium text-destructive mb-2">错误详情:</p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>行号</TableHead>
              <TableHead>错误信息</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="(err, i) in result.errors" :key="i">
              <TableCell class="text-destructive">第 {{ err.row }} 行</TableCell>
              <TableCell class="text-destructive">{{ err.message }}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </CardContent>
  </Card>
</template>

<script setup lang="ts">
import type { ImportResult } from '@/stores/import';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';

defineProps<{ result: ImportResult }>();
</script>
