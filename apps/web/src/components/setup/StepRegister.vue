<script setup lang="ts">
import { ref, reactive } from 'vue';
import api from '@/lib/axios';
import { useSetupStore } from '@/stores/setup';
import { setupRegisterSchema } from '@dmhub/shared';
import { Loader2, Eye, EyeOff } from 'lucide-vue-next';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

const emit = defineEmits<{
  next: [];
  back: [];
}>();

const store = useSetupStore();

const form = reactive({
  username: '',
  password: '',
  confirmPassword: '',
});

const errors = ref<Record<string, string>>({});
const saving = ref(false);
const showPassword = ref(false);
const showConfirmPassword = ref(false);

async function saveAndNext() {
  errors.value = {};
  const result = setupRegisterSchema.safeParse(form);
  if (!result.success) {
    for (const issue of result.error.issues) {
      const key = issue.path.join('.');
      if (!errors.value[key]) errors.value[key] = issue.message;
    }
    return;
  }

  saving.value = true;
  try {
    await api.post('/setup/register', form);
    store.adminRegistered = true;
    // 管理员创建后系统即可使用；后续站点 URL / SMTP 为可选
    store.initialized = true;
    emit('next');
  } catch (e: unknown) {
    const err = e as { response?: { data?: { message?: string; error?: string } } };
    const msg = err.response?.data?.error || err.response?.data?.message || '注册失败';
    errors.value._form = typeof msg === 'string' ? msg : '注册失败';
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="space-y-6">
    <div>
      <h2 class="text-xl font-semibold tracking-tight">注册管理员</h2>
      <p class="text-sm text-muted-foreground mt-1">创建系统管理员账户</p>
    </div>

    <div v-if="errors._form" class="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
      {{ errors._form }}
    </div>

    <div class="space-y-4">
      <div class="space-y-2">
        <Label>用户名</Label>
        <Input v-model="form.username" placeholder="admin" />
        <p v-if="errors.username" class="text-sm text-destructive">{{ errors.username }}</p>
      </div>

      <div class="space-y-2">
        <Label>密码</Label>
        <div class="relative">
          <Input
            :type="showPassword ? 'text' : 'password'"
            v-model="form.password"
            class="pr-10"
            placeholder="至少8个字符"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            class="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
            @click="showPassword = !showPassword"
          >
            <Eye v-if="!showPassword" class="h-4 w-4" />
            <EyeOff v-else class="h-4 w-4" />
          </Button>
        </div>
        <p v-if="errors.password" class="text-sm text-destructive">{{ errors.password }}</p>
      </div>

      <div class="space-y-2">
        <Label>确认密码</Label>
        <div class="relative">
          <Input
            :type="showConfirmPassword ? 'text' : 'password'"
            v-model="form.confirmPassword"
            class="pr-10"
            placeholder="再次输入密码"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            class="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
            @click="showConfirmPassword = !showConfirmPassword"
          >
            <Eye v-if="!showConfirmPassword" class="h-4 w-4" />
            <EyeOff v-else class="h-4 w-4" />
          </Button>
        </div>
        <p v-if="errors.confirmPassword" class="text-sm text-destructive">{{ errors.confirmPassword }}</p>
      </div>
    </div>

    <div class="flex justify-between pt-4 border-t">
      <Button variant="outline" @click="emit('back')">
        上一步
      </Button>
      <Button @click="saveAndNext" :disabled="saving">
        <Loader2 v-if="saving" class="mr-2 h-4 w-4 animate-spin" />
        {{ saving ? '注册中...' : '注册并继续' }}
      </Button>
    </div>
  </div>
</template>
