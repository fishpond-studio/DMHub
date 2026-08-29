<template>
  <div>
    <div class="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h1 class="text-2xl font-bold text-foreground">OIDC / OAuth2 配置</h1>
        <p class="mt-1 text-sm text-muted-foreground">
          配置外部身份登录。OIDC 请填写 Client ID、Secret 与 Well-Known URL；端点可自动发现。
        </p>
      </div>
      <Button @click="openAddForm">
        <Plus class="mr-1 h-4 w-4" />
        添加提供商
      </Button>
    </div>

    <!-- 全局主页 / 重定向提示 -->
    <Card v-if="homepageUrl || oidcRedirectUrl" class="mb-6 border-primary/20 bg-primary/5">
      <CardContent class="space-y-3 p-4">
        <p class="text-sm font-medium text-foreground">登记到身份提供商（IdP）的地址</p>
        <div v-if="homepageUrl" class="space-y-1">
          <Label class="text-xs text-muted-foreground">主页 URL</Label>
          <div class="flex items-center gap-2">
            <code class="flex-1 break-all rounded bg-background px-2 py-1.5 font-mono text-xs">
              {{ homepageUrl }}
            </code>
            <Button variant="outline" size="sm" @click="copyText(homepageUrl, '主页 URL 已复制')">
              复制
            </Button>
          </div>
        </div>
        <div v-if="oidcRedirectUrl" class="space-y-1">
          <Label class="text-xs text-muted-foreground">OIDC 重定向 URL</Label>
          <div class="flex items-center gap-2">
            <code class="flex-1 break-all rounded bg-background px-2 py-1.5 font-mono text-xs">
              {{ oidcRedirectUrl }}
            </code>
            <Button variant="outline" size="sm" @click="copyText(oidcRedirectUrl, '重定向 URL 已复制')">
              复制
            </Button>
          </div>
          <p class="text-[11px] text-muted-foreground">
            格式示例：https://your-domain.com/oauth/oidc
          </p>
        </div>
        <p v-if="!homepageUrl" class="text-xs text-destructive">
          尚未配置站点 URL。请先到「团队设置」填写站点地址，否则 OIDC 无法正确回调。
        </p>
      </CardContent>
    </Card>

    <div v-if="loading" class="py-12 text-center text-muted-foreground">加载中…</div>

    <div v-else-if="providers.length === 0 && !showForm" class="py-16 text-center">
      <Lock class="mx-auto h-12 w-12 text-muted-foreground" />
      <p class="mt-4 text-muted-foreground">尚未配置任何提供商</p>
      <Button class="mt-4" @click="openAddForm">添加 OIDC</Button>
    </div>

    <div v-else class="space-y-4">
      <Card v-for="provider in providers" :key="provider.id">
        <CardContent class="space-y-3 p-5">
          <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div class="min-w-0 space-y-1">
              <div class="flex flex-wrap items-center gap-2">
                <Badge>{{ providerDisplayName(provider.providerId) }}</Badge>
                <Badge v-if="!provider.enabled" variant="destructive">已禁用</Badge>
                <Badge variant="outline" class="text-[10px]">
                  {{ isOidc(provider.providerId) ? 'OIDC' : 'OAuth2' }}
                </Badge>
              </div>
              <p class="text-xs text-muted-foreground">
                Client ID: {{ provider.clientIdMasked }}
                <span v-if="provider.scope"> · Scope: {{ provider.scope }}</span>
              </p>
              <p v-if="provider.wellKnownUrl" class="truncate font-mono text-[11px] text-muted-foreground">
                Well-Known: {{ provider.wellKnownUrl }}
              </p>
            </div>
            <div class="flex shrink-0 gap-2">
              <Button variant="outline" size="sm" @click="openEditForm(provider)">编辑</Button>
              <Button
                variant="outline"
                size="sm"
                class="text-destructive hover:text-destructive"
                @click="handleDelete(provider)"
              >
                删除
              </Button>
            </div>
          </div>

          <!-- 每个提供商的主页 / 重定向 -->
          <div class="grid gap-2 rounded-lg border bg-muted/30 p-3 sm:grid-cols-2">
            <div>
              <p class="text-[11px] text-muted-foreground">主页 URL</p>
              <div class="mt-0.5 flex items-center gap-1">
                <code class="truncate font-mono text-xs">{{ provider.homepageUrl || homepageUrl || '—' }}</code>
                <Button
                  v-if="provider.homepageUrl || homepageUrl"
                  variant="ghost"
                  size="sm"
                  class="h-6 px-1.5 text-[10px]"
                  @click="copyText(provider.homepageUrl || homepageUrl, '已复制')"
                >
                  复制
                </Button>
              </div>
            </div>
            <div>
              <p class="text-[11px] text-muted-foreground">重定向 URL</p>
              <div class="mt-0.5 flex items-center gap-1">
                <code class="truncate font-mono text-xs">{{ provider.redirectUrl || '—' }}</code>
                <Button
                  v-if="provider.redirectUrl"
                  variant="ghost"
                  size="sm"
                  class="h-6 px-1.5 text-[10px]"
                  @click="copyText(provider.redirectUrl!, '已复制')"
                >
                  复制
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>

    <Dialog :open="showForm" @update:open="(v) => (showForm = v)">
      <DialogContent class="max-w-lg">
        <DialogHeader>
          <DialogTitle>{{ editingId ? '编辑提供商' : '添加 OIDC / OAuth2' }}</DialogTitle>
          <DialogDescription>
            OIDC：Client ID、Client Secret、Well-Known URL 必填；端点可选（自动发现）。
          </DialogDescription>
        </DialogHeader>

        <div class="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
          <div>
            <Label class="mb-1 block">提供商类型</Label>
            <Select v-model="form.providerId" :disabled="!!editingId">
              <SelectTrigger :disabled="!!editingId">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="avail in availableProviders" :key="avail.id" :value="avail.id">
                  {{ avail.name }} ({{ avail.type.toUpperCase() }})
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div class="space-y-1.5">
            <Label>Client ID <span class="text-destructive">*</span></Label>
            <Input
              v-model="form.clientId"
              :placeholder="editingId ? '留空则不修改' : 'Client ID / Application ID'"
            />
          </div>

          <div class="space-y-1.5">
            <Label>Client Secret <span class="text-destructive">*</span></Label>
            <Input
              v-model="form.clientSecret"
              type="password"
              :placeholder="editingId ? '留空则不修改' : 'Client Secret'"
            />
          </div>

          <!-- OIDC 专用字段 -->
          <template v-if="isOidc(form.providerId)">
            <div class="space-y-1.5">
              <Label>
                Well-Known URL <span class="text-destructive">*</span>
              </Label>
              <Input
                v-model="form.wellKnownUrl"
                type="url"
                placeholder="https://idp.example.com/.well-known/openid-configuration"
              />
              <p class="text-[11px] text-muted-foreground">
                也可只填 Issuer（如 https://idp.example.com/realms/demo），系统会自动补全
                <code>/.well-known/openid-configuration</code>
              </p>
            </div>

            <div class="rounded-md border border-dashed p-3 space-y-3">
              <p class="text-xs font-medium text-muted-foreground">
                以下端点可选 — 留空则从 Well-Known 自动识别
              </p>
              <div class="space-y-1.5">
                <Label class="text-xs">授权端点（可选）</Label>
                <Input
                  v-model="form.authorizeUrl"
                  type="url"
                  placeholder="https://idp.example.com/oauth/authorize"
                />
              </div>
              <div class="space-y-1.5">
                <Label class="text-xs">Token 端点（可选）</Label>
                <Input
                  v-model="form.tokenUrl"
                  type="url"
                  placeholder="https://idp.example.com/oauth/token"
                />
              </div>
              <div class="space-y-1.5">
                <Label class="text-xs">用户信息端点（可选）</Label>
                <Input
                  v-model="form.userInfoUrl"
                  type="url"
                  placeholder="https://idp.example.com/oauth/userinfo"
                />
              </div>
            </div>

            <div class="space-y-1.5">
              <Label>Scope（可选）</Label>
              <Input v-model="form.scope" placeholder="默认: openid email profile" />
            </div>
          </template>

          <!-- 非 OIDC：GitHub 等 -->
          <template v-else>
            <div class="space-y-1.5">
              <Label>Scope（可选）</Label>
              <Input
                v-model="form.scope"
                :placeholder="'默认: ' + defaultScope(form.providerId)"
              />
            </div>
            <div v-if="form.providerId === 'gitlab'" class="space-y-3 rounded-md border border-dashed p-3">
              <p class="text-xs text-muted-foreground">自建 GitLab 实例可覆盖端点</p>
              <Input v-model="form.authorizeUrl" placeholder="Authorize URL" />
              <Input v-model="form.tokenUrl" placeholder="Token URL" />
              <Input v-model="form.userInfoUrl" placeholder="User Info URL" />
            </div>
          </template>

          <!-- 填写后预览主页 / 重定向 -->
          <div
            v-if="previewHomepage || previewRedirect"
            class="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3"
          >
            <p class="text-xs font-semibold text-foreground">请将以下地址登记到 IdP 控制台</p>
            <div v-if="previewHomepage">
              <p class="text-[11px] text-muted-foreground">主页 URL</p>
              <div class="flex items-center gap-1">
                <code class="flex-1 break-all font-mono text-xs">{{ previewHomepage }}</code>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  class="h-7"
                  @click="copyText(previewHomepage, '已复制')"
                >
                  复制
                </Button>
              </div>
            </div>
            <div v-if="previewRedirect">
              <p class="text-[11px] text-muted-foreground">重定向 URL</p>
              <div class="flex items-center gap-1">
                <code class="flex-1 break-all font-mono text-xs">{{ previewRedirect }}</code>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  class="h-7"
                  @click="copyText(previewRedirect, '已复制')"
                >
                  复制
                </Button>
              </div>
            </div>
          </div>

          <div v-if="editingId" class="flex items-center gap-2">
            <Checkbox
              id="oauth-enabled"
              :checked="form.enabled"
              @update:checked="(v: boolean) => (form.enabled = v)"
            />
            <Label for="oauth-enabled">启用</Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" @click="showForm = false">取消</Button>
          <Button :disabled="saving" @click="handleSave">
            {{ saving ? '保存中…' : '保存' }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <AlertDialog :open="confirmDelete.open">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>确认删除</AlertDialogTitle>
          <AlertDialogDescription>{{ confirmDelete.message }}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel @click="confirmDelete.open = false">取消</AlertDialogCancel>
          <AlertDialogAction @click="proceedDelete">确认删除</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, reactive, computed, watch } from 'vue'
