/**
 * useRequest — 请求竞态保护（AbortController）
 * 防止快速重复请求导致的数据竞态问题
 */
import { ref, shallowRef, onUnmounted, type Ref } from 'vue';

interface UseRequestResult<T> {
  loading: Ref<boolean>;
  error: Ref<string | null>;
  data: Readonly<Ref<T | null>>;
  execute: <R = T>(fn: (signal: AbortSignal) => Promise<R>) => Promise<R | null>;
  cancel: () => void;
}

export function useRequest<T = unknown>(): UseRequestResult<T> {
  const loading = ref(false);
  const error = ref<string | null>(null);
  const data = shallowRef<T | null>(null);
  let controller: AbortController | null = null;

  async function execute<R = T>(
    fn: (signal: AbortSignal) => Promise<R>,
  ): Promise<R | null> {
    // 取消上一次未完成的请求
    if (controller) {
      controller.abort();
    }

    controller = new AbortController();
    loading.value = true;
    error.value = null;

    try {
      const result = await fn(controller.signal);
      data.value = result as unknown as T;
      return result;
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return null;
      error.value = (err instanceof Error ? err.message : null) || '请求失败';
      throw err;
    } finally {
      if (controller?.signal.aborted === false) {
        loading.value = false;
      }
      controller = null;
    }
  }

  function cancel() {
    if (controller) {
      controller.abort();
      controller = null;
    }
    loading.value = false;
  }

  onUnmounted(() => cancel());

  return {
    loading,
    error,
    data,
    execute,
    cancel,
  };
}
