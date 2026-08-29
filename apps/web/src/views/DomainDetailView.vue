<template>
  <div class="min-h-screen bg-background">
    <div class="max-w-6xl mx-auto px-4 py-8">
      <div v-if="!domain" class="text-center py-12 text-muted-foreground">加载中...</div>

      <template v-else>
        <div class="flex flex-col sm:flex-row items-start sm:items-center mb-6 gap-3">
          <Button variant="ghost" size="icon" @click="$router.push('/domains')">
            <ArrowLeft class="h-5 w-5" />
          </Button>
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2">
              <h1 class="text-xl md:text-2xl font-bold text-foreground truncate">{{ domain.name }}</h1>
              <Button
                variant="ghost"
                size="icon"
                class="h-8 w-8 shrink-0"
                :title="favorited ? '取消收藏' : '收藏域名'"
                @click="toggleFavorite"
              >
                <Star class="h-4 w-4" :class="favorited ? 'fill-yellow-400 text-yellow-500' : ''" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                class="h-8 w-8 shrink-0"
                title="复制域名"
                @click="copyText(domain.name, '域名已复制')"
              >
                <Copy class="h-4 w-4" />
              </Button>
            </div>
            <p class="text-xs text-muted-foreground mt-0.5">
              {{ domain.providerName || '未关联服务商' }}
              <span v-if="domain.groupName"> · {{ domain.groupName }}</span>
              <span> · {{ domain.recordCount }} 条记录</span>
              <span v-if="cdnSupported" class="text-orange-500"> · 支持 CDN 保护</span>
            </p>
          </div>
          <div class="flex items-center gap-2 sm:ml-auto flex-wrap">
            <DropdownMenu>
              <DropdownMenuTrigger as-child>
                <Button variant="outline" size="sm">
                  <Download class="mr-1.5 h-4 w-4" />
                  导出
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem @click="handleExportRecords('csv')">导出 CSV</DropdownMenuItem>
                <DropdownMenuItem @click="handleExportRecords('json')">导出 JSON</DropdownMenuItem>
                <DropdownMenuItem @click="handleExportRecords('zone')">导出 BIND Zone</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              v-if="isAdmin"
              @click="handleSync"
              :disabled="syncing"
              size="sm"
            >
              <RefreshCw class="mr-1.5 h-4 w-4" :class="syncing ? 'animate-spin' : ''" />
              {{ syncing ? '同步中...' : '同步记录' }}
            </Button>
            <Button
              v-if="isAdmin"
              @click="handleDelete"
              variant="destructive"
              size="sm"
            >
              删除域名
            </Button>
          </div>
        </div>

        <!-- 域名备注 -->
        <Card class="mb-4">
          <CardContent class="p-4">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0 flex-1">
                <dt class="text-xs font-medium text-muted-foreground mb-1">备注</dt>
                <div v-if="!editingNotes">
                  <p v-if="domain.notes" class="text-sm whitespace-pre-wrap">{{ domain.notes }}</p>
                  <p v-else class="text-sm text-muted-foreground">暂无备注</p>
                </div>
                <Textarea
                  v-else
                  v-model="notesInput"
                  rows="3"
                  class="text-sm"
                  placeholder="记录续费账号、联系人、用途等…"
                  maxlength="4000"
                />
              </div>
              <div v-if="isAdmin" class="shrink-0 flex gap-1">
                <template v-if="!editingNotes">
                  <Button variant="ghost" size="sm" class="h-8" @click="startEditNotes">编辑</Button>
                </template>
                <template v-else>
                  <Button variant="ghost" size="sm" class="h-8" @click="editingNotes = false">取消</Button>
                  <Button size="sm" class="h-8" :disabled="savingNotes" @click="saveNotes">保存</Button>
                </template>
              </div>
            </div>
          </CardContent>
        </Card>

        <!-- 非管理员：清晰展示被指派的子域名范围，避免只看到总域名 -->
        <Card v-if="!isAdmin && myScopes.length" class="mb-4 border-primary/20 bg-primary/5">
          <CardContent class="p-4">
            <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div class="min-w-0">
                <div class="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Shield class="h-4 w-4 text-primary" />
                  你的可管理范围
                </div>
                <p class="mt-1 text-xs text-muted-foreground">
                  列表仅显示权限范围内的解析记录；主机名需落在下列模式内才可{{ canEdit ? '编辑' : '查看' }}。
                </p>
              </div>
              <Badge :variant="canEdit ? 'default' : 'secondary'" class="shrink-0 self-start">
                {{ canEdit ? '可编辑' : '只读' }}
              </Badge>
            </div>
            <div class="mt-3 flex flex-wrap gap-2">
              <div
                v-for="scope in myScopes"
                :key="scope.id"
                class="rounded-lg border border-primary/15 bg-background/80 px-3 py-2"
              >
                <div class="font-mono text-sm font-medium">
                  {{ formatHostPreview(domain.name, scope.subdomainPattern) }}
                </div>
                <div class="mt-0.5 text-[11px] text-muted-foreground">
                  {{ formatScopeLabel(scope.subdomainPattern) }}
                  · {{ permissionLabel(scope.permission) }}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card class="mb-6">
          <CardContent class="p-5">
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <dt class="text-xs font-medium text-muted-foreground">状态</dt>
                <dd class="mt-1">
                  <Badge :variant="statusVariant(domain.status)">{{ statusLabel(domain.status) }}</Badge>
                </dd>
              </div>
              <div>
                <dt class="text-xs font-medium text-muted-foreground">服务商</dt>
                <dd class="mt-1 text-sm">{{ domain.providerName || '未关联' }}</dd>
              </div>
              <div>
                <dt class="text-xs font-medium text-muted-foreground">到期时间</dt>
                <dd class="mt-1">
                  <div v-if="!editingExpiry" class="flex items-center gap-1">
                    <span class="text-sm">{{ domain.expiresAt ? new Date(domain.expiresAt).toLocaleDateString('zh-CN') : '未设置' }}</span>
                    <Button v-if="isAdmin" @click="handleCheckExpiry" variant="ghost" size="icon" class="h-6 w-6" :disabled="checkingExpiry" title="WHOIS 查询">
                      <Search class="h-3.5 w-3.5" />
                    </Button>
                    <Button v-if="isAdmin" @click="startEditExpiry" variant="ghost" size="icon" class="h-6 w-6" title="手动设置">
                      <Pencil class="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <div v-else class="flex items-center gap-1">
                    <Input
                      v-model="expiryInput"
                      type="date"
                      class="w-36 h-7 text-sm"
                      @keydown.enter="saveExpiry"
                      @keydown.escape="editingExpiry = false"
                    />
                    <Button @click="saveExpiry" variant="link" size="sm" class="text-xs h-6 px-1">保存</Button>
                    <Button @click="editingExpiry = false" variant="link" size="sm" class="text-xs h-6 px-1 text-muted-foreground">取消</Button>
                  </div>
                  <div v-if="checkingExpiry" class="text-xs text-muted-foreground mt-0.5">正在查询 WHOIS...</div>
                  <div v-if="domain.lastCheckedAt" class="text-xs text-muted-foreground mt-0.5">
                    上次查询: {{ new Date(domain.lastCheckedAt).toLocaleString('zh-CN') }}
                  </div>
                </dd>
              </div>
              <div>
                <dt class="text-xs font-medium text-muted-foreground">记录数</dt>
                <dd class="mt-1 text-sm">{{ domain.recordCount }}</dd>
              </div>
              <div>
                <dt class="text-xs font-medium text-muted-foreground">HTTPS 证书</dt>
                <dd class="mt-1">
                  <div class="flex items-center gap-1 flex-wrap">
                    <span class="text-sm" :class="sslExpiryClass">
                      {{ sslExpiryLabel }}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      class="h-6 w-6"
                      title="检测证书"
                      :disabled="checkingSsl"
                      @click="handleSslCheck"
                    >
                      <Shield class="h-3.5 w-3.5" :class="checkingSsl ? 'animate-pulse' : ''" />
                    </Button>
                  </div>
                  <div v-if="domain.sslIssuer" class="text-xs text-muted-foreground mt-0.5 truncate max-w-[12rem]" :title="domain.sslIssuer">
                    {{ domain.sslIssuer }}
                  </div>
                </dd>
              </div>
              <div>
                <dt class="text-xs font-medium text-muted-foreground">分组</dt>
                <dd class="mt-1">
                  <div v-if="!editingGroup" class="flex items-center gap-1">
                    <span class="text-sm">{{ domain.groupName || '-' }}</span>
                    <Button v-if="isAdmin" @click="startEditGroup" variant="ghost" size="icon" class="h-6 w-6">
                      <Pencil class="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <div v-else class="flex items-center gap-1">
                    <Input
                      v-model="groupInput"
                      list="group-options"
                      class="w-32 h-7 text-sm"
                      placeholder="输入分组名称"
                      @keydown.enter="saveGroup"
                      @keydown.escape="editingGroup = false"
                    />
                    <datalist id="group-options">
                      <option v-for="g in store.groups" :key="g.name" :value="g.name" />
                    </datalist>
                    <Button @click="saveGroup" variant="link" size="sm" class="text-xs h-6 px-1">保存</Button>
                    <Button @click="editingGroup = false" variant="link" size="sm" class="text-xs h-6 px-1 text-muted-foreground">取消</Button>
                  </div>
                </dd>
              </div>
              <div>
                <dt class="text-xs font-medium text-muted-foreground">标签</dt>
                <dd class="mt-1">
                  <div class="flex gap-1 flex-wrap items-center">
                    <Badge v-for="tag in (domain.tags || [])" :key="tag" variant="secondary" class="gap-1">
                      {{ tag }}
                      <button v-if="isAdmin" @click="removeTag(tag)" class="ml-0.5 opacity-60 hover:opacity-100">&times;</button>
                    </Badge>
                    <span v-if="!domain.tags || domain.tags.length === 0" class="text-sm text-muted-foreground">-</span>
                    <Input
                      v-if="isAdmin"
                      v-model="newTag"
                      placeholder="添加标签"
                      class="w-20 h-6 text-xs px-1.5"
                      @keydown.enter="addTag"
                    />
                  </div>
                </dd>
              </div>
              <div>
                <dt class="text-xs font-medium text-muted-foreground">权限</dt>
                <dd class="mt-1 text-sm">
                  <span v-if="isAdmin">管理员（全部）</span>
                  <span v-else-if="canEdit">可编辑（限定子域）</span>
                  <span v-else>只读（限定子域）</span>
                </dd>
              </div>
              <div>
                <dt class="text-xs font-medium text-muted-foreground">创建时间</dt>
                <dd class="mt-1 text-sm">{{ new Date(domain.createdAt).toLocaleDateString('zh-CN') }}</dd>
              </div>
            </div>

            <div v-if="isAdmin" class="mt-4 pt-4 border-t">
              <div class="flex items-center justify-between">
                <div>
                  <dt class="text-xs font-medium text-muted-foreground">到期提醒天数</dt>
                  <dd class="mt-1 flex items-center gap-2 flex-wrap">
                    <label
                      v-for="day in remindDayOptions"
                      :key="day"
                      class="inline-flex items-center gap-1"
                    >
                      <Checkbox
                        :checked="expiryRemindDays.includes(day)"
                        :disabled="day === 0 || !isAdmin"
                        @update:checked="toggleRemindDay(day)"
                      />
                      <span class="text-xs">{{ day === 0 ? '当天' : `${day}天前` }}</span>
                    </label>
                  </dd>
                </div>
                <div class="flex items-center gap-2">
                  <Label class="text-xs text-muted-foreground">自动检查</Label>
                  <Switch
                    :checked="domain.autoCheckExpiry"
                    @update:checked="toggleAutoCheck"
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div v-if="syncResult" class="rounded-md bg-primary/10 p-3 text-sm text-primary mb-4">
          同步完成: {{ syncResult.synced }} 条记录已处理 (新增 {{ syncResult.created }}, 更新 {{ syncResult.updated }})
        </div>

        <Tabs v-model="activeTab" class="mb-4">
          <TabsList>
            <TabsTrigger value="records">DNS 记录</TabsTrigger>
            <TabsTrigger value="snapshots">快照 ({{ store.snapshots.length }})</TabsTrigger>
            <TabsTrigger value="monitor">监控</TabsTrigger>
            <TabsTrigger value="speedtest">测速</TabsTrigger>
          </TabsList>

          <TabsContent value="records">
          <div class="flex flex-col gap-3 mb-4">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div class="flex gap-1 flex-wrap">
                <Badge
                  v-for="summary in recordSummary"
                  :key="summary.type"
                  variant="outline"
                  class="cursor-pointer"
                  :class="typeFilter === summary.type ? 'border-primary text-primary' : ''"
                  @click="typeFilter = typeFilter === summary.type ? 'all' : summary.type; loadRecords()"
                >
                  {{ summary.type }}: {{ summary.count }}
                </Badge>
              </div>
              <div class="flex items-center gap-2 flex-wrap">
                <Button
                  v-if="canEdit"
                  variant="outline"
                  size="sm"
                  @click="showPasteDialog = true"
                >
                  <ClipboardPaste class="mr-1.5 h-4 w-4" />
                  粘贴导入
                </Button>
                <Button
                  v-if="canEdit"
                  variant="outline"
                  size="sm"
                  @click="showTemplateDialog = true"
                >
                  <LayoutTemplate class="mr-1.5 h-4 w-4" />
                  应用模板
                </Button>
                <Button
                  v-if="canEdit"
                  @click="openCreateRecord"
                  size="sm"
                >
                  <Plus class="mr-1.5 h-4 w-4" />
                  添加记录
                </Button>
              </div>
            </div>
            <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <Select v-model="typeFilter" @update:model-value="loadRecords">
                <SelectTrigger class="w-full sm:w-[130px]">
                  <SelectValue placeholder="全部类型" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部类型</SelectItem>
                  <SelectItem v-for="t in recordTypes" :key="t.type" :value="t.type">{{ t.type }}</SelectItem>
                </SelectContent>
              </Select>
              <div class="relative flex-1 sm:max-w-xs">
                <Search class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  v-model="recordSearch"
                  type="text"
                  placeholder="搜索记录名或值..."
                  class="pl-9"
                  @input="debouncedLoadRecords"
                />
              </div>
              <div v-if="canEdit && selectedRecordIds.length" class="flex items-center gap-2 ml-auto flex-wrap">
                <span class="text-xs text-muted-foreground">已选 {{ selectedRecordIds.length }}</span>
                <Select v-model="bulkTtl" @update:model-value="handleBulkTtl">
                  <SelectTrigger class="w-[120px] h-8">
                    <SelectValue placeholder="改 TTL" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="60">TTL 1 分钟</SelectItem>
                    <SelectItem value="300">TTL 5 分钟</SelectItem>
                    <SelectItem value="600">TTL 10 分钟</SelectItem>
                    <SelectItem value="1800">TTL 30 分钟</SelectItem>
                    <SelectItem value="3600">TTL 1 小时</SelectItem>
                    <SelectItem value="21600">TTL 6 小时</SelectItem>
                    <SelectItem value="86400">TTL 1 天</SelectItem>
                  </SelectContent>
                </Select>
                <template v-if="cdnSupported">
                  <Button variant="outline" size="sm" :disabled="bulkCdnLoading" @click="handleBulkCdn(true)">
                    开 CDN
                  </Button>
                  <Button variant="outline" size="sm" :disabled="bulkCdnLoading" @click="handleBulkCdn(false)">
                    关 CDN
                  </Button>
                </template>
                <Button variant="destructive" size="sm" @click="handleBulkDeleteRecords">
                  批量删除
                </Button>
              </div>
            </div>
          </div>

          <div v-if="store.loading" class="space-y-2 py-2">
            <Skeleton v-for="i in 5" :key="i" class="h-12 w-full rounded-lg" />
          </div>
          <EmptyState
            v-else-if="store.records.length === 0"
            title="暂无 DNS 记录"
            description="手动添加，或使用模板一键配置常见场景（邮箱、建站、CDN 等）"
            :action-label="canEdit ? '添加记录' : undefined"
            :secondary-label="canEdit ? '应用模板' : undefined"
            @action="openCreateRecord"
            @secondary="showTemplateDialog = true"
          />
          <div v-else>
            <div class="hidden md:block overflow-hidden rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow class="bg-muted/40 hover:bg-muted/40">
                    <TableHead v-if="canEdit" class="w-10">
                      <Checkbox
                        :checked="allRecordsSelected"
                        @update:checked="toggleSelectAllRecords"
                      />
                    </TableHead>
                    <TableHead>类型</TableHead>
                    <TableHead>主机记录</TableHead>
                    <TableHead>记录值</TableHead>
                    <TableHead>TTL</TableHead>
                    <TableHead>优先级</TableHead>
                    <TableHead>
                      <span v-if="cdnSupported">CDN</span>
                      <span v-else>代理</span>
                    </TableHead>
                    <TableHead>备注</TableHead>
                    <TableHead class="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow v-for="r in store.records" :key="r.id" class="group">
                    <TableCell v-if="canEdit">
                      <Checkbox
                        :checked="selectedRecordIds.includes(r.id)"
                        @update:checked="(v: boolean) => toggleRecordSelect(r.id, v)"
                      />
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{{ r.recordType }}</Badge>
                    </TableCell>
                    <TableCell class="font-medium font-mono text-sm">{{ r.name }}</TableCell>
                    <TableCell class="max-w-xs">
                      <div class="flex items-center gap-1">
                        <span class="truncate text-muted-foreground font-mono text-xs" :title="r.value">{{ r.value }}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          class="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100"
                          @click="copyText(r.value, '记录值已复制')"
                        >
                          <Copy class="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell class="text-muted-foreground tabular-nums">{{ r.ttl }}</TableCell>
                    <TableCell class="text-muted-foreground">{{ r.priority ?? '-' }}</TableCell>
                    <TableCell>
                      <template v-if="cdnSupported && canToggleCdn(r)">
                        <div class="flex items-center gap-1.5" @click.stop>
                          <Switch
                            :checked="!!r.proxied"
                            :disabled="!canEdit || togglingCdnId === r.id"
                            @update:checked="(v: boolean) => toggleRecordCdn(r, v)"
                          />
                          <span
                            class="text-xs"
                            :class="r.proxied ? 'text-orange-500 font-medium' : 'text-muted-foreground'"
                          >
                            {{ r.proxied ? '开' : '关' }}
                          </span>
                        </div>
                      </template>
                      <template v-else-if="r.proxied">
                        <span class="text-orange-500 dark:text-orange-400 text-xs font-medium">已代理</span>
                      </template>
                      <span v-else class="text-muted-foreground">-</span>
                    </TableCell>
                    <TableCell class="max-w-[8rem] truncate text-xs text-muted-foreground" :title="r.notes || ''">
                      {{ r.notes || '—' }}
                    </TableCell>
                    <TableCell class="text-right whitespace-nowrap">
                      <Button
                        variant="ghost"
                        size="sm"
                        class="h-8"
                        title="检测解析传播"
                        :disabled="propagatingId === r.id"
                        @click="handlePropagate(r)"
                      >
                        {{ propagatingId === r.id ? '检测…' : '传播' }}
                      </Button>
                      <template v-if="canEdit">
                        <Button @click="openEditRecord(r)" variant="ghost" size="sm" class="h-8">编辑</Button>
                        <Button @click="openCloneRecord(r)" variant="ghost" size="sm" class="h-8">克隆</Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          class="h-8"
                          title="复制 dig 命令"
                          @click="copyDigCommand(r)"
                        >
                          dig
                        </Button>
                        <Button @click="handleDeleteRecord(r.id)" variant="ghost" size="sm" class="h-8 text-destructive hover:text-destructive">删除</Button>
                      </template>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>

            <div class="md:hidden space-y-3">
              <Card v-for="r in store.records" :key="r.id">
                <CardContent class="p-3">
                  <div class="flex items-center justify-between mb-1">
                    <div class="flex items-center gap-2 min-w-0">
                      <Checkbox
                        v-if="canEdit"
                        :checked="selectedRecordIds.includes(r.id)"
                        @update:checked="(v: boolean) => toggleRecordSelect(r.id, v)"
                      />
                      <Badge variant="secondary" class="text-xs">{{ r.recordType }}</Badge>
                      <span class="font-medium text-sm font-mono">{{ r.name }}</span>
                    </div>
                    <div v-if="canEdit" class="flex gap-1 shrink-0 flex-wrap justify-end">
                      <Button @click="openEditRecord(r)" variant="ghost" size="sm" class="text-primary h-7 px-2">编辑</Button>
                      <Button @click="openCloneRecord(r)" variant="ghost" size="sm" class="h-7 px-2">克隆</Button>
                      <Button @click="copyDigCommand(r)" variant="ghost" size="sm" class="h-7 px-2">dig</Button>
                      <Button @click="handleDeleteRecord(r.id)" variant="ghost" size="sm" class="text-destructive h-7 px-2">删除</Button>
                    </div>
                  </div>
                  <div class="text-xs text-muted-foreground break-all font-mono flex items-start gap-1">
                    <span class="flex-1">{{ r.value }}</span>
                    <Button variant="ghost" size="icon" class="h-6 w-6 shrink-0" @click="copyText(r.value, '记录值已复制')">
                      <Copy class="h-3 w-3" />
                    </Button>
                  </div>
                  <div class="flex gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                    <span>TTL: {{ r.ttl }}</span>
                    <span v-if="r.priority">优先级: {{ r.priority }}</span>
                    <span v-if="r.proxied" class="text-orange-500">已代理</span>
                    <span v-if="r.notes" class="truncate">备注: {{ r.notes }}</span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    class="mt-2 h-7 w-full"
                    :disabled="propagatingId === r.id"
                    @click="handlePropagate(r)"
                  >
                    {{ propagatingId === r.id ? '检测传播中…' : '检测解析传播' }}
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>

          <RecordEditForm
            v-if="showRecordForm"
            :domain-id="domainId"
            :domain-name="domain?.name || ''"
            :record="editingRecord"
            :defaults="cloneDefaults"
            :allowed-patterns="myScopes.filter((s) => s.permission === 'dns_edit').map((s) => s.subdomainPattern)"
            :cdn-supported="cdnSupported"
            :cdn-proxy-types="cdnProxyTypes"
            :cdn-label="cdnLabel"
            :cdn-description="cdnDescription"
            @close="closeRecordForm"
            @saved="handleRecordSaved"
          />

          <DnsTemplateDialog
            v-if="domain"
            v-model:open="showTemplateDialog"
            :domain-id="domainId"
            :domain-name="domain.name"
            @applied="handleTemplateApplied"
          />

          <PasteRecordsDialog
            v-if="domain"
            v-model:open="showPasteDialog"
            :domain-id="domainId"
            @applied="handleTemplateApplied"
          />
        </TabsContent>

        <TabsContent value="snapshots">
          <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 gap-3">
            <Button
              v-if="canEdit"
              @click="handleCreateSnapshot"
              :disabled="creatingSnapshot"
              size="sm"
            >
              {{ creatingSnapshot ? '创建中...' : '创建快照' }}
            </Button>
            <div class="flex items-center gap-2 sm:ml-auto flex-wrap">
              <Select v-model="diffFromVersion">
                <SelectTrigger class="w-[120px]">
                  <SelectValue placeholder="源版本" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="s in store.snapshots" :key="'f-' + s.version" :value="String(s.version)">v{{ s.version }}</SelectItem>
                </SelectContent>
              </Select>
              <span class="text-muted-foreground">→</span>
              <Select v-model="diffToVersion">
                <SelectTrigger class="w-[120px]">
                  <SelectValue placeholder="目标版本" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="s in store.snapshots" :key="'t-' + s.version" :value="String(s.version)">v{{ s.version }}</SelectItem>
                </SelectContent>
              </Select>
              <Button
                @click="handleDiff"
                :disabled="!diffFromVersion || !diffToVersion"
                variant="secondary"
                size="sm"
              >
                比较
              </Button>
            </div>
          </div>

          <div v-if="store.snapshotDiff" class="mb-6">
            <SnapshotDiff :diff="store.snapshotDiff" />
          </div>

          <div v-if="store.snapshots.length === 0" class="text-center py-8 text-muted-foreground">暂无快照</div>
          <div v-else>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>版本</TableHead>
                  <TableHead>触发方式</TableHead>
                  <TableHead>创建时间</TableHead>
                  <TableHead class="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow v-for="s in store.snapshots" :key="s.id">
                  <TableCell class="font-medium">v{{ s.version }}</TableCell>
                  <TableCell>
                    <Badge :variant="triggerBadgeVariant(s.trigger)">{{ triggerLabel(s.trigger) }}</Badge>
                  </TableCell>
                  <TableCell class="text-muted-foreground">{{ new Date(s.createdAt).toLocaleString('zh-CN') }}</TableCell>
                  <TableCell class="text-right">
                    <Button @click="viewSnapshotDetail(s.id)" variant="link" size="sm" class="text-primary">查看</Button>
                    <Button
                      v-if="isAdmin"
                      @click="handleRollback(s.id, s.version)"
                      variant="link"
                      size="sm"
                      class="text-orange-500 dark:text-orange-400"
                    >
                      回滚
                    </Button>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </TabsContent>
        <TabsContent value="monitor">
          <Card class="mb-4">
            <CardHeader>
              <CardTitle class="text-sm">UptimeKuma 集成</CardTitle>
            </CardHeader>
            <CardContent>
              <div v-if="isAdmin">
                <div v-if="!uptimeStore.config?.configured" class="space-y-3">
                  <p class="text-sm text-muted-foreground">配置 UptimeKuma Push URL 以启用监控推送</p>
                  <div class="flex gap-2">
                    <Input
                      v-model="uptimePushUrl"
                      type="text"
                      placeholder="https://uptime.kuma.pet/api/push/{token}"
                      class="flex-1"
                    />
                    <Button
                      @click="handleConfigureUptime"
                      :disabled="uptimeStore.configuring || !uptimePushUrl"
                      size="sm"
                    >
                      {{ uptimeStore.configuring ? '配置中...' : '配置' }}
                    </Button>
                  </div>
                </div>
                <div v-else class="flex items-center justify-between">
                  <div class="text-sm">
                    <Badge variant="default">已配置</Badge>
                    <span class="text-muted-foreground ml-2">{{ uptimeStore.config.pushUrl }}</span>
                  </div>
                  <Button
                    @click="handleRemoveUptime"
                    variant="destructive"
                    size="sm"
                  >
                    移除配置
                  </Button>
                </div>
              </div>
              <div v-else class="text-sm text-muted-foreground">
                联系管理员配置 UptimeKuma 集成
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div class="flex items-center justify-between">
                <CardTitle class="text-sm">可用性监控</CardTitle>
                <div class="flex items-center gap-2">
                  <Switch
                    v-if="isAdmin"
                    :checked="monitorEnabled"
                    @update:checked="handleToggleMonitor"
                  />
                  <Button
                    @click="handleMonitorCheck"
                    :disabled="monitorStore.checking || !monitorEnabled"
                    size="sm"
                  >
                    {{ monitorStore.checking ? '探测中...' : '立即探测' }}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div v-if="!monitorEnabled" class="text-center py-6 text-sm text-muted-foreground">
                监控未启用{{ isAdmin ? '，请开启开关以定时探测域名可用性' : '' }}
              </div>
              <div v-else-if="monitorStore.history.length === 0" class="text-center py-6 text-sm text-muted-foreground">
                暂无探测记录，点击"立即探测"开始
              </div>
              <div v-else class="space-y-3">
                <div class="flex flex-wrap items-center gap-3">
                  <Badge :variant="monitorStore.history[0]?.status === 'up' ? 'default' : 'destructive'">
                    {{ monitorStore.history[0]?.status === 'up' ? '正常' : '不可用' }}
                  </Badge>
                  <span class="text-sm text-muted-foreground">
                    响应时间: <span class="font-medium">{{ monitorStore.history[0]?.responseMs ?? '-' }}ms</span>
                  </span>
                  <span class="text-xs text-muted-foreground">
                    可用率: <span class="font-medium">{{ monitorAvailability }}%</span>（近 {{ monitorStore.history.length }} 次）
                  </span>
                </div>
                <div class="flex gap-1 items-end h-20">
                  <div
                    v-for="(h, i) in [...monitorStore.history].slice(0, 48).reverse()"
                    :key="h.id || i"
                    :class="h.status === 'up' ? 'bg-primary' : 'bg-destructive'"
                    class="flex-1 rounded-t min-w-[4px]"
                    :style="{ height: Math.max(15, Math.min(100, (h.responseMs ?? 500) / 10)) + '%' }"
                    :title="`${h.status === 'up' ? '正常' : '异常'} ${h.responseMs ?? '-'}ms ${new Date(h.checkedAt).toLocaleString('zh-CN')}`"
                  ></div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div class="flex items-center justify-between">
                <CardTitle class="text-sm">健康检查</CardTitle>
                <Button
                  @click="handleHealthCheck"
                  :disabled="uptimeStore.checking"
                  size="sm"
                >
                  {{ uptimeStore.checking ? '检查中...' : '立即检查' }}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div v-if="uptimeStore.status" class="space-y-3">
                <div class="flex items-center gap-3">
                  <Badge :variant="uptimeStore.status.up ? 'default' : 'destructive'">
                    {{ uptimeStore.status.up ? '正常运行' : '无法访问' }}
                  </Badge>
                  <span class="text-sm text-muted-foreground">
                    响应时间: <span class="font-medium">{{ uptimeStore.status.responseTime }}ms</span>
                  </span>
                  <span class="text-xs text-muted-foreground">
                    最后检查: {{ new Date(uptimeStore.status.lastChecked).toLocaleString('zh-CN') }}
                  </span>
                </div>

                <div v-if="uptimeStore.status.history && uptimeStore.status.history.length > 1" class="mt-4">
                  <h4 class="text-xs font-medium text-muted-foreground mb-2">最近检查记录</h4>
                  <div class="flex gap-1 items-end h-16">
                    <div
                      v-for="(h, i) in uptimeStore.status.history.slice(0, 20)"
                      :key="i"
                      :class="h.up ? 'bg-primary' : 'bg-destructive'"
                      class="flex-1 rounded-t min-w-[8px]"
                      :style="{ height: Math.max(20, Math.min(100, h.responseTime / 10)) + '%' }"
                      :title="`${h.up ? '正常' : '异常'} ${h.responseTime}ms ${new Date(h.timestamp).toLocaleString('zh-CN')}`"
                    ></div>
                  </div>
                </div>
              </div>
              <div v-else class="text-center py-6 text-sm text-muted-foreground">点击"立即检查"查看域名状态</div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="speedtest">
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <div class="flex items-center justify-between">
                  <CardTitle class="text-sm">DNS 解析测速</CardTitle>
                  <Button
                    @click="handleDnsTest"
                    :disabled="speedtestStore.dnsLoading"
                    size="sm"
                  >
                    {{ speedtestStore.dnsLoading ? '测试中...' : '开始测试' }}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div v-if="speedtestStore.dnsResults.length > 0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>DNS 服务器</TableHead>
                        <TableHead>耗时</TableHead>
                        <TableHead>解析结果</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow v-for="r in speedtestStore.dnsResults" :key="r.server">
                        <TableCell class="text-xs">{{ r.label }}</TableCell>
                        <TableCell class="text-xs">
                          <span :class="r.time < 50 ? 'text-primary' : r.time < 200 ? 'text-yellow-500 dark:text-yellow-400' : 'text-destructive'" class="font-medium">
                            {{ r.time }}ms
                          </span>
                        </TableCell>
                        <TableCell class="text-xs text-muted-foreground">
                          <span v-if="r.error" class="text-destructive">{{ r.error }}</span>
                          <span v-else-if="r.answers.length === 0">-</span>
                          <span v-else>{{ r.answers.join(', ') }}</span>
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
                <div v-else class="text-center py-6 text-sm text-muted-foreground">点击"开始测试"进行 DNS 解析测速</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div class="flex items-center justify-between">
                  <CardTitle class="text-sm">HTTP 可用性测试</CardTitle>
                  <Button
                    @click="handleHttpTest"
                    :disabled="speedtestStore.httpLoading"
                    size="sm"
                  >
                    {{ speedtestStore.httpLoading ? '测试中...' : '开始测试' }}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div v-if="speedtestStore.httpResult" class="space-y-3">
                  <div class="grid grid-cols-3 gap-2 sm:gap-4">
                    <div class="rounded-md bg-muted p-3 text-center">
                      <div class="text-xs text-muted-foreground">TTFB</div>
                      <div class="mt-1 text-lg font-bold" :class="speedtestStore.httpResult.ttfb < 200 ? 'text-primary' : speedtestStore.httpResult.ttfb < 1000 ? 'text-yellow-500 dark:text-yellow-400' : 'text-destructive'">
                        {{ speedtestStore.httpResult.ttfb }}ms
                      </div>
                    </div>
                    <div class="rounded-md bg-muted p-3 text-center">
                      <div class="text-xs text-muted-foreground">总耗时</div>
                      <div class="mt-1 text-lg font-bold" :class="speedtestStore.httpResult.totalTime < 500 ? 'text-primary' : speedtestStore.httpResult.totalTime < 2000 ? 'text-yellow-500 dark:text-yellow-400' : 'text-destructive'">
                        {{ speedtestStore.httpResult.totalTime }}ms
                      </div>
                    </div>
                    <div class="rounded-md bg-muted p-3 text-center">
                      <div class="text-xs text-muted-foreground">状态码</div>
                      <div class="mt-1 text-lg font-bold" :class="speedtestStore.httpResult.statusCode >= 200 && speedtestStore.httpResult.statusCode < 400 ? 'text-primary' : 'text-destructive'">
                        {{ speedtestStore.httpResult.statusCode || 'N/A' }}
                      </div>
                    </div>
                  </div>
                  <div v-if="speedtestStore.httpResult.error" class="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                    {{ speedtestStore.httpResult.error }}
                  </div>
                  <div v-if="speedtestStore.httpResult.headers && Object.keys(speedtestStore.httpResult.headers).length > 0">
                    <h4 class="text-xs font-medium text-muted-foreground mb-1">响应头</h4>
                    <div class="rounded-md bg-muted p-2 text-xs font-mono text-muted-foreground max-h-40 overflow-y-auto">
                      <div v-for="(value, key) in speedtestStore.httpResult.headers" :key="key">
                        {{ key }}: {{ value }}
                      </div>
                    </div>
                  </div>
                </div>
                <div v-else class="text-center py-6 text-sm text-muted-foreground">点击"开始测试"进行 HTTP 可用性测试</div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        </Tabs>

      </template>
    </div>

    <Dialog v-if="showSnapshotDetail && store.currentSnapshot" v-model:open="showSnapshotDetail">
      <DialogContent class="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>快照 v{{ (store.currentSnapshot as any).version }}</DialogTitle>
          <DialogDescription>
            触发方式: {{ triggerLabel((store.currentSnapshot as any).trigger) }} · 创建时间: {{ new Date((store.currentSnapshot as any).createdAt).toLocaleString('zh-CN') }}
          </DialogDescription>
        </DialogHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>类型</TableHead>
              <TableHead>主机记录</TableHead>
              <TableHead>记录值</TableHead>
              <TableHead>TTL</TableHead>
              <TableHead>优先级</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="(r, i) in ((store.currentSnapshot as any).records || [])" :key="i">
              <TableCell class="text-xs">{{ r.recordType }}</TableCell>
              <TableCell class="text-xs">{{ r.name }}</TableCell>
              <TableCell class="text-xs text-muted-foreground max-w-xs truncate" :title="r.value">{{ r.value }}</TableCell>
              <TableCell class="text-xs text-muted-foreground">{{ r.ttl }}</TableCell>
              <TableCell class="text-xs text-muted-foreground">{{ r.priority ?? '-' }}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </DialogContent>
    </Dialog>

    <Dialog v-model:open="showPropagateDialog">
      <DialogContent class="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>解析传播检测</DialogTitle>
          <DialogDescription v-if="propagateResult">
            {{ propagateResult.recordType }} · {{ propagateResult.fqdn }}
            <span v-if="propagateResult.expectedValue" class="block font-mono text-xs mt-1 truncate">
              期望: {{ propagateResult.expectedValue }}
            </span>
          </DialogDescription>
        </DialogHeader>
        <div v-if="propagateResult" class="space-y-3">
          <div class="flex flex-wrap gap-2 text-sm">
            <Badge variant="default">匹配 {{ propagateResult.matched }}/{{ propagateResult.total }}</Badge>
            <Badge variant="secondary">可解析 {{ propagateResult.resolved }}/{{ propagateResult.total }}</Badge>
          </div>
          <div class="space-y-2">
            <div
              v-for="hit in propagateResult.results"
              :key="hit.ip"
              class="rounded-lg border px-3 py-2 text-sm"
            >
              <div class="flex items-center justify-between gap-2">
                <div class="font-medium">
                  {{ hit.name }}
                  <span class="text-xs font-normal text-muted-foreground font-mono ml-1">{{ hit.ip }}</span>
                </div>
                <Badge :variant="hit.matched ? 'default' : hit.ok ? 'secondary' : 'destructive'">
                  {{ hit.matched ? '已匹配' : hit.ok ? '不一致' : '失败' }}
                </Badge>
              </div>
              <div class="mt-1 text-xs text-muted-foreground font-mono break-all">
                <template v-if="hit.ok">{{ hit.values.join(' · ') || '（空）' }} · {{ hit.latencyMs }}ms</template>
                <template v-else>{{ hit.error }}</template>
              </div>
            </div>
          </div>
          <p class="text-[11px] text-muted-foreground">
            结果仅供参考：部分解析器有缓存，TTL 未到期时可能暂时不一致。
          </p>
        </div>
      </DialogContent>
    </Dialog>

    <AlertDialog :open="pendingDisableOneDay">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>确认关闭 1 天前提醒</AlertDialogTitle>
          <AlertDialogDescription>
            域名 {{ domain?.name }} 在这一天后到期，您确定不提醒吗？关闭后将无法在到期前 1 天收到任何提醒，可能导致错过最后续费机会。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel @click="pendingDisableOneDay = false">取消</AlertDialogCancel>
          <AlertDialogAction @click="confirmDisableOneDayRemind">确认关闭</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useDomainStore, type DnsRecord } from '@/stores/domain';
