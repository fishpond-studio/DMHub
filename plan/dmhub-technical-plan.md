# DMHub — 域名协作管理工具 技术规划文档

## 1. 项目概述

### 1.1 什么是 DMHub

DMHub（Domain Management Hub）是一个面向小型团队的开源域名协作管理工具，解决域名分散在个人账号、到期无人管理、解析变更无通知、出问题互相推诿等痛点。

### 1.2 目标用户

- 团队规模 5-15 人，非专业运维
- 可能只有 1 个懂技术的成员
- 需要一个简单、可视化的域名管理入口

### 1.3 核心价值

| 痛点 | DMHub 解决方案 |
|------|---------------|
| 域名分散在个人账号 | 统一管理面板，域名归属团队 |
| 到期没人管 | 定时检查 + 多渠道到期提醒 |
| 改解析没通知 | 操作日志 + 变更通知推送 |
| 出问题互相甩锅 | 完整操作审计链，谁改了什么一目了然 |

### 1.4 约束与边界

- 单机部署，Docker Compose 一键启动，不引入 K8s/微服务
- 不做自动续费、支付功能；但做域名到期时间检查 + 到期提醒
- 不做手机号登录/短信验证；可做邮箱验证码
- 监控对接第三方 API（如 UptimeKuma），本地可做简单测速
- 开源协议：AGPL-3.0

### 1.5 实现状态（截至 v0.2.0）

| 模块 | 状态 | 备注 |
|------|------|------|
| F01-F19 全部功能 | ✅ 已实现 | P0/P1/P2 全部上线 |
| PostgreSQL | ✅ 推荐 | 原生 `.returning()` / JSONB 路径 |
| MariaDB / MySQL | ✅ 已实现 | 双 schema + 跨方言 helper（v0.2.0），要求 MySQL 8.0.13+ / MariaDB 10.2.7+ |
| 表名前缀 | ❌ 已移除 | 6 步引导（原 7 步），多方言场景下复杂度收益不匹配 |
| 子域名权限模式精确匹配 | ✅ 已实现 | `lib/subdomain-match.ts` + `requireRecordWriteAccess` 中间件 |
| 方言切换重启提示 | ✅ 已实现 | 保存接口返回 `restartRequired: true` |

---


## 2. 功能清单

### 2.1 P0 — 核心功能（MVP）

| 编号 | 功能 | 说明 |
|------|------|------|
| F01 | 用户注册/登录 | 账号密码登录（用户名或邮箱）+ OIDC/OAuth2 登录 |
| F02 | 双因素认证（2FA） | 密码登录后强制选择 2FA：TOTP、Passkey、邮箱验证码三选一 |
| F03 | 备用代码 | 启用 2FA 时生成 8 个备用代码，用完即失效，用完最后一个提醒重新绑定 |
| F04 | 团队设置 | 单团队模式：团队信息设置、邀请码加入、成员列表 |
| F05 | 权限控制 | 管理员/成员/访客 三角色，管理员可多个 |
| F06 | 域名管理 | 添加/删除域名，关联云服务商，查看域名信息 |
| F07 | 解析记录管理 | 增删改查 DNS 解析记录，批量操作，记录类型带说明提示 |
| F08 | 操作日志 | 所有关键操作留痕 |
| F09 | 到期检查与提醒 | 定时检查域名到期时间，到期前多级提醒 |
| F10 | 通知推送 | 钉钉/飞书/邮件/Webhook 通知 |
| F11 | 云服务商集成 | Cloudflare（优先）、阿里云、腾讯云 DNS API 对接 |

### 2.2 P1 — 增强功能

| 编号 | 功能 | 说明 |
|------|------|------|
| F12 | 解析快照 | 手动/变更触发备份解析记录，支持回滚 |
| F13 | 变更对比 | 解析记录变更前后 diff 展示 |
| F14 | 域名分组/标签 | 按项目/环境对域名分类 |
| F15 | 批量导入域名 | CSV/Excel 批量导入 |
| F16 | 仪表盘 | 域名总览、到期日历、操作统计 |

### 2.3 P2 — 远期功能

| 编号 | 功能 | 说明 |
|------|------|------|
| F17 | 监控集成 | 对接 UptimeKuma 等第三方监控 API |
| F18 | 本地测速 | 简单的 DNS 解析测速、HTTP 可用性检测 |
| F19 | API 开放 | 提供 REST API 供外部系统集成 |


---

## 3. 技术栈选型

### 3.1 前端

| 选项 | 选型 | 理由 |
|------|------|------|
| 框架 | **Vue 3 + Vite** | 轻量、生态成熟、中文社区活跃 |
| UI 库 | **Radix Vue（shadcn-vue 风格）** | 管理后台风格，可定制性强，不引入重型组件库 |
| 状态管理 | **Pinia** | Vue 3 官方推荐，简洁 |
| 路由 | **Vue Router 4** | 标准选择 |
| HTTP | **Axios** | 拦截器方便统一处理认证 |
| 表格/表单 | **Radix Vue + 自定义 Data Table** | 基于 TanStack Table，功能够用 |

### 3.2 后端

| 选项 | 选型 | 理由 |
|------|------|------|
| 运行时 | **Node.js 20 LTS** | 开发快，前后端统一语言，团队易接手 |
| 框架 | **Fastify** | 比 Express 性能好，TypeScript 支持优秀，插件体系清晰 |
| ORM | **Drizzle ORM** | 轻量、类型安全、SQL-like API，不引入重型抽象 |
| 认证 | **自研** | OIDC/OAuth2 + 2FA 逻辑需深度定制，不宜依赖重型库 |
| 任务调度 | **node-cron** | 轻量定时任务，目前仅用于域名到期检查（无定时快照） |
| 验证 | **Zod** | 运行时类型校验，前后端可共享 schema |

### 3.3 数据库

| 选项 | 选型 | 理由 |
|------|------|------|
| 主库（推荐） | **PostgreSQL 16** | 功能强大，JSON 支持好，Drizzle 原生支持，推荐首选 |
| 主库（备选1） | **MariaDB 11+** | MySQL 兼容，社区活跃，Drizzle 通过 MySQL 驱动支持 |
| 主库（备选2） | **MySQL 8+** | 生态广泛，Drizzle 原生支持 |
| 缓存（可选） | **Redis 7** | 计划中：Session 存储、速率限制、2FA 验证码暂存 |

