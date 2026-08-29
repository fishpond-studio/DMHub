# 常见问题

## 数据库连接失败

**排查步骤：**

1. 确认数据库已创建：
   - PostgreSQL：`CREATE DATABASE dmhub;`
   - MariaDB / MySQL：`CREATE DATABASE dmhub CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`
2. 确认用户名和密码正确
3. Docker 内部注意使用容器主机名（`postgres` / `mysql`），不是 `localhost`
4. 云服务器注意安全组是否放行数据库端口
5. 测试连接的错误提示会按以下分类显示，按提示修复：
   - `connection_refused` — 数据库未启动或端口错误
   - `auth_failed` — 用户名或密码错误
   - `host_unreachable` — 主机不可达
   - `timeout` — 连接超时，检查防火墙
   - `database_missing` — 数据库不存在

## 切换数据库方言后界面提示需要重启

这是正常行为。PostgreSQL 和 MariaDB/MySQL 的 schema 在服务启动时确定，不可热切换。

- Docker 部署：`docker compose restart app`
- 本地开发：Ctrl+C 后重新 `pnpm dev:server`

重启后刷新页面继续后续步骤。

## SMTP 发送失败

**常见原因：**

- QQ / 163 / 网易企业邮箱请使用**授权码**而非登录密码
- 飞书邮箱请在客户端生成**第三方专用密码**
- iCloud 请在 appleid.apple.com 生成 **App 专用密码**
- 端口 465 使用 SSL，587 使用 TLS
- 云服务器通常封禁 25 端口，建议使用 465 或 587

## HTTPS 证书获取失败

**排查步骤：**

1. 确认域名 DNS A 记录已指向服务器 IP
2. Caddy 需要 80 和 443 端口可达
3. 可在引导页面点击「检查域名解析」验证
4. 确认没有防火墙拦截

## Cloudflare Token 无效

- 确保授予 **Zone - Zone - Read** + **Zone - DNS - Edit** 权限
- 确保选择了正确的域名区域
- 确认 Token 未过期

## 阿里云 / 腾讯云 DNS 凭证无效

- 使用 RAM / 子账号的 AccessKey，不是主账号
- 阿里云需授权 `AliyunDNSFullAccess`
- 腾讯云需授权 DNSPod 相关权限

## 忘记 2FA 无法登录

1. 在 2FA 验证页选择「请求管理员帮助」
2. 选择一位管理员
3. 提供备用邮箱并验证
4. 管理员审批后，重置代码发送到备用邮箱

## 数据库用了 trust 认证

PostgreSQL 的 `pg_hba.conf` 可能配置了 `trust` 认证（不验证密码），建议改为 `scram-sha-256` 或 `md5`。

## 下载备用码后旧码不能用了

「重新生成并下载」会重新生成所有备用码，当前码全部失效。这是设计行为——因为备用码是 hash 存储，无法还原明文，所以下载时必须重新生成。请妥善保存下载的 ZIP 文件。

## 上传图片失败

- Logo 限制 ≤ 1MB，支持 PNG / JPG / SVG
- 背景图限制 ≤ 5MB，支持 PNG / JPG / WEBP / GIF
- 开发模式需确认 Vite 代理已配置 `/uploads`

## 操作日志中看不到某些操作

- admin 可以查看全部操作日志
- member 仅能看到指派范围内的操作
- guest 无日志访问权限

## OIDC 登录失败 / redirect_uri 不匹配

1. 确认「团队设置」中的 **站点 URL** 与对外访问域名一致（含 `https`）
2. IdP 中登记的 **重定向 URL** 必须与配置页展示完全一致，OIDC 为：  
   `https://你的域名/oauth/oidc`
3. 反向代理须把 `/oauth/oidc` 转到后端，不能落到前端 SPA
4. Well-Known URL 需可从服务器访问（生产环境禁止内网地址）

## 成员不知道自己能管哪些子域名

指派后成员可在：

- **我的域名** — 可管理范围卡片  
- **域名详情** — 顶部范围横幅  
- **添加记录** — 允许的主机提示  

管理员在「域名分配」填写模式时也可预览成员可见主机名。

## 收不到站内信 / 邮件

- 站内信：个人资料中「站内通知」需开启；服务重启会清空内存中的历史消息
- 邮件：需绑定邮箱、配置 SMTP，并在个人资料中开启「邮件通知」（默认关闭）
- 域名分配、审批结果会推送站内信（邮件按上述开关）
