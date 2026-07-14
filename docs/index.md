---
layout: home
hero:
  name: DMHub
  text: 域名协作管理工具
  tagline: 面向小型团队的开源域名协作管理平台
  actions:
    - theme: brand
      text: 快速开始
      link: /guide/quick-start
    - theme: alt
      text: 功能概览
      link: /guide/

features:
  - icon: 🌐
    title: 域名管理
    details: 统一管理多个域名，查看到期状态，关联 DNS 服务商，支持分组与标签。
    link: /guide/domains
  - icon: 📡
    title: DNS 解析
    details: 支持 A / AAAA / CNAME / MX / TXT / NS / SRV / CAA，变更自动同步到 Cloudflare / 阿里云 / 腾讯云。
    link: /guide/dns-records
  - icon: 🔐
    title: 权限协作
    details: 三角色模型（admin / member / guest），域名级指派和子域名匹配模式，记录级写权限校验。
    link: /guide/assignments
  - icon: 🛡️
    title: 安全认证
    details: 账号密码 + OAuth2 / OIDC 登录，双因素认证（TOTP / Passkey），API Key 粒度权限。
    link: /guide/2fa
  - icon: 🔔
    title: 通知提醒
    details: 多渠道通知（网页 Toast / 钉钉 / 飞书 / 邮件 / Webhook），域名到期自动检查与提醒。
    link: /guide/notifications
  - icon: 📸
    title: 快照回滚
    details: 解析记录版本管理，手动 / 变更时自动快照，支持版本 diff 和回滚。
    link: /guide/snapshots
  - icon: 🗄️
    title: 多数据库
    details: PostgreSQL（推荐）/ MariaDB / MySQL 8+ 三方支持，启动时自动选择方言。
    link: /guide/docker
  - icon: 📋
    title: 记录模板
    details: 9 个预设场景模板（Gmail、Office 365、Cloudflare CDN 等），一键批量添加，告别手动输入。
    link: /guide/dns-templates
  - icon: 🚀
    title: 一键部署
    details: Docker Compose + Caddy 自动 HTTPS，开箱即用。
    link: /guide/quick-start
---
