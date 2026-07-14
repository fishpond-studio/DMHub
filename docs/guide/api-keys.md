# API Key 与开放接口

DMHub 提供两种 API 认证方式：管理员 API Key 和用户个人令牌。

## API Key（管理员）

### 创建 API Key

1. 进入「设置 → API Keys」
2. 点击「创建」
3. 设置名称和权限
4. 复制生成的 Key — **只显示一次**

### 权限粒度

| 权限 | 说明 |
|------|------|
| `domains:read` | 读取域名信息 |
| `records:read` | 读取解析记录 |
| `records:write` | 创建 / 修改 / 删除解析记录 |
| `*` | 所有权限 |

### Key 格式

- 前缀：`dmhub_`
- 示例：`dmhub_abc123def456...`

## 用户令牌（个人）

### 创建用户令牌

1. 进入「设置 → 我的令牌」
2. 点击「创建令牌」
3. 设置名称和权限
4. 复制生成的令牌 — **只显示一次**

### 权限粒度

与 API Key 相同：`domains:read` / `records:read` / `records:write` / `*`

### 令牌格式

- 前缀：`dmhub_pt_`
- 示例：`dmhub_pt_abc123def456...`

## 调用示例

### 使用 API Key

```bash
curl -H "Authorization: Bearer dmhub_xxxxxxxx" \
  https://your-domain.com/api/v1/domains
```

### 使用用户令牌

```bash
curl -H "Authorization: Bearer dmhub_pt_xxxxxxxx" \
  https://your-domain.com/api/v1/domains/example.com/records
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

## 频率限制

- 100 请求 / 分钟 / Key
- 进程内存实现，多实例部署不共享计数

## 安全注意事项

- Key 本身只显示一次，数据库存 hash
- 泄露后可在「设置 → API Keys」中吊销
- 建议使用最小权限原则
- 生产环境建议定期轮换 Key
