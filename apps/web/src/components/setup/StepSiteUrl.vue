<script setup lang="ts">
import { ref } from 'vue';
import api from '@/lib/axios';
import { useSetupStore } from '@/stores/setup';
import { setupSiteUrlSchema } from '@dmhub/shared';
import { Loader2, ChevronDown, ChevronUp, CheckCircle2, XCircle } from 'lucide-vue-next';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

const emit = defineEmits<{
  next: [];
  back: [];
  skip: [];
}>();

const store = useSetupStore();
const siteUrl = ref('');
const errors = ref<Record<string, string>>({});
const saving = ref(false);
const showDnsHelp = ref(false);
const dnsChecking = ref(false);
const dnsResult = ref<{ success: boolean; hostname?: string; addresses?: string[]; matchesServer?: boolean; error?: string } | null>(null);

async function checkDns() {
  dnsChecking.value = true;
  dnsResult.value = null;
  try {
    const { data } = await api.post('/setup/site-url/check-dns', { siteUrl: siteUrl.value });
    dnsResult.value = data;
  } catch (e: any) {
    dnsResult.value = { success: false, error: e.response?.data?.error || '检查失败' };
  } finally {
    dnsChecking.value = false;
  }
}

function skip() {
  emit('skip');
}

async function saveAndNext() {
  errors.value = {};
  const result = setupSiteUrlSchema.safeParse({ siteUrl: siteUrl.value });
  if (!result.success) {
    for (const issue of result.error.issues) {
      const key = issue.path.join('.');
      if (!errors.value[key]) errors.value[key] = issue.message;
    }
    return;
  }

  saving.value = true;
  try {
    await api.post('/setup/site-url', { siteUrl: siteUrl.value });
    store.siteUrlConfigured = true;
    emit('next');
  } catch (e: unknown) {
    const err = e as { response?: { data?: { message?: string } } };
    errors.value._form = err.response?.data?.message || '保存失败';
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="space-y-6">
    <div>
      <h2 class="text-xl font-semibold tracking-tight">绑定站点URL</h2>
      <p class="text-sm text-muted-foreground mt-1">设置站点的访问地址，用于生成链接、Cookie 域名和 OAuth 回调地址</p>
    </div>

    <div v-if="errors._form" class="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
      {{ errors._form }}
    </div>

    <div class="space-y-2">
      <Label>站点URL</Label>
      <Input v-model="siteUrl" placeholder="https://dmhub.example.com" />
      <p v-if="errors.siteUrl" class="text-sm text-destructive">{{ errors.siteUrl }}</p>
      <p class="text-sm text-muted-foreground">请填写用户访问 DMHub 的完整网址，需先将域名的 DNS A 记录指向本服务器 IP</p>
    </div>

    <div class="flex items-center gap-3">
      <Button variant="outline" size="sm" @click="checkDns" :disabled="dnsChecking || !siteUrl">
        <Loader2 v-if="dnsChecking" class="mr-2 h-4 w-4 animate-spin" />
        <component
          :is="dnsResult?.success ? CheckCircle2 : dnsResult?.success === false ? XCircle : null"
          v-if="dnsResult && !dnsChecking"
          class="mr-2 h-4 w-4"
          :class="dnsResult.success ? 'text-primary' : 'text-destructive'"
        />
        {{ dnsChecking ? '检查中...' : '检查域名解析' }}
      </Button>
      <span v-if="dnsResult?.success" class="text-sm" :class="dnsResult.matchesServer ? 'text-primary' : 'text-amber-600'">域名 {{ dnsResult.hostname }} 解析到 {{ dnsResult.addresses?.join(', ') }}{{ dnsResult.matchesServer ? '（已指向本服务器）' : '（未指向本服务器，请检查 DNS 配置）' }}</span>
      <span v-if="dnsResult?.success === false" class="text-sm text-destructive">{{ dnsResult.error }}</span>
    </div>

    <div class="rounded-md border bg-muted/50">
      <button
        type="button"
        class="flex w-full items-center justify-between px-3 py-2 text-sm font-medium text-foreground hover:bg-muted/80 transition-colors"
        @click="showDnsHelp = !showDnsHelp"
      >
        <span>如何将域名指向服务器？</span>
        <ChevronDown v-if="!showDnsHelp" class="h-4 w-4" />
        <ChevronUp v-else class="h-4 w-4" />
      </button>
      <div v-if="showDnsHelp" class="px-3 pb-3 text-sm text-muted-foreground space-y-2">
        <p>在域名 DNS 管理中添加一条 A 记录：</p>
        <ul class="list-disc list-inside space-y-1">
          <li>主机记录填写 <code class="rounded bg-background px-1">dmhub</code>（或 <code class="rounded bg-background px-1">@</code> 表示主域名）</li>
          <li>记录类型选择 <code class="rounded bg-background px-1">A</code></li>
          <li>记录值填写服务器 IP 地址</li>
        </ul>
        <p>DNS 生效可能需要几分钟到数小时</p>
      </div>
    </div>

    <div class="flex justify-between pt-4 border-t">
      <Button variant="outline" @click="emit('back')">
        上一步
      </Button>
      <Button @click="saveAndNext" :disabled="saving">
        <Loader2 v-if="saving" class="mr-2 h-4 w-4 animate-spin" />
        {{ saving ? '保存中...' : '保存并继续' }}
      </Button>
      <Button variant="ghost" @click="skip">
        跳过
      </Button>
    </div>
  </div>
</template>