> **数据库选型说明**：引导界面提供数据库类型选择（PostgreSQL / MariaDB / MySQL 8+），PostgreSQL 为推荐选项。多方言已**真支持**（v0.2.0 起）：通过双 schema 文件（`schema-pg.ts` / `schema-mysql.ts`）+ 启动时动态 re-export + 跨方言 helper（`db/helpers.ts`）实现，业务代码无需感知方言。MariaDB 和 MySQL 使用 Drizzle 的 MySQL 驱动；JSONB → JSON、数组 → JSON 存储；MySQL 路径要求 8.0.13+ / MariaDB 10.2.7+（JSON 默认值支持）。MVP 阶段不引入 Redis，Session 和验证码暂存使用数据库表 + 内存 LRU 缓存。待有性能需求时可在引导界面配置 Redis。

### 3.4 基础设施

| 选项 | 选型 | 理由 |
|------|------|------|
| 容器化 | **Docker + Docker Compose** | 单文件一键启动 |
| 反向代理 | **Caddy** | 自动 HTTPS，配置极简 |
| CI/CD | **GitHub Actions** | 开源项目标准选择 |

### 3.5 项目结构（Monorepo）

```
dmhub/
├── apps/
│   ├── web/                  # Vue 3 前端
│   └── server/               # Fastify 后端
├── packages/
│   ├── shared/               # 共享类型、Zod schema、常量
│   └── dns-providers/        # DNS 服务商适配器包
├── docker/
│   ├── Dockerfile.web
│   ├── Dockerfile.server
│   └── docker-compose.yml
├── docs/
├── package.json              # pnpm workspace
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

---

## 4. 认证与授权体系（重点）

### 4.1 认证流程总览

```
用户访问登录页
├── 路径A：OIDC/OAuth2 登录（可选，需管理员配置至少一个 Provider）
│   ├── 若未配置任何 Provider → 登录页/注册页/绑定页的 OIDC/OAuth2 区域灰显不可用，提示"OIDC/OAuth2 未配置"
│   ├── 选择 Provider（钉钉/飞书/GitHub/GitLab/Google/自定义）
│   ├── 跳转 Provider 授权页
│   ├── 回调获取用户信息
│   ├── 首次登录（系统中无用户）→ 自动创建管理员账号
│   ├── 首次登录（系统已有用户）→ 需输入邀请码加入，默认角色为"成员"
│   └── 签发 JWT → 登录完成（无需 2FA）
│
└── 路径B：账号密码登录
    ├── 输入用户名或邮箱 + 密码（二次确认）
    ├── 验证通过
    ├── 检查是否启用 2FA
    │   ├── 未启用 → 签发 JWT → 登录完成
    │   └── 已启用 → 进入 2FA 验证页
    │       ├── 方式1：TOTP（身份验证器应用）
    │       ├── 方式2：Passkey（WebAuthn）
    │       ├── 方式3：邮箱验证码
    │       └── 兜底：备用代码
    └── 2FA 验证通过 → 签发 JWT → 登录完成

特殊逻辑：
  → 系统首个注册用户自动成为管理员（无需邀请码）
  → 后续用户注册需输入邀请码
  → 单团队模式：一个 DMHub 实例只有一个团队
```

### 4.2 OIDC/OAuth2 Provider 抽象层

#### 4.2.1 统一接口设计

```typescript
interface OAuthProvider {
  id: string;                          // 'dingtalk' | 'feishu' | 'github' | 'gitlab' | 'google' | 'custom'
  name: string;                        // 显示名
  type: 'oauth2' | 'oidc';            // 协议类型
  getAuthorizationUrl(state: string): string;
  handleCallback(code: string): Promise<OAuthUserInfo>;
}

interface OAuthUserInfo {
  providerId: string;
  providerUserId: string;
  email?: string;
  name?: string;
  avatar?: string;
  raw?: Record<string, unknown>;
}
```

#### 4.2.2 Provider 配置（数据库存储，管理员可动态配置）

> OIDC/OAuth2 为可选功能。管理员在"团队设置 → 认证配置"中启用并填写 Provider 的 Client ID/Secret 后，登录页、注册页、账户绑定页才会显示对应的 OAuth 入口；未配置任何 Provider 时，这些区域灰显不可用，提示"OIDC/OAuth2 未配置，请联系管理员"。

```typescript
interface OAuthProviderConfig {
  id: string;
  providerId: string;        // 对应 OAuthProvider.id
  enabled: boolean;
  clientId: string;
  clientSecret: string;      // 加密存储
  authorizeUrl?: string;     // 自定义 Provider 需要
  tokenUrl?: string;
  userInfoUrl?: string;
  scope?: string;
}
```

#### 4.2.3 支持的 Provider

| Provider | 协议 | 说明 |
|----------|------|------|
| GitHub | OAuth2 | 最常见，开发者友好 |
| GitLab | OAuth2 | 自建 GitLab 也可用 |
| Google | OIDC | 国际团队通用 |
| 钉钉 | OAuth2 | 国内企业常用 |
| 飞书 | OAuth2 | 国内企业常用 |
| 自定义 | OIDC/OAuth2 | 支持自建认证平台（如 Authentik、Keycloak） |

### 4.3 双因素认证（2FA）

#### 4.3.1 三种第二因素

| 方式 | 实现方案 | 用户体验 |
|------|---------|---------|
| TOTP | 基于 `otpauth` 库，RFC 6238 标准 | 扫码绑定身份验证器 App（Google Authenticator / Authy 等） |
| Passkey | WebAuthn API，`@simplewebauthn/server` | 指纹/面部识别，最便捷 |
| 邮箱验证码 | 发送 6 位数字码到注册邮箱，5 分钟有效 | 无需额外 App |

#### 4.3.2 TOTP 启用流程

```
用户选择启用 TOTP
→ 后端生成 TOTP 密钥（Base32），存入 user_totp_seeds 表（加密存储）
→ 后端返回 otpauth:// URI
→ 前端生成二维码 + 同时展示密钥文本（用户可手动输入）
→ 用户用身份验证器 App 扫码/手动输入
  → 推荐身份验证器 App（前端提示）：
     - Google Authenticator（Android/iOS）
     - Microsoft Authenticator（Android/iOS）
     - Authy（Android/iOS/桌面）
  → 用户输入当前 TOTP 码验证
