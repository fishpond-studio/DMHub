<template>
  <div class="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
    <!-- 品牌侧：窄屏隐藏，宽屏用来承载产品说明，避免登录卡片孤零零浮在大片空白里 -->
    <aside class="relative hidden overflow-hidden border-r bg-surface lg:flex lg:flex-col lg:justify-between lg:p-12">
      <div class="pointer-events-none absolute inset-0 bg-grid opacity-40" />
      <div class="pointer-events-none absolute inset-0 bg-glow" />

      <router-link to="/" class="relative flex items-center gap-3">
        <BrandMark class="h-9 w-9" />
        <span class="text-base font-semibold tracking-tight">{{ teamName }}</span>
      </router-link>

      <div class="relative max-w-md">
        <h1 class="text-[28px] font-semibold leading-snug tracking-tight">
          {{ t('brand.tagline') }}
        </h1>
        <ul class="mt-8 space-y-5">
          <li v-for="f in features" :key="f.title" class="flex gap-3">
            <span class="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <component :is="f.icon" class="h-4 w-4" />
            </span>
            <span class="min-w-0">
              <span class="block text-sm font-medium">{{ f.title }}</span>
              <span class="block text-[13px] text-muted-foreground">{{ f.desc }}</span>
            </span>
          </li>
        </ul>
      </div>

      <p class="relative text-xs text-muted-foreground">{{ teamName }}</p>
    </aside>

    <div class="flex min-h-screen flex-col px-5 py-6 sm:px-10">
      <div class="flex items-center justify-between">
        <router-link to="/" class="flex items-center gap-2.5 lg:invisible">
          <BrandMark class="h-8 w-8" />
          <span class="text-sm font-semibold tracking-tight">{{ teamName }}</span>
        </router-link>
        <LanguageSwitcher />
      </div>

      <div class="flex flex-1 items-center justify-center py-10">
        <div class="w-full max-w-[380px]">
          <div class="mb-8">
            <h2 class="text-xl font-semibold tracking-tight">{{ t('auth.welcomeBack') }}</h2>
            <p class="mt-1.5 text-sm text-muted-foreground">{{ t('auth.username') }} / {{ t('auth.password') }}</p>
          </div>

          <form class="space-y-4" @submit.prevent="handleLogin">
            <div class="space-y-2">
              <Label for="username">{{ t('auth.username') }} / {{ t('auth.email') }}</Label>
              <Input
                id="username"
                v-model="form.username"
                type="text"
                autocomplete="username"
                :placeholder="t('auth.username')"
              />
            </div>

            <div class="space-y-2">
              <Label for="password">{{ t('auth.password') }}</Label>
              <div class="relative">
                <Input
                  id="password"
                  v-model="form.password"
                  :type="showPassword ? 'text' : 'password'"
                  autocomplete="current-password"
                  :placeholder="t('auth.password')"
                  class="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  class="absolute right-0 top-0 h-full w-9 hover:bg-transparent"
                  @click="showPassword = !showPassword"
                >
                  <Eye v-if="!showPassword" class="h-4 w-4 text-muted-foreground" />
                  <EyeOff v-else class="h-4 w-4 text-muted-foreground" />
                </Button>
              </div>
            </div>

            <div class="flex items-center gap-2">
              <Checkbox id="rememberMe" :checked="form.rememberMe" @update:checked="form.rememberMe = $event" />
              <Label for="rememberMe" class="cursor-pointer text-sm font-normal">{{ t('auth.rememberMe') }}</Label>
            </div>

            <p v-if="registered" class="rounded-lg border border-success/25 bg-success/10 px-3 py-2 text-[13px] text-success">
              {{ t('auth.registerSuccess') }}
            </p>
            <p v-if="error" class="rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-2 text-[13px] text-destructive">
              {{ error }}
            </p>

            <Button type="submit" :disabled="loading" class="w-full">
              <Loader2 v-if="loading" class="mr-2 h-4 w-4 animate-spin" />
              {{ loading ? '...' : t('auth.login') }}
            </Button>
          </form>

          <template v-if="oauthProviders.length > 0">
            <div class="my-6 flex items-center gap-3">
              <Separator class="flex-1" />
              <span class="text-[11px] uppercase tracking-wider text-muted-foreground">OAuth</span>
              <Separator class="flex-1" />
            </div>
            <div class="space-y-2">
              <Button
                v-for="provider in oauthProviders"
                :key="provider.providerId"
                variant="outline"
                class="w-full justify-center"
                as="a"
                :href="`/api/auth/oauth/${provider.providerId}/authorize`"
              >
                <svg v-if="provider.providerId === 'github'" class="mr-2 h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
                <KeyRound v-else class="mr-2 h-4 w-4 text-muted-foreground" />
                {{ provider.name }}
              </Button>
            </div>
          </template>
          <p v-else-if="!oauthLoading" class="my-6 text-center text-[13px] text-muted-foreground">
            OIDC/OAuth2 未配置
          </p>

          <div v-if="announcement" class="mt-6 rounded-lg border border-dashed bg-muted/40 px-3 py-2.5 text-[13px] leading-relaxed text-muted-foreground" v-html="announcementHtml" />

          <p v-if="registrationEnabled" class="mt-6 text-center text-sm text-muted-foreground">
            {{ t('auth.noAccount') }}
            <router-link to="/register" class="font-medium text-primary hover:underline">{{ t('auth.register') }}</router-link>
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, computed } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '@/stores/auth';
import { useOAuthStore } from '@/stores/oauth';
import api from '@/lib/axios';
import { sanitizeHtml } from '@/lib/sanitize-html';
import { marked } from 'marked';
import LanguageSwitcher from '@/components/LanguageSwitcher.vue';
import BrandMark from '@/components/BrandMark.vue';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Eye, EyeOff, KeyRound, ShieldCheck, ScrollText, BellRing } from 'lucide-vue-next';

const router = useRouter();
const route = useRoute();
const { t } = useI18n();
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
// 团队名称来自落地页配置，登录页也显示团队自己的品牌而非固定的 DMHub
const teamName = ref('DMHub');

const features = computed(() => [
  { icon: ShieldCheck, title: t('brand.feature1'), desc: t('brand.feature1Desc') },
  { icon: ScrollText, title: t('brand.feature2'), desc: t('brand.feature2Desc') },
  { icon: BellRing, title: t('brand.feature3'), desc: t('brand.feature3Desc') },
]);

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
    if (data.name) teamName.value = data.name;
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
