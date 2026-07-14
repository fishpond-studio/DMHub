<template>
  <div class="min-h-screen bg-background">
    <div class="max-w-6xl mx-auto px-4 py-8">
      <div v-if="!domain" class="text-center py-12 text-muted-foreground">加载中...</div>

      <template v-else>
        <div class="flex flex-col sm:flex-row items-start sm:items-center mb-6 gap-3">
          <Button variant="ghost" size="icon" @click="$router.push('/domains')">
            <ArrowLeft class="h-5 w-5" />
          </Button>
          <h1 class="text-xl md:text-2xl font-bold text-foreground truncate">{{ domain.name }}</h1>
          <div class="flex items-center gap-2 sm:ml-auto">
            <Button
              v-if="isAdmin"
              @click="handleSync"
              :disabled="syncing"
              size="sm"
            >
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
                  <span v-if="isAdmin">管理员</span>
                  <span v-else-if="domain.assignment?.permission === 'dns_edit'">可编辑</span>
                  <span v-else>只读</span>
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
          <div class="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-3">
            <div class="flex items-center gap-3 flex-wrap">
              <div class="flex gap-1 flex-wrap">
                <Badge
                  v-for="summary in recordSummary"
                  :key="summary.type"
                  variant="outline"
                >
                  {{ summary.type }}: {{ summary.count }}
                </Badge>
              </div>
              <Select v-model="typeFilter" @update:model-value="loadRecords">
                <SelectTrigger class="w-full sm:w-[130px]">
                  <SelectValue placeholder="全部类型" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部类型</SelectItem>
                  <SelectItem v-for="t in recordTypes" :key="t.type" :value="t.type">{{ t.type }}</SelectItem>
                </SelectContent>
              </Select>
              <Input
                v-model="recordSearch"
                type="text"
                placeholder="搜索记录名..."
                class="w-full sm:w-48"
                @input="debouncedLoadRecords"
              />
              <Button
                v-if="canEdit"
                @click="openCreateRecord"
                size="sm"
              >
                添加记录
              </Button>
            </div>
          </div>

          <div v-if="store.loading" class="text-center py-8 text-muted-foreground">加载中...</div>
          <div v-else-if="store.records.length === 0" class="text-center py-8 text-muted-foreground">暂无 DNS 记录</div>
          <div v-else>
            <div class="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>类型</TableHead>
                    <TableHead>主机记录</TableHead>
                    <TableHead>记录值</TableHead>
                    <TableHead>TTL</TableHead>
                    <TableHead>优先级</TableHead>
                    <TableHead>代理</TableHead>
                    <TableHead v-if="canEdit" class="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow v-for="r in store.records" :key="r.id">
                    <TableCell>
                      <Badge variant="secondary">{{ r.recordType }}</Badge>
                    </TableCell>
                    <TableCell class="font-medium">{{ r.name }}</TableCell>
                    <TableCell class="max-w-xs truncate text-muted-foreground" :title="r.value">{{ r.value }}</TableCell>
                    <TableCell class="text-muted-foreground">{{ r.ttl }}</TableCell>
                    <TableCell class="text-muted-foreground">{{ r.priority ?? '-' }}</TableCell>
                    <TableCell>
                      <span v-if="r.proxied" class="text-orange-500 dark:text-orange-400">已代理</span>
                      <span v-else class="text-muted-foreground">-</span>
                    </TableCell>
                    <TableCell v-if="canEdit" class="text-right">
                      <Button @click="openEditRecord(r)" variant="link" size="sm" class="text-primary">编辑</Button>
                      <Button @click="handleDeleteRecord(r.id)" variant="link" size="sm" class="text-destructive">删除</Button>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>

            <div class="md:hidden space-y-3">
              <Card v-for="r in store.records" :key="r.id">
                <CardContent class="p-3">
                  <div class="flex items-center justify-between mb-1">
                    <div class="flex items-center gap-2">
                      <Badge variant="secondary" class="text-xs">{{ r.recordType }}</Badge>
                      <span class="font-medium text-sm">{{ r.name }}</span>
                    </div>
                    <div v-if="canEdit" class="flex gap-1">
                      <Button @click="openEditRecord(r)" variant="ghost" size="sm" class="text-primary h-7 px-2">编辑</Button>
                      <Button @click="handleDeleteRecord(r.id)" variant="ghost" size="sm" class="text-destructive h-7 px-2">删除</Button>
                    </div>
                  </div>
                  <div class="text-xs text-muted-foreground break-all">{{ r.value }}</div>
                  <div class="flex gap-3 mt-1 text-xs text-muted-foreground">
                    <span>TTL: {{ r.ttl }}</span>
                    <span v-if="r.priority">优先级: {{ r.priority }}</span>
                    <span v-if="r.proxied" class="text-orange-500">已代理</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          <RecordEditForm
            v-if="showRecordForm"
            :domain-id="domainId"
            :record="editingRecord"
            @close="showRecordForm = false"
            @saved="handleRecordSaved"
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
import { useRoute } from 'vue-router';
import { useDomainStore, type DnsRecord } from '@/stores/domain';
import { useAuthStore } from '@/stores/auth';
import { useUptimeStore } from '@/stores/uptime';
import { useSpeedtestStore } from '@/stores/speedtest';
import { DNS_RECORD_TYPES, DEFAULT_EXPIRY_REMIND_DAYS } from '@dmhub/shared/constants';
import RecordEditForm from '@/components/domain/RecordEditForm.vue';
import SnapshotDiff from '@/components/domain/SnapshotDiff.vue';
import api from '@/lib/axios';
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
import { ArrowLeft, Pencil, Search } from 'lucide-vue-next';

