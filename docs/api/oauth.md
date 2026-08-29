# OAuth / OIDC API

## 登录与绑定（`/api/auth/oauth`）

### GET /api/auth/oauth/providers

公开。返回已启用的登录提供商。

```json
{
  "providers": [
    { "providerId": "oidc", "name": "OIDC", "type": "oidc" },
    { "providerId": "github", "name": "GitHub", "type": "oauth2" }
  ]
}
```

### GET /api/auth/oauth/:providerId/callback-url

公开。返回登记到 IdP 的地址。

```json
{
  "providerId": "oidc",
  "homepageUrl": "https://dmhub.example.com",
  "redirectUrl": "https://dmhub.example.com/oauth/oidc",
  "siteUrl": "https://dmhub.example.com",
  "callbackUrl": "https://dmhub.example.com/oauth/oidc"
}
```

| providerId | redirectUrl 形态 |
|------------|------------------|
| `oidc` / `custom` | `{siteUrl}/oauth/oidc` |
| 其他 | `{siteUrl}/api/auth/oauth/{providerId}/callback` |

### GET /api/auth/oauth/:providerId/authorize

公开。302 跳转到 IdP 授权页。

### GET /api/auth/oauth/:providerId/callback

IdP 回调。302 到前端：

| 结果 | 前端 Query |
|------|------------|
| 登录成功 | `?ticket=<一次性票据>` |
| 需要邀请码 | `?needs_invite=true&pending_token=...` |
| 绑定成功 | `?bound=1&provider_id=...` |
| 失败 | `?error=...` |

### GET /oauth/oidc

**非 `/api` 前缀。** OIDC 简洁重定向 URL，逻辑同回调；`providerId` 从加密 `state` 解析（`oidc` 或 `custom`）。

反向代理必须把该路径转到后端。

### POST /api/auth/oauth/exchange-ticket

公开。用 ticket 换 accessToken，并设置 refresh Cookie。

**Body:**

```json
{ "ticket": "..." }
```

**Response:**

```json
{
  "accessToken": "eyJ...",
  "user": { "id": "...", "username": "...", "email": null, "role": "member" }
}
```

### POST /api/auth/oauth/:providerId/bind/start

需登录。发起绑定，返回授权 URL。

**Response:**

```json
{
  "authorizeUrl": "https://idp.../authorize?...",
  "callbackUrl": "https://dmhub.example.com/oauth/oidc",
  "redirectUrl": "https://dmhub.example.com/oauth/oidc"
}
```

前端应 `window.location = authorizeUrl`。

### POST /api/auth/oauth/:providerId/register

公开。邀请码完成 OAuth 注册。

**Body:**

```json
{
  "pendingToken": "...",
  "inviteCode": "ABCD1234"
}
```

兼容字段：`code` 作为 inviteCode。

### GET /api/auth/oauth/bindings

需登录。当前用户已绑定列表。

### DELETE /api/auth/oauth/unbind/:providerId

需登录。解绑指定提供商。

---

## 提供商配置（`/api/oauth`，管理员）

### GET /api/oauth/providers

需登录。返回已配置列表、可用类型、主页/重定向 URL。

```json
{
  "providers": [
    {
      "id": "uuid",
      "providerId": "oidc",
      "enabled": true,
      "clientIdMasked": "abcd****wxyz",
      "scope": "openid email profile",
      "wellKnownUrl": "https://idp/.well-known/openid-configuration",
      "authorizeUrl": null,
      "tokenUrl": null,
      "userInfoUrl": null,
      "homepageUrl": "https://dmhub.example.com",
      "redirectUrl": "https://dmhub.example.com/oauth/oidc"
    }
  ],
  "availableProviders": [
    { "id": "oidc", "name": "OIDC", "type": "oidc" },
    { "id": "github", "name": "GitHub", "type": "oauth2" }
  ],
  "homepageUrl": "https://dmhub.example.com",
  "oidcUrls": {
    "homepageUrl": "https://dmhub.example.com",
    "redirectUrl": "https://dmhub.example.com/oauth/oidc"
  }
}
```

### POST /api/oauth/providers

需 admin。

**OIDC Body 示例:**

```json
{
  "providerId": "oidc",
  "clientId": "my-client",
  "clientSecret": "secret",
  "wellKnownUrl": "https://idp.example.com/realms/demo/.well-known/openid-configuration",
  "authorizeUrl": null,
  "tokenUrl": null,
  "userInfoUrl": null,
  "scope": "openid email profile",
  "enabled": true
}
```

**GitHub Body 示例:**

```json
{
  "providerId": "github",
  "clientId": "xxx",
  "clientSecret": "xxx",
  "scope": "user:email",
  "enabled": true
}
```

**Response** 含 `homepageUrl`、`redirectUrl`。

### PUT /api/oauth/providers/:id

需 admin。可更新 Client、Secret、Well-Known、可选端点、enabled 等。Secret 留空表示不修改。

### DELETE /api/oauth/providers/:id

需 admin。若有用户绑定，需 Header：`x-confirm-delete: true`。