import { useAuthStore } from '@/stores/auth';
import { useUptimeStore } from '@/stores/uptime';
import { useSpeedtestStore } from '@/stores/speedtest';
import { useMonitorStore } from '@/stores/monitor';
import { DNS_RECORD_TYPES, DEFAULT_EXPIRY_REMIND_DAYS } from '@dmhub/shared/constants';
import RecordEditForm from '@/components/domain/RecordEditForm.vue';
import SnapshotDiff from '@/components/domain/SnapshotDiff.vue';
import DnsTemplateDialog from '@/components/domain/DnsTemplateDialog.vue';
import PasteRecordsDialog from '@/components/domain/PasteRecordsDialog.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import { Skeleton } from '@/components/ui/skeleton';
import api from '@/lib/axios';
import { copyText } from '@/lib/copy';
import { confirmDialog } from '@/composables/use-confirm';
import { toastSuccess, toastError, toastInfo } from '@/lib/toast-helpers';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { ArrowLeft, Pencil, Search, Copy, Download, RefreshCw, LayoutTemplate, Plus, Shield, Star, ClipboardPaste } from 'lucide-vue-next';
import {
  formatHostPreview,
  formatScopeLabel,
  permissionLabel,
} from '@/lib/subdomain-scope';
import { isFavoriteDomain, toggleFavoriteDomain } from '@/lib/favorites';
import { pushRecentDomain } from '@/lib/recent-domains';
import type { DomainAssignmentScope } from '@/stores/domain';
import { Textarea } from '@/components/ui/textarea';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const route = useRoute();
const router = useRouter();
const store = useDomainStore();
const authStore = useAuthStore();
const uptimeStore = useUptimeStore();
const speedtestStore = useSpeedtestStore();
const monitorStore = useMonitorStore();
const domainId = computed(() => route.params.id as string);

