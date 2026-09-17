# 更新日志

## [0.3.0] — 2026-09-17

本版本聚焦 **核心安全性加固**、**SSRF 深度防护**、**分级云原生健康检查探针**、**OpenAPI 权限隔离与防越权** 以及 **安全响应头中间件**。

### 亮点

| 方向 | 说明 |
|------|------|
| 权限 | 修复 OpenAPI 接口管理员权限逃逸；增加批量解析记录子域名范围强制校验 |
| SSRF | 精准 32 位 CIDR 运算，覆盖 CGNAT、云元数据服务等保留网段；`safeFetch` 强制拦截 30x 重定向绕过 |
| 探针 | 区分存活探针（Liveness `/api/health`）、就绪探针（Readiness `/api/health/ready`）与系统诊断（`/api/health/diagnostics`） |
| 安全头 | 新增安全响应头中间件（CSP、nosniff、XSS-Protection、DENY frame）与敏感接口防缓存 |
| 防护 | 2FA 核心核验与邮件发送细粒度频控；个人 Token 权限严格白名单；头像输入防 XSS 注入 |

### 修复与安全加固

- **OpenAPI 鉴权与越权拦截**：`apps/server/src/routes/open-api.ts` 引入 `checkUserDomainAccess`，普通用户通过 Token 访问只能管理授权内的域名和子域名范围，禁止提权。
- **批量解析记录权限旁路**：`requireRecordWriteAccess` 中间件增加对 `recordIds` 批量操作的逐项子域名权限预检。
- **SSRF 深度拦截**：`apps/server/src/lib/ssrf-guard.ts` 重写为位运算 CIDR 匹配；新增 `safeFetch` 与 `safeValidateUrl`，全面防御反向探测和 30x 重定向内网窃听。
- **2FA 接口频控**：`apps/server/src/routes/twofa.ts` 为核验（10次/分）和发送（5次/分）增加限流，并将生产环境 Cookie `sameSite` 提升为 `strict`。
- **个人资料与 Token 安全**：`apps/server/src/routes/me.ts` 限制头像协议为 HTTP/HTTPS/相对路径，个人 Token 限制为普通权限白名单。

### 新增

- **云原生分级健康检查探针**：
  - `GET /api/health`：轻量 Liveness 探针，返回运行时间与存活状态。
  - `GET /api/health/ready`：Readiness 探针，实时检测数据库连接状态，异常返回 503。
  - `GET /api/health/diagnostics`：管理员专属系统诊断接口，展示内存、数据库延迟、Redis 状态与安全基线。
- **生产级安全响应头中间件**：`apps/server/src/middleware/security-headers.ts`，自动配置安全头及对 `/api/*` 下发防缓存策略。

---

## [0.2.0] — 2026-07-25

本版本聚焦 **OIDC 可用化**、**协作指派体验**、**站内信/邮件通知**、**可用性监控**、**审计与会话管理** 与 **前端交互**，并全面同步文档。

### 亮点

| 方向 | 说明 |
|------|------|
| OIDC | Well-Known 自动发现；重定向 URL `{site}/oauth/oidc`；配置页复制主页/重定向地址 |
| 指派 | 成员可见可管理主机（如 `blog.example.com`），不再只显示总域名 |
| 通知 | 顶栏站内信 + 可选个人邮件；分配/审批即时推送；事件清单前后端统一枚举 |
| 监控 | 定时 HTTP 探测、状态变更告警（`monitor.down` / `monitor.up`）、可用率与响应趋势 |
| 审计 | 登录会话管理、登录失败留痕、日志保留策略、管理员强制注销 |
| 缓存 | Redis 缓存抽象层（可选），验证码/票据/challenge/限流共享化，内存回退 |
| 备份 | 全量 JSON 备份导出/恢复；Excel（`.xlsx`）域名与记录导入 |
| 交互 | 命令面板、DNS 模板一键应用、导出/复制、骨架屏与空状态、暗色模式防闪烁、中英切换 |
| 运维 | 批量 TTL、粘贴导入、域名健康分、操作日志 CSV、最近访问 |
| 探测 | 多 DNS 传播检测、HTTPS 证书到期、记录备注、DNS 变更 Webhook 事件 |
| 文档 | VitePress 指南/API 与根目录 README、API.md 对齐 |

### 新增

#### 认证 · OIDC / OAuth2

- 标准 **OIDC** 提供商（`providerId: oidc`，兼容旧 `custom`）
- 配置字段：Client ID / Secret / **Well-Known URL**；可选授权、Token、用户信息端点
- 固定回调 **`GET /oauth/oidc`**（Nginx / Caddy / Vite 已代理）
- 登录：加密 `state`（含绝对 `redirect_uri` + intent）→ 一次性 **ticket** → `POST /api/auth/oauth/exchange-ticket`
- 绑定：`POST /api/auth/oauth/:providerId/bind/start`（与登录流程分离）
- `GET /api/auth/oauth/:providerId/callback-url` 返回主页 URL / 重定向 URL

