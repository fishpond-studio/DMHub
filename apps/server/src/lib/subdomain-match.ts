/**
 * 子域名匹配工具。
 *
 * 指派 subdomainPattern 语义：
 *   '*'          → 该域名下所有记录（含裸域名）
 *   ''           → 等同 '@'，仅裸域名
 *   'blog'       → 仅 blog（如 blog.example.com）
 *   '*.dev'      → dev 下的所有层级子域名（如 a.dev.example.com、x.y.dev.example.com），不含 dev 本身
 *   '*.www'      → www 下的所有层级子域名（如 api.www.example.com），不含 www 本身
 *   'api.v1'     → 精确匹配 api.v1
 *
 * 记录 name 同样使用相对主机名表示法（与 DNS 记录里的 name 字段一致）：
 *   ''  / '@'   → 裸域名
 *   'www'       → www 子域名
 *   'a.b.dev'   → 多级子域名
 */

function normalize(name: string): string {
  const n = (name ?? '').trim().toLowerCase();
  if (!n || n === '@') return '';
  return n.replace(/\.$/, '');
}

export function matchesSubdomainPattern(recordName: string, pattern: string): boolean {
  const name = normalize(recordName);
  const pat = normalize(pattern);

  if (pat === '*') return true;
  if (pat === '') return name === '';

  if (pat.startsWith('*.')) {
    const suffix = pat.slice(2);
    if (!suffix) return name !== '';
    return name.endsWith('.' + suffix);
  }

  return name === pat;
}

export function matchesAnyPattern(recordName: string, patterns: string[]): boolean {
  return patterns.some((p) => matchesSubdomainPattern(recordName, p));
}
