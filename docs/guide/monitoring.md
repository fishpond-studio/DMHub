# 监控集成

DMHub 提供两种监控能力：UptimeKuma 推送和本地测速。

## UptimeKuma 集成

DMHub 兼容 UptimeKuma 的 Push 推送端点。

### 配置步骤

1. 在 UptimeKuma 中添加监控，类型为「Push」
2. 复制 Push URL
3. 在 DMHub「设置 → 团队设置」中配置 Uptime Push URL
4. 系统会定期向 UptimeKuma 发送心跳

### 使用场景

- 监控 DMHub 服务可用性
- 接收服务宕机通知
- 统计历史可用性

## 本地测速

在域名详情页提供两种测速功能：

### DNS 测速

测试域名在各 DNS 服务器的解析耗时：

- 向多个公共 DNS 服务器发送解析请求
- 统计平均解析时间
- 检测 DNS 解析异常

### HTTP 可用性检测

检测 URL 的 HTTP 状态码和响应时间：

- 发送 HTTP HEAD 请求
- 测量 TTFB（首字节时间）
- 返回状态码和响应时间

### 使用场景

- 快速检测域名是否可访问
- 评估 CDN 效果
- 排查解析问题

## 仪表盘集成

仪表盘展示：

- 近 7 天变更趋势
- 即将过期域名
- 最近操作活动
