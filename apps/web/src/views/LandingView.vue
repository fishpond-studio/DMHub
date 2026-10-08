<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import api from '@/lib/axios';
import { sanitizeHtml } from '@/lib/sanitize-html';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import BrandMark from '@/components/BrandMark.vue';
import { marked } from 'marked';
import { Globe, Shield, Bell, Users, ArrowRight, LayoutDashboard } from 'lucide-vue-next';
import { getAccessToken } from '@/lib/axios';

const router = useRouter();

const name = ref('DMHub');
const subtitle = ref('');
const logoUrl = ref<string | null>(null);
const backgroundUrl = ref<string | null>(null);
const footerContent = ref('');
const footerFormat = ref('markdown');
const renderedFooter = ref('');
const isLoggedIn = computed(() => !!getAccessToken());

const features = [
  { icon: Globe, title: '域名统一管理', desc: '多服务商域名集中查看，分组标签一目了然' },
  { icon: Shield, title: '解析协作与审计', desc: '权限指派、操作留痕，变更可追溯可回滚' },
  { icon: Bell, title: '到期智能提醒', desc: '多渠道通知，不再错过续费窗口' },
  { icon: Users, title: '团队协作', desc: '邀请码入队、角色权限，适合小团队共管' },
];

onMounted(async () => {
  try {
    const { data } = await api.get('/public/landing');
    name.value = data.name || 'DMHub';
    subtitle.value = data.subtitle || '面向团队的域名协作管理平台';
    logoUrl.value = data.logoUrl || null;
    backgroundUrl.value = data.backgroundUrl || null;
    footerContent.value = data.footerContent || '';
    footerFormat.value = data.footerFormat || 'markdown';

    if (footerContent.value) {
      renderedFooter.value = footerFormat.value === 'html'
        ? sanitizeHtml(footerContent.value)
        : sanitizeHtml(await marked(footerContent.value));
    }
  } catch {
    if (!subtitle.value) subtitle.value = '面向团队的域名协作管理平台';
  }
});
</script>

<template>
  <div
    class="relative flex min-h-screen flex-col overflow-hidden"
    :class="backgroundUrl ? '' : 'bg-background'"
    :style="backgroundUrl ? { backgroundImage: `url(${backgroundUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}"
  >
    <div v-if="backgroundUrl" class="absolute inset-0 bg-black/55" />
    <template v-else>
      <div class="pointer-events-none absolute inset-0 bg-grid opacity-30" />
      <div class="pointer-events-none absolute inset-0 bg-glow" />
    </template>

    <header class="relative z-10 app-container flex items-center justify-between py-5">
      <div class="flex items-center gap-2.5">
        <BrandMark class="h-8 w-8" />
        <span class="font-semibold tracking-tight" :class="backgroundUrl ? 'text-white' : ''">{{ name }}</span>
      </div>
      <div class="flex items-center gap-2">
        <Button
          v-if="isLoggedIn"
          variant="secondary"
          size="sm"
          @click="router.push('/dashboard')"
        >
          <LayoutDashboard class="mr-1.5 h-4 w-4" />
          进入控制台
        </Button>
        <template v-else>
          <Button
            variant="ghost"
            size="sm"
            :class="backgroundUrl ? 'text-white hover:bg-white/10 hover:text-white' : ''"
            @click="router.push('/login')"
          >
            登录
          </Button>
          <Button size="sm" @click="router.push('/register')">
            注册
          </Button>
        </template>
      </div>
    </header>

    <div class="relative z-10 flex flex-1 flex-col items-center justify-center px-4 py-14 md:py-20">
      <Badge
        variant="secondary"
        class="mb-8 animate-fade-in"
        :class="backgroundUrl ? 'border-white/20 bg-white/15 text-white' : ''"
      >
        Domain Management Hub
      </Badge>

      <div class="mb-5 flex items-center gap-4 animate-scale-in">
        <img
          v-if="logoUrl"
          :src="logoUrl"
          :alt="name"
          class="h-14 w-14 rounded-2xl object-cover shadow-md"
        />
        <BrandMark v-else class="h-14 w-14 rounded-2xl" />
      </div>

      <h1
        class="mb-4 text-center text-3xl font-semibold tracking-tight md:text-5xl"
        :class="backgroundUrl ? 'text-white' : 'text-foreground'"
      >
        {{ name }}
      </h1>
      <p
        class="mb-10 max-w-2xl text-center text-base leading-relaxed md:text-lg animate-fade-in stagger-3"
        :class="backgroundUrl ? 'text-white/85' : 'text-muted-foreground'"
      >
        {{ subtitle || '面向团队的域名协作管理平台' }}
      </p>

      <div class="flex flex-col items-center gap-3 animate-fade-in stagger-4 sm:flex-row">
        <Button
          size="lg"
          class="shadow-md"
          @click="router.push(isLoggedIn ? '/dashboard' : '/login')"
        >
          {{ isLoggedIn ? '进入控制台' : '开始使用' }}
          <ArrowRight class="ml-2 h-4 w-4" />
        </Button>
        <Button
          v-if="!isLoggedIn"
          size="lg"
          variant="outline"
          :class="backgroundUrl ? 'border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white' : ''"
          @click="router.push('/register')"
        >
          创建账户
        </Button>
      </div>

      <div
        class="mt-16 grid w-full max-w-5xl grid-cols-1 gap-3 animate-fade-in stagger-5 sm:grid-cols-2 lg:grid-cols-4"
      >
        <div
          v-for="f in features"
          :key="f.title"
          class="rounded-xl border p-5 text-left"
          :class="backgroundUrl
            ? 'border-white/15 bg-white/10 text-white backdrop-blur'
            : 'card-hover border-border/80 bg-card shadow-sm'"
        >
          <span
            class="mb-4 flex h-9 w-9 items-center justify-center rounded-lg"
            :class="backgroundUrl ? 'bg-white/15' : 'bg-primary/10 text-primary'"
          >
            <component :is="f.icon" class="h-5 w-5" />
          </span>
          <div class="mb-1 text-sm font-medium">{{ f.title }}</div>
          <p class="text-[13px] leading-relaxed" :class="backgroundUrl ? 'text-white/70' : 'text-muted-foreground'">
            {{ f.desc }}
          </p>
        </div>
      </div>
    </div>

    <footer
      v-if="renderedFooter"
      class="relative z-10 px-4 py-8 animate-fade-in stagger-6"
      :class="backgroundUrl ? 'text-white/70' : 'text-muted-foreground'"
    >
      <div
        class="rich-text mx-auto max-w-3xl text-center"
        v-html="renderedFooter"
      />
    </footer>
  </div>
</template>
