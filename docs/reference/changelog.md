# 更新日志

## v0.1.0

### 新增

- **多数据库支持** — MariaDB / MySQL 8+ 与 PostgreSQL 同级支持
- **统一错误码体系** — 60+ 错误码按业务域分段
- **DNS 解析记录模板** — 9 个预设场景模板，一键批量添加
- **批量 DNS 记录创建** — 单次最多100条，自动校验记录值格式
- **DNS 记录值校验** — 按类型自动校验（A=IPv4, AAAA=IPv6 等）
- **批量导出** — CSV/JSON 格式
- **请求竞态保护** — AbortController 防数据覆盖
- **确认对话框** — 替代原生 confirm()
- **操作日志增强** — 时间预设 + 清除筛选
- **数据库索引** — 20 个关键索引覆盖外键列和查询热点

### 核心功能

- 系统初始化 6 步引导（数据库/建表/管理员/站点URL/SMTP/邮箱验证）
- 账号密码 + OAuth2/OIDC 登录（GitHub/GitLab/Google/钉钉/飞书）
- 双因素认证（TOTP/Passkey/邮箱验证码/备用代码）
- 三角色权限 + 域名指派 + 子域名匹配模式
- 域名管理 + DNS 记录 CRUD（8 种记录类型）
- DNS 服务商（Cloudflare/阿里云/腾讯云）+ 同步
- WHOIS/RDAP 到期查询 + cron 自动检查
- 解析记录快照/diff/回滚
- 批量导入 CSV
- 多渠道通知 + SSE 实时推送
- 操作审计日志 + API Key + Open API v1
- UptimeKuma + DNS 测速/HTTP 检测
- Docker Compose + Caddy 一键部署

### 变更

- Toast 替代 alert() — 全局替换 window.alert()
- ESLint no-unused-vars 从 warn 升级为 error
- 域名标签/分组改为 admin-only
- 引导流程 7 步简化为 6 步
- 包管理器统一为 pnpm workspace

### 修复

- rollbackSnapshot 参数顺序错位导致回滚失败
- 子域名通配符 *.dev 误命中 dev 自身
- WebAuthn credential_id 字段长度不足
- count(*)::int PG 专有写法跨方言失败
- MySQL JSON 列默认值缺失
- 2FA 登录流程 axios 拦截器误触发 refresh 重定向
- 仪表盘统计查询 WHERE 条件丢失
- 域名详情页 TabsContent 组件 provide/inject 失效
- 文件上传代理配置
- Nginx 上传限制调整
