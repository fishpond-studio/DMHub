<template>
  <div>
    <h1 class="text-2xl font-bold text-foreground mb-6">{{ $t('成员管理') }}</h1>

      <div v-if="loading" class="text-center py-12 text-muted-foreground">{{ $t('加载中․․․') }}</div>

      <Card v-else>
        <div class="hidden md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{{ $t('用户名') }}</TableHead>
                <TableHead>{{ $t('邮箱') }}</TableHead>
                <TableHead>{{ $t('角色') }}</TableHead>
                <TableHead>2FA</TableHead>
                <TableHead>{{ $t('加入时间') }}</TableHead>
                <TableHead class="text-right">{{ $t('操作') }}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="member in members" :key="member.id">
                <TableCell>
                  <div class="text-sm font-medium text-foreground">{{ member.displayName || member.username }}</div>
                  <div v-if="member.displayName" class="text-xs text-muted-foreground">@{{ member.username }}</div>
                </TableCell>
                <TableCell class="text-sm text-muted-foreground">{{ member.email || '-' }}</TableCell>
                <TableCell>
                  <DropdownMenu v-if="member.id !== currentUserId">
                    <DropdownMenuTrigger as-child>
                      <Button variant="ghost" size="sm" class="gap-1">
                        <Badge :variant="roleBadgeVariant(member.role)">{{ roleLabel(member.role) }}</Badge>
                        <ChevronDown class="h-3 w-3" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      <DropdownMenuItem @click="handleRoleChange(member, 'admin')">{{ $t('管理员') }}</DropdownMenuItem>
                      <DropdownMenuItem @click="handleRoleChange(member, 'member')">{{ $t('成员') }}</DropdownMenuItem>
                      <DropdownMenuItem @click="handleRoleChange(member, 'guest')">{{ $t('访客') }}</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Badge v-else :variant="roleBadgeVariant(member.role)">{{ roleLabel(member.role) }}</Badge>
                </TableCell>
                <TableCell>
                  <Badge v-if="member.status === 'disabled'" variant="destructive" class="mr-1">{{ $t('已禁用') }}</Badge>
                  <Badge v-if="member.twoFactorEnabled" variant="default" class="bg-primary/15 text-primary border-primary/30 hover:bg-primary/15">2FA</Badge>
                  <Badge v-else variant="secondary">{{ $t('无2FA') }}</Badge>
                </TableCell>
                <TableCell class="text-sm text-muted-foreground tnum">{{ formatDate(member.createdAt) }}</TableCell>
                <TableCell class="text-right">
                  <div class="flex items-center justify-end gap-1">
                    <Button
                      v-if="member.id !== currentUserId"
                      variant="ghost"
                      size="sm"
                      :class="member.status === 'disabled' ? 'text-primary hover:text-primary' : 'text-warning hover:text-warning'"
                      @click="handleStatusToggle(member)"
                    >
                      {{ member.status === 'disabled' ? $t('启用') : $t('禁用') }}
                    </Button>
                    <Button
                      v-if="member.id !== currentUserId"
                      variant="ghost"
                      size="sm"
                      class="text-destructive hover:text-destructive"
                      @click="pendingRemove = member"
                    >
                      {{ $t('移除') }}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>

        <div class="md:hidden divide-y">
          <div v-for="member in members" :key="member.id" class="p-4">
            <div class="flex items-center justify-between mb-2">
              <div>
                <span class="font-medium text-foreground">{{ member.displayName || member.username }}</span>
                <span v-if="member.displayName" class="text-xs text-muted-foreground ml-1">@{{ member.username }}</span>
              </div>
              <Badge :variant="roleBadgeVariant(member.role)">{{ roleLabel(member.role) }}</Badge>
            </div>
            <div class="flex items-center gap-2 text-sm text-muted-foreground mb-2 tnum">
              <span>{{ member.email || $t('无邮箱') }}</span>
              <span>·</span>
              <span>{{ formatDate(member.createdAt) }}</span>
            </div>
            <div class="flex items-center justify-between">
              <div class="flex gap-1">
                <Badge v-if="member.status === 'disabled'" variant="destructive">{{ $t('已禁用') }}</Badge>
                <Badge v-if="member.twoFactorEnabled" variant="default" class="bg-primary/15 text-primary border-primary/30">2FA</Badge>
                <Badge v-else variant="secondary">{{ $t('无2FA') }}</Badge>
              </div>
              <div v-if="member.id !== currentUserId" class="flex gap-1">
                <DropdownMenu>
                  <DropdownMenuTrigger as-child>
                    <Button variant="outline" size="sm">{{ $t('角色') }}</Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem @click="handleRoleChange(member, 'admin')">{{ $t('管理员') }}</DropdownMenuItem>
                    <DropdownMenuItem @click="handleRoleChange(member, 'member')">{{ $t('成员') }}</DropdownMenuItem>
                    <DropdownMenuItem @click="handleRoleChange(member, 'guest')">{{ $t('访客') }}</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button
                  variant="outline"
                  size="sm"
                  :class="member.status === 'disabled' ? 'text-primary' : 'text-warning'"
                  @click="handleStatusToggle(member)"
                >
                  {{ member.status === 'disabled' ? $t('启用') : $t('禁用') }}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  class="text-destructive"
                  @click="pendingRemove = member"
                >
                  {{ $t('移除') }}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </Card>

      <AlertDialog :open="!!pendingRoleChange">
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{{ $t('确认修改角色') }}</AlertDialogTitle>
            <AlertDialogDescription>{{ $t('确定将 {p0} 的角色从 {p1} 变更为 {p2} 吗？权限变更将立即生效。', { p0: pendingRoleChange?.username, p1: roleLabel(pendingRoleChange?.oldRole ?? ''), p2: roleLabel(pendingRoleChange?.newRole ?? '') }) }}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel @click="pendingRoleChange = null">{{ $t('取消') }}</AlertDialogCancel>
            <AlertDialogAction @click="proceedRoleChange">{{ $t('确认修改') }}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog :open="!!pendingRemove">
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{{ $t('确认移除成员') }}</AlertDialogTitle>
            <AlertDialogDescription>{{ $t('确定要移除成员 {p0} 吗？此操作不可撤销，该用户的所有域名分配和令牌将被删除。', { p0: pendingRemove?.username }) }}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel @click="pendingRemove = null">{{ $t('取消') }}</AlertDialogCancel>
            <AlertDialogAction @click="proceedRemove">{{ $t('确认移除') }}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog :open="!!pendingStatusChange">
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{{ pendingStatusChange?.newStatus === 'disabled' ? $t('确认禁用账号') : $t('确认启用账号') }}</AlertDialogTitle>
            <AlertDialogDescription>
              {{ pendingStatusChange?.newStatus === 'disabled'
                ? $t('确定要禁用 {p0} 的账号吗？该用户将被强制下线且无法登录。', { p0: pendingStatusChange?.username })
                : $t('确定要启用 {p0} 的账号吗？该用户将可以正常登录。', { p0: pendingStatusChange?.username })
              }}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel @click="pendingStatusChange = null">{{ $t('取消') }}</AlertDialogCancel>
            <AlertDialogAction @click="proceedStatusChange">{{ $t('确认') }}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useTeamStore } from '@/stores/team';