const domain = computed(() => store.currentDomain);
const isAdmin = computed(() => authStore.user?.role === 'admin');
const monitorEnabled = ref(false);
const monitorAvailability = computed(() => {
  const h = monitorStore.history;
  if (h.length === 0) return 0;
  const up = h.filter((x: any) => x.status === 'up').length;
  return Math.round((up / h.length) * 100);
});

const myScopes = computed<DomainAssignmentScope[]>(() => {
  const d = store.currentDomain;
  if (!d || isAdmin.value) return [];
  if (d.assignments && d.assignments.length > 0) return d.assignments;
  if (d.assignment) return [d.assignment];
  return [];
});

const canEdit = computed(() => {
  if (isAdmin.value) return true;
  return myScopes.value.some((a) => a.permission === 'dns_edit');
});

const syncing = ref(false);
const syncResult = ref<{ synced: number; created: number; updated: number } | null>(null);
const typeFilter = ref('all');
const recordSearch = ref('');
const showRecordForm = ref(false);
const showTemplateDialog = ref(false);
const showPasteDialog = ref(false);
const selectedRecordIds = ref<string[]>([]);
const editingRecord = ref<DnsRecord | null>(null);
const cloneDefaults = ref<Partial<DnsRecord> | null>(null);
const bulkTtl = ref<string>('');
const propagatingId = ref<string | null>(null);
const showPropagateDialog = ref(false);
const propagateResult = ref<{
  fqdn: string;
  recordType: string;
  expectedValue: string | null;
  total: number;
  resolved: number;
  matched: number;
  results: Array<{
    name: string;
    ip: string;
    ok: boolean;
    matched: boolean;
    values: string[];
    error?: string;
    latencyMs: number;
  }>;
} | null>(null);
const checkingSsl = ref(false);
const togglingCdnId = ref<string | null>(null);
const bulkCdnLoading = ref(false);

