# 0.2.0 新特性

面向升级与试用用户的简要说明。完整列表见 [更新日志](/reference/changelog)。

## 1. OIDC 登录（重点）

在 **设置 → OIDC / OAuth2** 添加 **OIDC**：

1. 先填 **团队设置 → 站点 URL**
2. 填写 Client ID、Client Secret、**Well-Known URL**
3. 授权 / Token / 用户信息端点可选（可自动发现）
4. 将页面上的地址登记到 IdP：

| 名称 | 示例 |
|------|------|
| 主页 URL | `https://dmhub.example.com` |
| 重定向 URL | `https://dmhub.example.com/oauth/oidc` |

从 0.1.x 升级：若曾用「自定义 OIDC」旧回调路径，请在 IdP **改成** `/oauth/oidc`。

详见 [OIDC / OAuth2 登录](/guide/oauth)。

## 2. 域名指派更清晰

成员在 **我的域名**、**域名详情** 直接看到：

- 可管理主机（如 `api.example.com`）
- 权限（可编辑 / 只读）
- 中文范围说明

添加 DNS 记录时，主机不在范围内会提示并禁止保存。

详见 [域名指派](/guide/assignments)。

## 3. 站内信与可选邮件

- 顶栏 **铃铛**：未读、已读、跳转域名/审批
- **个人资料**：站内通知开关；**邮件通知**默认关（需邮箱 + SMTP）
- 分配域名、审批申请会推送

详见 [通知配置](/guide/notifications)。

## 4. 交互增强

- `Ctrl/⌘ + K` 命令面板；`?` 快捷键帮助
- 域名详情 **应用模板** / **粘贴导入** / **批量改 TTL** / **克隆记录**
- 导出 CSV、BIND Zone、复制域名/记录值/`dig` 命令
- 全局 DNS 搜索、收藏、备注、最近访问
- 仪表盘 **域名健康分**；操作日志 **导出 CSV**
- 记录 **传播检测**（多公共 DNS）；**HTTPS 证书**探测与到期提醒
- DNS 记录 **备注**；全局搜索支持 **IP 反查**
- 通知事件：`record.created/updated/deleted`、`ssl.expiring/expired`（Webhook/飞书/钉钉）

## 5. 可用性监控

域名详情新增 **可用性监控** 卡片：

- 每 15 分钟定时 HTTP 探测，历史持久化（保留 30 天）
- 状态变更自动告警：`monitor.down`（不可用）/ `monitor.up`（恢复）
- 卡片展示：启用开关、可用率、响应时间趋势柱状图、立即探测

详见 [监控集成](/guide/monitoring)。

## 6. 审计与会话管理

- **个人资料 → 登录会话**：查看当前账号所有登录设备，可注销单个或"注销其他会话"
- 管理员可查看全部会话，并在成员管理中强制注销任意用户
- 密码错误记录 `login_failed` 操作日志
- **团队设置 → 审计与日志**：日志保留天数（0 = 永久保留），每日 03:00 自动清理

## 7. 备份与 Excel 导入

- **导入页 → 数据备份**：全量 JSON 导出 / 恢复（不含服务商凭据，恢复时跳过已存在项）
- 域名与记录导入支持 `.xlsx`（Excel）与 `.csv` 双格式

## 8. Redis 缓存（可选）

配置 `REDIS_URL`（环境变量或团队设置）后启用 Redis，否则回退进程内存。验证码、OAuth 登录票据、WebAuthn challenge、API Key 限流已统一走缓存层；docker-compose 已内置 `redis` 服务。

> 单实例部署无需配置；多实例部署启用后验证码与限流状态可跨实例共享。修改后需重启服务生效。

## 9. 界面与国际化

- 暗色模式防首屏闪烁（刷新不再闪白）
- 顶栏新增语言开关：简体中文 / English

## 10. 文档入口

| 类型 | 位置 |
|------|------|
| 用户指南 | 本站「指南」侧栏 |
| API | [API 概述](/api/) · [OAuth](/api/oauth) · [通知](/api/notifications) |
| 仓库 | `README.md`、`API.md`、`CHANGELOG.md` |

```bash
pnpm docs:dev   # 本地预览文档站
```