import { useAuthStore } from '@/stores/auth';
import { ChevronDown } from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

import { useI18n } from 'vue-i18n';
const { t } = useI18n();

const store = useTeamStore();
const authStore = useAuthStore();
const loading = ref(true);
const pendingRemove = ref<{ id: string; username: string } | null>(null);
const pendingRoleChange = ref<{ id: string; username: string; oldRole: string; newRole: string } | null>(null);
const pendingStatusChange = ref<{ id: string; username: string; currentStatus: string; newStatus: string } | null>(null);

const members = computed(() => store.members);
const currentUserId = computed(() => authStore.user?.id ?? '');

onMounted(async () => {
  try {
    await store.fetchMembers();
  } finally {
    loading.value = false;
  }
});

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('zh-CN');
}

function roleLabel(role: string): string {
  const labels: Record<string, string> = { admin: t('管理员'), member: t('成员'), guest: t('访客') };
  return labels[role] ?? role;
}

function roleBadgeVariant(role: string): 'destructive' | 'secondary' | 'outline' {
  const map: Record<string, 'destructive' | 'secondary' | 'outline'> = { admin: 'destructive', member: 'secondary', guest: 'outline' };
  return map[role] ?? 'outline';
}

function handleRoleChange(member: { id: string; username: string; role: string }, newRole: string) {
  if (newRole === member.role) return;
  pendingRoleChange.value = { id: member.id, username: member.username, oldRole: member.role, newRole };
}

async function proceedRoleChange() {
  if (!pendingRoleChange.value) return;
  try {
    await store.updateMemberRole(pendingRoleChange.value.id, pendingRoleChange.value.newRole);
  } catch (err: any) {
    alert(err.response?.data?.error || t('修改角色失败'));
  }
  pendingRoleChange.value = null;
}

async function proceedRemove() {
  if (!pendingRemove.value) return;
  try {
    await store.removeMember(pendingRemove.value.id);
  } catch (err: any) {
    alert(err.response?.data?.error || t('移除成员失败'));
  }
  pendingRemove.value = null;
}

function handleStatusToggle(member: { id: string; username: string; status: string }) {
  const newStatus = member.status === 'disabled' ? 'active' : 'disabled';
  pendingStatusChange.value = { id: member.id, username: member.username, currentStatus: member.status, newStatus };
}

async function proceedStatusChange() {
  if (!pendingStatusChange.value) return;
  try {
    await store.updateMemberStatus(pendingStatusChange.value.id, pendingStatusChange.value.newStatus);
  } catch (err: any) {
    alert(err.response?.data?.error || t('状态变更失败'));
  }
  pendingStatusChange.value = null;
}
</script>