→ 验证通过 → 同时生成 8 个备用代码，展示给用户（提示保存）
→ TOTP 启用完成
```

#### 4.3.3 备用代码机制

```
启用 2FA 时：
  → 生成 8 个备用代码（格式：XXXX-XXXX，16 位随机 hex 编码为 8 组）
  → 存入 backup_codes 表，每个代码关联用户 ID，状态为 unused
  → 页面展示备用代码列表，下方提供"下载备用代码"按钮
  → 点击按钮下载 ZIP 文件，文件名格式：{username}-backup_codes-{DATE}-{TIME}.zip
  → ZIP 内包含 DMHub-backup_codes.md 文件，内容如下：
     ┌──────────────────────────────────────────────
     │ # DMHub 备用代码
     │ 
     │ ⚠️ 请安全保管，切勿外传！泄露备用代码将导致账户安全风险！
     │ 
     │ - 用户名：{username}
     │ - 邮箱：{email}
     │ - 生成时间：{datetime}
     │ 
     │ ## 备用代码
     │ 
     │ 1. XXXX-XXXX
     │ 2. XXXX-XXXX
     │ ...
     │ 8. XXXX-XXXX
     │ 
     │ ⚠️ 每个代码仅可使用一次，用完即失效。请勿将此文件分享给任何人。
     └──────────────────────────────────────────────

使用备用代码登录：
  → 用户在 2FA 验证页选择"使用备用代码"
  → 输入备用代码
  → 后端验证：匹配 + unused → 标记为 used，登录成功
  → 检查剩余备用代码数量
  → 剩余 ≤ 2 个时，登录后弹出提醒："备用代码即将用完，请重新生成"
  → 剩余 0 个时，强制提醒："备用代码已全部使用，请立即重新生成"

重新生成备用代码（两种方式任选其一）：

  方式1：通过 2FA 验证
  → 使用当前已启用的 2FA 方式验证（TOTP/Passkey/邮箱验证码均可）
  → 验证通过 → 作废所有旧备用代码 → 生成 8 个新备用代码

  方式2：请求管理员帮助重置
  → 展示管理员列表（筛选条件：启用了允许通知的管理员，默认启用；若自己也是管理员则排除自己）
  → 显示管理员代称（nickname），无代称则显示用户名
  → 选择一位管理员 → 进入验证流程：
     1. 用户需提供一个其他邮箱地址（非注册邮箱，用于接收重置代码）
     2. 系统向该邮箱发送验证码，用户输入验证码确认邮箱归属
     3. 验证通过 → 系统向所选管理员发送重置请求邮件
     4. 管理员在后台审批该请求 → 系统生成重置代码发送到用户提供的邮箱
     5. 用户输入重置代码 → 作废所有旧备用代码 → 生成 8 个新备用代码
```

#### 4.3.4 Passkey（WebAuthn）流程

```
注册 Passkey：
  → 前端调用 navigator.credentials.create()
  → 后端用 @simplewebauthn/server 验证 attestation
  → 存入 passkeys 表（credential_id, public_key, counter, device_name）

验证 Passkey：
  → 前端调用 navigator.credentials.get()
  → 后端验证 assertion
  → 验证通过 → 登录成功
```

### 4.4 团队邀请逻辑（单团队模式）

```
单团队模式：
  → 一个 DMHub 实例只有一个团队，无需创建/切换团队
  → 团队信息（名称、Logo、描述）由管理员在"团队设置"中维护
  → 团队信息存储在 team_settings 单行表中

Logo 上传规则：
  → 管理员在"团队设置"中上传 Logo 图片
  → 支持格式：PNG / JPG / SVG
  → 文件大小限制：≤ 1MB
  → 建议尺寸：正方形，至少 128×128px
  → 上传新 Logo 时，自动删除旧 Logo 文件，新文件覆盖
  → 文件存储路径：Docker Volume 挂载目录下的 uploads/logo/
  → 数据库 team_settings.logo_url 存储相对路径（如 /uploads/logo/{uuid}.png）

首个用户（初始化）：
  → 系统首次启动时无需预配置数据库连接，应用可独立运行，显示初始化引导页面
  → 初始化引导流程（数据库优先，用户数据直接入库，无需暂存）：
     1. 配置数据库连接
        → 选择数据库类型：PostgreSQL（推荐）/ MariaDB / MySQL 8+
        → 输入主机、端口、用户名、密码、数据库名
        → 各字段提供默认值和示例：
           - 主机：默认 localhost，示例 192.168.1.100 或 db（Docker 内部）
           - 端口：PostgreSQL 默认 5432，MariaDB/MySQL 默认 3306
           - 用户名：示例 dmhub
           - 密码：密码输入框，带显示/隐藏切换
           - 数据库名：示例 dmhub，提示"请先在数据库中创建该数据库"
        → 提供"如何创建数据库"帮助链接/折叠说明：
           PostgreSQL: CREATE DATABASE dmhub;
           MariaDB/MySQL: CREATE DATABASE dmhub CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
        → 可选配置 Redis（主机、端口、密码），留空则不启用，使用内存替代
           - 提示"Redis 为可选加速组件，不确定是什么可以跳过"
        → 点击"测试连接"验证数据库可达性
        → 测试失败时给出具体错误提示（连接拒绝/认证失败/数据库不存在），并附排查建议
     2. 连接数据库并创建表结构（runRawSql + 方言对应迁移脚本）
        → 已实现：根据所选方言（PG / MySQL）自动选用 PG_MIGRATION_SQL 或 MYSQL_MIGRATION_SQL
        → 已实现：MySQL JSON 列默认值显式写为 DEFAULT (JSON_ARRAY()) / DEFAULT (JSON_OBJECT())，要求 MySQL 8.0.13+ / MariaDB 10.2.7+
        → 已实现：方言切换返回 restartRequired: true，需重启 server 让 schema 加载到对应方言
     3. 注册管理员账号（用户名 + 密码二次确认，数据直接写入数据库，无需暂存）
     4. 绑定主站域名（如 https://dmhub.example.com），用于 Caddy 自动 HTTPS、Cookie 域名、OAuth 回调地址
        → 提示"请填写用户访问 DMHub 的完整网址，需先将域名的 DNS A 记录指向本服务器 IP"
        → 提供帮助链接/折叠说明："如何将域名指向服务器？在域名 DNS 管理中添加一条 A 记录，主机记录填写 dmhub（或 @），记录值填写服务器 IP 地址"
        → 验证域名格式（必须以 http:// 或 https:// 开头）
        → 可选：点击"检查域名解析"验证域名是否已指向本服务器
     5. 配置 SMTP 发件邮箱（主机、端口、用户名、密码、发件地址）
        → 提供常见邮箱服务商预设（选择后自动填充主机和端口）：
           - QQ 邮箱：smtp.qq.com:465（SSL）或 587（TLS），需开启 SMTP 服务并使用授权码
           - 163 邮箱：smtp.163.com:465（SSL）或 25（TLS），需开启 SMTP 并使用授权码
           - 阿里云邮箱：smtp.aliyun.com:465（SSL）或 25（TLS），需开启 SMTP 并使用授权码
           - Gmail：smtp.gmail.com:587（TLS），需开启"不太安全的应用访问"或使用应用专用密码
           - Outlook/Office365：smtp.office365.com:587（TLS）
           - 自定义：手动填写
        → 端口说明：465 = SSL 加密，587 = TLS 加密（推荐），25 = 不加密（不推荐）
        → 密码提示"QQ/163 邮箱请填写授权码而非登录密码"
        → 发件地址默认填充 SMTP 用户名（如 xxx@qq.com）
     6. 配置完成后，管理员需先绑定自己的邮箱
     7. 系统发送验证邮件到管理员邮箱，验证发件配置是否正确
     8. 验证通过 → 初始化完成，系统开放注册
     9. 验证失败 → 提示修改 SMTP 配置，重新测试
  → SMTP 配置未完成前，系统不允许其他用户注册（邮箱验证码 2FA、邮件通知等依赖 SMTP 的功能也不可用）
  → 后续管理员可在"团队设置"中修改 SMTP 配置

