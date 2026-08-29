import { defineStore } from 'pinia';
import { ref } from 'vue';
import api from '@/lib/axios';

async function syncRouterInitialized(value: boolean) {
  try {
    const { setInitialized } = await import('@/router');
    setInitialized(value);
  } catch {
    // ignore
  }
}

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
      // 兼容旧后端：有管理员或已初始化时视为表已建
      tablesMigrated.value =
        data.tablesMigrated ?? data.adminRegistered ?? data.initialized ?? false;
      adminRegistered.value = data.adminRegistered ?? false;
      siteUrlConfigured.value = data.siteUrlConfigured ?? false;
      smtpConfigured.value = data.smtpConfigured ?? false;
      initialized.value = !!(data.initialized || data.adminRegistered);

      if (initialized.value) {
        await syncRouterInitialized(true);
        // 已安装：由路由守卫离开 /setup
        return;
      }
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
  const emailSkipped = ref(false);

  function skipStep() {
    if (currentStep.value === 3) siteUrlSkipped.value = true;
    if (currentStep.value === 4) smtpSkipped.value = true;
    if (currentStep.value === 5) emailSkipped.value = true;
    if (currentStep.value < 5) currentStep.value++;
  }

  function isStepSkipped(index: number): boolean {
    if (index === 3) return siteUrlSkipped.value;
    if (index === 4) return smtpSkipped.value;
    if (index === 5) return emailSkipped.value;
    return false;
  }

  function nextStep() {
    if (currentStep.value < 5) currentStep.value++;
  }

  function prevStep() {
    if (currentStep.value > 0) currentStep.value--;
  }

  /** 完成引导：通知后端并更新路由状态 */
  async function finishSetup() {
    try {
      await api.post('/setup/complete');
    } catch {
      // 管理员已存在时后端可能已判定 initialized，忽略错误
    }
    initialized.value = true;
    await syncRouterInitialized(true);
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
    emailSkipped,
    isStepSkipped,
    fetchStatus,
    nextStep,
    skipStep,
    prevStep,
    finishSetup,
  };
});
