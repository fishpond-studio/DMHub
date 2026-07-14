# 权限模型

## 角色

DMHub 采用三角色模型：

| 角色 | 说明 |
|------|------|
| admin | 全局管理员，拥有所有功能访问权限 |
| member | 团队成员，在指派范围内管理 DNS 记录 |
| guest | 访客，仅可查看 |

## 角色权限矩阵

### 域名

| 操作 | admin | member | guest |
|------|:-----:|:------:|:-----:|
| 查看 | ✅ | 指派范围内 | ❌ |
| 创建 / 编辑 | ✅ | ❌ | ❌ |
| 删除 | ✅ | ❌ | ❌ |
| 修改元数据（标签/分组/状态） | ✅ | ❌ | ❌ |

### DNS 记录

| 操作 | admin | member | guest |
|------|:-----:|:------:|:-----:|
| 查看 | ✅ | 指派范围内 | ❌ |
| 创建 / 修改 / 删除 | ✅ | 指派范围内（`dns_edit`） | ❌ |

### 快照

| 操作 | admin | member | guest |
|------|:-----:|:------:|:-----:|
| 查看 | ✅ | 指派范围内 | ❌ |
| 创建 | ✅ | 指派范围内 | ❌ |
| 回滚 | ✅ | ❌ | ❌ |

### 团队设置页面

| 操作 | admin | member | guest |
|------|:-----:|:------:|:-----:|
| 查看（基本信息/SMTP/注册/主页/公告） | ✅ | ❌ | ❌ |
| 编辑 | ✅ | ❌ | ❌ |

> 站外公告通过 `/` 公开页面展示，无需登录即可查看。

### 成员管理

| 操作 | admin | member | guest |
|------|:-----:|:------:|:-----:|
| 查看 | ✅ | ✅ | ✅ |
| 编辑角色 / 启用 / 禁用 | ✅ | ❌ | ❌ |
| 移除成员 | ✅ | ❌ | ❌ |

### 域名指派

| 操作 | admin | member | guest |
|------|:-----:|:------:|:-----:|
| 查看 | ✅ | ❌ | ❌ |
| 创建 / 编辑 / 删除指派 | ✅ | ❌ | ❌ |
| 审批申请 | ✅ | ❌ | ❌ |
| 提交指派申请 | ✅ | ✅ | ❌ |

### 操作日志

| 操作 | admin | member | guest |
|------|:-----:|:------:|:-----:|
| 查看全部 | ✅ | ❌ | ❌ |
| 查看指派范围 | ✅ | ✅ | ❌ |

### 通知

| 操作 | admin | member | guest |
|------|:-----:|:------:|:-----:|
| 查看通知配置 | ✅ | ❌ | ❌ |
| 编辑通知配置 | ✅ | ❌ | ❌ |
| 个人通知开关 | ✅ | ✅ | ❌ |

### API Key

| 操作 | admin | member | guest |
|------|:-----:|:------:|:-----:|
| 创建 / 管理 API Key | ✅ | ❌ | ❌ |
| 创建 / 管理用户令牌 | ✅ | ✅ | ❌ |

## 域名级权限

`domain_assignments` 表控制 member 对特定域名的访问：

### 子域名匹配模式

| 模式 | 含义 | 匹配示例 |
|------|------|---------|
| `*` | 整个域名（包含 apex 和所有子域） | `example.com` + `*.example.com` |
| `''` / `@` | 仅 apex 自身 | `example.com` |
| `blog` | 仅指定子域 | `blog.example.com` |
| `*.dev` | 通配子级 | `api.dev.example.com`（不含 `dev.example.com`） |

### 匹配规则

```text
matchesSubdomainPattern('blog', '*');        // true（全通配）
matchesSubdomainPattern('blog', 'blog');     // true（精确匹配）
matchesSubdomainPattern('api.dev', '*.dev'); // true（子级匹配）
matchesSubdomainPattern('dev', '*.dev');     // false（仅子级，不含自身）
matchesSubdomainPattern('', '@');            // true（apex）
```

### 权限级别

| 权限 | 说明 |
|------|------|
| `dns_edit` | 可创建、修改、删除 DNS 记录 |
| `dns_readonly` | 仅可查看 DNS 记录 |

## 中间件校验分层

| 中间件 | 校验粒度 | 说明 |
|--------|---------|------|
| `requireDomainAccess` | 域名级 | 验证用户对该 domainId 至少有一条 assignment（读权限） |
| `requireDomainWriteAccess` | 域名级 | 进一步要求 `dns_edit` 权限 |
| `requireRecordWriteAccess` | 记录级 | 取出该 record 的 name，逐一比对用户所有 assignment 的 pattern，命中即放行 |

`lib/subdomain-match.ts` 实现 pattern 匹配规则。

## 数据隔离

- admin 查看全部数据
- member 仅查看和操作指派范围内的域名和记录
- guest 无管理权限
- 中间件层统一校验，不依赖前端控制