import api from '@/lib/axios'
import { copyText } from '@/lib/copy'
import { Plus, Lock } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

interface OAuthProviderConfig {
  id: string
  providerId: string
  enabled: boolean
  clientIdMasked: string
  scope: string | null
  wellKnownUrl?: string | null
  authorizeUrl?: string | null
  tokenUrl?: string | null
  userInfoUrl?: string | null
  customAuthorizeUrl?: string | null
  customTokenUrl?: string | null
  customUserInfoUrl?: string | null
  homepageUrl?: string | null
  redirectUrl?: string | null
  createdAt: string
  updatedAt: string
}

interface AvailableProvider {
  id: string
  name: string
  type: string
}

const providers = ref<OAuthProviderConfig[]>([])
const availableProviders = ref<AvailableProvider[]>([])
const loading = ref(false)
const showForm = ref(false)
const editingId = ref<string | null>(null)
const saving = ref(false)
const homepageUrl = ref('')
const oidcRedirectUrl = ref('')

const confirmDelete = reactive({ open: false, message: '', id: '' })

const form = reactive({
  providerId: 'oidc',
  clientId: '',
  clientSecret: '',
  wellKnownUrl: '',
  authorizeUrl: '',
  tokenUrl: '',
  userInfoUrl: '',
  scope: '',
  enabled: true,
})

