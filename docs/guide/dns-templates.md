# DNS 记录模板

添加 DNS 记录时，可以从预设模板快速填充。避免每次手动输入常见配置，提高效率。

## 使用方式

在域名详情页点击 **"添加记录"**，弹出表单顶部会显示 **"从模板填充"** 区域：

1. 从下拉菜单选择场景模板
2. 如果模板只有 1 条记录 → 自动填充表单，检查后保存
3. 如果模板有多条记录 → 显示记录列表，可以：
   - 点击单条填充到表单
   - 点击 **"一键添加全部 N 条记录"** 批量创建

## 模板列表

### 基础建站 🌐

基本的 A 记录和 WWW 跳转：

| 类型 | 主机记录 | 记录值 | 说明 |
|------|----------|--------|------|
| A | @ | `1.2.3.4` | 替换为你的服务器 IP |
| CNAME | www | @ | 将 www 指向根域名 |

### Google Workspace 邮箱 📧

Gmail 企业邮件的完整配置（MX、SPF、DKIM、DMARC）：

- 5 条 MX 记录（ASPMX.L.GOOGLE.COM 系列）
- SPF 记录（`include:_spf.google.com`）
- DKIM 记录（需在 Google Admin 生成后替换公钥）
- DMARC 记录（替换为你的通知邮箱）

### Microsoft 365 邮箱 📨

Exchange Online 配置：

- MX 记录（`yourdomain-com.mail.protection.outlook.com`）
- Autodiscover CNAME（`autodiscover.outlook.com`）
- SPF 记录（`include:spf.protection.outlook.com`）

### 腾讯企业邮箱 💼

- MX 主/备（`mxbiz1.qq.com` / `mxbiz2.qq.com`）
- SPF 记录（`include:spf.mail.qq.com`）
- DKIM 记录（在管理后台获取公钥）

### Cloudflare CDN ☁️

通过 Cloudflare 加速和保护网站，记录默认开启代理：

- A 记录（指向服务器 IP，`proxied: true`）
- WWW CNAME 指向根域名

### GitHub Pages 🐙

将域名指向 GitHub Pages 静态站点：

- 4 条 A 记录（GitHub IP 段）
- WWW CNAME（`your-username.github.io`）

### Vercel 部署 ▲

将域名指向 Vercel 项目：

- A 记录（`76.76.21.21`）
- WWW CNAME（`cname.vercel-dns.com`）

### SSL 域名验证 🔒

- ACME 协议 TXT 记录（`_acme-challenge`）
- DNS CNAME 验证（腾讯云/阿里云）

### CDN 归属验证 ✅

- 腾讯云 CDN 验证 TXT 记录
- 阿里云 CDN 验证 TXT 记录

## 注意事项

- 模板中的占位值（如 `1.2.3.4`、`你的公钥`）需要替换为你的实际配置
- DKIM 公钥需要从对应服务商（Google Admin / 腾讯企业邮管理后台）获取
- 批量添加时，如果某条记录添加失败，已成功添加的记录不会被回滚
