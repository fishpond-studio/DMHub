<template>
  <div class="flex min-h-screen items-center justify-center bg-background px-4">
    <Card class="w-full max-w-sm animate-scale-in">
      <CardHeader class="text-center">
        <CardTitle class="text-2xl font-bold">DMHub</CardTitle>
        <CardDescription>登录到您的账户</CardDescription>
      </CardHeader>

      <CardContent>
        <form class="space-y-4" @submit.prevent="handleLogin">
          <div class="space-y-2">
            <Label for="username">用户名 / 邮箱</Label>
            <Input
              id="username"
              v-model="form.username"
              type="text"
              autocomplete="username"
              placeholder="请输入用户名或邮箱"
            />
          </div>

          <div class="space-y-2">
            <Label for="password">密码</Label>
            <div class="relative">
              <Input
                id="password"
                v-model="form.password"
                :type="showPassword ? 'text' : 'password'"
                autocomplete="current-password"
                placeholder="请输入密码"
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

          <div class="flex items-center space-x-2">
            <Checkbox id="rememberMe" :checked="form.rememberMe" @update:checked="form.rememberMe = $event" />
            <Label for="rememberMe" class="text-sm cursor-pointer">记住我</Label>
          </div>

          <div v-if="registered" class="rounded-md bg-primary/10 p-3 text-sm text-primary">注册成功，请登录</div>

          <p v-if="error" class="text-sm text-destructive">{{ error }}</p>

          <Button type="submit" :disabled="loading" class="w-full">
            <Loader2 v-if="loading" class="mr-2 h-4 w-4 animate-spin" />
            {{ loading ? '登录中...' : '登录' }}
          </Button>
        </form>
      </CardContent>

      <CardFooter class="flex flex-col gap-4">
        <div v-if="announcement" class="w-full rounded-md border bg-muted/50 p-3 text-sm text-muted-foreground" v-html="announcementHtml" />

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

        <p v-if="registrationEnabled" class="text-center text-sm text-muted-foreground">
          没有账户？
          <router-link to="/register" class="font-medium text-primary hover:underline">注册</router-link>
        </p>
      </CardFooter>
    </Card>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, computed } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useOAuthStore } from '@/stores/oauth';
import api from '@/lib/axios';
import { marked } from 'marked';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Eye, EyeOff } from 'lucide-vue-next';

function sanitizeHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<script[\s\S]*?\/>/gi, '')
    .replace(/\bon\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/\bon\w+\s*=\s*'[^']*'/gi, '')
    .replace(/\bon\w+\s*=\s*[^\s>]+/gi, '')
    .replace(/javascript\s*:/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    .replace(/<iframe[\s\S]*?\/>/gi, '');
}

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();
const oauthStore = useOAuthStore();

const form = reactive({ username: '', password: '', rememberMe: false });
const loading = ref(false);
const error = ref('');
const showPassword = ref(false);
const registered = ref(!!route.query.registered);
const registrationEnabled = ref(true);
const oauthLoading = ref(true);
const oauthProviders = ref<{ providerId: string; name: string; type: string }[]>([]);
const announcement = ref('');
const announcementFormat = ref('markdown');

const announcementHtml = computed(() => {
  if (!announcement.value) return '';
  return announcementFormat.value === 'html'
    ? sanitizeHtml(announcement.value)
    : sanitizeHtml(marked(announcement.value) as string);
});

onMounted(async () => {
  if (registered.value) {
    setTimeout(() => { registered.value = false; }, 5000);
  }
  try {
    await oauthStore.fetchProviders();
    oauthProviders.value = oauthStore.providers;
  } catch {} finally {
    oauthLoading.value = false;
  }
  try {
    const { data } = await api.get('/public/landing');
    announcement.value = data.announcement || '';
    announcementFormat.value = data.announcementFormat || 'markdown';
    registrationEnabled.value = data.registrationEnabled ?? true;
  } catch {}
});

async function handleLogin() {
  error.value = '';
  if (!form.username || !form.password) {
    error.value = '请填写用户名和密码';
    return;
  }
  loading.value = true;
  try {
    const result = await authStore.login(form.username, form.password, form.rememberMe);
    if (result?.requires2FA) {
      router.push({ path: '/2fa/verify', query: { token: result.tempToken } });
    } else {
      router.push('/dashboard');
    }
  } catch (err: any) {
    error.value = err.response?.data?.error || '登录失败';
  } finally {
    loading.value = false;
  }
}
</script>
