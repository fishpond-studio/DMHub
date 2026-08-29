# OIDC / OAuth2 登录

DMHub 支持通过 OIDC / OAuth2 身份提供商登录与账号绑定。

## 支持的提供商

| Provider | 类型 | 必填配置 |
|----------|------|----------|
| GitHub | OAuth2 | Client ID + Client Secret |
| GitLab | OAuth2 | Client ID + Client Secret（自建需填端点） |
| Google | OIDC | Client ID + Client Secret |
| 钉钉 | OAuth2 | Client ID + Client Secret |
| 飞书 | OAuth2 | Client ID + Client Secret |
| **OIDC** | OIDC | Client ID + Client Secret + **Well-Known URL** |

## 前置条件

1. 在 **设置 → 团队设置** 中填写 **站点 URL**（例如 `https://dmhub.example.com`）  
   - 用于生成主页 URL、OIDC 重定向 URL 与 Cookie 域名
2. 在 IdP 控制台创建应用，并登记下方「主页 URL / 重定向 URL」

## 配置入口

进入 **设置 → OIDC / OAuth2 配置**：

- 添加 / 编辑 / 删除提供商
- 启用 / 禁用
- 一键复制 **主页 URL** 与 **重定向 URL**

## OIDC 配置字段

| 字段 | 必填 | 说明 |
|------|------|------|
| Client ID | 是 | 应用 ID |
| Client Secret | 是 | 应用密钥 |
| **Well-Known URL** | 是* | Discovery 地址或 Issuer |
| 授权端点 | 否 | 留空则从 Well-Known 自动识别 |
| Token 端点 | 否 | 同上 |
| 用户信息端点 | 否 | 同上；也可依赖 `id_token` claims |
| Scope | 否 | 默认 `openid email profile` |

\* 若不填 Well-Known，则必须同时手填「授权端点 + Token 端点」。

### Well-Known 示例

完整地址：

```text
https://auth.example.com/realms/demo/.well-known/openid-configuration
```

或只填 Issuer（系统自动补全 `/.well-known/openid-configuration`）：

```text
https://auth.example.com/realms/demo
```

### 登记到 IdP 的地址

配置完成后页面会展示（可复制）：

| 名称 | 示例 |
|------|------|
| **主页 URL** | `https://dmhub.example.com` |
| **OIDC 重定向 URL** | `https://dmhub.example.com/oauth/oidc` |

其他 OAuth 提供商（GitHub 等）的回调为：

```text
https://dmhub.example.com/api/auth/oauth/{providerId}/callback
```

## 登录流程

```
用户点击登录
    → GET /api/auth/oauth/:provider/authorize
    → 跳转 IdP 授权
    → 回调（OIDC: /oauth/oidc ；其他: /api/auth/oauth/:id/callback）
    → 服务端用相同 redirect_uri 换 token
    → 302 到前端 /oauth/callback?ticket=...
    → POST /api/auth/oauth/exchange-ticket 换取 accessToken
    → 进入控制台
```

### 首次登录

| 场景 | 行为 |
|------|------|
| 系统中尚无用户 | 自动创建管理员账号并登录 |
| 已有用户 + 关闭邀请码 | 自动注册为 member 并登录 |
| 已有用户 + 开启邀请码 | 要求输入邀请码后完成注册 |
| 关闭注册 | 拒绝新用户，提示联系管理员 |

### 再次登录

已绑定过的 OAuth 身份直接登录。

## 账号绑定

路径：**设置 → 账号绑定**

1. 点击「绑定」  
2. 前端调用 `POST /api/auth/oauth/:providerId/bind/start`（需登录）  
3. 跳转 IdP 授权  
4. 回调绑定后返回绑定页  

解绑时若该用户没有密码且仅剩一种登录方式，将拒绝解绑。

## 安全要点

| 机制 | 说明 |
|------|------|
| 绝对 `redirect_uri` | 与 IdP 登记地址完全一致，token 交换时原样回传 |
| 加密 `state` | 含 providerId、redirectUri、intent（login/bind）、可选 userId，10 分钟过期 |
| 一次性 ticket | 避免 access_token 出现在 URL 查询参数中，60 秒有效 |
| refresh_token | 写入数据库并设 HttpOnly Cookie |

## 反向代理

OIDC 回调路径 `/oauth/oidc` 必须转发到后端（不能落到前端 SPA）：

- **Nginx**：`location = /oauth/oidc { proxy_pass http://app:3000; ... }`
- **Caddy**：`handle /oauth/oidc { reverse_proxy app:3000 }`
- **本地 Vite**：已代理 `/oauth/oidc` → 后端

## 常见问题

**Token 交换失败 / redirect_uri mismatch**  
检查 IdP 登记的重定向 URL 是否与页面展示的完全一致（含 `https`、无多余斜杠）。

**Well-Known 拉取失败**  
确认 URL 可从服务器访问；生产环境禁止内网地址（SSRF 防护）。

**站点 URL 未配置**  
先在团队设置填写站点 URL，否则无法生成回调地址。

**绑定后仍无法登录**  
确认该 OAuth 身份已绑定到正确用户；可在「账号绑定」查看。