#### 通知

- 站内信铃铛收件箱（SSE + Toast，已读 / 全部已读 / 清空）
- 个人可选 **邮件通知**（`emailNotificationsEnabled`，默认关；需邮箱 + SMTP）
- 域名分配 / 移除 / 申请 / 审批通过或拒绝时 `notifyUser` / `notifyAdmins`
- `@dmhub/shared` 新增 **`NOTIFICATION_EVENTS` 枚举常量**，通知配置页改用共享枚举，前后端事件清单统一（含 `monitor.down/up`、`member.status_changed`）

#### 域名协作

- 我的域名 / 域名列表 / 详情展示 `assignments[]` 可管范围
- 添加记录时校验主机是否在指派 pattern 内
- 管理员分配时预览成员可见主机名

#### 可用性监控

- 新增 `monitor_checks` 表（双方言 schema + 迁移 + 幂等补表）
- `domains` 增加 `monitor_enabled` / `monitor_status` / `monitor_response_ms` / `monitor_last_checked_at` 字段
- 定时探测 cron（每 15 分钟，带重叠保护）+ 手动探测接口
- 状态变更告警：`monitor.down`（critical）/ `monitor.up`（恢复 info）
- 域名详情"可用性监控"卡片：开关、可用率、响应时间趋势柱状图
- 历史保留 30 天，定时清理

#### 审计与会话管理

- 会话管理：列出/注销当前用户登录会话；管理员可查看全部会话并强制注销任意用户
- 个人资料页新增"登录会话"卡片
- 密码错误记录 `login_failed` 操作日志（含 IP / UA）
- 日志保留策略：`team_settings.log_retention_days`（0/空 = 永久保留），每日 03:00 清理过期操作日志与监控历史
- 团队设置页新增"审计与日志"配置区

#### 缓存层（Redis 可选）

- `lib/cache.ts` 统一缓存抽象：配置 `REDIS_URL`（环境变量或团队设置）启用 Redis，否则回退进程内存
- 验证码（2FA 邮箱码、管理员重置码）、OAuth 登录票据、WebAuthn challenge、API Key 限流迁移到缓存层
- docker-compose 增加 `redis` 服务（可选）；断连自动回退内存并周期性重试

#### 备份与导入

- 全量备份导出/恢复：JSON 格式（域名 + 解析记录，不含服务商凭据），恢复时跳过已存在项
- Excel 导入：`.xlsx` 域名与解析记录批量解析，复用 CSV 导入管线
- 导入页新增"数据备份"标签页，文件选择同时支持 `.csv` / `.xlsx`

#### 前端体验

- 命令面板 `Ctrl/⌘ + K`
- DNS 记录模板对话框（对接 bulk API）
- 域名/记录导出 CSV / BIND Zone、一键复制、`dig` 命令复制
- 批量改 TTL、批量删除、记录克隆、粘贴多行导入
- 全局 DNS 搜索、域名收藏、域名备注、最近访问
- 仪表盘域名健康评分、快捷入口、骨架屏与空状态
- 操作日志导出 CSV
- 统一确认框与 Toast 时长
- **暗色模式**：index.html 内联脚本防首屏闪烁
- **i18n**：vue-i18n 中英切换（顶栏语言开关），导航/登录/监控/会话等核心文案国际化

#### 数据与部署

- `users.email_notifications_enabled`
- `oauth_providers.well_known_url`
- `team_settings.log_retention_days`
- 启动时 `ensureSchemaPatches()` 幂等补列补表

