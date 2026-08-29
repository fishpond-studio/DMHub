<template>
  <div class="min-h-screen bg-background">
    <div class="max-w-5xl mx-auto px-4 py-8">
      <div class="flex items-center mb-6">
        <Button variant="ghost" size="icon" @click="$router.push('/dashboard')">
          <ArrowLeft class="h-5 w-5" />
        </Button>
        <h1 class="text-2xl font-bold text-foreground">批量导入</h1>
      </div>

      <Tabs v-model="activeTab" class="mb-6">
        <TabsList>
          <TabsTrigger value="domains">导入域名</TabsTrigger>
          <TabsTrigger value="records">导入记录</TabsTrigger>
          <TabsTrigger value="backup">数据备份</TabsTrigger>
        </TabsList>
      </Tabs>

      <TabsContent value="domains" class="space-y-4">
        <div class="flex items-center gap-3 mb-2">
          <a href="javascript:void(0)" @click="downloadDomainTemplate" class="text-sm text-primary hover:underline">下载域名导入模板</a>
        </div>

        <Card
          @dragover.prevent="dragOver = true"
          @dragleave="dragOver = false"
          @drop.prevent="handleDomainDrop"
          :class="dragOver ? 'border-primary bg-primary/5' : ''"
          class="border-2 border-dashed cursor-pointer transition-colors"
          @click="domainFileInput?.click()"
        >
          <CardContent class="p-8 text-center">
            <Upload class="mx-auto h-12 w-12 text-muted-foreground" />
            <p class="mt-2 text-sm text-muted-foreground">拖拽 CSV / Excel 文件到此处，或点击选择文件</p>
            <p v-if="domainFile" class="mt-1 text-sm font-medium">{{ domainFile.name }}</p>
          </CardContent>
        </Card>
        <input ref="domainFileInput" type="file" accept=".csv,.xlsx" class="hidden" @change="handleDomainFileSelect" />

        <div v-if="domainFile" class="flex gap-3">
          <Button
            @click="importDomains"
            :disabled="importStore.loading"
          >
            {{ importStore.loading ? '导入中...' : '开始导入' }}
          </Button>
          <Button @click="domainFile = null" variant="outline">取消</Button>
        </div>

        <ImportResult v-if="domainResult" :result="domainResult" />
      </TabsContent>

      <TabsContent value="records" class="space-y-4">
        <div class="flex items-center gap-3 mb-2">
          <a href="javascript:void(0)" @click="downloadRecordTemplate" class="text-sm text-primary hover:underline">下载记录导入模板</a>
        </div>

        <div>
          <Label class="mb-1">选择域名</Label>
          <Select v-model="selectedDomainId">
            <SelectTrigger class="max-w-md">
              <SelectValue placeholder="请选择域名" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">请选择域名</SelectItem>
              <SelectItem v-for="d in domains" :key="d.id" :value="d.id">{{ d.name }}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Card
          @dragover.prevent="recordDragOver = true"
          @dragleave="recordDragOver = false"
          @drop.prevent="handleRecordDrop"
          :class="recordDragOver ? 'border-primary bg-primary/5' : ''"
          class="border-2 border-dashed cursor-pointer transition-colors"
          @click="recordFileInput?.click()"
        >
          <CardContent class="p-8 text-center">
            <Upload class="mx-auto h-12 w-12 text-muted-foreground" />
            <p class="mt-2 text-sm text-muted-foreground">拖拽 CSV / Excel 文件到此处，或点击选择文件</p>
            <p v-if="recordFile" class="mt-1 text-sm font-medium">{{ recordFile.name }}</p>
          </CardContent>
        </Card>
        <input ref="recordFileInput" type="file" accept=".csv,.xlsx" class="hidden" @change="handleRecordFileSelect" />

        <div v-if="recordFile" class="flex gap-3">
          <Button
            @click="importRecords"
            :disabled="importStore.loading || selectedDomainId === 'none'"
          >
            {{ importStore.loading ? '导入中...' : '开始导入' }}
          </Button>
          <Button @click="recordFile = null" variant="outline">取消</Button>
        </div>

        <p v-if="selectedDomainId === 'none' && recordFile" class="text-sm text-amber-600">请先选择要导入记录的域名</p>

        <ImportResult v-if="recordResult" :result="recordResult" />
      </TabsContent>

      <TabsContent value="backup" class="space-y-4">
        <Card>
          <CardContent class="p-6 space-y-4">
            <div>
              <h3 class="text-sm font-medium">导出完整备份</h3>
              <p class="text-xs text-muted-foreground mt-1">将所有域名与解析记录导出为 JSON 文件（不含服务商凭据）</p>
              <Button class="mt-3" @click="exportBackup" :disabled="backupLoading">
                {{ backupLoading ? '导出中...' : '导出备份' }}
              </Button>
            </div>
            <div class="border-t pt-4">
              <h3 class="text-sm font-medium">恢复备份</h3>
              <p class="text-xs text-muted-foreground mt-1">从 JSON 备份文件恢复域名与记录（已存在的同名域名/记录将跳过）</p>
              <div class="mt-3 flex items-center gap-3">
                <input ref="backupFileInput" type="file" accept=".json" class="text-sm" @change="handleBackupFileSelect" />
                <Button @click="importBackup" :disabled="!backupFile || backupLoading">
                  {{ backupLoading ? '恢复中...' : '恢复备份' }}
                </Button>
              </div>
              <div v-if="backupResult" class="mt-3 rounded-md border p-3 text-sm">
                <p>导入域名：{{ backupResult.domainsImported }}（跳过 {{ backupResult.domainsSkipped }}）</p>
                <p>导入记录：{{ backupResult.recordsImported }}（跳过 {{ backupResult.recordsSkipped }}）</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </TabsContent>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useImportStore } from '@/stores/import';
