# 快照 API

## 列表

### GET /api/domains/:id/snapshots

获取域名下的快照列表。

**Query Parameters:**

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `page` | 页码 | 1 |
| `limit` | 每页数量 | 20 |
| `trigger` | 触发类型筛选 | - |

**Response:**

```json
{
  "snapshots": [
    {
      "id": "uuid",
      "domainId": "uuid",
      "version": 3,
      "trigger": "on_change",
      "records": [...],
      "createdBy": "uuid",
      "createdAt": "2026-01-01T00:00:00.000Z"
    }
  ],
  "total": 15,
  "page": 1,
  "limit": 20
}
```

## 创建

### POST /api/domains/:id/snapshots

手动创建快照。

**Body:**

```json
{
  "trigger": "manual"
}
```

> `trigger` 可选值：`manual`（默认）、`scheduled`、`on_change`

## 查看

### GET /api/domains/:id/snapshots/:snapshotId

获取单个快照详情。

## 对比

### GET /api/domains/:id/snapshots/diff?from=:id&to=:id

对比两个快照版本。

**Response:**

```json
{
  "added": [
    { "recordType": "A", "name": "api", "value": "1.2.3.4" }
  ],
  "removed": [
    { "recordType": "A", "name": "old", "value": "5.6.7.8" }
  ],
  "modified": [
    {
      "before": { "recordType": "A", "name": "www", "value": "192.168.1.1", "ttl": 600, "priority": null, "proxied": false },
      "after": { "recordType": "A", "name": "www", "value": "192.168.1.2", "ttl": 600, "priority": null, "proxied": false },
      "changes": { "value": ["192.168.1.1", "192.168.1.2"] }
    }
  ]
}
```

## 回滚

### POST /api/domains/:id/snapshots/:snapshotId/rollback

回滚到指定快照版本。

> 仅限 admin 操作。回滚操作本身会创建 `on_change` 快照。
