import i18n from '@/i18n';
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
  if (pat === '*') return i18n.global.t('全部主机（含裸域名与所有子域名）')
  if (pat === '@' || pat === '') return i18n.global.t('仅裸域名（@）')
  if (pat.startsWith('*.')) {
    const suffix = pat.slice(2)
    return i18n.global.t('仅 {p0} 下的多级子域名（不含 {p1} 本身）', { p0: suffix, p1: suffix })
  }
  return i18n.global.t('仅主机 {p0}', { p0: pat })
}

/** 列表/卡片用的短标签 */
export function formatScopeShort(domainName: string, pattern: string | null | undefined): string {
  return formatHostPreview(domainName, pattern)
}

export function permissionLabel(permission: string | null | undefined): string {
  if (permission === 'dns_edit') return i18n.global.t('可编辑')
  if (permission === 'dns_readonly') return i18n.global.t('只读')
  return permission || i18n.global.t('未知')
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