### API 变更摘要

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/oauth/exchange-ticket` | ticket 换 accessToken |
| POST | `/api/auth/oauth/:id/bind/start` | 发起绑定 |
| GET | `/api/auth/oauth/:id/callback-url` | 主页/重定向 URL |
| GET | `/oauth/oidc` | OIDC 回调 |
| GET/POST/DELETE | `/api/notifications` 及已读接口 | 站内信 |
| PUT | `/api/auth/me/profile` | 增加 `emailNotificationsEnabled` |
| * | OAuth 配置 | `wellKnownUrl` / 可选端点字段 |
| GET | 域名相关 | 非管理员返回 `assignments[]`；详情返回监控状态字段 |
| POST | `/api/domains/:id/records/bulk-update` | 批量改 TTL / 代理 |
| POST | `/api/domains/:id/records/bulk-delete` | 批量删除记录 |
| GET | `/api/logs/export` | 操作日志 CSV |
| GET | `/api/dashboard/health` | 域名健康评分 |
| GET | `/api/domains/search/records` | 全局 DNS 搜索 |
| PUT | `/api/domains/:id/notes` | 域名备注 |
| POST | `/api/domains/check-expiry-batch` | 批量 WHOIS 到期 |
| GET | `/api/monitor/summary` | 监控概览 |
| GET | `/api/monitor/:domainId/history` | 探测历史（`hours` 最大 168） |
| POST | `/api/monitor/:domainId/check` | 手动探测 |
| PUT | `/api/monitor/:domainId/enabled` | 开关监控 |
| GET | `/api/auth/sessions` | 我的会话 |
| DELETE | `/api/auth/sessions/:id` | 注销会话 |
| DELETE | `/api/auth/sessions` | 注销其他会话 |
| GET | `/api/team/sessions` | 全部会话（admin） |
| DELETE | `/api/team/users/:userId/sessions` | 强制注销用户全部会话（admin） |
| GET | `/api/backup/export` | 导出全量 JSON 备份 |
| POST | `/api/backup/import` | 恢复备份 |
| POST | `/api/import/domains/excel` | Excel 导入域名 |
| POST | `/api/import/records/excel` | Excel 导入记录 |

### 文档

- 指南：`docs/guide/oauth.md`、`notifications.md`、`assignments.md`、`env.md`、`faq.md` 等
- API：`docs/api/oauth.md`、`notifications.md`；侧栏与 `API.md` 同步（含监控/会话/备份章节）
- 架构 / 数据库 / 权限参考页更新
- `.env.example` 标明 OAuth 走 Web 配置、Redis 启用方式

### 破坏性 / 升级注意

1. **站点 URL** 必须在团队设置中正确填写，否则 OAuth 无法生成回调地址。
2. **OIDC 重定向 URL** 现为 `{站点}/oauth/oidc`（不再是 `/api/auth/oauth/custom/callback`）。请在 IdP 中更新登记。
3. 反向代理需转发 `/oauth/oidc` 到后端（Docker 镜像内 nginx / 根目录 Caddyfile 已包含）。
4. 重启服务以加载 schema 补丁（`well_known_url`、`email_notifications_enabled`、`monitor_checks` 表及监控字段等，启动时自动补建）。
5. 站内信为内存存储，**重启后历史清空**（设计如此）。
6. 启用 Redis 需在团队设置填入连接地址并**重启服务**；留空则维持内存模式，单实例行为不变。

### 升级步骤

```bash
git pull
pnpm install
pnpm build   # 或 docker compose build && up -d
# 确认团队设置中的站点 URL
# 若使用 OIDC：在 IdP 更新重定向 URL 为 https://你的域名/oauth/oidc
# 可选：团队设置 → 审计与日志 → 配置 Redis 连接地址后重启服务
```

---

## [0.1.0]

### 新增

- **多数据库支持** — MariaDB / MySQL 8+ 与 PostgreSQL 同级支持。双 schema 文件（`schema-pg.ts` / `schema-mysql.ts`）+ 动态 re-export 层
- **跨方言 DB 帮手** — `insertReturningOne` / `insertReturningAll` / `insertIgnore`
- **统一错误码体系** — 60+ 错误码按业务域分段
- **DNS 解析记录模板** — 9 个预设场景（常量层）
- **批量 DNS 记录创建** — `POST /domains/:id/records/bulk`，单次最多 100 条
- **DNS 记录值校验** — 按类型校验
- **批量导出** — CSV / JSON
- **请求竞态保护** — `useRequest` + AbortController
- **确认对话框**、**操作日志增强**、**数据库索引**

### 核心功能

- 系统初始化 6 步引导
- 账号密码 + OAuth2/OIDC（GitHub / GitLab / Google / 钉钉 / 飞书）
- 双因素认证（TOTP / Passkey / 邮箱 / 备用代码）
- 三角色 + 域名指派 + 审批
- 域名与 DNS CRUD、服务商同步、WHOIS/RDAP
- 快照 / 导入导出 / 多渠道通知 / 审计 / Open API
- Docker Compose + Caddy

### 变更

- Toast 替代 `window.alert()`
- ESLint `no-unused-vars` 升为 error
- 域名标签/分组仅管理员可改
- 引导 7 步简化为 6 步；统一 pnpm workspace

### 修复

- 快照回滚参数顺序、子域名 `*.dev` 匹配、WebAuthn credential 长度
- 跨方言 `count(*)` / MySQL JSON 默认值
- 2FA axios 拦截、仪表盘 WHERE、Tabs provide/inject
- 上传代理与 Nginx 体积限制
