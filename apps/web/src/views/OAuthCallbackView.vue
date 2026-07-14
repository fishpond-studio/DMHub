<template>
  <div class="flex min-h-screen items-center justify-center bg-background px-4">
    <Card class="w-full max-w-sm">
      <CardHeader class="text-center">
        <CardTitle class="text-2xl font-bold">DMHub</CardTitle>
        <CardDescription>OAuth 登录处理中</CardDescription>
      </CardHeader>

      <CardContent>
        <div v-if="error" class="rounded-md border border-destructive/50 bg-destructive/10 p-4">
          <p class="text-sm text-destructive">{{ error }}</p>
          <router-link to="/login" class="mt-2 inline-block text-sm text-primary hover:underline">返回登录</router-link>
        </div>

        <div v-else-if="needsInvite" class="space-y-4">
          <div class="text-center">
            <Avatar class="mx-auto h-16 w-16">
              <AvatarImage v-if="avatar" :src="avatar" />
              <AvatarFallback>
                <Globe class="h-6 w-6 text-muted-foreground" />
              </AvatarFallback>
            </Avatar>
            <p class="mt-2 text-sm text-muted-foreground">{{ name || email }}</p>
          </div>
          <p class="text-sm text-muted-foreground text-center">首次登录需要邀请码</p>

          <div class="space-y-2">
            <Label for="inviteCode">邀请码</Label>
            <Input
              id="inviteCode"
              v-model="inviteCode"
              type="text"
              placeholder="请输入邀请码"
            />
          </div>

          <p v-if="formError" class="text-sm text-destructive">{{ formError }}</p>

          <Button @click="handleRegister" :disabled="submitting" class="w-full">
            <Loader2 v-if="submitting" class="mr-2 h-4 w-4 animate-spin" />
            {{ submitting ? '注册中...' : '注册并登录' }}
          </Button>
        </div>

        <div v-else class="text-center py-4">
          <Loader2 class="mx-auto h-8 w-8 animate-spin text-primary" />
          <p class="mt-4 text-sm text-muted-foreground">正在登录...</p>
        </div>
      </CardContent>
    </Card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import api from '@/lib/axios';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Loader2, Globe } from 'lucide-vue-next';

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();

const error = ref('');
const needsInvite = ref(false);
const pendingToken = ref('');
const providerId = ref('');
const email = ref('');
const name = ref('');
const avatar = ref('');
const inviteCode = ref('');
const formError = ref('');
const submitting = ref(false);

onMounted(() => {
  const query = route.query;

  if (query.error) {
    error.value = query.error as string;
    return;
  }

  if (query.needs_invite === 'true') {
    needsInvite.value = true;
    pendingToken.value = (query.pending_token as string) || '';
    providerId.value = (query.provider_id as string) || '';
    email.value = (query.email as string) || '';
    name.value = (query.name as string) || '';
    avatar.value = (query.avatar as string) || '';
    return;
  }

  if (query.access_token) {
    authStore.setAccessToken(query.access_token as string);
    try {
      if (query.user) {
        authStore.user = JSON.parse(query.user as string);
      }
    } catch {}
    router.push('/dashboard');
    return;
  }

  error.value = '未知的回调参数';
});

async function handleRegister() {
  formError.value = '';
  if (!inviteCode.value) {
    formError.value = '请输入邀请码';
    return;
  }

  submitting.value = true;
  try {
    const { data } = await api.post(`/auth/oauth/${providerId.value}/register`, {
      pendingToken: pendingToken.value,
      code: inviteCode.value,
    });

    authStore.setAccessToken(data.accessToken);
    if (data.user) {
      authStore.user = data.user;
    }
    router.push('/dashboard');
  } catch (err: any) {
    formError.value = err.response?.data?.error || '注册失败';
  } finally {
    submitting.value = false;
  }
}
</script>
