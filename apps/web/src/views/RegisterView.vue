<template>
  <div class="flex min-h-screen flex-col items-center justify-center bg-background px-6 py-6 md:py-8">
    <router-link to="/" class="mb-6 flex items-center gap-2.5">
      <BrandMark class="h-8 w-8" />
      <span class="text-sm font-semibold tracking-tight">DMHub</span>
    </router-link>
    <Card class="w-full max-w-sm animate-scale-in">
      <CardHeader class="text-center">
        <CardTitle class="text-2xl font-bold">DMHub</CardTitle>
        <CardDescription>创建新账户</CardDescription>
      </CardHeader>

      <CardContent>
        <div v-if="!registrationEnabled" class="py-8 text-center">
          <p class="text-lg font-medium text-foreground mb-2">注册已关闭</p>
          <p class="text-sm text-muted-foreground">管理员已关闭新用户注册</p>
          <router-link to="/login" class="mt-4 inline-block text-sm text-primary hover:underline">返回登录</router-link>
        </div>
        <form v-else class="space-y-4" @submit.prevent="handleRegister">
          <div class="space-y-2">
            <Label for="username">用户名</Label>
            <Input
              id="username"
              v-model="form.username"
              type="text"
              autocomplete="username"
              placeholder="字母、数字、下划线和连字符"
            />
          </div>

          <div class="space-y-2">
            <Label for="email">邮箱</Label>
            <Input
              id="email"
              v-model="form.email"
              type="email"
              autocomplete="email"
              placeholder="可选"
            />
          </div>

          <div class="space-y-2">
            <Label for="password">密码</Label>
            <div class="relative">
              <Input
                id="password"
                v-model="form.password"
                :type="showPassword ? 'text' : 'password'"
                autocomplete="new-password"
                placeholder="至少8个字符"
                class="pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                class="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                @click="showPassword = !showPassword"
              >
                <Eye v-if="!showPassword" class="h-4 w-4 text-muted-foreground" />
                <EyeOff v-else class="h-4 w-4 text-muted-foreground" />
              </Button>
            </div>
          </div>

          <div class="space-y-2">
            <Label for="confirmPassword">确认密码</Label>
            <div class="relative">
              <Input
                id="confirmPassword"
                v-model="form.confirmPassword"
                :type="showConfirmPassword ? 'text' : 'password'"
                autocomplete="new-password"
                placeholder="再次输入密码"
                class="pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                class="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                @click="showConfirmPassword = !showConfirmPassword"
              >
                <Eye v-if="!showConfirmPassword" class="h-4 w-4 text-muted-foreground" />
                <EyeOff v-else class="h-4 w-4 text-muted-foreground" />
              </Button>
            </div>
          </div>

          <div v-if="inviteCodeEnabled" class="space-y-2">
            <Label for="inviteCode">邀请码</Label>
            <Input
              id="inviteCode"
              v-model="form.inviteCode"
              type="text"
              placeholder="请输入邀请码"
            />
          </div>

          <p v-if="error" class="text-sm text-destructive">{{ error }}</p>

          <Button type="submit" :disabled="loading" class="w-full">
            <Loader2 v-if="loading" class="mr-2 h-4 w-4 animate-spin" />
            {{ loading ? '注册中...' : '注册' }}
          </Button>
        </form>
      </CardContent>      <CardFooter class="flex flex-col gap-4">
        <p class="text-center text-sm text-muted-foreground">
          已有账户？
          <router-link to="/login" class="font-medium text-primary hover:underline">登录</router-link>
        </p>

        <template v-if="oauthProviders.length > 0">
          <Separator />
          <div class="flex justify-center gap-3">
            <Button
              v-for="provider in oauthProviders"
              :key="provider.providerId"
              variant="outline"
              as="a"
              :href="`/api/auth/oauth/${provider.providerId}/authorize`"
            >
              <svg v-if="provider.providerId === 'github'" class="mr-2 h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
              <span v-else class="mr-2 h-4 w-4 rounded-full bg-muted"></span>
              {{ provider.name }}
            </Button>
          </div>
        </template>
        <div v-else-if="!oauthLoading" class="opacity-50">
          <Separator />
          <p class="pt-2 text-center text-sm text-muted-foreground">OIDC/OAuth2 未配置</p>
        </div>
        <div v-else class="flex justify-center">
          <Loader2 class="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      </CardFooter>
    </Card>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useOAuthStore } from '@/stores/oauth';
import api from '@/lib/axios';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import BrandMark from '@/components/BrandMark.vue';
import { Loader2, Eye, EyeOff } from 'lucide-vue-next';

const router = useRouter();
const authStore = useAuthStore();
const oauthStore = useOAuthStore();

const form = reactive({
  username: '',
  email: '',
  password: '',
  confirmPassword: '',
  inviteCode: '',
});
const loading = ref(false);
const error = ref('');
const showPassword = ref(false);
const showConfirmPassword = ref(false);
const oauthLoading = ref(true);
const oauthProviders = ref<{ providerId: string; name: string; type: string }[]>([]);
const inviteCodeEnabled = ref(true);
const registrationEnabled = ref(true);

onMounted(async () => {
  try {
    await oauthStore.fetchProviders();
    oauthProviders.value = oauthStore.providers;
  } catch {} finally {
    oauthLoading.value = false;
  }
  try {
    const { data } = await api.get('/public/landing');
    inviteCodeEnabled.value = data.inviteCodeEnabled ?? true;
    registrationEnabled.value = data.registrationEnabled ?? true;
  } catch {}
});

async function handleRegister() {
  error.value = '';
  if (!form.username || !form.password || !form.confirmPassword || (inviteCodeEnabled.value && !form.inviteCode)) {
    error.value = '请填写所有必填项';
    return;
  }
  if (form.password !== form.confirmPassword) {
    error.value = '两次输入的密码不一致';
    return;
  }
  loading.value = true;
  try {
    await authStore.register(form);
    router.push({ path: '/login', query: { registered: '1' } });
  } catch (err: any) {
    const respError = err.response?.data?.error;
    if (typeof respError === 'object') {
      const messages = Object.values(respError).flat().join('; ');
      error.value = messages || '注册失败';
    } else {
      error.value = respError || '注册失败';
    }
  } finally {
    loading.value = false;
  }
}
</script>