const route = useRoute();
const store = useDomainStore();
const authStore = useAuthStore();
const uptimeStore = useUptimeStore();
const speedtestStore = useSpeedtestStore();
const domainId = computed(() => route.params.id as string);

const domain = computed(() => store.currentDomain);
const isAdmin = computed(() => authStore.user?.role === 'admin');
const canEdit = computed(() => isAdmin.value || store.currentDomain?.assignment?.permission === 'dns_edit');

const syncing = ref(false);
const syncResult = ref<{ synced: number; created: number; updated: number } | null>(null);
const typeFilter = ref('all');
const recordSearch = ref('');
const showRecordForm = ref(false);
const editingRecord = ref<DnsRecord | null>(null);
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
    alert(err.response?.data?.error || '更新失败');
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
    alert(err.response?.data?.error || '更新失败');
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
  } catch (err: any) {
    alert(err.response?.data?.error || '同步失败');
  } finally {
    syncing.value = false;
  }
}

async function handleDelete() {
  if (!confirm('确定要删除该域名吗？此操作将同时删除所有 DNS 记录和分配信息。')) return;
  try {
    await store.deleteDomain(domainId.value);
    history.back();
  } catch (err: any) {
    alert(err.response?.data?.error || '删除失败');
  }
}

function openCreateRecord() {
  editingRecord.value = null;
  showRecordForm.value = true;
}

function openEditRecord(record: DnsRecord) {
  editingRecord.value = record;
  showRecordForm.value = true;
}

async function handleDeleteRecord(recordId: string) {
  if (!confirm('确定要删除该记录吗？')) return;
  try {
    await store.deleteRecord(domainId.value, recordId);
  } catch (err: any) {
    alert(err.response?.data?.error || '删除失败');
  }
}

function handleRecordSaved() {
  showRecordForm.value = false;
  loadRecords();
}

async function handleCreateSnapshot() {
  creatingSnapshot.value = true;
  try {
    await store.createSnapshot(domainId.value);
    await store.fetchSnapshots(domainId.value);
  } catch (err: any) {
    alert(err.response?.data?.error || '创建快照失败');
  } finally {
    creatingSnapshot.value = false;
  }
}

async function viewSnapshotDetail(snapshotId: string) {
  try {
    await store.getSnapshotDetail(domainId.value, snapshotId);
    showSnapshotDetail.value = true;
  } catch (err: any) {
    alert(err.response?.data?.error || '获取快照详情失败');
  }
}

