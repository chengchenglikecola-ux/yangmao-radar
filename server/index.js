// 羊毛雷达 · 服务端入口：定时抓取全网羊毛 + 提供 API / 静态页面 / RSS / 实时推送
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { URL } = require('url');
const { Store } = require('./store');
const { sources } = require('./sources');
const { CATEGORIES, PLATFORMS } = require('./classify');
const evergreen = require('./evergreen');

const PORT = +process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC = path.join(__dirname, '..', 'public');
const DISABLED = new Set(String(process.env.DISABLED_SOURCES || '').split(',').filter(Boolean));
const SITE_URL = process.env.SITE_URL || '';

const store = new Store();
store.load();

/* ---------------- 抓取调度 ---------------- */

const activeSources = sources.filter((s) => !DISABLED.has(s.id));

async function runSource(src) {
  const t0 = Date.now();
  const prev = store.sourceState[src.id] || {};
  try {
    const list = await src.fetch();
    const added = store.upsert(src, list);
    store.setSourceState(src.id, { ok: true, lastRun: Date.now(), lastOk: Date.now(), ms: Date.now() - t0, fetched: list.length, added: added.length, error: null, fails: 0 });
    if (added.length) console.log(`[${src.id}] +${added.length} 新羊毛（${Date.now() - t0}ms）`);
    return 0;
  } catch (e) {
    const fails = (prev.fails || 0) + 1;
    store.setSourceState(src.id, { ok: false, lastRun: Date.now(), ms: Date.now() - t0, error: String(e.message || e).slice(0, 120), fails });
    console.warn(`[${src.id}] 抓取失败(${fails}): ${e.message}`);
    return fails;
  }
}

function schedule(src, delay) {
  setTimeout(async () => {
    const fails = await runSource(src);
    // 失败指数退避，最长 30 分钟；正常则按间隔 ±15% 抖动
    const base = fails ? Math.min(src.interval * 2 ** fails, 30 * 60e3) : src.interval;
    schedule(src, base * (0.85 + Math.random() * 0.3));
  }, delay);
}

activeSources.forEach((s, i) => schedule(s, 300 + i * 700));

/* ---------------- 实时推送（SSE） ---------------- */

const clients = new Set();
store.onNew((added) => {
  const payload = `event: new\ndata: ${JSON.stringify({ count: added.length, at: Date.now(), titles: added.slice(0, 5).map((a) => ({ id: a.id, title: a.title })) })}\n\n`;
  for (const res of clients) res.write(payload);
});
setInterval(() => {
  for (const res of clients) res.write(': ping\n\n');
}, 25e3);

/* ---------------- HTTP ---------------- */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

function send(req, res, status, body, type = 'application/json; charset=utf-8', extra = {}) {
  let buf = Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
  const headers = { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff', ...extra };
  if (buf.length > 1024 && /gzip/.test(req.headers['accept-encoding'] || '') && /json|text|xml|javascript|svg/.test(type)) {
    buf = zlib.gzipSync(buf);
    headers['Content-Encoding'] = 'gzip';
    headers.Vary = 'Accept-Encoding';
  }
  headers['Content-Length'] = buf.length;
  res.writeHead(status, headers);
  res.end(req.method === 'HEAD' ? undefined : buf);
}

function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC)) return send(req, res, 403, { error: 'forbidden' });
  fs.readFile(file, (err, data) => {
    if (err) {
      // SPA 回退
      if (!path.extname(rel)) return serveStatic(req, res, '/');
      return send(req, res, 404, { error: 'not found' });
    }
    const ext = path.extname(file);
    const cache = ext === '.html' ? 'no-cache' : 'public, max-age=3600';
    send(req, res, 200, data, MIME[ext] || 'application/octet-stream', { 'Cache-Control': cache });
  });
}

function sourcesMeta() {
  const counts = store.stats().sources;
  return activeSources.map((s) => ({
    id: s.id,
    name: s.name,
    home: s.home,
    desc: s.desc,
    interval: s.interval,
    count: counts[s.id] || 0,
    ...(store.sourceState[s.id] || {}),
  }));
}

