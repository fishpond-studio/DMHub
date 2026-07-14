<template>
  <div>
    <h1 class="text-2xl font-bold text-foreground mb-6">个人资料</h1>

    <div v-if="loading" class="text-center py-12 text-muted-foreground">加载中...</div>

    <div v-else class="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>基本信息</CardTitle>
          <CardDescription>修改您的显示名称、昵称和头像</CardDescription>
        </CardHeader>
        <CardContent class="space-y-4">
          <div>
            <Label class="mb-1 block">用户名</Label>
            <Input :model-value="user?.username" disabled class="bg-muted" />
          </div>
          <div>
            <Label class="mb-1 block">显示名称</Label>
            <Input v-model="form.displayName" type="text" placeholder="输入显示名称" />
          </div>
          <div>
            <Label class="mb-1 block">昵称</Label>
            <Input v-model="form.nickname" type="text" placeholder="输入昵称" />
          </div>
          <div>
            <Label class="mb-1 block">头像 URL</Label>
            <Input v-model="form.avatarUrl" type="text" placeholder="输入头像图片 URL" />
          </div>
          <div class="flex justify-end">
            <Button @click="saveProfile" :disabled="saving">{{ saving ? '保存中...' : '保存' }}</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>邮箱地址</CardTitle>
          <CardDescription>修改邮箱需要验证当前密码</CardDescription>
        </CardHeader>
        <CardContent class="space-y-4">
          <div>
            <Label class="mb-1 block">当前邮箱</Label>
            <div class="flex items-center gap-2">
              <Input :model-value="user?.email || '未设置'" disabled class="bg-muted" />
              <Badge v-if="user?.emailVerified" variant="default" class="bg-primary/15 text-primary border-primary/30 hover:bg-primary/15">已验证</Badge>
              <Badge v-else variant="secondary">未验证</Badge>
            </div>
          </div>
          <div>
            <Label class="mb-1 block">新邮箱</Label>
            <Input v-model="emailForm.email" type="email" placeholder="输入新邮箱地址" />
          </div>
          <div>
            <Label class="mb-1 block">当前密码</Label>
            <Input v-model="emailForm.password" type="password" placeholder="输入当前密码以确认身份" />
          </div>
          <div class="flex justify-end">
            <Button @click="saveEmail" :disabled="savingEmail">{{ savingEmail ? '保存中...' : '更改邮箱' }}</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>通知偏好</CardTitle>
          <CardDescription>控制站内通知的接收</CardDescription>
        </CardHeader>
        <CardContent class="space-y-4">
          <div class="flex items-center justify-between">
            <div>
              <Label>站内通知</Label>
              <p class="text-xs text-muted-foreground mt-0.5">关闭后您将不再收到站内推送通知</p>
            </div>
            <Switch :checked="notificationsEnabled" @update:checked="toggleNotifications" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>修改密码</CardTitle>
          <CardDescription>修改密码后需要重新登录</CardDescription>
        </CardHeader>
        <CardContent class="space-y-4">
          <div>
            <Label class="mb-1 block">当前密码</Label>
            <Input v-model="passwordForm.oldPassword" type="password" placeholder="输入当前密码" />
          </div>
          <div>
            <Label class="mb-1 block">新密码</Label>
            <Input v-model="passwordForm.newPassword" type="password" placeholder="输入新密码（至少8个字符）" />
          </div>
          <div>
            <Label class="mb-1 block">确认新密码</Label>
            <Input v-model="passwordForm.confirmPassword" type="password" placeholder="再次输入新密码" />
          </div>
          <div class="flex justify-end">
            <Button @click="savePassword" :disabled="savingPassword">{{ savingPassword ? '保存中...' : '修改密码' }}</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, computed } from 'vue';
import { useAuthStore } from '@/stores/auth';
import api from '@/lib/axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const authStore = useAuthStore();
const loading = ref(true);
const saving = ref(false);
const savingEmail = ref(false);
const savingPassword = ref(false);

const user = computed(() => authStore.user as any);

const form = reactive({
  displayName: '',
  nickname: '',
  avatarUrl: '',
});

const notificationsEnabled = ref(true);

const emailForm = reactive({
  email: '',
  password: '',
});

const passwordForm = reactive({
  oldPassword: '',
  newPassword: '',
  confirmPassword: '',
});

onMounted(async () => {
  try {
    await authStore.fetchUser();
    form.displayName = user.value?.displayName || '';
    form.nickname = user.value?.nickname || '';
    form.avatarUrl = user.value?.avatarUrl || '';
    notificationsEnabled.value = user.value?.notificationsEnabled !== false;
  } finally {
    loading.value = false;
  }
});

async function saveProfile() {
  saving.value = true;
  try {
    const { data } = await api.put('/auth/me/profile', {
      displayName: form.displayName,
      nickname: form.nickname,
      avatarUrl: form.avatarUrl,
    });
    authStore.user = data.user;
    alert('个人资料已更新');
  } catch (err: any) {
    alert(err.response?.data?.error || '保存失败');
  } finally {
    saving.value = false;
  }
}

async function toggleNotifications(checked: boolean) {
  try {
    const { data } = await api.put('/auth/me/profile', {
      notificationsEnabled: checked,
    });
    authStore.user = data.user;
    notificationsEnabled.value = checked;
  } catch (err: any) {
    alert(err.response?.data?.error || '操作失败');
  }
}

async function saveEmail() {
  if (!emailForm.email) {
    alert('请输入新邮箱');
    return;
  }
  if (!emailForm.password) {
    alert('请输入当前密码');
    return;
  }
  savingEmail.value = true;
  try {
    const { data } = await api.put('/auth/me/email', {
      email: emailForm.email,
      password: emailForm.password,
    });
    authStore.user = data.user;
    emailForm.email = '';
    emailForm.password = '';
    alert('邮箱已更改');
  } catch (err: any) {
    alert(err.response?.data?.error || '更改邮箱失败');
  } finally {
    savingEmail.value = false;
  }
}

async function savePassword() {
  if (!passwordForm.oldPassword || !passwordForm.newPassword) {
    alert('请输入当前密码和新密码');
    return;
  }
  if (passwordForm.newPassword.length < 8) {
    alert('新密码至少8个字符');
    return;
  }
  if (passwordForm.newPassword !== passwordForm.confirmPassword) {
    alert('两次输入的密码不一致');
    return;
  }
  savingPassword.value = true;
  try {
    await api.put('/auth/me/password', {
      oldPassword: passwordForm.oldPassword,
      newPassword: passwordForm.newPassword,
    });
    passwordForm.oldPassword = '';
    passwordForm.newPassword = '';
    passwordForm.confirmPassword = '';
    alert('密码已修改，请重新登录');
    await authStore.logout();
    window.location.href = '/login';
  } catch (err: any) {
    alert(err.response?.data?.error || '修改密码失败');
  } finally {
    savingPassword.value = false;
  }
}
</script>
