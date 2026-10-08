import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'https://dmhub.example/',
});
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  DOMParser: dom.window.DOMParser,
  Node: dom.window.Node,
});

const { sanitizeHtml } = await import('../../web/src/lib/sanitize-html.ts');
const { sanitizeRichHtml } = await import('../src/lib/html-sanitize.ts');

test('blocks entity-encoded javascript and event handlers', async () => {
  const link = sanitizeHtml('<a href="jav&#x61;script:alert(document.cookie)">open</a>');
  assert.equal(link.includes('javascript:'), false);
  assert.equal(link.includes('href'), false);

  const img = sanitizeHtml('<img src="x" one&#114;ror="alert(1)">');
  assert.equal(img.includes('onerror'), false);
  assert.equal(img.includes('one'), false);

  const iframe = sanitizeHtml('<iframe src="https://evil.example/x">');
  assert.equal(iframe.includes('iframe'), false);
});

test('blocks newline-split javascript, svg script, style and data urls', () => {
  assert.equal(sanitizeHtml('<a href="java\nscript:alert(1)">x</a>').includes('javascript:'), false);
  assert.equal(sanitizeHtml('<svg><script>alert(1)</script></svg>').includes('script'), false);
  assert.equal(sanitizeHtml('<p style="background:url(javascript:alert(1))">x</p>').includes('style'), false);
  assert.equal(sanitizeHtml('<img src="data:text/html,<script>alert(1)</script>">').includes('data:'), false);
});

test('keeps ordinary content and restricts mailto/tel to href', () => {
  const kept = sanitizeHtml('<h2>标题</h2><p><strong>ok</strong></p><table><tr><th align="center" colspan="2">h</th></tr></table>');
  assert.match(kept, /<h2>标题<\/h2>/);
  assert.match(kept, /<strong>ok<\/strong>/);
  assert.match(kept, /align="center"/);

  assert.match(sanitizeHtml('<a href="mailto:ops@example.com">mail</a>'), /mailto:ops@example.com/);
  assert.match(sanitizeHtml('<a href="tel:+8613800138000">tel</a>'), /tel:\+8613800138000/);
  assert.match(sanitizeHtml('<a href="/docs">docs</a>'), /href="\/docs"/);
  assert.match(sanitizeHtml('<a href="#top">top</a>'), /href="https:\/\/dmhub\.example\/#top"|href="#top"/);

  const img = sanitizeHtml('<img src="mailto:ops@example.com" alt="x">');
  assert.equal(img.includes('mailto:'), false);
  const telImg = sanitizeHtml('<img src="tel:123" alt="x">');
  assert.equal(telImg.includes('tel:'), false);
});

test('adds noopener on target=_blank', () => {
  const html = sanitizeHtml('<a href="https://example.com" target="_blank">out</a>');
  assert.match(html, /rel="noopener noreferrer"/);
});

test('server sanitizer removes the same bypasses', async () => {
  const cleaned = await sanitizeRichHtml('<a href="jav&#x61;script:alert(1)">open</a><img src="x" one&#114;ror="alert(1)"><iframe src="https://evil.example"></iframe>');
  assert.equal(cleaned.includes('javascript:'), false);
  assert.equal(cleaned.includes('onerror'), false);
  assert.equal(cleaned.includes('iframe'), false);
  const mailImg = await sanitizeRichHtml('<img src="mailto:ops@example.com" alt="x"><a href="mailto:ops@example.com">m</a>');
  assert.match(mailImg, /href="mailto:ops@example.com"/);
  assert.equal(mailImg.includes('src="mailto:'), false);
});
