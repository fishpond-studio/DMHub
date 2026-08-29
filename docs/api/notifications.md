# 通知 API

## 站内信

### GET /api/notifications/stream

SSE 实时流。认证：Query `token` 或（部分客户端）Bearer。

```
GET /api/notifications/stream?token=<access_token>
Content-Type: text/event-stream
```

消息示例：

```
data: {"event":"connected"}

data: {"event":"assignment.create","id":"...","title":"你获得了新的域名权限","content":"...","level":"info","read":false,"createdAt":"...","metadata":{...}}
```

每用户最多约 5 路并发 SSE。

### GET /api/notifications

需登录。当前用户站内信列表。

```json
{
  "notifications": [
    {
      "id": "uuid",
      "event": "assignment.create",
      "title": "你获得了新的域名权限",
      "content": "管理员已为你分配 blog.example.com（所属域名 example.com），权限：可编辑。",
      "level": "info",
      "metadata": {
        "type": "assignment",
        "domainId": "...",
        "domainName": "example.com",
        "subdomainPattern": "blog",
        "host": "blog.example.com"
      },
      "createdAt": "2026-07-25T00:00:00.000Z",
      "read": false
    }
  ],
  "unreadCount": 1
}
```

> 存储在服务端内存，进程重启后清空。

### POST /api/notifications/:id/read

标记单条已读。

### POST /api/notifications/read-all

全部已读。

### DELETE /api/notifications/:id

删除单条。

### DELETE /api/notifications

清空全部站内信。

## 通知渠道配置（管理员）

### GET /api/notifications/configs

### POST /api/notifications

创建外部渠道配置（钉钉 / 飞书 / email / webhook / web）。

```json
{
  "channel": "dingtalk",
  "name": "运维群",
  "config": {
    "webhookUrl": "https://oapi.dingtalk.com/robot/send?access_token=xxx",
    "secret": "SEC..."
  },
  "events": ["domain.expiring", "domain.expired"],
  "enabled": true
}
```

### PUT /api/notifications/configs/:id

### DELETE /api/notifications/configs/:id

## 个人资料中的通知开关

通过 `PUT /api/auth/me/profile`：

```json
{
  "notificationsEnabled": true,
  "emailNotificationsEnabled": false
}
```

| 字段 | 默认 | 说明 |
|------|------|------|
| `notificationsEnabled` | true | 站内信 / SSE |
| `emailNotificationsEnabled` | false | 可选邮件（需邮箱 + SMTP） |

## 指派相关站内事件（示例）

| event | 说明 |
|-------|------|
| `assignment.create` | 管理员分配域名 |
| `assignment.delete` | 移除分配 |
| `assignment.request` | 新申请（管理员） |
| `assignment.approve` | 申请通过 |
| `assignment.reject` | 申请拒绝 |
