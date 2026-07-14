<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';

export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'default' | 'danger' | 'warning';
}

const visible = ref(false);
const options = ref<ConfirmOptions>({ message: '' });
let resolveFn: ((value: boolean) => void) | null = null;

function open(opts: ConfirmOptions): Promise<boolean> {
  options.value = opts;
  visible.value = true;
  return new Promise((resolve) => {
    resolveFn = resolve;
  });
}

function handleConfirm() {
  visible.value = false;
  resolveFn?.(true);
  resolveFn = null;
}

function handleCancel() {
  visible.value = false;
  resolveFn?.(false);
  resolveFn = null;
}

function handleKeydown(e: KeyboardEvent) {
  if (!visible.value) return;
  if (e.key === 'Escape') handleCancel();
  if (e.key === 'Enter') handleConfirm();
}

onMounted(() => window.addEventListener('keydown', handleKeydown));
onUnmounted(() => window.removeEventListener('keydown', handleKeydown));

defineExpose({ open });
</script>

<template>
  <Teleport to="body">
    <Transition name="confirm-fade">
      <div v-if="visible" class="confirm-overlay" @click.self="handleCancel">
        <div class="confirm-dialog" :class="options.type || 'default'">
          <div class="confirm-header">
            <h3>{{ options.title || '确认操作' }}</h3>
          </div>
          <div class="confirm-body">
            <p>{{ options.message }}</p>
          </div>
          <div class="confirm-footer">
            <button class="btn-cancel" @click="handleCancel">
              {{ options.cancelText || '取消' }}
            </button>
            <button
              class="btn-confirm"
              :class="options.type || 'default'"
              @click="handleConfirm"
            >
              {{ options.confirmText || '确认' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.confirm-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.confirm-dialog {
  background: var(--color-background, #fff);
  border-radius: 12px;
  max-width: 420px;
  width: 90%;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15);
  overflow: hidden;
}

.confirm-header h3 {
  margin: 0;
  padding: 20px 24px 0;
  font-size: 18px;
  font-weight: 600;
}

.confirm-body {
  padding: 12px 24px 24px;
}

.confirm-body p {
  margin: 0;
  font-size: 14px;
  line-height: 1.6;
  color: var(--color-text-secondary, #666);
}

.confirm-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 0 24px 20px;
}

.btn-cancel,
.btn-confirm {
  padding: 8px 20px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all 0.2s;
}

.btn-cancel {
  background: transparent;
  border-color: var(--color-border, #e2e8f0);
  color: var(--color-text, #333);
}

.btn-cancel:hover {
  background: var(--color-background-hover, #f8fafc);
}

.btn-confirm {
  background: #3b82f6;
  color: #fff;
}

.btn-confirm:hover {
  background: #2563eb;
}

.btn-confirm.danger {
  background: #ef4444;
}

.btn-confirm.danger:hover {
  background: #dc2626;
}

.btn-confirm.warning {
  background: #f59e0b;
}

.btn-confirm.warning:hover {
  background: #d97706;
}

.confirm-fade-enter-active,
.confirm-fade-leave-active {
  transition: opacity 0.2s ease;
}

.confirm-fade-enter-from,
.confirm-fade-leave-to {
  opacity: 0;
}
</style>
