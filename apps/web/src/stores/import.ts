import { defineStore } from 'pinia';
import { ref } from 'vue';
import api from '@/lib/axios';

export interface ImportError {
  row: number;
  message: string;
}

export interface ImportResult {
  imported: number;
  skipped: number;
  errors: ImportError[];
}

export const useImportStore = defineStore('import', () => {
  const loading = ref(false);
  const result = ref<ImportResult | null>(null);

  async function importDomainsCsv(file: File): Promise<ImportResult> {
    loading.value = true;
    result.value = null;
    try {
      const formData = new FormData();
      formData.append('file', file);
      const { data } = await api.post('/import/domains/csv', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      result.value = data;
      return data;
    } finally {
      loading.value = false;
    }
  }

  async function importRecordsCsv(domainId: string, file: File): Promise<ImportResult> {
    loading.value = true;
    result.value = null;
    try {
      const formData = new FormData();
      formData.append('file', file);
      const { data } = await api.post(`/import/records/csv?domainId=${domainId}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      result.value = data;
      return data;
    } finally {
      loading.value = false;
    }
  }

  async function importDomainsExcel(file: File): Promise<ImportResult> {
    loading.value = true;
    result.value = null;
    try {
      const formData = new FormData();
      formData.append('file', file);
      const { data } = await api.post('/import/domains/excel', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      result.value = data;
      return data;
    } finally {
      loading.value = false;
    }
  }

  async function importRecordsExcel(domainId: string, file: File): Promise<ImportResult> {
    loading.value = true;
    result.value = null;
    try {
      const formData = new FormData();
      formData.append('file', file);
      const { data } = await api.post(`/import/records/excel?domainId=${domainId}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      result.value = data;
      return data;
    } finally {
      loading.value = false;
    }
  }

  function downloadTemplate(type: 'domains' | 'records') {
    window.open(`/api/import/template/${type}`, '_blank');
  }

  return { loading, result, importDomainsCsv, importRecordsCsv, importDomainsExcel, importRecordsExcel, downloadTemplate };
});
