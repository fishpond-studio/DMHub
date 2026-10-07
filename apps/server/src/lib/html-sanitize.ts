/**
 * 公告和页脚的服务端净化。浏览器端还有一份白名单，这里用 DOMPurify 挡住
 * 不经过 SPA、直接渲染公开接口 HTML 的客户端。
 */
let purifyPromise: Promise<{
  sanitize: (html: string, config: Record<string, unknown>) => string;
}> | null = null;

const ALLOWED_TAGS = [
  'a', 'abbr', 'b', 'blockquote', 'br', 'code', 'dd', 'del', 'div', 'dl', 'dt',
  'em', 'figcaption', 'figure', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'i',
  'img', 'ins', 'kbd', 'li', 'mark', 'ol', 'p', 'pre', 'q', 's', 'samp',
  'small', 'span', 'strong', 'sub', 'sup', 'table', 'tbody', 'td', 'tfoot',
  'th', 'thead', 'tr', 'u', 'ul', 'var',
];

const ALLOWED_ATTR = ['href', 'title', 'target', 'rel', 'src', 'alt', 'width', 'height', 'align', 'colspan', 'rowspan'];

async function getPurify() {
  if (!purifyPromise) {
    purifyPromise = (async () => {
      const dp = await import('dompurify');
      const jsdom = await import('jsdom');
      const DOMPurify = dp.default || dp;
      const JSDOM = jsdom.JSDOM || jsdom.default;
      const purify = DOMPurify(new JSDOM('').window);
      purify.addHook('uponSanitizeAttribute', (_node: Element, data: { attrName: string; attrValue: string; keepAttr: boolean }) => {
        if (data.attrName !== 'src') return;
        const protocol = data.attrValue.trim().split(/[:\s]/)[0]?.toLowerCase();
        if (protocol === 'mailto' || protocol === 'tel') data.keepAttr = false;
      });
      purify.addHook('afterSanitizeAttributes', (node: Element) => {
        if (node.tagName === 'A' && node.getAttribute('target') === '_blank') {
          node.setAttribute('rel', 'noopener noreferrer');
        }
      });
      return purify;
    })();
  }
  return purifyPromise;
}

export async function sanitizeRichHtml(html: string): Promise<string> {
  if (!html) return '';
  const purify = await getPurify();
  return purify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
  });
}
