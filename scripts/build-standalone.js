// 生成免代理、零外部依赖的单文件 HTML 制品（内嵌实时抓取的羊毛数据 + 样式 + 图标 + 交互）
'use strict';

const fs = require('fs');
const path = require('path');
const { Store } = require('../server/store');
const { CATEGORIES, PLATFORMS } = require('../server/classify');
const evergreen = require('../server/evergreen');
const { sources } = require('../server/sources');

const ROOT = path.join(__dirname, '..');
const OUT = process.argv[2] || path.join(ROOT, 'dist', '羊毛雷达.html');

const store = new Store();
store.load();

const logoSvg = fs.readFileSync(path.join(ROOT, 'public/img/logo.svg'), 'utf8');
const logoData = 'data:image/svg+xml;base64,' + Buffer.from(logoSvg).toString('base64');
const mascotData = 'data:image/webp;base64,' + fs.readFileSync(path.join(ROOT, 'public/img/mascot.webp')).toString('base64');
const css = fs.readFileSync(path.join(ROOT, 'public/styles.css'), 'utf8');
let html = fs.readFileSync(path.join(ROOT, 'public/index.html'), 'utf8');
let appJs = fs.readFileSync(path.join(ROOT, 'public/app.js'), 'utf8');

const allItems = [...store.items.values()].sort((a, b) => b.ts - a.ts);
const counts = store.stats().sources;
const boot = {
  meta: {
    stats: store.stats(),
    categories: CATEGORIES,
    platforms: PLATFORMS,
    sources: sources.map((s) => ({
      id: s.id,
      name: s.name,
      home: s.home,
      desc: s.desc,
      interval: s.interval,
      count: counts[s.id] || 0,
      ...(store.sourceState[s.id] || { ok: true }),
    })),
    now: Date.now(),
  },
  games: store.games(),
  evergreen,
  items: allItems,
};

// 客户端离线 API 垫片：若 /api 不可达（打开本地 HTML 制品时），直接用内置数据完成筛选、搜索、排序与详情读取
const shim = `
window.__YM_BOOT__ = ${JSON.stringify(boot).replace(/<\//g, '<\\/')};
(function(){
  const rawFetch = window.fetch ? window.fetch.bind(window) : null;
  function hotScore(it, now) {
    const ageH = Math.max(0, (now - it.ts) / 3600e3);
    const eng = Math.log2(1 + (it.replies || 0)) * 1.6 + Math.log10(1 + (it.views || 0)) * 0.8 + (it.alsoOn ? it.alsoOn.length * 1.5 : 0);
    const bonus = (it.cats.includes('free') ? 1.2 : 0) + (it.price != null && it.price <= 10 ? 0.6 : 0) + (it.image ? 0.2 : 0);
    return (1 + eng + bonus) / Math.pow(ageH + 2, 1.15);
  }
  function localHandle(url) {
    const u = new URL(url, 'http://local');
    const p = u.pathname;
    const q = Object.fromEntries(u.searchParams);
    const B = window.__YM_BOOT__;
    if (p === '/api/meta') return B.meta;
    if (p === '/api/games') return { items: B.games };
    if (p === '/api/evergreen') return { groups: B.evergreen };
    if (p.startsWith('/api/deal/')) {
      const id = decodeURIComponent(p.slice('/api/deal/'.length));
      return B.items.find((x) => x.id === id) || null;
    }
    if (p === '/api/deals') {
      const now = Date.now();
      let list = B.items.slice();
      if (q.cat && q.cat !== 'all') list = list.filter((it) => it.cats.includes(q.cat));
      if (q.platform) list = list.filter((it) => it.platforms.includes(q.platform));
      if (q.source) { const ss = new Set(String(q.source).split(',')); list = list.filter((it) => ss.has(it.source)); }
      if (q.q) {
        const ws = String(q.q).toLowerCase().split(/\\s+/).filter(Boolean);
        list = list.filter((it) => { const h = (it.title + ' ' + (it.summary||'') + ' ' + (it.tag||'') + ' ' + it.sourceName).toLowerCase(); return ws.every((w) => h.includes(w)); });
      }
      const total = list.length;
      if (q.sort === 'hot') {
        list.forEach((it) => (it._s = hotScore(it, now)));
        list.sort((a, b) => b._s - a._s);
      } else if (q.sort === 'price') {
        list = list.filter((it) => it.price != null);
        list.sort((a, b) => a.price - b.price || b.ts - a.ts);
      } else {
        list.sort((a, b) => b.ts - a.ts);
      }
      const off = +q.offset || 0;
      const lim = Math.min(+q.limit || 30, 100);
      return { total, items: list.slice(off, off + lim) };
    }
    return null;
  }
  const isFile = location.protocol === 'file:' || location.protocol === 'blob:' || location.protocol === 'data:' || !location.host;
  window.fetch = async function(input, init) {
    const s = typeof input === 'string' ? input : input.url;
    if (s.startsWith('/api/')) {
      if (!isFile && rawFetch) {
        try {
          const r = await rawFetch(input, init);
          if (r.ok) return r;
        } catch (_) {}
      }
      const d = localHandle(s);
      return new Response(JSON.stringify(d), { status: d ? 200 : 404, headers: { 'Content-Type': 'application/json' } });
    }
    return rawFetch(input, init);
  };
  if (isFile) {
    window.EventSource = function() { return { addEventListener(){}, close(){} }; };
  }
})();
`;

html = html
  .replace(/\/img\/logo\.svg/g, logoData)
  .replace(/\/img\/mascot\.webp/g, mascotData)
  .replace(/\/img\/mascot\.jpg/g, mascotData)
  .replace('<link rel="manifest" href="/manifest.webmanifest" />', '')
  .replace('<link rel="stylesheet" href="/styles.css" />', () => `<style>${css}</style>`)
  .replace('<script src="/app.js" defer></script>', () => `<script>${shim}\n${appJs}</script>`);

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, html);
console.log(`✔ 已生成单文件制品：${OUT} (${(Buffer.byteLength(html) / 1024).toFixed(1)} KB，含 ${allItems.length} 条羊毛)`);