function escXml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function rss(req, res, params) {
  const { items } = store.query({ ...params, limit: 60 });
  const origin = SITE_URL || `http://${req.headers.host}`;
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
<title>羊毛雷达 · 全网羊毛实时聚合</title>
<link>${escXml(origin)}</link>
<description>整合什么值得买、线报酷、0818团、赚客吧、V2EX、LINUX DO、Epic 等全网羊毛</description>
<language>zh-cn</language>
${items
  .map(
    (it) => `<item><title>${escXml(it.title)}</title><link>${escXml(it.url)}</link><guid isPermaLink="false">${escXml(it.id)}</guid><pubDate>${new Date(it.ts).toUTCString()}</pubDate><category>${escXml(it.sourceName)}</category><description>${escXml(it.summary || it.title)}</description></item>`
  )
  .join('\n')}
</channel></rss>`;
  send(req, res, 200, body, 'application/rss+xml; charset=utf-8', { 'Cache-Control': 'public, max-age=120' });
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://localhost');
  const p = u.pathname;
  const q = Object.fromEntries(u.searchParams);
  try {
    if (p === '/api/deals') {
      const ids = q.ids ? q.ids.split(',').slice(0, 300) : undefined;
      return send(req, res, 200, store.query({ ...q, ids }), undefined, { 'Cache-Control': 'no-store' });
    }
    if (p.startsWith('/api/deal/')) {
      const it = store.get(decodeURIComponent(p.slice('/api/deal/'.length)));
      if (!it) return send(req, res, 404, { error: '这条羊毛已经被薅完啦' });
      if (!it.html) {
        await fetchDetail(it);
        if (it.html) store.scheduleSave();
      }
      return send(req, res, 200, it);
    }
    if (p === '/api/img' && q.u) {
      try {
        const target = new URL(q.u);
        if (target.protocol !== 'http:' && target.protocol !== 'https:') return send(req, res, 400, 'bad url');
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 10000);
        const r = await fetch(target.href, { signal: ctrl.signal, headers: { 'User-Agent': 'Mozilla/5.0' } });
        clearTimeout(t);
        if (!r.ok) return send(req, res, 502, 'upstream');
        const ct = r.headers.get('content-type') || 'image/jpeg';
        const buf = Buffer.from(await r.arrayBuffer());
        return send(req, res, 200, buf, ct, { 'Cache-Control': 'public, max-age=86400' });
      } catch (_) {
        return send(req, res, 502, 'img error');
      }
    }
    if (p === '/api/meta') {
      return send(req, res, 200, {
        stats: store.stats(),
        categories: CATEGORIES,
        platforms: PLATFORMS,
        sources: sourcesMeta(),
        now: Date.now(),
      }, undefined, { 'Cache-Control': 'no-store' });
    }
    if (p === '/api/games') return send(req, res, 200, { items: store.games() });
    if (p === '/api/evergreen') return send(req, res, 200, { groups: evergreen }, undefined, { 'Cache-Control': 'public, max-age=600' });
    if (p === '/api/stream') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
      res.write(`retry: 5000\nevent: hello\ndata: ${JSON.stringify({ at: Date.now() })}\n\n`);
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }
    if (p === '/api/health') return send(req, res, 200, { ok: true, items: store.items.size, uptime: process.uptime() });
    if (p === '/rss.xml' || p === '/feed') return rss(req, res, q);
    if (p.startsWith('/api/')) return send(req, res, 404, { error: 'not found' });
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(req, res, 405, { error: 'method not allowed' });
    return serveStatic(req, res, p);
  } catch (e) {
    console.error(e);
    return send(req, res, 500, { error: 'server error' });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`🐑 羊毛雷达已启动：http://localhost:${PORT}  （数据源 ${activeSources.length} 个）`);
});

function shutdown() {
  store.saveNow();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
