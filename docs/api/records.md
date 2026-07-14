# 解析记录 API

## 列表

### GET /api/domains/:id/records

获取域名下的解析记录列表。

**Query Parameters:**

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `type` | 记录类型筛选 | - |
| `search` | 主机记录搜索 | - |
| `page` | 页码 | 1 |
| `limit` | 每页数量 | 50 |

**Response:**

```json
{
  "records": [
    {
      "id": "uuid",
      "domainId": "uuid",
      "recordType": "A",
      "name": "www",
      "value": "192.168.1.1",
      "ttl": 600,
      "priority": null,
      "proxied": false,
      "status": "active",
      "createdAt": "2026-01-01T00:00:00.000Z"
    }
  ],
  "total": 10,
  "page": 1,
  "limit": 50
}
```

## CRUD

### POST /api/domains/:id/records

创建解析记录。

**Body:**

```json
{
  "recordType": "A",
  "name": "www",
  "value": "192.168.1.1",
  "ttl": 600,
  "priority": null,
  "proxied": false
}
```

### PUT /api/domains/:id/records/:recordId

更新解析记录。

### DELETE /api/domains/:id/records/:recordId

删除解析记录。

## 批量创建

### POST /api/domains/:id/records/bulk

批量创建解析记录，单次最多100条。每条记录独立校验，失败不影响其他记录。

**Body:**

```json
{
  "records": [
    { "recordType": "A", "name": "www", "value": "1.2.3.4", "ttl": 600 },
    { "recordType": "CNAME", "name": "blog", "value": "example.com", "ttl": 3600 }
  ]
}
```

**Response:**

```json
{
  "results": [
    { "success": true, "recordType": "A", "name": "www" },
    { "success": false, "recordType": "CNAME", "name": "blog", "error": "CNAME记录的值必须是有效的域名" }
  ],
  "total": 2,
  "succeeded": 1
}
```

**DNS 记录值校验规则：**

| 记录类型 | 校验规则 |
|----------|----------|
| A | 必须是有效 IPv4 地址（每段 0-255） |
| AAAA | 必须是有效 IPv6 地址 |
| CNAME / NS | 必须是有效域名格式 |
| MX | 格式 `优先级 域名`，优先级 0-65535 |
| TXT | 不超过 2048 字符 |
| SRV | 格式 `优先级 权重 端口 目标`，权重 0-65535，端口 1-65535 |
| CAA | 格式 `flag tag value`，flag 0-255 |

## 同步

### POST /api/domains/:id/sync

从 DNS 服务商同步解析记录。

**Response:**

```json
{
  "synced": 12,
  "created": 2,
  "updated": 1
}
```

## Open API

### GET /api/v1/domains/:id/records

获取解析记录列表（Open API）。

### POST /api/v1/domains/:id/records

创建解析记录（Open API）。

### PUT /api/v1/domains/:id/records/:recordId

更新解析记录（Open API）。

### DELETE /api/v1/domains/:id/records/:recordId

删除解析记录（Open API）。
