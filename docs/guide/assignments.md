# 域名指派与协作

DMHub 通过域名指派机制实现多人协作管理。管理员为 member 分配特定域名的管理权限，member 只能在指派范围内操作。

## 角色与权限

| 角色 | 权限 |
|------|------|
| admin | 全局管理：域名 CRUD、DNS 记录、团队设置、指派管理 |
| member | 指派范围内：DNS 记录读写或只读 |
| guest | 无管理权限 |

## 子域名匹配模式

指派域名时需设置子域名匹配模式（`subdomainPattern`）：

| 模式 | 含义 | 匹配示例 |
|------|------|---------|
| `*` | 整个域名（包含 apex 和所有子域） | `example.com` + `*.example.com` |
| `''` / `@` | 仅 apex 自身 | `example.com` |
| `blog` | 仅指定子域 | `blog.example.com` |
| `*.dev` | 通配子级 | `api.dev.example.com`（不含 `dev.example.com`） |

### 匹配规则示例

```text
matchesSubdomainPattern('blog', '*');        // true（全通配）
matchesSubdomainPattern('blog', 'blog');     // true（精确匹配）
matchesSubdomainPattern('api.dev', '*.dev'); // true（子级匹配）
matchesSubdomainPattern('dev', '*.dev');     // false（仅子级，不含自身）
matchesSubdomainPattern('', '@');            // true（apex 自身）
```

> 通配符指派（`*`）需二次确认。`*.dev` 严格匹配子级，需要包含 `dev` 自身请单独再加一条 `dev` 规则。

## 权限级别

| 权限 | 说明 |
|------|------|
| `dns_edit` | 可创建、修改、删除 DNS 记录 |
| `dns_readonly` | 仅可查看 DNS 记录 |

## 管理员指派流程

1. 进入「设置 → 域名指派」
2. 点击「添加指派」
3. 选择成员 → 选择域名
4. 设置子域名匹配模式
5. 选择权限（`dns_edit` / `dns_readonly`）
6. 保存

## 成员申请流程

1. member 在「我的域名」页面点击「申请管理权限」
2. 选择域名、填写子域名模式和申请理由
3. 管理员在「设置 → 指派审批」中查看申请
4. 审批通过后生效

## 权限校验分层

DMHub 在中间件层实现三层权限校验：

| 中间件 | 校验粒度 | 说明 |
|--------|---------|------|
| `requireDomainAccess` | 域名级 | 验证用户对该 domainId 至少有一条 assignment（读权限） |
| `requireDomainWriteAccess` | 域名级 | 进一步要求 `dns_edit` 权限 |
| `requireRecordWriteAccess` | 记录级 | 取出该 record 的名称，逐一比对用户所有 assignment 的 pattern，命中即放行 |

## 操作示例

### 场景：授权管理 www.example.com 的解析

1. 管理员进入「设置 → 域名指派」
2. 选择成员 `张三` → 域名 `example.com`
3. 子域名模式填 `*`
4. 权限选 `dns_edit`
5. 保存

此后张三可以管理 `example.com` 域名下的所有解析记录，但不能修改域名元数据（标签、分组等），也不能管理其他域名。
