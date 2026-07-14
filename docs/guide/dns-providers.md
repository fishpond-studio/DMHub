# DNS 服务商配置

DMHub 支持三个主流 DNS 服务商，通过 REST API 进行解析管理。

## 服务商列表

| 服务商 | 认证方式 | 接口 |
|--------|---------|------|
| Cloudflare | API Token | api.cloudflare.com REST API |
| 阿里云 | AccessKey ID + Secret | alidns.aliyuncs.com（HMAC-SHA1 签名） |
| 腾讯云 | SecretId + SecretKey | dnspod.tencentcloudapi.com（TC3-HMAC-SHA256 签名） |

## Cloudflare

### 获取 API Token

1. 登录 [Cloudflare API Token 页面](https://dash.cloudflare.com/profile/api-tokens)
2. 点击「创建令牌」→ 选择「自定义令牌」
3. 权限配置：
   - 区域 → 区域 → 读取
   - 区域 → DNS → 编辑
4. 区域资源选择要管理的域名
5. 创建并复制令牌

### 配置参数

| 参数 | 值 |
|------|-----|
| API Token | 复制的令牌 |

## 阿里云

### 获取 AccessKey

1. 登录阿里云控制台 → AccessKey 管理
2. 创建 AccessKey，建议使用 RAM 子账号
3. 授权 `AliyunDNSFullAccess`

### 配置参数

| 参数 | 值 |
|------|-----|
| AccessKey ID | RAM 用户的 AccessKey ID |
| AccessKey Secret | RAM 用户的 AccessKey Secret |

> 建议使用 RAM 子账号而非主账号，遵循最小权限原则。

## 腾讯云

### 获取 API 密钥

1. 登录腾讯云控制台 → 访问管理 → API 密钥
2. 创建密钥，建议使用子账号
3. 授权 DNSPod 相关权限

### 配置参数

| 参数 | 值 |
|------|-----|
| SecretId | 子账号 SecretId |
| SecretKey | 子账号 SecretKey |

## 服务商操作

### 测试连接

配置完成后点击「测试连接」，验证凭证是否正确。

### 同步域名

点击「同步域名」从服务商批量导入域名和解析记录。

### 配置管理

- 每个服务商配置可独立启用 / 禁用
- 支持为不同域名关联不同服务商
- 删除服务商配置前需确认无域名引用

## 添加新服务商

如需添加其他 DNS 服务商：

1. 在 `packages/dns-providers/src/adapters/` 实现 `DNSProviderAdapter` 接口
2. 在 `packages/dns-providers/src/index.ts` 注册适配器
3. 前端添加服务商选项和配置表单

接口定义参考 `DNSProviderAdapter`：

```typescript
interface DNSProviderAdapter {
  testConnection(): Promise<{ success: boolean; error?: string }>
  listDomains(): Promise<Array<{ name: string; id: string }>>
  getDomainInfo(domainId: string): Promise<{ status: string; expiresAt?: string }>
  listRecords(domainId: string): Promise<DnsRecord[]>
  createRecord(domainId: string, record: NewRecord): Promise<DnsRecord>
  updateRecord(domainId: string, recordId: string, record: Partial<NewRecord>): Promise<DnsRecord>
  deleteRecord(domainId: string, recordId: string): Promise<void>
  getDomainExpiry(domainName: string): Promise<string | null>
}
```