async function handleRollback(snapshotId: string, version: number) {
  if (!confirm(`确定要回滚到 v${version} 吗？这将替换所有当前的 DNS 记录，当前状态会被保存为快照。此操作不可撤销！`)) return;
  try {
    const result = await store.rollbackSnapshot(domainId.value, snapshotId);
    alert(`回滚完成：删除 ${result.deleted} 条，新增 ${result.created} 条，更新 ${result.updated} 条`);
    await store.fetchDomain(domainId.value);
    loadRecords();
    await store.fetchSnapshots(domainId.value);
  } catch (err: any) {
    alert(err.response?.data?.error || '回滚失败');
  }
}

async function handleDiff() {
  if (!diffFromVersion.value || !diffToVersion.value) return;
  try {
    await store.diffSnapshots(domainId.value, Number(diffFromVersion.value), Number(diffToVersion.value));
  } catch (err: any) {
    alert(err.response?.data?.error || '比较失败');
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
  } catch (err: any) {
    alert(err.response?.data?.error || '更新失败');
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
    alert('请选择到期日期');
    return;
  }
  try {
    await api.put(`/domains/${domainId.value}/expiry`, { expiresAt: expiryInput.value });
    editingExpiry.value = false;
    await store.fetchDomain(domainId.value);
  } catch (err: any) {
    alert(err.response?.data?.error || '更新失败');
  }
}

async function handleCheckExpiry() {
  checkingExpiry.value = true;
  try {
    const { data } = await api.post(`/domains/${domainId.value}/check-expiry`);
    await store.fetchDomain(domainId.value);
    const date = data.expiresAt ? new Date(data.expiresAt).toLocaleDateString('zh-CN') : '未知';
    alert(`WHOIS 查询成功！到期时间: ${date}${data.registrar ? `\n注册商: ${data.registrar}` : ''}`);
  } catch (err: any) {
    alert(err.response?.data?.error || 'WHOIS 查询失败');
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
  } catch (err: any) {
    alert(err.response?.data?.error || '添加标签失败');
  }
}

async function removeTag(tag: string) {
  const currentTags = (domain.value?.tags || []).filter((t: string) => t !== tag);
  try {
    await store.updateDomainTags(domainId.value, currentTags);
  } catch (err: any) {
    alert(err.response?.data?.error || '删除标签失败');
  }
}

async function handleConfigureUptime() {
  if (!uptimePushUrl.value) return;
  try {
    await uptimeStore.configure(uptimePushUrl.value);
    uptimePushUrl.value = '';
  } catch (err: any) {
    alert(err.response?.data?.error || '配置失败');
  }
}

async function handleRemoveUptime() {
  if (!confirm('确定要移除 UptimeKuma 配置吗？')) return;
  try {
    await uptimeStore.removeConfig();
  } catch (err: any) {
    alert(err.response?.data?.error || '移除失败');
  }
}

async function handleHealthCheck() {
  try {
    await uptimeStore.checkDomain(domainId.value);
  } catch (err: any) {
    alert(err.response?.data?.error || '检查失败');
  }
}

async function handleDnsTest() {
  try {
    await speedtestStore.runDnsTest(domainId.value);
  } catch (err: any) {
    alert(err.response?.data?.error || 'DNS 测试失败');
  }
}

async function handleHttpTest() {
  try {
    await speedtestStore.runHttpTest(domainId.value);
  } catch (err: any) {
    alert(err.response?.data?.error || 'HTTP 测试失败');
  }
}

watch(domainId, (newId) => {
  if (newId) {
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
  }
  if (tab === 'speedtest') {
    speedtestStore.reset();
  }
});

onMounted(() => {
  store.fetchDomain(domainId.value);
  loadRecords();
  store.fetchSnapshots(domainId.value);
  store.fetchGroups();
});

onUnmounted(() => {
  if (debounceTimer) clearTimeout(debounceTimer);
});
</script>
