# 导出 API

> 需要登录认证，使用 `Authorization: Bearer <token>` 请求头。

## 导出域名列表

```
GET /api/export/domains?format=csv|json
```

### 查询参数

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `format` | 导出格式：`csv` 或 `json` | `json` |

### 响应

#### JSON 格式

```json
[
  {
    "id": "uuid",
    "name": "example.com",
    "providerName": "Cloudflare",
    "status": "active",
    "expiresAt": "2027-01-15",
    "tags": ["生产环境"],
    "groupName": "核心业务",
    "recordCount": 12
  }
]
```

#### CSV 格式

返回 UTF-8 BOM 编码的 CSV 文件，Excel 可直接打开。包含以下列：

```csv
域名,状态,服务商,到期时间,分组,标签,记录数
example.com,active,Cloudflare,2027-01-15,核心业务,生产环境,12
```

## 导出 DNS 记录

```
GET /api/export/dns-records/:domainId?format=csv|json
```

### 查询参数

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `format` | 导出格式：`csv` 或 `json` | `json` |

### 响应

#### JSON 格式

```json
[
  {
    "id": "uuid",
    "recordType": "A",
    "name": "@",
    "value": "1.2.3.4",
    "ttl": 600,
    "priority": null,
    "proxied": false
  }
]
```

#### CSV 格式

包含以下列：

```csv
类型,主机记录,记录值,TTL,优先级,代理
A,@,1.2.3.4,600,,否
MX,@,mail.example.com,3600,10,否
```

## 权限

导出接口复用域名管理的权限模型：

- **admin** — 可导出所有域名的数据
- **member** — 仅可导出已指派域名的数据
- **guest** — 不可操作

## 前端使用

在域名列表页和域名详情页提供 **"导出"** 按钮，无需手动构造 API 请求：

<div class="tip custom-block">

**域名列表页** — 点击 "导出" 下拉菜单选择 CSV 或 JSON

**域名详情页** — DNS 记录表格上方 "导出" 按钮直接下载 CSV

</div>

浏览器会自动触发文件下载，文件名包含中文（如 `域名列表.csv`）。