配置变更提醒原则：
  → 所有关键配置修改时，页面必须展示醒目的变更影响提醒
  → 修改前需二次确认，确认弹窗中说明具体影响范围
  → 关键配置变更后，自动向所有管理员发送通知
  → 具体提醒场景：
     - 修改主站域名 → 提醒："修改域名后，OAuth 回调地址将变更，已登录用户的 Cookie 可能失效，需重新登录。确认修改？"
     - 修改 SMTP 配置 → 提醒："修改后需重新验证发件功能，验证完成前邮件相关功能不可用。确认修改？"
     - 修改/删除 OAuth Provider → 提醒："已有 N 个用户通过此 Provider 登录，删除后这些用户将无法通过此方式登录。确认修改？"
     - 修改/删除 DNS 服务商配置 → 提醒："已有 N 个域名使用此配置，删除后相关域名的解析管理将不可用。确认修改？"
     - 修改通知配置 → 提醒："修改后相关事件的推送渠道将变更。确认修改？"
     - 修改成员角色 → 提醒："将用户 {name} 的角色从 {old} 变更为 {new}，权限范围将立即生效。确认修改？"
     - 重新生成邀请码 → 提醒："旧邀请码将立即失效，未使用的邀请码不可恢复。确认重新生成？"

邀请码加入：
  → 管理员生成邀请码（6-8 位，大小写+数字，排除易混淆字符）
  → 邀请码可设置过期时间和使用次数限制
  → 管理员可随时重新生成邀请码
  → 新用户注册/首次 OAuth 登录时，需输入邀请码
  → 后端验证邀请码有效性（未过期、未达上限）
  → 验证通过 → 用户加入，默认角色为"成员"
  → 邀请码使用次数 +1
