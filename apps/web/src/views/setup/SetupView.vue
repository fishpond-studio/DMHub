<script setup lang="ts">
import { reactive, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useSetupStore } from '@/stores/setup';
import { Check, Loader2, Minus } from 'lucide-vue-next';
import StepDatabase from '@/components/setup/StepDatabase.vue';
import StepMigrate from '@/components/setup/StepMigrate.vue';
import StepRegister from '@/components/setup/StepRegister.vue';
import StepSiteUrl from '@/components/setup/StepSiteUrl.vue';
import StepSmtp from '@/components/setup/StepSmtp.vue';
import StepVerifyEmail from '@/components/setup/StepVerifyEmail.vue';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

const store = useSetupStore();
const router = useRouter();

const steps = [
  { label: '数据库' },
  { label: '数据表' },
  { label: '管理员' },
  { label: '站点URL' },
  { label: 'SMTP' },
  { label: '验证邮箱' },
];

const mountedSteps = reactive<Record<number, boolean>>({ 0: true });

function onNext() {
  store.nextStep();
  mountedSteps[store.currentStep] = true;
}

function onBack() {
  store.prevStep();
  mountedSteps[store.currentStep] = true;
}

function onSkip() {
  store.skipStep();
  mountedSteps[store.currentStep] = true;
}

onMounted(async () => {
  await store.fetchStatus();
  // 已安装实例进入此页时由路由守卫重定向；双保险
  if (store.initialized) {
    router.replace('/login');
    return;
  }
  mountedSteps[store.currentStep] = true;
});
</script>

<template>
  <div class="min-h-screen flex flex-col items-center justify-center bg-background px-4 py-8">
    <div class="w-full max-w-2xl">
      <div class="text-center mb-8">
        <h1 class="text-3xl font-bold">DMHub</h1>
        <p class="text-muted-foreground mt-1">系统初始化引导</p>
      </div>

      <div class="flex items-center mb-8">
        <template v-for="(step, index) in steps" :key="index">
          <div class="flex items-center">
            <Badge
              :variant="index < store.currentStep && !store.isStepSkipped(index) ? 'default' : index === store.currentStep ? 'default' : 'secondary'"
              :class="[
                'w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium transition-colors shrink-0',
                index === store.currentStep ? 'ring-2 ring-primary/30 ring-offset-2' : '',
                index < store.currentStep && store.isStepSkipped(index) ? 'bg-muted text-muted-foreground' : '',
              ]"
            >
              <Minus v-if="index < store.currentStep && store.isStepSkipped(index)" class="w-4 h-4" />
              <Check v-else-if="index < store.currentStep" class="w-4 h-4" />
              <span v-else>{{ index + 1 }}</span>
            </Badge>
            <span
              class="ml-2 text-xs hidden sm:inline"
              :class="index <= store.currentStep ? 'text-foreground' : 'text-muted-foreground'"
            >
              {{ step.label }}
            </span>
          </div>
          <div
            v-if="index < steps.length - 1"
            class="flex-1 h-0.5 mx-1 sm:mx-2"
            :class="index < store.currentStep ? 'bg-primary' : 'bg-muted'"
          />
        </template>
      </div>

      <div v-if="store.loading" class="flex items-center justify-center py-16">
        <Loader2 class="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
      <Card v-else>
        <CardContent class="p-6">
          <StepDatabase
            v-if="mountedSteps[0]"
            v-show="store.currentStep === 0"
            @next="onNext"
            @back="onBack"
          />
          <StepMigrate
            v-if="mountedSteps[1]"
            v-show="store.currentStep === 1"
            @next="onNext"
            @back="onBack"
          />
          <StepRegister
            v-if="mountedSteps[2]"
            v-show="store.currentStep === 2"
            @next="onNext"
            @back="onBack"
          />
          <StepSiteUrl
            v-if="mountedSteps[3]"
            v-show="store.currentStep === 3"
            @next="onNext"
            @back="onBack"
            @skip="onSkip"
          />
          <StepSmtp
            v-if="mountedSteps[4]"
            v-show="store.currentStep === 4"
            @next="onNext"
            @back="onBack"
            @skip="onSkip"
          />
          <StepVerifyEmail
            v-if="mountedSteps[5]"
            v-show="store.currentStep === 5"
            @next="onNext"
            @back="onBack"
          />
        </CardContent>
      </Card>

      <p class="text-center text-xs text-muted-foreground mt-6">
        DMHub 初始化引导
      </p>
    </div>
  </div>
</template>