import type { ImportResult as ImportResultType } from '@/stores/import';
import api from '@/lib/axios';
import ImportResult from '@/components/import/ImportResult.vue';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ArrowLeft, Upload } from 'lucide-vue-next';
import { toastSuccess, toastError } from '@/lib/toast-helpers';

const importStore = useImportStore();

const activeTab = ref<'domains' | 'records' | 'backup'>('domains');
const domains = ref<{ id: string; name: string }[]>([]);

const domainFile = ref<File | null>(null);
const recordFile = ref<File | null>(null);
const selectedDomainId = ref('none');
const dragOver = ref(false);
const recordDragOver = ref(false);

const domainResult = ref<ImportResultType | null>(null);
const recordResult = ref<ImportResultType | null>(null);

const domainFileInput = ref<HTMLInputElement | null>(null);
const recordFileInput = ref<HTMLInputElement | null>(null);

function handleDomainFileSelect(e: Event) {
  const input = e.target as HTMLInputElement;
  domainFile.value = input.files?.[0] ?? null;
  domainResult.value = null;
}

function handleDomainDrop(e: DragEvent) {
  dragOver.value = false;
  domainFile.value = e.dataTransfer?.files?.[0] ?? null;
  domainResult.value = null;
}

function handleRecordFileSelect(e: Event) {
  const input = e.target as HTMLInputElement;
  recordFile.value = input.files?.[0] ?? null;
  recordResult.value = null;
}

function handleRecordDrop(e: DragEvent) {
  recordDragOver.value = false;
  recordFile.value = e.dataTransfer?.files?.[0] ?? null;
  recordResult.value = null;
}

async function importDomains() {
  if (!domainFile.value) return;
  const isExcel = domainFile.value.name.toLowerCase().endsWith('.xlsx');
  const result = isExcel
    ? await importStore.importDomainsExcel(domainFile.value)
    : await importStore.importDomainsCsv(domainFile.value);
  domainResult.value = result;
}

async function importRecords() {
  if (!recordFile.value || selectedDomainId.value === 'none') return;
  const isExcel = recordFile.value.name.toLowerCase().endsWith('.xlsx');
  const result = isExcel
    ? await importStore.importRecordsExcel(selectedDomainId.value, recordFile.value)
    : await importStore.importRecordsCsv(selectedDomainId.value, recordFile.value);
  recordResult.value = result;
}

async function downloadDomainTemplate() {
  try {
    const response = await api.get('/import/template/domains', { responseType: 'blob' });
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'domains_template.csv';
    link.click();
    window.URL.revokeObjectURL(url);
  } catch {}
}

async function downloadRecordTemplate() {
  try {
    const response = await api.get('/import/template/records', { responseType: 'blob' });
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'records_template.csv';
    link.click();
    window.URL.revokeObjectURL(url);
  } catch {}
}

onMounted(async () => {
  try {
    const { data } = await api.get('/domains');
    domains.value = data.domains;
  } catch {}
});

// 数据备份
const backupFileInput = ref<HTMLInputElement | null>(null);
const backupFile = ref<File | null>(null);
const backupLoading = ref(false);
const backupResult = ref<{ domainsImported: number; domainsSkipped: number; recordsImported: number; recordsSkipped: number } | null>(null);

function handleBackupFileSelect(e: Event) {
  const input = e.target as HTMLInputElement;
  backupFile.value = input.files?.[0] ?? null;
  backupResult.value = null;
}

async function exportBackup() {
  backupLoading.value = true;
  try {
    const response = await api.get('/backup/export', { responseType: 'blob' });
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.download = `dmhub-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    window.URL.revokeObjectURL(url);
    toastSuccess('备份已导出');
  } catch (err: any) {
    toastError('导出失败', err.response?.data?.error || err.message);
  } finally {
    backupLoading.value = false;
  }
}

async function importBackup() {
  if (!backupFile.value) return;
  backupLoading.value = true;
  try {
    const formData = new FormData();
    formData.append('file', backupFile.value);
    const { data } = await api.post('/backup/import', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
    backupResult.value = data;
    toastSuccess('备份已恢复');
  } catch (err: any) {
    toastError('恢复失败', err.response?.data?.error || err.message);
  } finally {
    backupLoading.value = false;
  }
}
</script>
