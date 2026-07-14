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
            <p class="mt-2 text-sm text-muted-foreground">拖拽CSV文件到此处，或点击选择文件</p>
            <p v-if="domainFile" class="mt-1 text-sm font-medium">{{ domainFile.name }}</p>
          </CardContent>
        </Card>
        <input ref="domainFileInput" type="file" accept=".csv" class="hidden" @change="handleDomainFileSelect" />

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
            <p class="mt-2 text-sm text-muted-foreground">拖拽CSV文件到此处，或点击选择文件</p>
            <p v-if="recordFile" class="mt-1 text-sm font-medium">{{ recordFile.name }}</p>
          </CardContent>
        </Card>
        <input ref="recordFileInput" type="file" accept=".csv" class="hidden" @change="handleRecordFileSelect" />

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

const importStore = useImportStore();

const activeTab = ref<'domains' | 'records'>('domains');
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
  const result = await importStore.importDomainsCsv(domainFile.value);
  domainResult.value = result;
}

async function importRecords() {
  if (!recordFile.value || selectedDomainId.value === 'none') return;
  const result = await importStore.importRecordsCsv(selectedDomainId.value, recordFile.value);
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
</script>