```

### 4.5 Session 与 Token 策略

| 项目 | 策略 |
|------|------|
| Token 类型 | JWT（Access Token + Refresh Token） |
| Access Token 有效期 | 15 分钟 |
| Refresh Token 有效期 | 7 天 |
| 存储位置 | Access Token → 内存；Refresh Token → HttpOnly Cookie |
| 2FA 中间态 | 短期 Token（5 分钟有效），仅允许访问 2FA 验证接口 |

---

## 5. 数据模型

### 5.1 ER 关系概览

```
users ──< user_oauth_bindings
users ──< user_totp_seeds
users ──< user_passkeys
users ──< backup_codes
users ──< domain_assignments
domains ──< dns_records
domains ──< domain_assignments
domains ──< operation_logs
domains ──< dns_snapshots
```

### 5.2 核心表定义

#### users — 用户表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID PK | 主键 |
| username | VARCHAR(64) UNIQUE | 用户名 |
| email | VARCHAR(255) UNIQUE | 邮箱 |
| password_hash | VARCHAR(255) | 密码哈希（bcrypt），OAuth 用户可为空 |
| display_name | VARCHAR(128) | 显示名 |
| nickname | VARCHAR(64) | 代称（用于管理员列表展示，无代称时显示 username） |
| avatar_url | VARCHAR(512) | 头像 URL |
| role | VARCHAR(16) DEFAULT 'member' | 角色：admin/member/guest |
| two_factor_enabled | BOOLEAN DEFAULT false | 是否启用 2FA |
| two_factor_methods | VARCHAR(64)[] | 已启用的 2FA 方式列表 ['totp','passkey','email'] |
| email_verified | BOOLEAN DEFAULT false | 邮箱是否已验证 |
| notifications_enabled | BOOLEAN DEFAULT true | 是否允许接收通知（管理员重置请求等） |
| status | VARCHAR(16) DEFAULT 'active' | 状态：active/disabled |
| created_at | TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | 更新时间 |

#### team_settings — 团队设置表（单行表，全局只有一条记录）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK DEFAULT 1 | 固定为 1 |
| name | VARCHAR(128) | 团队名 |
| description | TEXT | 团队描述 |
| logo_url | VARCHAR(512) | 团队 Logo（管理员上传，新上传自动替换旧文件） |
| default_role | VARCHAR(16) DEFAULT 'member' | 新成员默认角色 |
| initialized | BOOLEAN DEFAULT false | 是否已初始化（首个管理员创建后标记为 true） |
| site_url | VARCHAR(512) | 主站绑定域名（如 https://dmhub.example.com），影响 Caddy HTTPS、Cookie 域名、OAuth 回调地址 |
| created_at | TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | 更新时间 |

#### domains — 域名表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID PK | 主键 |
| name | VARCHAR(255) | 域名（如 example.com） |
| provider_id | VARCHAR(32) | DNS 服务商标识（cloudflare/aliyun/tencent） |
| provider_domain_id | VARCHAR(255) | 服务商侧域名 ID |
| provider_config_id | UUID FK → provider_configs | 服务商配置 ID |
| expires_at | TIMESTAMP | 域名到期时间 |
| tags | VARCHAR(32)[] | 标签 |
| group_name | VARCHAR(64) | 分组名 |
| status | VARCHAR(16) DEFAULT 'active' | 状态：active/expired/transferred |
| auto_check_expiry | BOOLEAN DEFAULT true | 是否自动检查到期 |
| expiry_remind_days | INTEGER[] DEFAULT '{30,14,7,3,1,0}' | 启用的提醒节点（天数），0天不可关闭，1天关闭需二次确认 |
| last_checked_at | TIMESTAMP | 最后检查时间 |
| created_at | TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | 更新时间 |

#### dns_records — 解析记录表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID PK | 主键 |
| domain_id | UUID FK → domains | 所属域名 |
| record_type | VARCHAR(16) | 记录类型：A/AAAA/CNAME/MX/TXT/NS/SRV 等 |
| name | VARCHAR(255) | 主机记录（如 www） |
| value | TEXT | 记录值 |
| ttl | INTEGER | TTL 秒数 |
| priority | INTEGER | MX/SRV 优先级 |
| proxied | BOOLEAN DEFAULT false | 是否开启代理（Cloudflare） |
| provider_record_id | VARCHAR(255) | 服务商侧记录 ID |
| snapshot_version | INTEGER | 快照版本号 |
| status | VARCHAR(16) DEFAULT 'active' | 状态 |
| created_at | TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | 更新时间 |

> DNS 记录类型说明（前端创建/编辑解析记录时展示提示）：
> | 类型 | 说明 | 示例值 |
> |------|------|--------|
> | A | 将域名指向 IPv4 地址 | 192.168.1.1 |
> | AAAA | 将域名指向 IPv6 地址 | 2001:db8::1 |
> | CNAME | 将域名指向另一个域名 | example.com |
> | MX | 邮件交换记录，指向邮件服务器 | mail.example.com |
> | TXT | 文本记录，常用于域名验证、SPF | v=spf1 include:... |
> | NS | 域名服务器记录 | ns1.example.com |
> | SRV | 服务记录，指定服务的端口 | 10 60 5060 sip.example.com |
> | CAA | 证书颁发机构授权 | 0 issue "letsencrypt.org" |

#### operation_logs — 操作日志表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID PK | 主键 |
| user_id | UUID FK → users | 操作人 |
| domain_id | UUID FK → domains (nullable) | 关联域名 |
| action | VARCHAR(64) | 操作类型（见下表） |
| target_type | VARCHAR(32) | 操作对象类型 |
| target_id | VARCHAR(255) | 操作对象 ID |
| detail | JSONB | 变更详情（before/after） |
| ip_address | VARCHAR(45) | 操作 IP |
| user_agent | VARCHAR(512) | 浏览器 UA |
| created_at | TIMESTAMP | 操作时间 |

> 操作类型枚举：domain.add, domain.delete, record.create, record.update, record.delete, member.invite, member.remove, member.role_change, team_settings.update, provider.config, notification.update, login, login_2fa

#### notification_configs — 通知配置表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID PK | 主键 |
| channel | VARCHAR(32) | 通知渠道：web/ dingtalk/feishu/email/webhook |
| name | VARCHAR(128) | 配置名称 |
| config | JSONB | 渠道配置（webhook_url / email_list 等，敏感字段加密） |
| events | VARCHAR(32)[] | 触发事件列表 |
| enabled | BOOLEAN DEFAULT true | 是否启用 |
| created_at | TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | 更新时间 |

#### provider_configs — 服务商配置表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID PK | 主键 |
| provider_id | VARCHAR(32) | 服务商标识 |
| name | VARCHAR(128) | 配置名称 |
| credentials | JSONB | 凭证信息（加密存储） |
| enabled | BOOLEAN DEFAULT true | 是否启用 |
| created_at | TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | 更新时间 |

#### user_oauth_bindings — OAuth 绑定表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID PK | 主键 |
| user_id | UUID FK → users | 用户 ID |
| provider_id | VARCHAR(32) | Provider 标识 |
| provider_user_id | VARCHAR(255) | Provider 侧用户 ID |
| provider_email | VARCHAR(255) | Provider 侧邮箱 |
| provider_name | VARCHAR(128) | Provider 侧显示名 |
| provider_avatar | VARCHAR(512) | Provider 侧头像 |
| raw_data | JSONB | Provider 返回的原始数据 |
| created_at | TIMESTAMP | 绑定时间 |
| updated_at | TIMESTAMP | 更新时间 |
| UNIQUE | (provider_id, provider_user_id) | 联合唯一 |

#### user_totp_seeds — TOTP 种子表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID PK | 主键 |
| user_id | UUID FK → users UNIQUE | 用户 ID（一对一） |
| secret_encrypted | TEXT | TOTP 密钥（AES-256 加密存储） |
| verified | BOOLEAN DEFAULT false | 是否已验证（启用前需验证一次） |
| created_at | TIMESTAMP | 创建时间 |

#### user_passkeys — Passkey 表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID PK | 主键 |
| user_id | UUID FK → users | 用户 ID |
| credential_id | BYTEA UNIQUE | WebAuthn Credential ID |
| public_key | BYTEA | 公钥 |
| counter | INTEGER | 签名计数器 |
| device_type | VARCHAR(32) | 设备类型（singleDevice/multiDevice） |
| backed_up | BOOLEAN | 是否备份 |
| transports | VARCHAR(16)[] | 传输方式 |
| device_name | VARCHAR(128) | 用户自定义设备名 |
| created_at | TIMESTAMP | 创建时间 |
| last_used_at | TIMESTAMP | 最后使用时间 |

#### backup_codes — 备用代码表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID PK | 主键 |
| user_id | UUID FK → users | 用户 ID |
| code_hash | VARCHAR(255) | 备用代码哈希（bcrypt） |
| code_index | INTEGER | 代码序号（1-8） |
| used | BOOLEAN DEFAULT false | 是否已使用 |
| used_at | TIMESTAMP | 使用时间 |
| created_at | TIMESTAMP | 创建时间 |

#### invite_codes — 邀请码表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID PK | 主键 |
| code | VARCHAR(16) UNIQUE | 邀请码 |
| max_uses | INTEGER | 最大使用次数（0=无限） |
| current_uses | INTEGER DEFAULT 0 | 已使用次数 |
| expires_at | TIMESTAMP | 过期时间 |
| created_by | UUID FK → users | 创建人 |
| created_at | TIMESTAMP | 创建时间 |

#### domain_assignments — 域名指派表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID PK | 主键 |
| domain_id | UUID FK → domains | 域名 ID |
| user_id | UUID FK → users | 被指派的用户 ID |
| subdomain_pattern | VARCHAR(255) DEFAULT '*' | 子域名匹配模式（'*' = 整个域名，'blog' = blog.example.com，'*.dev' = *.dev.example.com） |
| permission | VARCHAR(16) DEFAULT 'dns_edit' | 权限粒度：dns_edit（增删改查）/ dns_readonly（只读） |
| assigned_by | UUID FK → users | 指派人（管理员） |
| created_at | TIMESTAMP | 指派时间 |
| UNIQUE | (domain_id, user_id, subdomain_pattern) | 联合唯一 |

#### domain_assignment_requests — 域名指派申请表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID PK | 主键 |
| domain_id | UUID FK → domains | 域名 ID |
| user_id | UUID FK → users | 申请人 |
| subdomain_pattern | VARCHAR(255) DEFAULT '*' | 子域名匹配模式 |
| permission | VARCHAR(16) DEFAULT 'dns_edit' | 申请权限粒度：dns_edit / dns_readonly |
| reason | TEXT | 申请理由（必填） |
| status | VARCHAR(16) DEFAULT 'pending' | 状态：pending/approved/rejected |
| reviewed_by | UUID FK → users (nullable) | 审批人 |
| review_comment | TEXT (nullable) | 拒绝理由（可选） |
| created_at | TIMESTAMP | 申请时间 |
| reviewed_at | TIMESTAMP (nullable) | 审批时间 |

#### dns_snapshots — DNS 快照表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID PK | 主键 |
| domain_id | UUID FK → domains | 域名 ID |
| version | INTEGER | 版本号（自增） |
| records | JSONB | 解析记录快照 |
| trigger | VARCHAR(32) | 触发方式：scheduled/manual/on_change |
| created_by | UUID FK → users (nullable) | 操作人 |
| created_at | TIMESTAMP | 创建时间 |

#### refresh_tokens — Refresh Token 表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID PK | 主键 |
| user_id | UUID FK → users | 用户 ID |
| token_hash | VARCHAR(255) | Token 哈希 |
| device_info | VARCHAR(255) | 设备信息 |
| expires_at | TIMESTAMP | 过期时间 |
| created_at | TIMESTAMP | 创建时间 |

---

## 6. 多服务商集成设计

### 6.1 抽象层接口

```typescript
interface DNSProviderAdapter {
  id: string;                                    // 'cloudflare' | 'aliyun' | 'tencent'
  name: string;                                  // 显示名

