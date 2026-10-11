<template>
  <div class="flex min-h-screen flex-col items-center justify-center bg-background px-6 py-6 md:py-8">
    <router-link to="/" class="mb-6 flex items-center gap-2.5">
      <BrandMark class="h-8 w-8" />
      <span class="text-sm font-semibold tracking-tight">DMHub</span>
    </router-link>
    <Card class="w-full max-w-sm animate-scale-in">
      <CardHeader class="text-center">
        <CardTitle class="text-2xl font-bold">DMHub</CardTitle>
        <CardDescription>{{ t('auth.createAccount') }}</CardDescription>
      </CardHeader>

      <CardContent>
        <div v-if="!registrationEnabled" class="py-8 text-center">
          <p class="text-lg font-medium text-foreground mb-2">{{ t('auth.registrationClosed') }}</p>
          <p class="text-sm text-muted-foreground">{{ t('auth.registrationClosedHint') }}</p>
          <router-link to="/login" class="mt-4 inline-block text-sm text-primary hover:underline">{{ t('auth.backToLogin') }}</router-link>
        </div>
        <form v-else class="space-y-4" @submit.prevent="handleRegister">
          <div class="space-y-2">
            <Label for="username">{{ t('auth.username') }} <span class="text-destructive">*</span></Label>
            <Input
              id="username"
              v-model="form.username"
              type="text"
              autocomplete="username"
              :placeholder="t('auth.usernamePlaceholder')"
            />
          </div>

          <div class="space-y-2">
            <Label for="email">{{ t('auth.email') }} <span class="text-destructive">*</span></Label>
            <Input
              id="email"
              v-model="form.email"
              type="email"
              autocomplete="email"
              :placeholder="t('auth.emailPlaceholder')"
            />
          </div>

          <div class="space-y-2">
            <Label for="password">{{ t('auth.password') }}</Label>
            <div class="relative">
              <Input
                id="password"
                v-model="form.password"
                :type="showPassword ? 'text' : 'password'"
                autocomplete="new-password"
                :placeholder="t('auth.passwordPlaceholder')"
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
            <Label for="confirmPassword">{{ t('auth.confirmPassword') }}</Label>
            <div class="relative">
              <Input
                id="confirmPassword"
                v-model="form.confirmPassword"
                :type="showConfirmPassword ? 'text' : 'password'"
                autocomplete="new-password"
                :placeholder="t('auth.confirmPlaceholder')"
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
            <Label for="inviteCode">{{ t('auth.inviteCode') }}</Label>
            <Input
              id="inviteCode"
              v-model="form.inviteCode"
              type="text"
              :placeholder="t('auth.inviteCodePlaceholder')"
            />
          </div>

          <p v-if="error" class="text-sm text-destructive">{{ error }}</p>

          <Button type="submit" :disabled="loading" class="w-full">
            <Loader2 v-if="loading" class="mr-2 h-4 w-4 animate-spin" />
            {{ loading ? t('auth.registering') : t('auth.register') }}
          </Button>
        </form>
      </CardContent>      <CardFooter class="flex flex-col gap-4">
        <p class="text-center text-sm text-muted-foreground">
          {{ t('auth.hasAccount') }}
          <router-link to="/login" class="font-medium text-primary hover:underline">{{ t('auth.login') }}</router-link>
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
          <p class="pt-2 text-center text-sm text-muted-foreground">{{ t('auth.oauthNotConfigured') }}</p>
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
import { useI18n } from 'vue-i18n';
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
const { t } = useI18n();
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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
  if (!form.username || !form.email || !form.password || !form.confirmPassword || (inviteCodeEnabled.value && !form.inviteCode)) {
    error.value = t('auth.fillRequired');
    return;
  }
  if (!EMAIL_RE.test(form.email.trim())) {
    error.value = t('auth.emailInvalid');
    return;
  }
  if (form.password !== form.confirmPassword) {
    error.value = t('auth.passwordMismatch');
    return;
  }
  loading.value = true;
  try {
    await authStore.register({ ...form, email: form.email.trim() });
    router.push({ path: '/login', query: { registered: '1' } });
  } catch (err: any) {
    const respError = err.response?.data?.error;
    if (typeof respError === 'object') {
      const messages = Object.values(respError).flat().join('; ');
      error.value = messages || t('auth.registerFailed');
    } else {
      error.value = respError || t('auth.registerFailed');
    }
  } finally {
    loading.value = false;
  }
}
</script>