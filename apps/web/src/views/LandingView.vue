<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import api from '@/lib/axios';
import { sanitizeHtml } from '@/lib/sanitize-html';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
    class="min-h-screen flex flex-col relative overflow-hidden"
    :class="backgroundUrl ? '' : 'bg-gradient-to-b from-background via-background to-muted/40'"
    :style="backgroundUrl ? { backgroundImage: `url(${backgroundUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}"
  >
    <div class="absolute inset-0 bg-black/50" v-if="backgroundUrl" />
    <div
      v-if="!backgroundUrl"
      class="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/10 via-transparent to-transparent"
    />

    <header class="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-5">
      <div class="flex items-center gap-2">
        <div class="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15 text-primary">
          <Globe class="h-5 w-5" />
        </div>
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

    <div class="flex-1 flex flex-col items-center justify-center relative z-10 px-4 py-12 md:py-20">
      <Badge
        variant="secondary"
        class="mb-6 animate-fade-in"
        :class="backgroundUrl ? 'bg-white/15 text-white border-white/20' : ''"
      >
        Domain Management Hub
      </Badge>

      <img
        v-if="logoUrl"
        :src="logoUrl"
        :alt="name"
        class="w-20 h-20 rounded-2xl mb-6 shadow-xl animate-scale-in object-cover"
      />
      <div
        v-else
        class="w-20 h-20 rounded-2xl mb-6 flex items-center justify-center animate-scale-in shadow-lg"
        :class="backgroundUrl ? 'bg-white/15 backdrop-blur' : 'bg-primary/15'"
      >
        <Globe class="w-10 h-10" :class="backgroundUrl ? 'text-white' : 'text-primary'" />
      </div>

      <h1
        class="text-4xl md:text-6xl font-bold tracking-tight mb-4 text-center drop-shadow-sm animate-fade-in stagger-2"
        :class="backgroundUrl ? 'text-white' : 'text-foreground'"
      >
        {{ name }}
      </h1>
      <p
        class="text-lg md:text-xl mb-10 text-center max-w-2xl leading-relaxed animate-fade-in stagger-3"
        :class="backgroundUrl ? 'text-white/85' : 'text-muted-foreground'"
      >
        {{ subtitle || '面向团队的域名协作管理平台' }}
      </p>

      <div class="flex flex-col sm:flex-row items-center gap-3 animate-fade-in stagger-4">
        <Button
          size="lg"
          class="h-12 px-8 text-base font-medium shadow-lg"
          @click="router.push(isLoggedIn ? '/dashboard' : '/login')"
        >
          {{ isLoggedIn ? '进入控制台' : '开始使用' }}
          <ArrowRight class="ml-2 h-4 w-4" />
        </Button>
        <Button
          v-if="!isLoggedIn"
          size="lg"
          variant="outline"
          class="h-12 px-8 text-base"
          :class="backgroundUrl ? 'border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white' : ''"
          @click="router.push('/register')"
        >
          创建账户
        </Button>
      </div>

      <div
        class="mt-16 grid w-full max-w-4xl grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 animate-fade-in stagger-5"
      >
        <div
          v-for="f in features"
          :key="f.title"
          class="rounded-xl border p-4 text-left transition-all hover:-translate-y-0.5"
          :class="backgroundUrl
            ? 'border-white/15 bg-white/10 backdrop-blur text-white'
            : 'border-border bg-card/80 shadow-sm'"
        >
          <component
            :is="f.icon"
            class="mb-3 h-5 w-5"
            :class="backgroundUrl ? 'text-white' : 'text-primary'"
          />
          <div class="text-sm font-semibold mb-1">{{ f.title }}</div>
          <p class="text-xs leading-relaxed" :class="backgroundUrl ? 'text-white/75' : 'text-muted-foreground'">
            {{ f.desc }}
          </p>
        </div>
      </div>
    </div>

    <footer
      v-if="renderedFooter"
      class="relative z-10 py-6 px-4 text-center animate-fade-in stagger-6"
      :class="backgroundUrl ? 'text-white/70' : 'text-muted-foreground'"
    >
      <div
        class="prose prose-sm dark:prose-invert max-w-3xl mx-auto"
        :class="backgroundUrl ? 'prose-invert' : ''"
        v-html="renderedFooter"
      />
    </footer>
  </div>
</template>
