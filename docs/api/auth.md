# 认证 API

## 账号密码登录

### POST /api/auth/login

**Body:**

```json
{
  "username": "admin",
  "password": "your_password",
  "rememberMe": false
}
```

**Response (成功，无 2FA):**

```json
{
  "accessToken": "eyJhbGciOi...",
  "refreshToken": "eyJhbGciOi...",
  "user": {
    "id": "uuid",
    "username": "admin",
    "email": "admin@example.com",
    "role": "admin"
  }
}
```

**Response (需要 2FA):**

```json
{
  "requires2FA": true,
  "tempToken": "eyJhbGciOi...",
  "methods": ["totp", "passkey", "email"]
}
```

`rememberMe` 决定刷新令牌的生命周期：

- `true`：持久 Cookie（7 天），刷新时重新签发 7 天，属滑动续期。
- `false`（默认）：会话级 Cookie，刷新令牌在登录后 **24 小时绝对到期**。
  刷新只延续剩余时间，不会延长截止点；即使浏览器恢复了会话 Cookie，
  超过 24 小时也必须重新登录。

### POST /api/auth/refresh

通过 HttpOnly Cookie 中的 refresh_token 刷新 Access Token。

**Response:**

```json
{
  "accessToken": "eyJhbGciOi...",
  "refreshToken": "eyJhbGciOi..."
}
```

**错误码：**

| 状态码 | code | 说明 |
| :-- | :-- | :-- |
| 401 | `REFRESH_TOKEN_MISSING` | 缺少刷新令牌 |
| 401 | `REFRESH_TOKEN_INVALID` | 令牌无效或已过期，会话结束并清除 Cookie |
| 401 | `REFRESH_TOKEN_REUSED` | 令牌刚被其他请求消费（多标签页竞态），稍后重试即可 |
| 503 | `REFRESH_UNAVAILABLE` | 服务端临时故障，保留 Cookie，可稍后重试 |

`REFRESH_TOKEN_REUSED` 只在令牌被消费后的 60 秒宽限窗口内返回。数据库里查不到
令牌（已登出、已被吊销、从未登记）或令牌已过期，一律返回 `REFRESH_TOKEN_INVALID`
并清除 Cookie；宽限窗口之后再次使用已消费的令牌视为重放，服务端会撤销整条轮换链。

### POST /api/auth/logout

吊销当前 refresh token。

## 2FA 验证

### POST /api/2fa/verify

**Headers:** `Authorization: Bearer <tempToken>`

**Body (TOTP):**

```json
{
  "method": "totp",
  "code": "123456"
}
```

**Body (Passkey):**

```json
{
  "method": "passkey",
  "credential": { ... }
}
```

**Body (邮箱验证码):**

```json
{
  "method": "email",
  "code": "123456"
}
```

**Response:**

```json
{
  "accessToken": "eyJhbGciOi...",
  "refreshToken": "eyJhbGciOi...",
  "user": { ... }
}
```

## OAuth / OIDC 登录

完整说明见 [OAuth / OIDC API](./oauth)。

摘要：

| 接口 | 说明 |
|------|------|
| `GET /api/auth/oauth/providers` | 已启用提供商 |
| `GET /api/auth/oauth/:id/authorize` | 跳转授权 |
| `GET /oauth/oidc` | OIDC 重定向 URL（简洁路径） |
| `POST /api/auth/oauth/exchange-ticket` | ticket 换 accessToken |
| `POST /api/auth/oauth/:id/bind/start` | 发起账号绑定 |
| `POST /api/auth/oauth/:id/register` | 邀请码完成注册 |

`:providerId` 可为 `oidc` / `github` / `gitlab` / `google` / `dingtalk` / `feishu` / `custom`（兼容）。

## 用户资料

### GET /api/auth/me

获取当前登录用户信息（含 `notificationsEnabled`、`emailNotificationsEnabled`）。

### PUT /api/auth/me/profile

更新用户资料。

**Body 示例:**

```json
{
  "displayName": "张三",
  "nickname": "san",
  "avatarUrl": "https://...",
  "notificationsEnabled": true,
  "emailNotificationsEnabled": false
}
```

### PUT /api/auth/me/password

修改密码。需要验证旧密码。

### PUT /api/auth/me/email

修改邮箱。需要验证当前密码。

## 用户令牌

### GET /api/auth/me/tokens

获取个人令牌列表。

### POST /api/auth/me/tokens

创建个人令牌。

**Body:**

```json
{
  "name": "CI/CD Token",
  "permissions": ["records:read", "records:write"]
}
```

**Response:**

```json
{
  "token": "dmhub_pt_xxxxxxxx",
  "id": "uuid",
  "name": "CI/CD Token",
  "permissions": ["records:read", "records:write"],
  "createdAt": "2026-01-01T00:00:00.000Z"
}
```

### DELETE /api/auth/me/tokens/:id

吊销个人令牌。
