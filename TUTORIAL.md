# DMHub 使用教程

## 目录

- [部署](#部署)
- [初始化引导](#初始化引导)
- [登录与认证](#登录与认证)
- [仪表盘](#仪表盘)
- [个人资料设置](#个人资料设置)
- [域名管理](#域名管理)
- [DNS 解析记录管理](#dns-解析记录管理)
- [DNS 服务商配置](#dns-服务商配置)
- [域名到期与 WHOIS](#域名到期与-whois)
- [域名指派与协作](#域名指派与协作)
- [团队管理](#团队管理)
- [通知配置](#通知配置)
- [双因素认证（2FA）](#双因素认证2fa)
- [OIDC / OAuth2 登录](#oidc--oauth2-登录)
- [API Key 与开放接口](#api-key-与开放接口)
- [监控集成](#监控集成)
- [批量导入](#批量导入)
- [常见问题](#常见问题)

---

## 部署

### Docker Compose（推荐）

```bash
git clone https://github.com/FishpondStu/dmhub.git
cd dmhub
cp .env.example .env
```

编辑 `.env`，填入以下必填项：

```env
JWT_SECRET=          # 运行 openssl rand -hex 32 生成
ENCRYPTION_KEY=      # 运行 openssl rand -hex 32 生成
```

其余配置可在首次访问引导页面中填写。

```bash
docker compose -f docker/docker-compose.yml --env-file .env up -d
```

访问 `https://your-domain.com` 进入初始化引导。初始化完成后，`/` 为站外主页，`/dashboard` 为管理仪表盘。

Docker Compose 包含四个服务：

| 服务 | 说明 |
|------|------|
| `app` | Node.js 后端，端口 3000 |
| `web` | Nginx 前端，端口 8080 |
| `postgres` | PostgreSQL 16 数据库 |
| `caddy` | Caddy 反向代理，自动 HTTPS，端口 80 / 443 |

### 本地开发

```bash
# 需要 Node.js ≥ 20 和 pnpm ≥ 9
pnpm install
pnpm --filter @dmhub/shared build
pnpm --filter @dmhub/dns-providers build
pnpm dev:web     # 前端 :5173
pnpm dev:server  # 后端 :8088
```

前端开发模式自动代理 `/api` 和 `/uploads` 到后端。

---

## 初始化引导

首次访问 DMHub 时，系统自动进入初始化引导流程，共 6 步。

### 第 1 步：配置数据库

| 字段 | 说明 |
|------|------|
| 数据库类型 | PostgreSQL（推荐）/ MariaDB / MySQL 8+ |
| 主机地址 | `localhost`，Docker 内部用 `postgres` 或 `mysql` |
| 端口 | PostgreSQL 5432，MariaDB/MySQL 3306 |
| 用户名 | 数据库用户 |
| 密码 | 数据库密码 |
| 数据库名 | 如 `dmhub`，不存在会自动创建 |
| Redis URL | 可选（保留字段，当前未实现） |

点击「测试连接」验证可达性。错误会按 `连接被拒绝` / `认证失败` / `主机不可达` / `超时` / `数据库不存在` 等分类显示，并给出修复提示。

> **方言切换需要重启**：选择 MariaDB / MySQL 并保存后，若与当前运行方言不同，接口返回 `restartRequired: true`，前端会展示重启指引。
> - Docker 部署：`docker compose restart app`
> - 本地开发：Ctrl+C 后重新 `pnpm dev:server`
>
> 重启后刷新页面继续后续步骤。

### 第 2 步：创建数据表

点击「开始创建数据表」，系统根据所选方言（PG / MySQL）自动选用对应迁移脚本创建全部表结构。

### 第 3 步：注册管理员

首个注册的用户自动成为管理员（admin 角色），只需填写用户名和密码（二次确认）。

### 第 4 步：绑定站点 URL

设置用户访问 DMHub 的完整网址（如 `https://dmhub.example.com`），用于：

- OAuth 回调地址
- Cookie 域名
- Caddy 自动 HTTPS

可点击「检查域名解析」验证 DNS 是否指向当前服务器。如果暂时没有域名可跳过，后续在团队设置中配置。

### 第 5 步：配置 SMTP

SMTP 用于发送系统通知和验证邮件。提供常见邮箱预设：

| 预设 | SMTP 服务器 | 端口 | 备注 |
|------|------------|------|------|
| QQ 邮箱 | smtp.qq.com | 465 | 需使用授权码 |
| 163 邮箱 | smtp.163.com | 465 | 需使用授权码 |
| 阿里云邮箱（个人） | smtp.aliyun.com | 465 | 需授权码 |
| 阿里云邮箱（企业） | smtp.qiye.aliyun.com | 465 | |
| 网易企业邮箱 | smtphz.qiye.163.com | 465 | 需在 WebMail 生成授权码 |
| 飞书邮箱 | smtp.feishu.cn | 465 | 需生成第三方专用密码 |
| iCloud | smtp.mail.me.com | 587 | 需在 appleid.apple.com 生成 App 专用密码 |
| Gmail | smtp.gmail.com | 587 | 需应用专用密码 |
| Outlook / Office365 | smtp.office365.com | 587 | |

> **端口说明**：465 = SSL 加密（推荐）| 587 = TLS 加密 | 25 = 不加密（云服务器通常封禁）
>
> **密码提示**：QQ / 163 / 网易请填写授权码，飞书请填写第三方专用密码，iCloud 请填写 App 专用密码，而非登录密码。

### 第 6 步：验证邮箱

系统发送验证码到管理员邮箱，输入验证码确认 SMTP 配置正确。验证通过后初始化完成。

---

## 登录与认证

### 账号密码登录

支持用户名或邮箱 + 密码登录。勾选「记住我」可在 30 天内免重新登录。

### OAuth 登录

如管理员配置了 OAuth Provider（GitHub / GitLab / Google / 钉钉 / 飞书 / 自定义 OIDC），登录页会显示对应的登录按钮。

- 首次 OAuth 登录：系统中无用户时自动成为管理员；已有用户时需输入邀请码
- 再次 OAuth 登录：直接进入

### 双因素认证

如启用了 2FA，密码验证通过后需选择一种方式完成二次验证：

1. **TOTP** — 打开验证器 App 输入 6 位动态码
2. **Passkey** — 使用指纹或面部识别
3. **邮箱验证码** — 系统发送 6 位验证码到注册邮箱
4. **备用代码** — 使用启用 2FA 时生成的备用代码

---

## 仪表盘

登录后进入 `/dashboard`，展示团队全局概览：

| 卡片 | 说明 |
|------|------|
| 域名总数 | 正常 / 即将过期 / 已过期统计 |
| DNS 记录数 | 按类型分布饼图 |
| 团队成员数 | 当前成员数量 |
| 近 7 天变更 | 解析记录变更次数 |
| 到期日历 | 可视化域名到期日期 |
| 即将过期域名 | 30 天内到期的域名列表及剩余天数 |
| 最近活动 | 操作时间线（解析变更、成员变动等） |

---

## 个人资料设置

进入「设置 → 个人资料」：

| 功能 | 说明 |
|------|------|
| 显示名称 | 展示名称，可随时修改 |
| 昵称 | 简短代称 |
| 头像 URL | 头像图片地址 |
| 通知开关 | 关闭后不接收网页推送和 SSE 通知 |
| 修改邮箱 | 需输入当前密码验证 |
| 修改密码 | 需输入旧密码 |

### 用户令牌

进入「设置 → 我的令牌」，创建个人访问令牌（`dmhub_pt_` 前缀），用于 CI/CD 或脚本调用 Open API：

1. 点击「创建令牌」
2. 设置名称和权限（`domains:read` / `records:read` / `records:write` / `*`）
3. 复制生成的令牌 — **只显示一次**

---

## 域名管理

### 添加域名

1. 进入「域名」页面
2. 点击「添加域名」
3. 填写域名名称，关联 DNS 服务商配置，可选填到期时间和标签
4. 可点击「WHOIS 自动获取」自动查询到期日期
5. 保存后系统自动从服务商同步解析记录

### 域名分组与标签

- **标签** — 为域名添加标签（如 `生产环境`、`测试`）
- **分组** — 按项目对域名分组
- 在域名列表页可按分组或标签筛选

### 域名状态

| 状态 | 说明 |
|------|------|
| active | 正常 |
| expiring | 即将过期 |
| expired | 已过期 |

---

## DNS 解析记录管理

### 记录类型

| 类型 | 说明 | 示例 |
|------|------|------|
| A | 指向 IPv4 地址 | `192.168.1.1` |
| AAAA | 指向 IPv6 地址 | `2001:db8::1` |
| CNAME | 指向另一个域名 | `example.com` |
| MX | 邮件交换记录 | `mail.example.com` |
| TXT | 文本记录，常用于 SPF、域名验证 | `v=spf1 include:...` |
| NS | 域名服务器记录 | `ns1.example.com` |
| SRV | 服务记录 | `10 60 5060 sip.example.com` |
| CAA | 证书颁发机构授权 | `0 issue "letsencrypt.org"` |

### 操作

- **创建** — 填写类型、主机记录、值、TTL、优先级等
- **批量创建** — 使用 DNS 模板一键添加常用场景记录（Google Workspace、Microsoft 365 等），或通过 API 批量提交最多 100 条记录
- **修改** — 直接编辑记录值
- **删除** — 需二次确认
- **同步** — 从服务商拉取最新解析记录

> DNS 记录值会按类型自动校验：A 记录必须是有效 IPv4 地址，CNAME 必须是域名格式等。校验失败会显示具体错误提示。

所有变更自动同步到服务商 API，并记录操作日志和自动创建快照。

### 快照与回滚

- 系统自动创建快照（定时 / 手动 / 变更时触发）
- 查看任意两个版本的差异（新增 / 删除 / 修改）
- 管理员可回滚到指定快照

---

## DNS 服务商配置

进入「设置 → DNS 服务商」，支持三个服务商：

### Cloudflare

1. 登录 [Cloudflare API Token 页面](https://dash.cloudflare.com/profile/api-tokens)
2. 点击「创建令牌」→ 选择「自定义令牌」
3. 权限配置：
   - 区域 → 区域 → 读取
   - 区域 → DNS → 编辑
4. 区域资源选择要管理的域名
5. 创建并复制令牌

**凭证：** API Token

### 阿里云

1. 登录阿里云控制台 → AccessKey 管理
2. 创建 AccessKey，建议使用 RAM 子账号并授权 `AliyunDNSFullAccess`

**凭证：** AccessKey ID + AccessKey Secret

### 腾讯云

1. 登录腾讯云控制台 → 访问管理 → API 密钥
2. 创建密钥，建议使用子账号并授权 DNSPod 相关权限

**凭证：** SecretId + SecretKey

每个服务商配置可点击「测试连接」验证凭证是否正确，点击「同步域名」从服务商批量导入域名和解析记录。

---

## 域名到期与 WHOIS

### 自动检查

- 每天北京时间 08:00 自动检查开启自动检查的域名
- 检查方式：WHOIS / RDAP 查询（三级回退）
- 查询结果自动更新域名到期时间

### WHOIS 查询

在域名详情页点击「WHOIS 查询到期时间」按钮，系统自动：

1. 先尝试 RDAP 查询
2. 失败则查询对应 TLD 的 WHOIS 服务器
3. 最后回退到 whois-servers.net

支持 20+ 常见 TLD（.com / .net / .org / .io / .cn 等）。

### 手动设置

如果 WHOIS 查询不到（如某些注册商屏蔽），可手动设置到期时间。

### 到期提醒

提醒节点默认：30 / 14 / 7 / 3 / 1 / 0 天，可在域名详情页自定义。到达提醒节点时通过已配置的通知渠道发送提醒。

---

## 域名指派与协作

### 管理员指派

1. 进入「设置 → 域名指派」
2. 选择成员 → 选择域名 → 设置子域名匹配模式 → 选择权限
3. 权限粒度：
   - `dns_edit` — 增删改查
   - `dns_readonly` — 只读

### 子域名匹配

| 模式 | 含义 |
|------|------|
| `*` | 整个域名（包含 apex 和所有子域） |
| `''` / `@` | 仅 apex（即域名本身） |
| `blog` | 仅 blog.example.com |
| `*.dev` | 所有 *.dev.example.com（不含 dev.example.com 自身） |

> 通配符指派需二次确认。`*.dev` 严格匹配子级，需要包含 `dev` 自身请单独再加一条 `dev` 规则。

### 成员申请

1. member 在「我的域名」页面点击「申请管理权限」
2. 选择域名、填写子域名模式和申请理由
3. 管理员在「设置 → 指派审批」中审批

---

## 团队管理

进入「设置 → 团队设置」：

### 基本信息

- **团队 Logo** — PNG / JPG / SVG，≤ 1MB，推荐 128×128px
- **团队名称**和**描述**
- **站点 URL** — 修改后影响 OAuth 回调和 Cookie

### 注册与邀请

- **邀请码开关** — 默认开启，关闭后注册无需邀请码
- **开放注册开关** — 关闭后禁止新用户注册
- **生成邀请码** — 可设置过期时间和使用次数
- **重新生成** — 会使现有邀请码全部失效，需二次确认

### 成员管理

- 查看所有成员
- 修改成员角色（admin / member / guest）
- 启用 / 禁用成员（禁用时自动注销其所有设备）
- 移除成员（至少保留一个管理员）

### 站外公告

- 公告内容支持 Markdown 或 HTML
- 留空则不显示
- 显示在登录页面

### 主页设置

- **副标题** — 显示在团队名称下方
- **背景图片** — PNG / JPG / WEBP / GIF，≤ 5MB
- **底栏内容** — 支持 Markdown / HTML

主页位于根路径 `/`，展示团队名称、副标题、Logo、Get Started 按钮和底栏。

### SMTP 邮件配置

在团队设置中修改 SMTP 配置，修改前会二次确认提醒。

---

## 通知配置

进入「设置 → 通知」，支持五种通知渠道：

| 渠道 | 配置项 |
|------|--------|
| 站内通知 | SSE 实时推送 + Toast（无需额外配置） |
| 钉钉 | Webhook URL + 签名密钥 |
| 飞书 | Webhook URL + 签名密钥 |
| 邮件 | 使用团队 SMTP 配置 |
| Webhook | URL + 请求头 + 签名密钥 |

为每个通知配置选择触发事件：

| 事件 | 说明 |
|------|------|
| domain.expiring | 域名即将过期 |
| domain.expired | 域名已过期 |
| team_settings.updated | 团队设置变更 |
| member.role_changed | 成员角色变更 |
| member.removed | 成员被移除 |
| member.status_changed | 成员启用/禁用 |
| notification.update | 通知配置变更 |
| dns_provider.deleted | DNS 服务商被删除 |
| oauth_provider.deleted | OAuth Provider 被删除 |
| admin_reset.requested | 管理员帮助重置 2FA |

管理员可在「个人资料」中关闭通知开关，关闭后不接收站内通知和 SSE 推送。系统通知主要推送给启用通知的管理员。

---

## 双因素认证（2FA）

### 启用 2FA

进入「设置 → 2FA 安全」：

1. **TOTP** — 扫描二维码或手动输入密钥到验证器 App，输入当前码验证
2. **Passkey** — 注册指纹 / 面部识别
3. **邮箱验证码** — 绑定邮箱后可用

启用 2FA 时自动生成 8 个备用代码（格式 `XXXX-XXXX`），建议立即下载保存。

### 备用代码

- 每个代码只能使用一次
- 剩余 ≤ 2 个时提醒，0 个时强制提醒
- 「重新生成并下载」会重新生成新码并下载 ZIP，**当前码全部失效**
- 「重新生成」仅重新生成，在页面显示明文码

### 忘记 2FA

1. 在 2FA 验证页选择「请求管理员帮助」
2. 选择一位管理员
3. 提供备用邮箱并验证
4. 管理员审批后，重置代码发送到备用邮箱

---

## OIDC / OAuth2 登录

### 配置 Provider

进入「设置 → OAuth Providers」：

| Provider | 必填配置 |
|----------|---------|
| GitHub | Client ID + Client Secret |
| GitLab | Client ID + Client Secret + GitLab URL |
| Google | Client ID + Client Secret |
| 钉钉 | Client ID + Client Secret |
| 飞书 | Client ID + Client Secret |
| 自定义 OIDC | 名称 + Issuer + Client ID + Client Secret |

配置后在登录页会显示对应 OAuth 按钮。

### 账号绑定

进入「设置 → 账号绑定」：

- 查看已绑定的 OAuth 账号
- 可解绑（需二次确认）

---

## API Key 与开放接口

### API Key（管理员）

进入「设置 → API Keys」：

1. 点击「创建」
2. 设置名称和权限（`domains:read` / `records:read` / `records:write` / `*`）
3. 复制生成的 Key（`dmhub_` 前缀，只显示一次）

### 用户令牌（个人）

进入「设置 → 我的令牌」：

1. 创建个人访问令牌（`dmhub_pt_` 前缀）
2. 权限与 API Key 相同
3. 可随时吊销

### 调用示例

```bash
# 使用 API Key
curl -H "Authorization: Bearer dmhub_xxxxxxxx" \
  https://your-domain.com/api/v1/domains

# 使用用户令牌
curl -H "Authorization: Bearer dmhub_pt_xxxxxxxx" \
  https://your-domain.com/api/v1/domains/example.com/records
```

### Open API 端点

| 端点 | 方法 | 所需权限 |
|------|------|---------|
| `/api/v1/domains` | GET | `domains:read` |
| `/api/v1/domains/:id` | GET | `domains:read` |
| `/api/v1/domains/:id/records` | GET | `records:read` |
| `/api/v1/domains/:id/records` | POST | `records:write` |
| `/api/v1/domains/:id/records/:recordId` | PUT | `records:write` |
| `/api/v1/domains/:id/records/:recordId` | DELETE | `records:write` |

频率限制：100 请求 / 分钟 / Key

---

## 监控集成

### UptimeKuma

在团队设置中配置 Uptime Push URL，DMHub 兼容 UptimeKuma 的 Push 推送端点。

### 本地测速

在域名详情页：

- **DNS 测速** — 测试域名在各 DNS 服务器的解析耗时
- **HTTP 可用性** — 检测 URL 的 HTTP 状态码和响应时间（TTFB）

---

## 批量导入

进入「批量导入」页面：

### 导入域名

1. 下载域名 CSV 模板
2. 按模板填写域名信息
3. 上传 CSV 文件
4. 查看导入结果（成功 / 跳过 / 错误）

### 导入解析记录

1. 选择目标域名
2. 下载记录 CSV 模板
3. 按模板填写记录信息
4. 上传 CSV 文件

---

## 常见问题

### 数据库连接失败

- 确认数据库已创建：
  - PostgreSQL：`CREATE DATABASE dmhub;`
  - MariaDB / MySQL：`CREATE DATABASE dmhub CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`
- 确认用户名和密码正确
- Docker 内部注意使用容器主机名（`postgres` / `mysql`），不是 `localhost`
- 云服务器注意安全组是否放行数据库端口
- 测试连接的错误提示会按 `连接被拒绝` / `认证失败` / `主机不可达` / `超时` / `数据库不存在` 分类，按提示修复

### 切换数据库方言后界面提示需要重启

这是正常行为。PostgreSQL 和 MariaDB/MySQL 的 schema 在服务启动时确定，不可热切换。

- Docker 部署：`docker compose restart app`
- 本地开发：Ctrl+C 后重新 `pnpm dev:server`

重启后刷新页面继续后续步骤。

### SMTP 发送失败

- QQ / 163 / 网易企业邮箱请使用**授权码**而非登录密码
- 飞书邮箱请在客户端生成**第三方专用密码**
- iCloud 请在 appleid.apple.com 生成 **App 专用密码**
- 端口 465 使用 SSL，587 使用 TLS
- 云服务器通常封禁 25 端口，建议使用 465 或 587

### HTTPS 证书获取失败

- 确认域名 DNS A 记录已指向服务器 IP
- Caddy 需要 80 和 443 端口可达
- 可在引导页面点击「检查域名解析」验证

### Cloudflare Token 无效

- 确保授予 **Zone - Zone - Read** + **Zone - DNS - Edit** 权限
- 确保选择了正确的域名区域
- 确认 Token 未过期

### 阿里云 / 腾讯云 DNS 凭证无效

- 使用 RAM / 子账号的 AccessKey，不是主账号
- 阿里云需授权 `AliyunDNSFullAccess`
- 腾讯云需授权 DNSPod 相关权限

### 忘记 2FA 无法登录

1. 在 2FA 验证页选择「请求管理员帮助」
2. 选择一位管理员
3. 提供备用邮箱并验证
4. 管理员审批后，重置代码发送到备用邮箱

### 数据库用了 trust 认证

PostgreSQL 的 `pg_hba.conf` 可能配置了 `trust` 认证（不验证密码），建议改为 `scram-sha-256` 或 `md5`。

### 下载备用码后旧码不能用了

「重新生成并下载」会重新生成所有备用码，当前码全部失效。这是设计行为——因为备用码是 hash 存储，无法还原明文，所以下载时必须重新生成。请妥善保存下载的 ZIP 文件。

### 上传图片失败

- Logo 限制 ≤ 1MB，支持 PNG / JPG / SVG
- 背景图限制 ≤ 5MB，支持 PNG / JPG / WEBP / GIF
- 开发模式需确认 Vite 代理已配置 `/uploads`
