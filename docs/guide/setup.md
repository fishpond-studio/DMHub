# 初始化引导

首次访问 DMHub 时，系统自动进入初始化引导流程。整个过程共 **6 步**，无需预配置数据库。

## 第 1 步：配置数据库

选择数据库类型并填写连接信息。

| 字段 | 说明 |
|------|------|
| 数据库类型 | PostgreSQL（推荐）/ MariaDB / MySQL 8+ |
| 主机地址 | `localhost`，Docker 内部用 `postgres` 或 `mysql` |
| 端口 | PostgreSQL 5432，MariaDB/MySQL 3306 |
| 用户名 | 数据库用户 |
| 密码 | 数据库密码 |
| 数据库名 | 如 `dmhub`，不存在会自动创建 |
| Redis URL | 可选（保留字段，当前未实现） |

点击「测试连接」验证可达性。错误会按以下分类显示：

| 错误类型 | 可能原因 |
|----------|---------|
| `connection_refused` | 数据库未启动或端口错误 |
| `auth_failed` | 用户名或密码错误 |
| `host_unreachable` | 主机不可达 |
| `timeout` | 连接超时，检查防火墙 |
| `database_missing` | 数据库不存在 |

> **方言切换需要重启**：选择 MariaDB / MySQL 并保存后，若与当前运行方言不同，接口返回 `restartRequired: true`，前端会展示重启指引。
>
> - Docker 部署：`docker compose restart app`
> - 本地开发：Ctrl+C 后重新 `pnpm dev:server`

## 第 2 步：创建数据表

点击「开始创建数据表」，系统根据所选方言自动选用对应迁移脚本创建全部 19 张表。

## 第 3 步：注册管理员

首个注册的用户自动成为管理员（admin 角色）。填写用户名、密码（二次确认）和邮箱。

## 第 4 步：绑定站点 URL

设置用户访问 DMHub 的完整网址（如 `https://dmhub.example.com`），用于：

- OAuth 回调地址
- Cookie 域名
- Caddy 自动 HTTPS

可点击「检查域名解析」验证 DNS 是否指向当前服务器。如果暂时没有域名可跳过，后续在团队设置中配置。

## 第 5 步：配置 SMTP

SMTP 用于发送系统通知和验证邮件。提供常见邮箱预设：

| 预设 | SMTP 服务器 | 端口 | 备注 |
|------|------------|------|------|
| QQ 邮箱 | smtp.qq.com | 465 | 需使用授权码 |
| 163 邮箱 | smtp.163.com | 465 | 需使用授权码 |
| 阿里云邮箱（个人） | smtp.aliyun.com | 465 | 需授权码 |
| 阿里云邮箱（企业） | smtp.qiye.aliyun.com | 465 | |
| 飞书邮箱 | smtp.feishu.cn | 465 | 需第三方专用密码 |
| iCloud | smtp.mail.me.com | 587 | 需 App 专用密码 |
| Gmail | smtp.gmail.com | 587 | 需应用专用密码 |
| Outlook / Office365 | smtp.office365.com | 587 | |

> **端口说明**：465 = SSL 加密（推荐）| 587 = TLS 加密 | 25 = 不加密（不推荐）

## 第 6 步：验证邮箱

系统发送验证码到管理员邮箱，输入验证码确认 SMTP 配置正确。验证通过后初始化完成，自动跳转到仪表盘。

## 完成之后

初始化完成后，`/` 为站外主页，`/dashboard` 为管理仪表盘。可在「设置 → 团队设置」中修改之前配置的 URL、SMTP 等信息。
