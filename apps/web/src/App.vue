<template>
  <TooltipProvider :delay-duration="200">
    <AppLayout />
    <Toaster />
    <GlobalConfirmDialog />
    <CommandPalette />
    <KeyboardShortcutsHelp />
  </TooltipProvider>
</template>

<script setup lang="ts">
import AppLayout from '@/components/AppLayout.vue'
import { Toaster } from '@/components/ui/toast'
import { TooltipProvider } from '@/components/ui/tooltip'
import GlobalConfirmDialog from '@/components/common/GlobalConfirmDialog.vue'
import CommandPalette from '@/components/CommandPalette.vue'
import KeyboardShortcutsHelp from '@/components/KeyboardShortcutsHelp.vue'
</script>
