# API 参考

所有 API 端点前缀为 `/api`。需认证的接口在请求头携带 `Authorization: Bearer <access_token>`。

## 认证令牌类型

| 类型 | 前缀 | 用途 |
|------|------|------|
| Access Token | - | 常规 API 认证，15 分钟有效 |
| 2FA Temp Token | - | 2FA 验证流程，5 分钟有效，scope=`2fa` |
| API Key | `dmhub_` | Open API 认证，管理员创建 |
| User Token | `dmhub_pt_` | Open API 认证，用户个人令牌 |

## 认证流程

```
┌──────────┐     POST /api/auth/login    ┌──────────┐
│  Client  │ ─────────────────────────▶│  Server  │
│          │◀───────────────────────── │          │
│          │   { requires2FA,          │          │
│          │     tempToken }           │          │
│          │                           │          │
│          │  POST /api/2fa/verify      │          │
│          │  Bearer: tempToken        │          │
│          │──────────────────────────▶│          │
│          │◀───────────────────────── │          │
│          │   { accessToken,          │          │
│          │     refreshToken,         │          │
│          │     user }                │          │
└──────────┘                           └──────────┘
```

## Open API 端点

| 端点 | 方法 | 所需权限 |
|------|------|---------|
| `/api/v1/domains` | GET | `domains:read` |
| `/api/v1/domains/:id` | GET | `domains:read` |
| `/api/v1/domains/:id/records` | GET | `records:read` |
| `/api/v1/domains/:id/records` | POST | `records:write` |
| `/api/v1/domains/:id/records/:recordId` | PUT | `records:write` |
| `/api/v1/domains/:id/records/:recordId` | DELETE | `records:write` |

## 导出端点

| 端点 | 方法 | 权限 | 说明 |
|------|------|------|------|
| `/api/export/domains` | GET | admin | 导出域名列表（`?format=csv\|json`） |
| `/api/export/dns-records/:domainId` | GET | 域名访问权限 | 导出指定域名 DNS 记录 |
| `/api/export/dns-records` | GET | admin | 导出所有 DNS 记录 |

## 其他端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/domains/:id/records/bulk` | POST | 批量创建 DNS 记录（最多100条） |

## 专题文档

| 文档 | 内容 |
|------|------|
| [认证](./auth) | 登录 / 刷新 / 2FA / 个人资料 |
| [OAuth / OIDC](./oauth) | 登录回调、绑定、Well-Known 配置、`/oauth/oidc` |
| [通知](./notifications) | 站内信 SSE、已读、渠道配置、邮件开关 |
| [域名](./domains) | 域名 CRUD |
| [解析记录](./records) | DNS 记录与批量 |
| [快照](./snapshots) | 快照与回滚 |
| [导出](./export) | CSV / JSON 导出 |

## 频率限制

- 100 请求 / 分钟 / Key
- 进程内存实现，多实例部署不共享计数

## 分页

列表接口支持分页参数：

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `page` | 页码（从 1 开始） | 1 |
| `limit` | 每页数量 | 20 |
| `offset` | 偏移量 | 0 |

## 错误响应格式

所有接口错误返回统一格式：

```json
{ "error": "错误描述" }
```

结构化错误码（通过 `AppError` 抛出时）：

```json
{
  "error": "错误描述",
  "code": 2000,
  "detail": null
}
```

| 字段 | 说明 |
|------|------|
| `error` | 人类可读的错误描述 |
| `code` | 数字错误码，按业务域分段（可选） |
| `detail` | 附加详情，如字段校验错误（可选） |

错误码分段：

| 范围 | 业务域 |
|------|--------|
| 1000-1999 | 通用错误 |
| 2000-2999 | 认证 |
| 3000-3999 | 双因素认证 |
| 4000-4999 | 域名 |
| 5000-5999 | DNS 记录 |
| 6000-6999 | 团队 |
| 7000-7999 | 服务商 |
| 8000-8999 | 快照 |
| 9000-9999 | 通知 |
| 10000-10999 | API Key |
| 11000-11999 | 导入 |
