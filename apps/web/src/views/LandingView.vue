<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import api from '@/lib/axios';
import { Button } from '@/components/ui/button';
import { marked } from 'marked';

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

const name = ref('DMHub');
const subtitle = ref('');
const logoUrl = ref<string | null>(null);
const backgroundUrl = ref<string | null>(null);
const footerContent = ref('');
const footerFormat = ref('markdown');

const renderedFooter = ref('');

onMounted(async () => {
  try {
    const { data } = await api.get('/public/landing');
    name.value = data.name || 'DMHub';
    subtitle.value = data.subtitle || '';
    logoUrl.value = data.logoUrl || null;
    backgroundUrl.value = data.backgroundUrl || null;
    footerContent.value = data.footerContent || '';
    footerFormat.value = data.footerFormat || 'markdown';

    if (footerContent.value) {
      renderedFooter.value = footerFormat.value === 'html'
        ? sanitizeHtml(footerContent.value)
        : sanitizeHtml(await marked(footerContent.value));
    }
  } catch {}
});
</script>

<template>
  <div
    class="min-h-screen flex flex-col relative"
    :style="backgroundUrl ? { backgroundImage: `url(${backgroundUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}"
  >
    <div class="absolute inset-0 bg-black/40" v-if="backgroundUrl" />
    <div class="flex-1 flex flex-col items-center justify-center relative z-10 px-4 py-16">
      <img
        v-if="logoUrl"
        :src="logoUrl"
        :alt="name"
        class="w-24 h-24 rounded-2xl mb-8 shadow-lg animate-scale-in"
      />
      <div v-else class="w-24 h-24 rounded-2xl mb-8 bg-primary/20 flex items-center justify-center animate-scale-in">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-12 h-12 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
      </div>

      <h1 class="text-5xl font-bold tracking-tight text-white mb-4 drop-shadow-lg animate-fade-in stagger-2">{{ name }}</h1>
      <p v-if="subtitle" class="text-xl text-white/80 mb-10 text-center max-w-lg drop-shadow animate-fade-in stagger-3">{{ subtitle }}</p>

      <Button
        size="lg"
        class="h-12 px-8 text-base font-medium shadow-lg animate-fade-in stagger-4"
        @click="router.push('/login')"
      >
        Get Started
      </Button>
    </div>

    <footer
      v-if="renderedFooter"
      class="relative z-10 py-6 px-4 text-center animate-fade-in stagger-5"
      :class="backgroundUrl ? 'text-white/70' : 'text-muted-foreground'"
    >
      <div class="prose prose-sm dark:prose-invert max-w-3xl mx-auto" :class="backgroundUrl ? 'prose-white' : ''" v-html="renderedFooter" />
    </footer>
  </div>
</template>
