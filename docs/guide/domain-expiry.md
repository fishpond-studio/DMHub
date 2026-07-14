# 域名到期与 WHOIS

## 自动检查

- 每天北京时间 **08:00** 自动检查开启自动检查的域名
- 检查方式：WHOIS / RDAP 查询（三级回退）
- 查询结果自动更新域名到期时间

## WHOIS 查询流程

系统采用三级回退策略：

```
lookupDomainExpiry(domain)
  │
  ├─ 1. RDAP 查询 (https://rdap.org/domain/xxx)
  │     └─ 成功 → 提取 expiryDate
  │
  ├─ 2. TLD WHOIS 服务器查询 (net.connect)
  │     └─ 支持 20+ TLD 专用服务器
  │     └─ 成功 → 正则提取 expiry
  │
  └─ 3. {tld}.whois-servers.net WHOIS 回退
        └─ 成功 → 正则提取 expiry
```

> WHOIS / RDAP 查询逻辑纯 Node.js 实现（`net` + `https`），不依赖外部 WHOIS npm 包。

## 支持的 TLD

支持 20+ 常见 TLD，包括但不限于：.com / .net / .org / .io / .cn / .dev / .app / .xyz / .me / .co 等。

## 手动操作

### WHOIS 查询

在域名详情页点击「WHOIS 查询到期时间」按钮，系统自动执行 RDAP → WHOIS → whois-servers.net 三级回退。

### 手动设置

如果 WHOIS 查询不到（如某些注册商屏蔽），可手动设置到期时间。

## 到期提醒

### 提醒节点

默认提醒节点：**30 / 14 / 7 / 3 / 1 / 0 天**（距过期）。

到达提醒节点时，系统通过已配置的通知渠道发送提醒。

### 自定义提醒

在域名详情页可自定义提醒节点：

- 勾选已启用的提醒节点
- 可添加自定义天数（如 60 天、90 天）
- 保存后立即生效

## 状态联动

| 距过期天数 | 域名状态 |
|-----------|---------|
| > 30 天 | `active` |
| ≤ 30 天 | `expiring` |
| ≤ 0 天 | `expired` |