const cdnSupported = computed(() => domain.value?.cdnProxy?.supported === true);
const cdnProxyTypes = computed(() => domain.value?.cdnProxy?.proxyRecordTypes || ['A', 'AAAA', 'CNAME']);
const cdnLabel = computed(() => domain.value?.cdnProxy?.proxyLabel || 'CDN 保护');
const cdnDescription = computed(
  () => domain.value?.cdnProxy?.proxyDescription || '',
);

function canToggleCdn(r: DnsRecord) {
  return cdnSupported.value && cdnProxyTypes.value.includes(r.recordType);
}

async function toggleRecordCdn(r: DnsRecord, enabled: boolean) {
  if (!canEdit.value || !canToggleCdn(r)) return;
  togglingCdnId.value = r.id;
  try {
    await store.updateRecord(domainId.value, r.id, { proxied: enabled });
    toastSuccess(enabled ? '已开启 CDN 保护' : '已关闭 CDN 保护');
  } catch (err: any) {
    toastError('更新失败', err.response?.data?.error || err.message);
  } finally {
    togglingCdnId.value = null;
  }
}

async function handleBulkCdn(enabled: boolean) {
  const ids = selectedRecordIds.value.filter((id) => {
    const r = store.records.find((x) => x.id === id);
    return r && canToggleCdn(r);
  });
  if (!ids.length) {
    toastError('所选记录中没有可开关 CDN 的类型', `支持：${cdnProxyTypes.value.join(', ')}`);
    return;
  }
  const ok = await confirmDialog({
    title: enabled ? '批量开启 CDN' : '批量关闭 CDN',
    description: `将对 ${ids.length} 条 ${cdnProxyTypes.value.join('/')} 记录${enabled ? '开启' : '关闭'} CDN 保护（${cdnLabel.value}）。`,
    confirmText: enabled ? '开启' : '关闭',
  });
  if (!ok) return;
  bulkCdnLoading.value = true;
  try {
    const result = await store.bulkUpdateRecords(domainId.value, ids, { proxied: enabled });
    if (result.succeeded === result.total) toastSuccess(`已更新 ${result.succeeded} 条`);
    else toastError(`完成：成功 ${result.succeeded}，失败 ${result.failed}`);
    selectedRecordIds.value = [];
    await loadRecords();
  } catch (err: any) {
    toastError('批量更新失败', err.response?.data?.error || err.message);
  } finally {
    bulkCdnLoading.value = false;
  }
}

