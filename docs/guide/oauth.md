# OIDC / OAuth2 登录

DMHub 支持通过 OIDC / OAuth2 提供商登录，实现单点登录。

## 支持的 Provider

| Provider | 必填配置 |
|----------|---------|
| GitHub | Client ID + Client Secret |
| GitLab | Client ID + Client Secret + GitLab URL |
| Google | Client ID + Client Secret |
| 钉钉 | Client ID + Client Secret |
| 飞书 | Client ID + Client Secret |
| 自定义 OIDC | 名称 + Issuer + Client ID + Client Secret |

## 配置 Provider

### 环境变量方式

在 `.env` 文件中配置：

```bash
GITHUB_CLIENT_ID=your_client_id
GITHUB_CLIENT_SECRET=your_client_secret
```

### 引导页面方式

首次启动引导的第 4 步可配置 OAuth Provider。

### 设置页面方式

进入「设置 → OAuth Providers」管理：

- 添加 / 删除 Provider
- 修改 Client ID / Secret
- 启用 / 禁用 Provider

## 登录流程

### 首次 OAuth 登录

1. 用户点击 OAuth 登录按钮
2. 跳转到 Provider 授权页面
3. 用户授权后回调到 DMHub
4. 系统中无用户时自动成为管理员
5. 已有用户时需输入邀请码

### 再次 OAuth 登录

1. 用户点击 OAuth 登录按钮
2. 自动匹配已绑定的账号
3. 直接进入系统

## 账号绑定

进入「设置 → 账号绑定」：

- 查看已绑定的 OAuth 账号
- 可解绑（需二次确认）
- 支持绑定多个 Provider 到同一账号

## 自定义 OIDC

如需接入其他 OIDC 提供商：

1. 选择 Provider 类型为「自定义 OIDC」
2. 填写：
   - **名称** — 显示名称
   - **Issuer** — OIDC Provider 的 Issuer URL（如 `https://accounts.google.com`）
   - **Client ID** — OAuth Client ID
   - **Client Secret** — OAuth Client Secret

回调地址统一为：`https://your-domain.com/api/auth/oauth/:provider/callback`