  testConnection(credentials: Credentials): Promise<boolean>;

  listDomains(credentials: Credentials): Promise<ProviderDomain[]>;

  getDomainInfo(credentials: Credentials, domainId: string): Promise<ProviderDomain>;

  listRecords(credentials: Credentials, domainId: string): Promise<ProviderRecord[]>;

  createRecord(credentials: Credentials, domainId: string, record: CreateRecordInput): Promise<ProviderRecord>;

  updateRecord(credentials: Credentials, domainId: string, recordId: string, record: UpdateRecordInput): Promise<ProviderRecord>;

  deleteRecord(credentials: Credentials, domainId: string, recordId: string): Promise<void>;

  getDomainExpiry(credentials: Credentials, domainId: string): Promise<Date | null>;
}

interface Credentials {
  [key: string]: string;                         // 各 Provider 不同
}

interface ProviderDomain {
  id: string;
  name: string;
  status: string;
  expiresAt?: Date;
  nameservers?: string[];
  locked?: boolean;
}

interface ProviderRecord {
  id: string;
  type: string;
  name: string;
  value: string;
  ttl: number;
  priority?: number;
  proxied?: boolean;
}

interface CreateRecordInput {
  type: string;
  name: string;
  value: string;
  ttl: number;
  priority?: number;
  proxied?: boolean;
}

interface UpdateRecordInput extends Partial<CreateRecordInput> {}
```

### 6.2 Provider 实现优先级

| 优先级 | Provider | SDK/API | 说明 |
|--------|----------|---------|------|
| 1 | **Cloudflare** | REST API v4（直接 fetch） | API 文档清晰，免费 Zone 足够，优先实现 |
| 2 | 阿里云 | @alicloud/alidns20150109 | 国内最常用 |
| 3 | 腾讯云 | @tencentcloud/dnspod | 国内常用 |

### 6.3 Cloudflare 实现要点

```
认证方式：Bearer Token（API Token）
  → 管理员在 Cloudflare 控制台创建 API Token，授予以下最小权限：
     - Zone - Zone - Read（列出和读取域名区域信息）
     - Zone - DNS - Edit（增删改查 DNS 解析记录，已包含 DNS Read）
  → 可选择限定到特定 Zone，遵循最小权限原则
  → DMHub 仅存储该 Token，所有请求通过 Authorization: Bearer {token} 鉴权

  前端配置引导（服务商配置页面）：
  → 步骤1：登录 Cloudflare 控制台 → https://dash.cloudflare.com/profile/api-tokens
  → 步骤2：点击"创建令牌" → 选择"自定义令牌"模板
  → 步骤3：权限配置：
     - 区域 - 区域 - 读取
     - 区域 - DNS - 编辑
  → 步骤4：区域资源 → 选择"特定区域" → 选择要管理的域名（推荐）或"所有区域"
  → 步骤5：点击"继续以显示摘要" → "创建令牌"
  → 步骤6：复制生成的令牌（⚠️ 只显示一次！），粘贴到 DMHub 的 Token 输入框
  → 点击"测试连接"验证 Token 是否有效
  → 测试失败时提示常见原因：Token 权限不足、Token 已过期、域名未选择

API 基址：https://api.cloudflare.com/client/v4

核心接口：
  GET    /zones                          → 列出域名
  GET    /zones/{zone_id}                → 域名详情
  GET    /zones/{zone_id}/dns_records    → 列出解析记录
  POST   /zones/{zone_id}/dns_records    → 创建记录
  PUT    /zones/{zone_id}/dns_records/{record_id} → 更新记录
  DELETE /zones/{zone_id}/dns_records/{record_id} → 删除记录

到期时间：
  Cloudflare API 不直接返回域名到期时间
  → 需通过 WHOIS 查询或手动录入
  → 预留 whois_expiry 字段，后续可对接 WHOIS API
