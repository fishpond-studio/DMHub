<template>
  <div>
    <h1 class="text-2xl font-bold text-foreground mb-6">账号绑定</h1>

      <div v-if="loading" class="text-center py-12 text-muted-foreground">加载中...</div>

      <div v-else class="space-y-4">
        <Card v-for="binding in bindings" :key="binding.id">
          <CardContent class="p-5">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-3">
                <Avatar>
                  <AvatarImage v-if="binding.providerAvatar" :src="binding.providerAvatar" />
                  <AvatarFallback>{{ binding.providerDisplayName.charAt(0) }}</AvatarFallback>
                </Avatar>
                <div>
                  <div class="flex items-center gap-2">
                    <span class="text-sm font-medium text-foreground">{{ binding.providerDisplayName }}</span>
                    <Badge v-if="binding.providerId === 'github'" variant="secondary">GitHub</Badge>
                  </div>
                  <p class="text-xs text-muted-foreground">
                    {{ binding.providerName || binding.providerEmail || binding.providerId }}
                    <span v-if="binding.providerEmail && binding.providerName" class="ml-1">({{ binding.providerEmail }})</span>
                  </p>
                </div>
              </div>
              <Button variant="outline" size="sm" class="text-destructive hover:text-destructive hover:bg-destructive/10" :disabled="unbindingId === binding.providerId" @click="handleUnbind(binding)">
                {{ unbindingId === binding.providerId ? '解绑中...' : '解绑' }}
              </Button>
            </div>
          </CardContent>
        </Card>

        <div v-if="bindings.length === 0" class="text-center py-8">
          <p class="text-muted-foreground">暂未绑定任何 OAuth 提供商</p>
        </div>
      </div>

      <div v-if="availableProviders.length > 0" class="mt-8">
        <h2 class="text-lg font-semibold text-foreground mb-4">绑定新提供商</h2>
        <div class="space-y-3">
          <Card v-for="prov in availableProviders" :key="prov.providerId" class="cursor-pointer hover:bg-accent transition-colors" @click="handleBind(prov.providerId)">
            <CardContent class="p-4">
              <div class="flex items-center gap-3">
                <Avatar>
                  <AvatarFallback>{{ prov.name.charAt(0) }}</AvatarFallback>
                </Avatar>
                <div class="text-left">
                  <p class="text-sm font-medium text-foreground">{{ prov.name }}</p>
                  <p class="text-xs text-muted-foreground">{{ prov.type.toUpperCase() }}</p>
                </div>
                <span class="ml-auto text-sm text-blue-600 dark:text-blue-400">绑定</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <AlertDialog :open="confirmUnbind.open">
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认解绑</AlertDialogTitle>
            <AlertDialogDescription>{{ confirmUnbind.message }}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel @click="confirmUnbind.open = false">取消</AlertDialogCancel>
            <AlertDialogAction @click="proceedUnbind">确认解绑</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import api from '@/lib/axios';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

interface Binding {
  id: string;
  providerId: string;
  providerEmail: string | null;
  providerName: string | null;
  providerAvatar: string | null;
  providerDisplayName: string;
  createdAt: string;
}

interface ProviderInfo {
  providerId: string;
  name: string;
  type: string;
}

const bindings = ref<Binding[]>([]);
const availableProviders = ref<ProviderInfo[]>([]);
const loading = ref(false);
const unbindingId = ref<string | null>(null);

const confirmUnbind = reactive({
  open: false,
  message: '',
  providerId: '',
});

onMounted(() => {
  fetchBindings();
  fetchAvailableProviders();
});

async function fetchBindings() {
  loading.value = true;
  try {
    const { data } = await api.get('/auth/oauth/bindings');
    bindings.value = data.bindings;
  } finally {
    loading.value = false;
  }
}

async function fetchAvailableProviders() {
  try {
    const { data } = await api.get('/auth/oauth/providers');
    const boundIds = new Set(bindings.value.map((b) => b.providerId));
    availableProviders.value = data.providers.filter((p: ProviderInfo) => !boundIds.has(p.providerId));
  } catch {}
}

async function handleBind(providerId: string) {
  window.location.href = `/api/auth/oauth/${providerId}/authorize`;
}

function handleUnbind(binding: Binding) {
  confirmUnbind.open = true;
  confirmUnbind.providerId = binding.providerId;
  confirmUnbind.message = `确定要解绑 ${binding.providerDisplayName} 吗？解绑后将无法通过该方式登录。`;
}

async function proceedUnbind() {
  unbindingId.value = confirmUnbind.providerId;
  try {
    await api.delete(`/auth/oauth/unbind/${confirmUnbind.providerId}`);
    await fetchBindings();
    await fetchAvailableProviders();
  } catch (err: any) {
    alert(err.response?.data?.error || '解绑失败');
  } finally {
    unbindingId.value = null;
    confirmUnbind.open = false;
  }
}
</script>
