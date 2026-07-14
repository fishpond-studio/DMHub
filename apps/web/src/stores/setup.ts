import { defineStore } from 'pinia';
import { ref } from 'vue';
import api from '@/lib/axios';

export const useSetupStore = defineStore('setup', () => {
  const currentStep = ref(0);
  const dbConfigured = ref(false);
  const tablesMigrated = ref(false);
  const adminRegistered = ref(false);
  const siteUrlConfigured = ref(false);
  const smtpConfigured = ref(false);
  const initialized = ref(false);
  const loading = ref(true);

  async function fetchStatus() {
    try {
      const { data } = await api.get('/setup/status');
      dbConfigured.value = data.dbConfigured ?? false;
      tablesMigrated.value = data.tablesMigrated ?? false;
      adminRegistered.value = data.adminRegistered ?? false;
      siteUrlConfigured.value = data.siteUrlConfigured ?? false;
      smtpConfigured.value = data.smtpConfigured ?? false;
      initialized.value = data.initialized ?? false;

      if (initialized.value) return;
      if (!dbConfigured.value) currentStep.value = 0;
      else if (!tablesMigrated.value) currentStep.value = 1;
      else if (!adminRegistered.value) currentStep.value = 2;
      else if (!siteUrlConfigured.value) currentStep.value = 3;
      else if (!smtpConfigured.value) currentStep.value = 4;
      else currentStep.value = 5;
    } catch {
      currentStep.value = 0;
    } finally {
      loading.value = false;
    }
  }

  const siteUrlSkipped = ref(false);
  const smtpSkipped = ref(false);

  function skipStep() {
    if (currentStep.value === 3) siteUrlSkipped.value = true;
    if (currentStep.value === 4) smtpSkipped.value = true;
    if (currentStep.value < 5) currentStep.value++;
  }

  function isStepSkipped(index: number): boolean {
    if (index === 3) return siteUrlSkipped.value;
    if (index === 4) return smtpSkipped.value;
    return false;
  }

  function nextStep() {
    if (currentStep.value < 5) currentStep.value++;
  }

  function prevStep() {
    if (currentStep.value > 0) currentStep.value--;
  }

  return {
    currentStep,
    dbConfigured,
    tablesMigrated,
    adminRegistered,
    siteUrlConfigured,
    smtpConfigured,
    initialized,
    loading,
    siteUrlSkipped,
    smtpSkipped,
    isStepSkipped,
    fetchStatus,
    nextStep,
    skipStep,
    prevStep,
  };
});