const sslExpiryLabel = computed(() => {
  const d = domain.value;
  if (!d?.sslExpiresAt) return '未检测';
  const days = Math.ceil((new Date(d.sslExpiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (days < 0) return `已过期 ${Math.abs(days)} 天`;
  if (days === 0) return '今天到期';
  return `${new Date(d.sslExpiresAt).toLocaleDateString('zh-CN')}（${days}天）`;
});

const sslExpiryClass = computed(() => {
  const d = domain.value;
  if (!d?.sslExpiresAt) return 'text-muted-foreground';
  const days = Math.ceil((new Date(d.sslExpiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (days < 0) return 'text-destructive font-medium';
  if (days <= 14) return 'text-amber-600 dark:text-amber-400 font-medium';
  return 'text-sm';
});

async function handlePropagate(r: DnsRecord) {
  propagatingId.value = r.id;
  try {
    const data = await store.checkPropagation(domainId.value, r.id);
    propagateResult.value = data;
    showPropagateDialog.value = true;
    if (data.matched === data.total) toastSuccess('各解析器均已匹配');
    else if (data.matched > 0) toastInfo('部分解析器已匹配', `${data.matched}/${data.total}`);
    else toastError('尚未匹配', '可能仍在传播或记录值不一致');
  } catch (err: any) {
    toastError('传播检测失败', err.response?.data?.error || err.message);
  } finally {
    propagatingId.value = null;
  }
}

async function handleSslCheck() {
  checkingSsl.value = true;
  try {
    const data = await store.checkSsl(domainId.value);
    if (data.success) {
      toastSuccess(
        '证书检测完成',
        data.daysRemaining != null
          ? `剩余 ${data.daysRemaining} 天 · ${data.issuer || ''}`
          : data.subject || '成功',
      );
      await store.fetchDomain(domainId.value);
    } else {
      toastError('证书检测失败', data.error || '无法连接 443');
    }
  } catch (err: any) {
    toastError('证书检测失败', err.response?.data?.error || err.message);
  } finally {
    checkingSsl.value = false;
  }
}
const activeTab = ref('records');
const creatingSnapshot = ref(false);
const showSnapshotDetail = ref(false);
const diffFromVersion = ref('');
const diffToVersion = ref('');
const editingGroup = ref(false);
const groupInput = ref('');
const editingExpiry = ref(false);
const expiryInput = ref('');
const checkingExpiry = ref(false);
const newTag = ref('');
const uptimePushUrl = ref('');
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

const allRecordsSelected = computed(
  () => store.records.length > 0 && selectedRecordIds.value.length === store.records.length,
);

function toggleRecordSelect(id: string, checked: boolean) {
  if (checked) {
    if (!selectedRecordIds.value.includes(id)) selectedRecordIds.value.push(id);
  } else {
    selectedRecordIds.value = selectedRecordIds.value.filter((x) => x !== id);
  }
}

function toggleSelectAllRecords(checked: boolean) {
  selectedRecordIds.value = checked ? store.records.map((r) => r.id) : [];
}

function handleTemplateApplied() {
  selectedRecordIds.value = [];
  loadRecords();
  store.fetchDomain(domainId.value);
}

const favorited = ref(false);
const editingNotes = ref(false);
const notesInput = ref('');
const savingNotes = ref(false);

function toggleFavorite() {
  if (!domain.value) return;
  favorited.value = toggleFavoriteDomain(domain.value.id);
  toastSuccess(favorited.value ? '已收藏' : '已取消收藏');
}

function startEditNotes() {
  notesInput.value = domain.value?.notes || '';
  editingNotes.value = true;
}

async function saveNotes() {
  savingNotes.value = true;
  try {
    await store.updateDomainNotes(domainId.value, notesInput.value);
    editingNotes.value = false;
    toastSuccess('备注已保存');
  } catch (err: any) {
    toastError('保存失败', err.response?.data?.error || err.message);
  } finally {
    savingNotes.value = false;
  }
}

async function handleExportRecords(format: 'csv' | 'json' | 'zone' = 'csv') {
  try {
    const response = await api.get(`/export/dns-records/${domainId.value}`, {
      params: { format },
      responseType: 'blob',
    });
    const url = URL.createObjectURL(response.data);
    const link = document.createElement('a');
    link.href = url;
    const base = domain.value?.name || 'records';
    const ext = format === 'zone' ? 'zone' : format === 'json' ? 'json' : 'csv';
    link.download = format === 'zone' ? `${base}.zone` : `${base}-dns.${ext}`;
    link.click();
    URL.revokeObjectURL(url);
    toastSuccess(format === 'zone' ? 'BIND Zone 已导出' : '记录已导出');
  } catch (err: any) {
    toastError('导出失败', err.response?.data?.error || err.message);
  }
}

watch(
  () => domain.value?.id,
  (id) => {
    favorited.value = id ? isFavoriteDomain(id) : false;
  },
  { immediate: true },
);

async function handleBulkDeleteRecords() {
  const ids = [...selectedRecordIds.value];
  if (!ids.length) return;
  const ok = await confirmDialog({
    title: '批量删除记录',
    description: `确定删除选中的 ${ids.length} 条 DNS 记录吗？此操作会同步到 DNS 服务商。`,
    confirmText: '删除',
    variant: 'destructive',
  });
  if (!ok) return;
  try {
    const result = await store.bulkDeleteRecords(domainId.value, ids);
    selectedRecordIds.value = [];
    if (result.succeeded === result.total) toastSuccess(`已删除 ${result.succeeded} 条记录`);
    else toastError(`删除完成：成功 ${result.succeeded}，失败 ${result.failed}`);
    await loadRecords();
    store.fetchDomain(domainId.value);
  } catch (err: any) {
    toastError('批量删除失败', err.response?.data?.error || err.message);
  }
}

async function handleBulkTtl(value: string) {
  const ttl = Number(value);
  const ids = [...selectedRecordIds.value];
  bulkTtl.value = '';
  if (!ids.length || !ttl) return;
  const ok = await confirmDialog({
    title: '批量修改 TTL',
    description: `将选中的 ${ids.length} 条记录 TTL 改为 ${ttl} 秒？`,
    confirmText: '确认修改',
  });
  if (!ok) return;
  try {
    const result = await store.bulkUpdateRecords(domainId.value, ids, { ttl });
    if (result.succeeded === result.total) toastSuccess(`已更新 ${result.succeeded} 条 TTL`);
    else toastError(`更新完成：成功 ${result.succeeded}，失败 ${result.failed}`);
    selectedRecordIds.value = [];
    await loadRecords();
  } catch (err: any) {
    toastError('批量改 TTL 失败', err.response?.data?.error || err.message);
  }
}

function closeRecordForm() {
  showRecordForm.value = false;
  editingRecord.value = null;
  cloneDefaults.value = null;
}

function openCloneRecord(r: DnsRecord) {
  editingRecord.value = null;
  cloneDefaults.value = {
    recordType: r.recordType,
    name: r.name,
    value: r.value,
    ttl: r.ttl,
    priority: r.priority,
    proxied: r.proxied,
  };
  showRecordForm.value = true;
}

function copyDigCommand(r: DnsRecord) {
  const host =
    !r.name || r.name === '@'
      ? domain.value?.name || ''
      : r.name.endsWith(`.${domain.value?.name}`)
        ? r.name
        : `${r.name}.${domain.value?.name || ''}`;
  const cmd = `dig ${r.recordType} ${host}`;
  copyText(cmd, 'dig 命令已复制');
}

const recordTypes = DNS_RECORD_TYPES;

const remindDayOptions = [30, 14, 7, 3, 1, 0];
const expiryRemindDays = computed(() => {
  const d = store.currentDomain;
  if (!d) return DEFAULT_EXPIRY_REMIND_DAYS;
  return (d as any).expiryRemindDays ?? DEFAULT_EXPIRY_REMIND_DAYS;
});

async function toggleRemindDay(day: number) {
  if (day === 0) return;
  if (day === 1 && expiryRemindDays.value.includes(1)) {
    pendingDisableOneDay.value = true;
    return;
  }
  await applyToggleRemindDay(day);
}

async function applyToggleRemindDay(day: number) {
  const current = [...expiryRemindDays.value];
  const idx = current.indexOf(day);
  if (idx !== -1) {
    current.splice(idx, 1);
  } else {
    current.push(day);
    current.sort((a, b) => b - a);
  }
  if (!current.includes(0)) current.push(0);
  try {
    await api.put(`/domains/${domainId.value}/expiry-remind`, { expiryRemindDays: current });
    store.fetchDomain(domainId.value);
  } catch (err: any) {
    toastError('更新失败', err.response?.data?.error || err.message);
  }
}

const pendingDisableOneDay = ref(false);
async function confirmDisableOneDayRemind() {
  pendingDisableOneDay.value = false;
  await applyToggleRemindDay(1);
}

async function toggleAutoCheck() {
  try {
    await api.put(`/domains/${domainId.value}/expiry-remind`, {
      autoCheckExpiry: !domain.value?.autoCheckExpiry,
    });
    store.fetchDomain(domainId.value);
  } catch (err: any) {
    toastError('更新失败', err.response?.data?.error || err.message);
  }
}

const recordSummary = computed(() => {
  const counts: Record<string, number> = {};
  for (const r of store.records) {
    counts[r.recordType] = (counts[r.recordType] || 0) + 1;
  }
  return Object.entries(counts).map(([type, count]) => ({ type, count })).sort((a, b) => a.type.localeCompare(b.type));
});

function debouncedLoadRecords() {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(loadRecords, 300);
}

function loadRecords() {
  store.fetchRecords(domainId.value, {
    type: typeFilter.value === 'all' ? undefined : typeFilter.value || undefined,
    search: recordSearch.value || undefined,
  });
}

function statusVariant(status: string): 'default' | 'destructive' | 'secondary' | 'outline' {
  if (status === 'active') return 'default';
  if (status === 'expired') return 'destructive';
  if (status === 'transferred') return 'secondary';
  return 'outline';
}

function statusLabel(status: string) {
  if (status === 'active') return '正常';
  if (status === 'expired') return '已过期';
  if (status === 'transferred') return '已转移';
  return status;
}

function triggerBadgeVariant(trigger: string): 'default' | 'secondary' | 'outline' {
  if (trigger === 'manual') return 'default';
  if (trigger === 'on_change') return 'secondary';
  return 'outline';
}

function triggerLabel(trigger: string) {
  if (trigger === 'manual') return '手动';
  if (trigger === 'on_change') return '自动';
  if (trigger === 'scheduled') return '定时';
  return trigger;
}

async function handleSync() {
  syncing.value = true;
  syncResult.value = null;
  try {
    syncResult.value = await store.syncRecords(domainId.value);
    await store.fetchDomain(domainId.value);
    loadRecords();
    toastSuccess('同步完成', `处理 ${syncResult.value.synced} 条记录`);
  } catch (err: any) {
    toastError('同步失败', err.response?.data?.error || err.message);
  } finally {
    syncing.value = false;
  }
}

async function handleDelete() {
  const ok = await confirmDialog({
    title: '删除域名',
    description: `确定删除域名 ${domain.value?.name} 吗？\n将同时删除所有 DNS 记录和分配信息，此操作不可撤销。`,
    confirmText: '删除',
    variant: 'destructive',
  });
  if (!ok) return;
  try {
    await store.deleteDomain(domainId.value);
    toastSuccess('域名已删除');
    router.push('/domains');
  } catch (err: any) {
    toastError('删除失败', err.response?.data?.error || err.message);
  }
}

function openCreateRecord() {
  editingRecord.value = null;
  cloneDefaults.value = null;
  showRecordForm.value = true;
}

function openEditRecord(record: DnsRecord) {
  editingRecord.value = record;
  cloneDefaults.value = null;
  showRecordForm.value = true;
}

async function handleDeleteRecord(recordId: string) {
  const ok = await confirmDialog({
    title: '删除记录',
    description: '确定删除该 DNS 记录吗？将同步到 DNS 服务商。',
    confirmText: '删除',
    variant: 'destructive',
  });
  if (!ok) return;
  try {
    await store.deleteRecord(domainId.value, recordId);
    selectedRecordIds.value = selectedRecordIds.value.filter((id) => id !== recordId);
    toastSuccess('记录已删除');
  } catch (err: any) {
    toastError('删除失败', err.response?.data?.error || err.message);
  }
}

function handleRecordSaved() {
  closeRecordForm();
  loadRecords();
  store.fetchDomain(domainId.value);
  toastSuccess('记录已保存');
}

async function handleCreateSnapshot() {
  creatingSnapshot.value = true;
  try {
    await store.createSnapshot(domainId.value);
    await store.fetchSnapshots(domainId.value);
    toastSuccess('快照已创建');
  } catch (err: any) {
    toastError('创建快照失败', err.response?.data?.error || err.message);
  } finally {
    creatingSnapshot.value = false;
  }
}

async function viewSnapshotDetail(snapshotId: string) {
  try {
    await store.getSnapshotDetail(domainId.value, snapshotId);
    showSnapshotDetail.value = true;
  } catch (err: any) {
    toastError('获取快照详情失败', err.response?.data?.error || err.message);
  }
}

async function handleRollback(snapshotId: string, version: number) {
  const ok = await confirmDialog({
    title: `回滚到 v${version}`,
    description: '将替换所有当前 DNS 记录，当前状态会先保存为快照。此操作影响线上解析，请确认。',
    confirmText: '确认回滚',
    variant: 'destructive',
  });
  if (!ok) return;
  try {
    const result = await store.rollbackSnapshot(domainId.value, snapshotId);
    toastSuccess(
      '回滚完成',
      `删除 ${result.deleted} 条，新增 ${result.created} 条，更新 ${result.updated} 条`,
    );
    await store.fetchDomain(domainId.value);
    loadRecords();
    await store.fetchSnapshots(domainId.value);
  } catch (err: any) {
    toastError('回滚失败', err.response?.data?.error || err.message);
  }
}

async function handleDiff() {
  if (!diffFromVersion.value || !diffToVersion.value) return;
  try {
    await store.diffSnapshots(domainId.value, Number(diffFromVersion.value), Number(diffToVersion.value));
  } catch (err: any) {
    toastError('比较失败', err.response?.data?.error || err.message);
  }
}

function startEditGroup() {
  groupInput.value = domain.value?.groupName || '';
  editingGroup.value = true;
}

async function saveGroup() {
  try {
    await store.updateDomainGroup(domainId.value, groupInput.value);
    editingGroup.value = false;
    toastSuccess('分组已更新');
  } catch (err: any) {
    toastError('更新失败', err.response?.data?.error || err.message);
  }
}

function startEditExpiry() {
  if (domain.value?.expiresAt) {
    expiryInput.value = new Date(domain.value.expiresAt).toISOString().split('T')[0];
  } else {
    expiryInput.value = '';
  }
  editingExpiry.value = true;
}

async function saveExpiry() {
  if (!expiryInput.value) {
    toastError('请选择到期日期');
    return;
  }
  try {
    await api.put(`/domains/${domainId.value}/expiry`, { expiresAt: expiryInput.value });
    editingExpiry.value = false;
    await store.fetchDomain(domainId.value);
    toastSuccess('到期时间已更新');
  } catch (err: any) {
    toastError('更新失败', err.response?.data?.error || err.message);
  }
}

async function handleCheckExpiry() {
  checkingExpiry.value = true;
  try {
    const { data } = await api.post(`/domains/${domainId.value}/check-expiry`);
    await store.fetchDomain(domainId.value);
    const date = data.expiresAt ? new Date(data.expiresAt).toLocaleDateString('zh-CN') : '未知';
    toastSuccess(
      'WHOIS 查询成功',
      `到期时间: ${date}${data.registrar ? ` · 注册商: ${data.registrar}` : ''}`,
    );
  } catch (err: any) {
    toastError('WHOIS 查询失败', err.response?.data?.error || err.message);
  } finally {
    checkingExpiry.value = false;
  }
}

async function addTag() {
  const tag = newTag.value.trim();
  if (!tag) return;
  const currentTags = [...(domain.value?.tags || [])];
  if (currentTags.includes(tag)) { newTag.value = ''; return; }
  currentTags.push(tag);
  try {
    await store.updateDomainTags(domainId.value, currentTags);
    newTag.value = '';
    toastSuccess('标签已添加');
  } catch (err: any) {
    toastError('添加标签失败', err.response?.data?.error || err.message);
  }
}

async function removeTag(tag: string) {
  const currentTags = (domain.value?.tags || []).filter((t: string) => t !== tag);
  try {
    await store.updateDomainTags(domainId.value, currentTags);
  } catch (err: any) {
    toastError('删除标签失败', err.response?.data?.error || err.message);
  }
}

async function handleConfigureUptime() {
  if (!uptimePushUrl.value) return;
  try {
    await uptimeStore.configure(uptimePushUrl.value);
    uptimePushUrl.value = '';
    toastSuccess('UptimeKuma 已配置');
  } catch (err: any) {
    toastError('配置失败', err.response?.data?.error || err.message);
  }
}

async function handleRemoveUptime() {
  const ok = await confirmDialog({
    title: '移除监控配置',
    description: '确定移除 UptimeKuma 配置吗？',
    confirmText: '移除',
    variant: 'destructive',
  });
  if (!ok) return;
  try {
    await uptimeStore.removeConfig();
    toastSuccess('已移除配置');
  } catch (err: any) {
    toastError('移除失败', err.response?.data?.error || err.message);
  }
}

async function handleHealthCheck() {
  try {
    await uptimeStore.checkDomain(domainId.value);
    toastSuccess('健康检查完成');
  } catch (err: any) {
    toastError('检查失败', err.response?.data?.error || err.message);
  }
}

async function handleMonitorCheck() {
  try {
    await monitorStore.checkNow(domainId.value);
    await monitorStore.fetchHistory(domainId.value);
    toastSuccess('探测完成');
  } catch (err: any) {
    toastError('探测失败', err.response?.data?.error || err.message);
  }
}

async function handleToggleMonitor(enabled: boolean) {
  try {
    await monitorStore.setEnabled(domainId.value, enabled);
    monitorEnabled.value = enabled;
    toastSuccess(enabled ? '监控已启用' : '监控已关闭');
    if (enabled) {
      monitorStore.fetchHistory(domainId.value).catch(() => {});
    }
  } catch (err: any) {
    toastError('操作失败', err.response?.data?.error || err.message);
  }
}

async function handleDnsTest() {
  try {
    await speedtestStore.runDnsTest(domainId.value);
    toastSuccess('DNS 测速完成');
  } catch (err: any) {
    toastError('DNS 测试失败', err.response?.data?.error || err.message);
  }
}

async function handleHttpTest() {
  try {
    await speedtestStore.runHttpTest(domainId.value);
    toastSuccess('HTTP 测试完成');
  } catch (err: any) {
    toastError('HTTP 测试失败', err.response?.data?.error || err.message);
  }
}

watch(domainId, (newId) => {
  if (newId) {
    selectedRecordIds.value = [];
    store.fetchDomain(newId);
    loadRecords();
    store.fetchSnapshots(newId);
    store.fetchGroups();
  }
});

watch(activeTab, (tab) => {
  if (tab === 'snapshots') {
    store.fetchSnapshots(domainId.value);
    store.fetchGroups();
  }
  if (tab === 'monitor') {
    uptimeStore.fetchConfig();
    uptimeStore.fetchStatus(domainId.value);
    monitorEnabled.value = !!(store.currentDomain as any)?.monitorEnabled;
    monitorStore.fetchHistory(domainId.value).catch(() => {});
  }
  if (tab === 'speedtest') {
    speedtestStore.reset();
  }
});

onMounted(async () => {
  await store.fetchDomain(domainId.value);
  if (store.currentDomain) {
    pushRecentDomain(store.currentDomain.id, store.currentDomain.name);
    monitorEnabled.value = !!(store.currentDomain as any)?.monitorEnabled;
  }
  loadRecords();
  store.fetchSnapshots(domainId.value);
  store.fetchGroups();
});

onUnmounted(() => {
  if (debounceTimer) clearTimeout(debounceTimer);
});
</script>
