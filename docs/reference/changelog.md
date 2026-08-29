# 更新日志

## 0.2.0 — 2026-07-25

完整说明见仓库根目录 [CHANGELOG.md](https://github.com/fishpond-studio/DMHub/blob/main/CHANGELOG.md)。

### 亮点

- **OIDC 可用化** — Well-Known、`/oauth/oidc` 重定向、主页/回调 URL 可复制
- **指派范围可见** — 成员直接看到可管理主机，记录写入受 pattern 约束
- **站内信 + 可选邮件** — 铃铛收件箱；分配/审批推送；事件清单共享枚举
- **可用性监控** — 定时 HTTP 探测、状态变更告警、可用率与响应趋势
- **审计与会话** — 登录会话管理、登录失败留痕、日志保留策略
- **缓存层** — Redis 缓存抽象（可选），验证码/票据/challenge/限流共享化，内存回退
- **备份与导入** — 全量 JSON 备份导出/恢复；`.xlsx` 域名与记录导入
- **前端体验** — 命令面板、DNS 模板 UI、导出/复制、暗色模式防闪烁、中英切换
- **文档** — 指南与 API 专题对齐实现

### 升级注意

1. 配置 **站点 URL**
2. IdP 重定向改为 `https://你的域名/oauth/oidc`
3. 代理转发 `/oauth/oidc` 到后端
4. 重启服务加载 schema 补丁（含 `monitor_checks` 表，自动补建）
5. 可选：团队设置配置 Redis 连接地址后重启启用缓存

### 相关文档

| 文档 | 链接 |
|------|------|
| OIDC 配置 | [指南](/guide/oauth) · [API](/api/oauth) |
| 通知 | [指南](/guide/notifications) · [API](/api/notifications) |
| 域名指派 | [指南](/guide/assignments) |
| 监控集成 | [指南](/guide/monitoring) |
| 新特性总览 | [0.2.0 新特性](/guide/whats-new) |
| 环境变量 | [指南](/guide/env) |

---

## 0.1.0

首个公开版本：多数据库、域名/DNS 协作、2FA、快照、导入导出、Open API、Docker 部署等。详见根目录 CHANGELOG。