```

### 6.4 扩展新 Provider 的步骤

1. 在 `packages/dns-providers/` 下新建目录，实现 `DNSProviderAdapter` 接口
2. 在 `packages/shared/` 中注册 Provider ID 和配置 Schema
3. 管理后台"服务商配置"页自动出现新 Provider 选项
4. 无需修改核心逻辑

---

## 7. 权限模型

### 7.1 三角色定义

| 角色 | 权限范围 |
|------|---------|
| **管理员（admin）** | 全部权限：团队设置、成员管理、域名增删、解析变更、服务商配置、通知配置、查看日志 |
| **成员（member）** | 仅能管理管理员指派的域名/子域名，可对指派范围内的解析记录增删改查；不能删除域名、不能管理成员和团队设置 |
| **访客（guest）** | 什么都看不到，全拦在登录页面，什么也不能做 |

### 7.2 权限矩阵

| 操作 | admin | member | guest |
|------|-------|--------|-------|
| 团队设置 | ✅ | ❌ | ❌ |
| 成员管理 | ✅ | ❌ | ❌ |
| 邀请码管理 | ✅ | ❌ | ❌ |
| 服务商配置 | ✅ | ❌ | ❌ |
| 通知配置 | ✅ | ❌ | ❌ |
| 添加域名 | ✅ | ❌ | ❌ |
| 删除域名 | ✅ | ❌ | ❌ |
| 查看所有域名 | ✅ | ❌ | ❌ |
| 查看指派域名 | ✅ | ✅ | ❌ |
| 修改域名信息 | ✅ | ❌ | ❌ |
| 创建解析记录（指派范围内） | ✅ | ✅ | ❌ |
| 修改解析记录（指派范围内） | ✅ | ✅ | ❌ |
| 删除解析记录（指派范围内） | ✅ | ✅ | ❌ |
| 查看解析记录（指派范围内） | ✅ | ✅ | ❌ |
| 查看操作日志 | ✅ | ✅（仅指派范围） | ❌ |
| 快照回滚 | ✅ | ❌ | ❌ |

### 7.3 域名指派机制

管理员通过"成员管理 → 指派域名"为 member 分配可管理的域名范围：

- **按域名指派**：将整个域名（如 `example.com`）指派给 member，member 可管理该域名下所有解析记录
- **按子域名指派**：将特定子域名（如 `blog.example.com`、`*.dev.example.com`）指派给 member，member 只能管理匹配的解析记录
- 一个 member 可被指派多个域名/子域名
- 一个域名/子域名可指派给多个 member
- 指派时可选择权限粒度：`dns_edit`（增删改查）或 `dns_readonly`（只读）

指派记录存储在 `domain_assignments` 表中。

### 7.4 域名指派申请流程

member 也可主动申请域名管理权限，需管理员审批：

```
member 发起申请：
  → member 在"我的域名"页面点击"申请管理权限"
  → 选择域名 + 填写子域名匹配模式 + 选择权限粒度
  → 填写申请理由（必填）
  → 提交申请，状态为 pending

管理员审批：
  → 管理员在"成员管理 → 指派审批"中看到待审批列表
  → 审批通过 → 创建 domain_assignments 记录，通知 member
  → 审批拒绝 → 通知 member，附上拒绝理由（可选）

通配符安全确认：
  → 若申请的子域名模式为通配符（如 *.example.com）
  → 管理员点击"通过"时，弹出二次确认：
     "该申请包含通配符 *.example.com，将授权管理 example.com 下所有子域名的解析记录，确认通过吗？"
  → 管理员确认后才正式通过
  → 管理员直接指派通配符时同样触发此确认
```

申请记录存储在 `domain_assignment_requests` 表中。

### 7.5 实现方式

- 后端中间件：每个路由声明所需角色，中间件校验 `user.role`（直接从 users 表读取）
- 域名级权限：member 访问域名/解析记录接口时，额外校验 `domain_assignments` 表确认是否有权操作该域名
- 前端：根据角色 + 指派范围动态渲染/隐藏操作按钮，但以后端权限为准
- 管理员可将其他用户的角色在 admin/member/guest 之间切换
- 系统至少保留一个管理员，不允许最后一个管理员降级自己

---

## 8. 通知体系

### 8.1 通知渠道

| 渠道 | 实现方式 | 配置项 |
|------|---------|--------|
| 网页通知 | 前端右上角 Toast 通知，可手动关闭，120 秒后自动关闭 | 无需额外配置，用户在线时自动推送 |
| 钉钉 | 自定义机器人 Webhook | webhook_url, secret |
| 飞书 | 自定义机器人 Webhook | webhook_url, secret |
| 邮件 | SMTP 发送 | host, port, user, password, from |
| Webhook | 通用 HTTP POST | url, method, headers, secret(签名) |

### 8.2 触发事件

| 事件 | 说明 | 默认通知角色 |
|------|------|-------------|
| domain.expiring | 域名即将到期（30/14/7/3/1 天） | admin |
| domain.expired | 域名已到期 | admin |
| record.created | 解析记录创建 | admin + member |
| record.updated | 解析记录修改 | admin + member |
| record.deleted | 解析记录删除 | admin + member |
| member.joined | 新成员加入 | admin |
| member.removed | 成员移除 | admin |
| member.role_changed | 角色变更 | admin + 当事人 |
| assignment.requested | 域名指派申请提交 | admin |
| assignment.approved | 域名指派申请通过 | 申请人 |
| assignment.rejected | 域名指派申请拒绝 | 申请人 |
| login.suspicious | 异地/异常登录 | 当事人 |

### 8.3 到期提醒策略

```
定时任务（每天 08:00 执行）：
  → 查询所有 auto_check_expiry = true 的域名
  → 检查 expires_at 距今天数
  → 匹配提醒规则（管理员可在域名设置中勾选启用的提醒节点，默认全选）：
     30 天 → 发送提醒（可选）
     14 天 → 发送提醒（可选）
      7 天 → 发送提醒 - 升级（可选）
      3 天 → 发送提醒 - 紧急（可选）
      1 天 → 发送提醒 - 紧急（可关闭，但需二次确认："域名 {name} 在这一天后到期，您确定不提醒吗？"）
      0 天 → 发送到期通知（不可关闭）
  → 查询通知配置，匹配事件 domain.expiring / domain.expired
  → 按配置的渠道发送通知
  → 通知内容包含：域名、到期日期、剩余天数、操作人信息
  → 管理员可在域名设置中指定"到期通知人"（覆盖默认角色）
