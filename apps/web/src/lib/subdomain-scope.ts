/**
 * 将指派的 subdomainPattern 转成用户能看懂的范围说明。
 *
 * 模式语义与后端 apps/server/src/lib/subdomain-match.ts 保持一致。
 */

export function normalizePattern(pattern: string | null | undefined): string {
  const n = (pattern ?? '').trim().toLowerCase()
  if (!n || n === '@') return '@'
  return n.replace(/\.$/, '')
}

/** 可管理主机预览，如 blog.example.com / *.dev.example.com */
export function formatHostPreview(domainName: string, pattern: string | null | undefined): string {
  const pat = normalizePattern(pattern)
  if (pat === '*') return `*.${domainName}`
  if (pat === '@' || pat === '') return domainName
  if (pat.startsWith('*.')) return `${pat}.${domainName}`
  return `${pat}.${domainName}`
}

/** 中文范围说明 */
export function formatScopeLabel(pattern: string | null | undefined): string {
  const pat = normalizePattern(pattern)
  if (pat === '*') return '全部主机（含裸域名与所有子域名）'
  if (pat === '@' || pat === '') return '仅裸域名（@）'
  if (pat.startsWith('*.')) {
    const suffix = pat.slice(2)
    return `仅 ${suffix} 下的多级子域名（不含 ${suffix} 本身）`
  }
  return `仅主机 ${pat}`
}

/** 列表/卡片用的短标签 */
export function formatScopeShort(domainName: string, pattern: string | null | undefined): string {
  return formatHostPreview(domainName, pattern)
}

export function permissionLabel(permission: string | null | undefined): string {
  if (permission === 'dns_edit') return '可编辑'
  if (permission === 'dns_readonly') return '只读'
  return permission || '未知'
}

export function isEditablePermission(permission: string | null | undefined): boolean {
  return permission === 'dns_edit'
}

/** 多条指派合并后的最高权限 */
export function mergePermission(
  items: Array<{ permission: string }>,
): 'dns_edit' | 'dns_readonly' {
  return items.some((i) => i.permission === 'dns_edit') ? 'dns_edit' : 'dns_readonly'
}
