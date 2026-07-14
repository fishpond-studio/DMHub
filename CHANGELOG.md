# 更新日志

## v0.1.0

### 新增

- **多数据库支持** — MariaDB / MySQL 8+ 与 PostgreSQL 同级支持。双 schema 文件（`schema-pg.ts` / `schema-mysql.ts`）+ 动态 re-export 层
- **跨方言 DB 帮手** — `insertReturningOne` / `insertReturningAll` / `insertIgnore`，统一替换 `.returning()` / `.onConflictDoNothing()`
- **统一错误码体系** — 60+ 错误码按业务域分段（认证 2000、域名 4000、DNS 5000 等），`AppError` 类 + 全局错误中间件
- **DNS 解析记录模板** — 9 个预设场景模板（Gmail、Microsoft 365、腾讯企业邮箱、Cloudflare CDN、GitHub Pages、Vercel 等），支持一键批量添加
- **批量 DNS 记录创建** — `POST /domains/:id/records/bulk`，单次最多100条，独立校验逐条返回结果
- **DNS 记录值校验** — 按记录类型自动校验（A=IPv4、AAAA=IPv6、CNAME/NS=域名格式、MX=优先级范围、TXT=长度限制、SRV=端口权重、CAA=flag范围）
- **批量导出** — 域名列表和 DNS 记录导出 CSV（含 BOM）和 JSON
- **请求竞态保护** — `useRequest` composable（AbortController），快速切换时不产生数据覆盖
- **确认对话框** — 替代原生 `confirm()`，与 Toast 配套使用
- **操作日志增强** — 时间范围预设快捷选择 + 一键清除筛选
- **数据库索引** — 20 个关键索引覆盖外键列和查询热点（`dns_records.domain_id`、`operation_logs.created_at`、`refresh_tokens.token_hash` 等）

### 核心功能

- 系统初始化引导（数据库配置、建表、注册管理员、站点 URL、SMTP、邮箱验证）
- 账号密码登录 + OAuth2/OIDC 登录（GitHub / GitLab / Google / 钉钉 / 飞书 / 自定义 OIDC）
- 双因素认证（TOTP / Passkey / 邮箱验证码 / 备用代码）
- 三角色权限模型（admin / member / guest）+ 域名指派 + 指派申请审批
- 域名管理（添加/删除/分组/标签/状态） + DNS 记录 CRUD（A/AAAA/CNAME/MX/TXT/NS/SRV/CAA）
- DNS 服务商集成（Cloudflare / 阿里云 / 腾讯云）+ 服务商连接测试和域名同步
- WHOIS/RDAP 到期查询（三级回退，纯 Node.js 实现）+ 自动检查与提醒（cron 每天 08:00）
- 解析记录快照（手动/变更触发）、版本 diff 和回滚
- 批量导入域名和解析记录（CSV）
- 多渠道通知（网页/钉钉/飞书/邮件/Webhook）+ SSE 实时推送
- 操作审计日志 + API Key 管理 + Open API v1
- UptimeKuma Push URL 集成 + DNS 测速/HTTP 可用性检测
- 仪表盘统计 + 站外主页/公告
- 子域名权限模式精确匹配（`*` / `''` / `blog` / `*.dev`）+ 记录级写权限中间件
- Docker Compose + Caddy 自动 HTTPS 一键部署

### 变更

- **Toast 替代 alert()** — 全局替换 `window.alert()`，全站 70+ 处自动转为 Toast
- **ESLint `no-unused-vars`** — 从 warn 升级为 error
- **域名标签/分组改为 admin-only** — 仅管理员可修改域名元数据
- 引导流程 7 步简化为 6 步
- 包管理器统一为 pnpm workspace

### 修复

- `rollbackSnapshot` 参数顺序错位导致回滚失败
- 子域名通配符 `*.dev` 误命中 `dev` 自身
- WebAuthn `credential_id` 字段长度不足（512 → 1024）
- `count(*)::int` PG 专有写法跨方言失败
- MySQL JSON 列默认值缺失
- 2FA 登录流程 axios 拦截器误触发 refresh 重定向
- 仪表盘统计查询 WHERE 条件丢失
- 域名详情页 TabsContent 组件 provide/inject 失效
- 文件上传代理配置
- Nginx 上传限制（2M → 6M）
