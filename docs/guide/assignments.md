# 域名指派与协作

DMHub 通过域名指派实现多人协作：管理员为 member 分配**域名 + 子域名范围 + 权限**，成员只能在范围内操作解析。

## 角色与权限

| 角色 | 权限 |
|------|------|
| admin | 全局管理：域名 CRUD、DNS 记录、团队设置、指派管理 |
| member | 指派范围内：DNS 记录读写或只读 |
| guest | 无管理权限 |

## 子域名匹配模式

| 模式 | 含义 | 成员看到的范围示例（域名 example.com） |
|------|------|----------------------------------------|
| `*` | 全部主机（含裸域名） | `*.example.com` |
| `@` / 空 | 仅裸域名 | `example.com` |
| `blog` | 仅该主机 | `blog.example.com` |
| `*.dev` | dev 下的多级子域（不含 `dev` 本身） | `*.dev.example.com` |

### 匹配规则示例

```text
matchesSubdomainPattern('blog', '*');        // true
matchesSubdomainPattern('blog', 'blog');     // true
matchesSubdomainPattern('api.dev', '*.dev'); // true
matchesSubdomainPattern('dev', '*.dev');     // false（不含 dev 本身）
matchesSubdomainPattern('', '@');            // true（apex）
```

> 通配符 `*` 指派时建议二次确认。需要 `dev` 自身时请再加一条 `dev` 规则。

## 权限级别

| 权限 | 说明 |
|------|------|
| `dns_edit` | 可创建、修改、删除 DNS 记录（仍受子域名范围限制） |
| `dns_readonly` | 仅可查看权限范围内的记录 |

## 成员侧展示（重要）

成员不会只看到「总域名」而猜权限：

| 页面 | 展示内容 |
|------|----------|
| **我的域名** | 每个域名下的可管理范围卡片（主机预览 + 中文说明 + 权限） |
| **域名列表** | 域名下挂可管主机标签 |
| **域名详情** | 顶部「你的可管理范围」横幅；列表仅显示权限内记录 |
| **添加/编辑记录** | 提示允许的主机模式，超范围禁止保存 |

同一域名可有多条指派（不同子域模式），前端会聚合展示。

## 管理员指派流程

1. 进入 **设置 → 域名分配**  
2. 选择成员  
3. 选择域名、填写子域名模式、选择权限  
4. 保存  

填写模式时，页面会预览成员将看到的主机名（如 `api.example.com`）。

## 成员申请流程

1. **我的域名** → 申请权限（或 **指派申请** 页）  
2. 选择域名、子域名模式、理由  
3. 管理员在 **设置 → 分配审核** 中通过 / 拒绝  

## 通知

指派相关会发**站内信**（可选邮件，见 [通知配置](/guide/notifications)）：

| 动作 | 通知谁 |
|------|--------|
| 管理员直接分配 | 被分配成员 |
| 移除分配 | 被移除成员 |
| 成员提交申请 | 管理员 |
| 审批通过 / 拒绝 | 申请人 |

## 权限校验分层

| 中间件 | 粒度 | 说明 |
|--------|------|------|
| `requireDomainAccess` | 域名 | 至少有一条 assignment 可读 |
| `requireDomainWriteAccess` | 域名 | 需 `dns_edit` |
| `requireRecordWriteAccess` | 记录名 | 主机名必须命中某条 subdomainPattern |

## 操作示例

### 只让成员管理 blog.example.com

1. 域名：`example.com`  
2. 子域名模式：`blog`  
3. 权限：`dns_edit`  

成员侧显示可管理：`blog.example.com`（仅主机 blog）。  
其只能增删改名为 `blog` 的记录，不能动 `@` 或 `www`。

### 授权整个域名

子域名模式填 `*`，权限 `dns_edit`。