```

### 8.4 通知发送抽象

```typescript
interface NotificationChannel {
  id: string;
  send(message: NotificationMessage, config: ChannelConfig): Promise<void>;
}

interface NotificationMessage {
  title: string;
  content: string;
  level: 'info' | 'warning' | 'critical';
  metadata?: Record<string, unknown>;
}
```

---

## 9. 部署方案

### 9.1 Docker Compose 单文件启动

```yaml
# docker-compose.yml
version: "3.8"

services:
  app:
    build:
      context: .
      dockerfile: docker/Dockerfile.server
    ports:
      - "3000:3000"
    environment:
      - DB_TYPE=${DB_TYPE}
      - DATABASE_URL=${DATABASE_URL}
      - REDIS_URL=${REDIS_URL}
      - JWT_SECRET=${JWT_SECRET}
      - ENCRYPTION_KEY=${ENCRYPTION_KEY}
      - NODE_ENV=production
    volumes:
      - uploads:/app/uploads
    depends_on:
      postgres:
        condition: service_healthy
    restart: unless-stopped

  web:
    build:
      context: .
      dockerfile: docker/Dockerfile.web
    ports:
      - "8080:80"
    depends_on:
      - app
    restart: unless-stopped

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: dmhub
      POSTGRES_PASSWORD: dmhub
      POSTGRES_DB: dmhub
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U dmhub"]
      interval: 5s
      timeout: 5s
      retries: 5
    restart: unless-stopped

  caddy:
    image: caddy:2-alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy_data:/data
      - caddy_config:/config
    depends_on:
      - web
      - app
    restart: unless-stopped

volumes:
  pgdata:
  uploads:
  caddy_data:
  caddy_config:
```

### 9.2 环境变量

```env
# 必填
JWT_SECRET=               # JWT 签名密钥（openssl rand -hex 32）
ENCRYPTION_KEY=           # 数据加密密钥（openssl rand -hex 32）

# 数据库（首次启动引导中配置，也可在 .env 中预填）
DB_TYPE=postgresql         # postgresql / mariadb / mysql（切换后必须重启服务才能生效）
DATABASE_URL=

# Redis（可选，首次启动引导中配置，留空则不启用）
REDIS_URL=

# 邮件（首次启动引导中配置，也可在 .env 中预填）
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM=

# OAuth Providers（可选，按需配置）
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
GITLAB_CLIENT_ID=
GITLAB_CLIENT_SECRET=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
DINGTALK_CLIENT_ID=
DINGTALK_CLIENT_SECRET=
FEISHU_CLIENT_ID=
FEISHU_CLIENT_SECRET=

# 自定义 OIDC（可选）
CUSTOM_OIDC_NAME=
CUSTOM_OIDC_ISSUER=
CUSTOM_OIDC_CLIENT_ID=
CUSTOM_OIDC_CLIENT_SECRET=

# 域名（Caddy 自动 HTTPS 用）
DOMAIN=dmhub.example.com
```

### 9.3 一键启动

```bash
# 1. 克隆仓库
git clone https://github.com/FishpondStu/dmhub.git
cd dmhub

# 2. 复制环境变量模板
cp .env.example .env
# 编辑 .env，填入必填项（JWT_SECRET 和 ENCRYPTION_KEY）
# 其他配置在首次访问引导页面中填写即可

# 3. 启动
docker compose up -d

# 4. 访问
# https://dmhub.example.com
# 首次访问引导：配置数据库连接 → 创建表 → 注册管理员 → 绑定主站域名 → 配置 SMTP → 绑定管理员邮箱验证发件 → 初始化完成
```

### 9.3.1 常见问题排查

| 问题 | 原因 | 解决方案 |
|------|------|---------|
| 页面打不开 | 容器未启动或端口被占用 | `docker compose ps` 检查状态，`docker compose logs app` 查看日志 |
| 数据库连接失败 | 数据库未创建或连接信息错误 | 先创建数据库（见引导页帮助），检查主机/端口/密码 |
| SMTP 发送失败 | 授权码错误或端口不对 | QQ/163 用授权码非登录密码，465 用 SSL、587 用 TLS |
| HTTPS 证书获取失败 | 域名未解析到服务器 | 检查域名 DNS A 记录是否指向服务器 IP，Caddy 需 80/443 端口可达 |
| Cloudflare Token 无效 | 权限不足或域名未选择 | 确保授予 Zone-Read + DNS-Edit，且选择了正确的域名区域 |

### 9.4 数据库迁移

- 使用 Drizzle Kit 管理迁移
- 应用启动时自动执行 `drizzle-kit push`（生产环境建议手动 `drizzle-kit migrate`）
- 首次启动创建初始表结构

### 9.5 备份策略

```yaml
# 可选：在 docker-compose.yml 中添加备份服务
  backup:
    build:
      context: .
      dockerfile: docker/Dockerfile.backup
    environment:
      - DATABASE_URL=postgresql://dmhub:dmhub@postgres:5432/dmhub
      - BACKUP_CRON=0 2 * * *          # 每天凌晨 2 点
      - BACKUP_RETENTION_DAYS=30
    volumes:
      - ./backups:/backups
    depends_on:
      - postgres
    restart: unless-stopped
```

---

## 10. 实施路线图

### Phase 1 — 基础骨架（MVP）

1. 项目脚手架搭建（Monorepo + TypeScript + pnpm workspace）
2. 数据库 Schema + 迁移
3. 用户注册/登录（账号密码）
4. 2FA：TOTP + 备用代码
5. 团队设置 + 邀请码（单团队模式）
6. 权限中间件
7. Cloudflare DNS 集成
8. 域名 + 解析记录 CRUD
9. 操作日志
10. 基础前端页面

### Phase 2 — 认证完善 + 通知

1. OIDC/OAuth2 Provider 抽象层 + GitHub 实现
2. Passkey（WebAuthn）2FA
3. 邮箱验证码 2FA
4. 通知体系（钉钉/飞书/邮件/Webhook）
5. 到期检查定时任务
6. 阿里云 DNS 集成

### Phase 3 — 增强功能

1. DNS 快照 + 回滚
2. 变更对比
3. 域名分组/标签
4. 批量导入
5. 仪表盘
6. 腾讯云 DNS 集成
7. 其他 OAuth Provider

### Phase 4 — 监控与开放

1. UptimeKuma 集成
2. 本地测速
3. API 开放

