/**
 * Toast 通知工具 — 全局替换 window.alert()
 */
import { reactive } from 'vue';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
  timeout: number;
}

const toasts = reactive<ToastItem[]>([]);
let nextId = 0;

function show(type: ToastType, message: string, duration = 4000): number {
  const id = ++nextId;
  toasts.push({ id, type, message, timeout: duration });
  if (duration > 0) {
    setTimeout(() => remove(id), duration);
  }
  return id;
}

export function remove(id: number): void {
  const idx = toasts.findIndex((t) => t.id === id);
  if (idx >= 0) toasts.splice(idx, 1);
}

export function notifySuccess(message: string, duration?: number): number {
  return show('success', message, duration);
}

export function notifyError(message: string, duration?: number): number {
  return show('error', message, duration ?? 6000);
}

export function notifyWarning(message: string, duration?: number): number {
  return show('warning', message, duration);
}

export function notifyInfo(message: string, duration?: number): number {
  return show('info', message, duration);
}

/**
 * 兼容旧代码：替代 window.alert()
 */
export function alert(message: string): void {
  show('warning', message, 0);
}

export function useToasts() {
  return toasts;
}