const previewHomepage = computed(() => homepageUrl.value)
const previewRedirect = computed(() => {
  if (isOidc(form.providerId)) {
    return oidcRedirectUrl.value || (homepageUrl.value ? `${homepageUrl.value}/oauth/oidc` : '')
  }
  if (!homepageUrl.value) return ''
  return `${homepageUrl.value}/api/auth/oauth/${form.providerId}/callback`
})

function isOidc(id: string) {
  return id === 'oidc' || id === 'custom'
}

function providerDisplayName(id: string) {
  const map: Record<string, string> = {
    oidc: 'OIDC',
    custom: '自定义 OIDC',
    github: 'GitHub',
    gitlab: 'GitLab',
    google: 'Google',
    dingtalk: '钉钉',
    feishu: '飞书',
  }
  return map[id] || id
}

function defaultScope(id: string) {
  const map: Record<string, string> = {
    github: 'user:email',
    gitlab: 'read_user',
    google: 'openid email profile',
    dingtalk: 'openid',
    feishu: 'openid',
    oidc: 'openid email profile',
    custom: 'openid email profile',
  }
  return map[id] || 'openid email profile'
}

onMounted(() => fetchProviders())

watch(
  () => form.providerId,
  async (id) => {
    if (!id) return
    try {
      const { data } = await api.get(`/auth/oauth/${id}/callback-url`)
      if (data.homepageUrl || data.siteUrl) {
        homepageUrl.value = data.homepageUrl || data.siteUrl
      }
      if (isOidc(id) && (data.redirectUrl || data.callbackUrl)) {
        oidcRedirectUrl.value = data.redirectUrl || data.callbackUrl
      }
    } catch {
      // site not configured
    }
  },
)

