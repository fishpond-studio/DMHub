# 域名 API

## 列表与详情

### GET /api/domains

获取域名列表。

**Query Parameters:**

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `page` | 页码 | 1 |
| `limit` | 每页数量 | 20 |
| `status` | 状态筛选 | - |
| `group` | 分组筛选 | - |
| `tag` | 标签筛选 | - |
| `search` | 搜索关键词 | - |

**Response:**

```json
{
  "domains": [
    {
      "id": "uuid",
      "name": "example.com",
      "providerId": "uuid",
      "providerConfigId": "uuid",
      "expiresAt": "2026-12-31T00:00:00.000Z",
      "status": "active",
      "groupName": "Production",
      "tags": ["重要"],
      "recordCount": 12,
      "createdAt": "2026-01-01T00:00:00.000Z"
    }
  ],
  "total": 42,
  "page": 1,
  "limit": 20
}
```

### GET /api/domains/:id

获取单个域名详情。

## 管理

### POST /api/domains

创建域名。

**Body:**

```json
{
  "name": "example.com",
  "providerConfigId": "uuid",
  "expiresAt": "2026-12-31T00:00:00.000Z",
  "groupName": "Production",
  "tags": ["重要"]
}
```

### PUT /api/domains/:id

更新域名信息。

### DELETE /api/domains/:id

删除域名。

## 到期管理

### PUT /api/domains/:id/expiry-remind

更新到期提醒配置。

**Body:**
```json
{ "expiryRemindDays": [30, 14, 7], "autoCheckExpiry": true }
```

### POST /api/domains/:id/check-expiry

触发 WHOIS/RDAP 查询并更新到期时间。

**Response:**
```json
{ "success": true, "expiresAt": "2026-12-31T00:00:00.000Z", "source": "rdap" }
```

### PUT /api/domains/:id/expiry

手动设置域名到期时间。

**Body:**
```json
{ "expiresAt": "2026-12-31T00:00:00.000Z" }
```

### POST /api/domains/check-expiry-preview

预览 WHOIS 查询结果（不更新数据库）。

**Body:**
```json
{ "domain": "example.com" }
```

## 标签

### GET /api/domains/tags

获取所有标签及计数。

**Response:**

```json
{
  "tags": [
    { "name": "重要", "count": 5 },
    { "name": "测试", "count": 3 }
  ]
}
```

## Open API

### GET /api/v1/domains

获取域名列表（Open API）。

### GET /api/v1/domains/:id

获取单个域名详情（Open API）。
