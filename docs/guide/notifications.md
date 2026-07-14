# 通知配置

DMHub 支持多渠道通知，包括站内 SSE 推送和外部渠道分发。

## 通知渠道

| 渠道 | 说明 | 配置项 |
|------|------|--------|
| 站内通知 | SSE 实时推送 + Toast | 无需额外配置 |
| 钉钉 | 群机器人 Webhook | Webhook URL + 签名密钥 |
| 飞书 | 群机器人 Webhook | Webhook URL + 签名密钥 |
| 邮件 | 使用团队 SMTP 配置 | SMTP 已在团队设置中配置 |
| Webhook | 自定义 HTTP 回调 | URL + 请求头 + 签名密钥 |

## 通知事件

每个通知配置可选择触发事件：

| 事件 | 说明 |
|------|------|
| `domain.expiring` | 域名即将过期 |
| `domain.expired` | 域名已过期 |
| `team_settings.updated` | 团队设置变更 |
| `member.role_changed` | 成员角色变更 |
| `member.removed` | 成员被移除 |
| `member.status_changed` | 成员启用 / 禁用 |
| `notification.update` | 通知配置变更 |
| `dns_provider.deleted` | DNS 服务商被删除 |
| `oauth_provider.deleted` | OAuth Provider 被删除 |
| `admin_reset.requested` | 管理员帮助重置 2FA |

## 通知流程

```
事件触发 → triggerNotification() → 遍历管理员
                                            │
                                    ┌───────┴───────┐
                                    │               │
                              SSE 推送          dispatch()
                              (站内通知)      (外部渠道)
                                                    │
                                      ┌─────┬───────┼───────┬──────┐
                                      │     │       │       │      │
                                    邮件  钉钉   飞书  Webhook ...
```

## 个人通知设置

管理员可在「设置 → 个人资料」中关闭通知开关，关闭后不接收站内通知和 SSE 推送。

## 系统通知

- 系统通知主要推送给启用通知的管理员
- 每日 08:00 域名到期检查会触发通知
- 解析变更、成员变动等事件触发通知

## SSE 连接

```
GET /api/notifications/stream?token=<access_token>
```

SSE 连接用于实时推送站内通知。连接断开后会自动重连。