async function fetchProviders() {
  loading.value = true
  try {
    const { data } = await api.get('/oauth/providers')
    providers.value = data.providers || []
    // 优先展示 oidc，隐藏重复的 custom 别名入口（若未配置）
    availableProviders.value = (data.availableProviders || []).filter(
      (p: AvailableProvider) => p.id !== 'custom' || !data.availableProviders?.some((x: AvailableProvider) => x.id === 'oidc'),
    )
    // 保证 oidc 在列表里
    if (!availableProviders.value.find((p) => p.id === 'oidc')) {
      availableProviders.value.unshift({ id: 'oidc', name: 'OIDC', type: 'oidc' })
    }
    homepageUrl.value = data.homepageUrl || data.oidcUrls?.homepageUrl || ''
    oidcRedirectUrl.value = data.oidcUrls?.redirectUrl || ''
    if (!oidcRedirectUrl.value && homepageUrl.value) {
      oidcRedirectUrl.value = `${homepageUrl.value}/oauth/oidc`
    }
    if (!form.providerId) form.providerId = 'oidc'
  } finally {
    loading.value = false
  }
}

function openAddForm() {
  editingId.value = null
  form.providerId = availableProviders.value.find((p) => p.id === 'oidc')?.id || availableProviders.value[0]?.id || 'oidc'
  form.clientId = ''
  form.clientSecret = ''
  form.wellKnownUrl = ''
  form.authorizeUrl = ''
  form.tokenUrl = ''
  form.userInfoUrl = ''
  form.scope = ''
  form.enabled = true
  showForm.value = true
}

function openEditForm(provider: OAuthProviderConfig) {
  editingId.value = provider.id
  form.providerId = provider.providerId
  form.clientId = ''
  form.clientSecret = ''
  form.wellKnownUrl = provider.wellKnownUrl || ''
  form.authorizeUrl = provider.authorizeUrl || provider.customAuthorizeUrl || ''
  form.tokenUrl = provider.tokenUrl || provider.customTokenUrl || ''
  form.userInfoUrl = provider.userInfoUrl || provider.customUserInfoUrl || ''
  form.scope = provider.scope || ''
  form.enabled = provider.enabled
  showForm.value = true
}

async function handleSave() {
  if (!editingId.value && !form.clientId) {
    alert('请填写 Client ID')
    return
  }
  if (!editingId.value && !form.clientSecret) {
    alert('请填写 Client Secret')
    return
  }
  if (isOidc(form.providerId) && !editingId.value) {
    if (!form.wellKnownUrl && !(form.authorizeUrl && form.tokenUrl)) {
      alert('OIDC 请填写 Well-Known URL，或同时填写授权端点与 Token 端点')
      return
    }
  }

  saving.value = true
  try {
    const payload: Record<string, unknown> = {
      scope: form.scope || undefined,
      wellKnownUrl: form.wellKnownUrl || undefined,
      authorizeUrl: form.authorizeUrl || undefined,
      tokenUrl: form.tokenUrl || undefined,
      userInfoUrl: form.userInfoUrl || undefined,
    }

    if (editingId.value) {
      if (form.clientId) payload.clientId = form.clientId
      if (form.clientSecret) payload.clientSecret = form.clientSecret
      payload.enabled = form.enabled
      // 允许清空可选端点
      payload.wellKnownUrl = form.wellKnownUrl || null
      payload.authorizeUrl = form.authorizeUrl || null
      payload.tokenUrl = form.tokenUrl || null
      payload.userInfoUrl = form.userInfoUrl || null
      payload.scope = form.scope || null
      const { data } = await api.put(`/oauth/providers/${editingId.value}`, payload)
      if (data.homepageUrl) homepageUrl.value = data.homepageUrl
      if (data.redirectUrl && isOidc(form.providerId)) oidcRedirectUrl.value = data.redirectUrl
    } else {
      const { data } = await api.post('/oauth/providers', {
        providerId: form.providerId,
        clientId: form.clientId,
        clientSecret: form.clientSecret,
        ...payload,
      })
      if (data.homepageUrl) homepageUrl.value = data.homepageUrl
      if (data.redirectUrl && isOidc(form.providerId)) oidcRedirectUrl.value = data.redirectUrl
    }
    showForm.value = false
    await fetchProviders()
  } catch (err: any) {
    alert(err.response?.data?.error || '保存失败')
  } finally {
    saving.value = false
  }
}

async function handleDelete(provider: OAuthProviderConfig) {
  try {
    const { data } = await api.delete(`/oauth/providers/${provider.id}`)
    if (data.requiresConfirmation) {
      confirmDelete.open = true
      confirmDelete.message = data.warning || '确定删除？'
      confirmDelete.id = provider.id
      return
    }
    await fetchProviders()
  } catch (err: any) {
    alert(err.response?.data?.error || '删除失败')
  }
}

async function proceedDelete() {
  try {
    await api.delete(`/oauth/providers/${confirmDelete.id}`, {
      headers: { 'x-confirm-delete': 'true' },
    })
    await fetchProviders()
  } catch (err: any) {
    alert(err.response?.data?.error || '删除失败')
  } finally {
    confirmDelete.open = false
  }
}
</script>
