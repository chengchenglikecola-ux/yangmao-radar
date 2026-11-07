// 轻量 HTML 白名单清洗：只保留安全标签与属性，其余全部转义
'use strict';

const ALLOWED = {
  a: ['href', 'title'],
  img: ['src', 'alt'],
  br: [], p: [], b: [], strong: [], em: [], i: [], u: [], s: [],
  ul: [], ol: [], li: [], blockquote: [], code: [], pre: [], span: [],
  h3: [], h4: [], h5: [], hr: [], figure: [], figcaption: [],
};
const VOID = new Set(['br', 'img', 'hr']);

function escText(s) {
  return s.replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escAttr(s) {
  return String(s).replace(/&amp;/g, '&').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function safeUrl(raw, base) {
  if (!raw) return null;
  let v = raw.trim().replace(/&amp;/g, '&');
  if (v.startsWith('//')) v = 'https:' + v;
  try {
    const u = new URL(v, base || undefined);
    if (u.protocol === 'http:' || u.protocol === 'https:') return u.href;
  } catch (_) { /* ignore */ }
  return null;
}

function parseAttrs(str) {
  const out = {};
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  let m;
  while ((m = re.exec(str))) out[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? '';
  return out;
}

function sanitize(html, base) {
  if (!html) return '';
  let src = String(html)
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|iframe|object|embed|noscript|template|svg|math|form)[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<(script|style|iframe|object|embed|form)[^>]*>/gi, '');
  const re = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)([^>]*)>/g;
  let out = '';
  let last = 0;
  let m;
  while ((m = re.exec(src))) {
    out += escText(src.slice(last, m.index));
    last = re.lastIndex;
    const closing = !!m[1];
    const tag = m[2].toLowerCase();
    if (!ALLOWED[tag]) continue;
    if (closing) {
      if (!VOID.has(tag)) out += `</${tag}>`;
      continue;
    }
    const attrs = parseAttrs(m[3]);
    let rendered = `<${tag}`;
    if (tag === 'a') {
      const href = safeUrl(attrs.href, base);
      if (href) rendered += ` href="${escAttr(href)}" target="_blank" rel="noopener noreferrer nofollow"`;
      if (attrs.title) rendered += ` title="${escAttr(attrs.title)}"`;
    } else if (tag === 'img') {
      const s = safeUrl(attrs['data-original'] || attrs['data-src'] || attrs.src, base);
      if (!s) continue;
      rendered += ` src="${escAttr(s)}" loading="lazy" referrerpolicy="no-referrer"`;
      if (attrs.alt) rendered += ` alt="${escAttr(attrs.alt)}"`;
    }
    rendered += '>';
    out += rendered;
  }
  out += escText(src.slice(last));
  return out.trim();
}

function stripTags(html) {
  return String(html || '')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function firstImage(html, base) {
  const m = /<img[^>]+?(?:data-original|data-src|src)\s*=\s*["']([^"']+)["']/i.exec(html || '');
  return m ? safeUrl(m[1], base) : null;
}

function decodeEntities(s) {
  return String(s || '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
}

function firstActionUrl(html, base) {
  if (!html) return null;
  const re = /<a[^>]+?href\s*=\s*["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(html))) {
    const u = safeUrl(m[1], base);
    if (!u) continue;
    if (/v2ex\.com|linux\.do|xianbao\.fun|0818tuan\.com|iehou\.com|zuanke8\.com|\.(?:jpg|jpeg|png|webp|gif)(?:\?|$)/i.test(u)) continue;
    return u;
  }
  return null;
}

module.exports = { sanitize, stripTags, firstImage, firstActionUrl, safeUrl, decodeEntities };
