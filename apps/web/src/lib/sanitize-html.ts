/**
 * 富文本白名单净化。
 *
 * 站点公告与页脚允许团队管理员填写 HTML，最终通过 `v-html` 渲染。此前用一组正则
 * 删除 `script` / `on*=` / `javascript:`，但正则只能看到原始字符串，而浏览器是
 * 先还原实体引用再建树的：`jav&#x61;script:`、`one&#114;ror=` 都能绕过正则，
 * 在解析阶段还原成真正的危险协议与事件属性。
 *
 * 因此改为把字符串交给浏览器自身的 HTML 解析器建树，再按白名单重建 DOM：
 * 标签、属性逐项判断，URL 属性用 URL 解析器校验协议。
 */

const ALLOWED_TAGS = new Set([
  'a', 'abbr', 'b', 'blockquote', 'br', 'code', 'dd', 'del', 'div', 'dl', 'dt',
  'em', 'figcaption', 'figure', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'i',
  'img', 'ins', 'kbd', 'li', 'mark', 'ol', 'p', 'pre', 'q', 's', 'samp',
  'small', 'span', 'strong', 'sub', 'sup', 'table', 'tbody', 'td', 'tfoot',
  'th', 'thead', 'tr', 'u', 'ul', 'var',
]);

/** 这些标签连同内容一起丢弃：内容本身没有展示价值，或可能被二次解析 */
const DROP_WITH_CONTENT = new Set([
  'script', 'style', 'iframe', 'object', 'embed', 'template', 'noscript',
  'svg', 'math', 'form', 'input', 'button', 'select', 'option', 'textarea',
  'link', 'meta', 'base', 'title', 'head',
]);

/**
 * 白名单标签上允许保留的属性。未列出的标签不保留任何属性，
 * 因此 `on*` 事件、`style`、`id`、`class` 一律被丢弃。
 */
const ALLOWED_ATTRS: Record<string, ReadonlySet<string>> = {
  a: new Set(['href', 'title', 'target', 'rel']),
  img: new Set(['src', 'alt', 'title', 'width', 'height']),
  th: new Set(['align', 'colspan', 'rowspan']),
  td: new Set(['align', 'colspan', 'rowspan']),
};

const EMPTY_ATTRS: ReadonlySet<string> = new Set();

const URL_ATTRS = new Set(['href', 'src']);

/** 允许出现在 URL 属性中的协议；相对路径与锚点解析后同样落到 http(s) */
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:']);

function isSafeUrlAttribute(value: string): boolean {
  const raw = value.trim();
  if (!raw) return false;
  try {
    // 交给 URL 解析器：它按规范先剥离制表符与换行，`java\nscript:` 这类写法
    // 会在这一步还原成 `javascript:`，从而被协议白名单拦下
    return ALLOWED_PROTOCOLS.has(new URL(raw, window.location.origin).protocol);
  } catch {
    return false;
  }
}

function cleanNode(node: Node, doc: Document): Node | null {
  if (node.nodeType === Node.TEXT_NODE) {
    return doc.createTextNode(node.nodeValue ?? '');
  }
  if (node.nodeType !== Node.ELEMENT_NODE) {
    return null; // 注释、CDATA 等一律丢弃
  }

  const el = node as Element;
  const tag = el.tagName.toLowerCase();
  if (DROP_WITH_CONTENT.has(tag)) return null;

  // 不在白名单内的标签只保留其子节点，标签本身丢弃
  if (!ALLOWED_TAGS.has(tag)) {
    const fragment = doc.createDocumentFragment();
    for (const child of Array.from(el.childNodes)) {
      const cleaned = cleanNode(child, doc);
      if (cleaned) fragment.appendChild(cleaned);
    }
    return fragment;
  }

  const allowedAttrs = ALLOWED_ATTRS[tag] ?? EMPTY_ATTRS;
  const clean = doc.createElement(tag);
  for (const attr of Array.from(el.attributes)) {
    const name = attr.name.toLowerCase();
    if (!allowedAttrs.has(name)) continue;
    if (URL_ATTRS.has(name) && !isSafeUrlAttribute(attr.value)) continue;
    clean.setAttribute(name, attr.value);
  }
  if (tag === 'a' && clean.getAttribute('target') === '_blank') {
    clean.setAttribute('rel', 'noopener noreferrer');
  }

  for (const child of Array.from(el.childNodes)) {
    const cleaned = cleanNode(child, doc);
    if (cleaned) clean.appendChild(cleaned);
  }
  return clean;
}

export function sanitizeHtml(html: string): string {
  if (!html) return '';
  // DOMParser 产出的文档是惰性的：不执行 script，也不加载图片
  const parsed = new DOMParser().parseFromString(String(html), 'text/html');
  const container = document.createElement('div');
  for (const node of Array.from(parsed.body.childNodes)) {
    const cleaned = cleanNode(node, document);
    if (cleaned) container.appendChild(cleaned);
  }
  return container.innerHTML;
}
