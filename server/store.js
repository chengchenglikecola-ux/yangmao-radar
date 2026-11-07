// 羊毛存储：内存 Map + JSON 文件持久化，负责去重、排序与检索
'use strict';

const fs = require('fs');
const path = require('path');
const { classify } = require('./classify');
const { firstActionUrl } = require('./sanitize');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const FILE = path.join(DATA_DIR, 'store.json');
const MAX_ITEMS = 8000;
const MAX_AGE = 21 * 86400e3;

const HOT_WORDS = [
  '京东', '淘宝', '拼多多', '美团', '饿了么', '抖音', '支付宝', '微信', '云闪付', '立减金', '红包', '京豆', '话费', '流量',
  '抽奖', '0元', '免费', '喜加一', 'Steam', 'Epic', '白菜', '无门槛', '外卖', '星巴克', '瑞幸', '肯德基', '麦当劳', '工行',
  '建行', '农行', '招行', '中行', '信用卡', '数币', '视频会员', '爱奇艺', '腾讯视频', 'AI', 'GPT', 'Claude', '国补', 'PLUS',
  '88VIP', '小红书', '纸巾', '咖啡', '打车', '电影票', '券包', '果果', '秒杀', '百亿补贴',
];

class Store {
  constructor() {
    this.items = new Map();
    this.titleIndex = new Map();
    this.sourceState = {};
    this.saveTimer = null;
    this.listeners = new Set();
  }

  load() {
    try {
      const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'));
      for (const it of raw.items || []) {
        if (!it.actionUrl && it.html) it.actionUrl = firstActionUrl(it.html, it.url);
        this.items.set(it.id, it);
        this.titleIndex.set(normTitle(it.title), it.id);
      }
      this.sourceState = raw.sourceState || {};
      console.log(`[store] 已载入 ${this.items.size} 条历史羊毛`);
    } catch (e) {
      if (e.code !== 'ENOENT') console.warn('[store] 读取失败', e.message);
    }
  }

  scheduleSave() {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.saveNow();
    }, 4000);
  }

  saveNow() {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      const tmp = FILE + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify({ savedAt: Date.now(), sourceState: this.sourceState, items: [...this.items.values()] }));
      fs.renameSync(tmp, FILE);
    } catch (e) {
      console.warn('[store] 保存失败', e.message);
    }
  }

  onNew(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  upsert(source, rawList) {
    const now = Date.now();
    const added = [];
    for (const raw of rawList) {
      if (!raw || !raw.title || !raw.url) continue;
      const id = `${source.id}-${raw.sid}`;
      const existing = this.items.get(id);
      if (existing) {
        // 仅刷新互动数据与游戏状态
        if (raw.replies != null) existing.replies = raw.replies;
        if (raw.views != null) existing.views = raw.views;
        if (raw.game) existing.game = raw.game;
        if (raw.html && !existing.html) existing.html = raw.html;
        continue;
      }
      const key = normTitle(raw.title);
      const dupId = key.length >= 6 ? this.titleIndex.get(key) : null;
      const dup = dupId && this.items.get(dupId);
      if (dup && dup.source !== source.id && Math.abs((dup.ts || 0) - (raw.ts || now)) < 3 * 86400e3) {
        dup.alsoOn = dup.alsoOn || [];
        if (!dup.alsoOn.find((a) => a.source === source.id)) dup.alsoOn.push({ source: source.id, name: source.name, url: raw.url });
        continue;
      }
      const meta = classify(raw);
      let ts = raw.ts && !Number.isNaN(raw.ts) ? raw.ts : now;
      if (ts > now) ts = now;
      const item = {
        id,
        source: source.id,
        sourceName: source.name,
        title: raw.title.trim().slice(0, 200),
        url: raw.url,
        actionUrl: raw.actionUrl || firstActionUrl(raw.html, raw.url) || null,
        ts,
        seen: now,
        image: raw.image || null,
        summary: (raw.summary || '').slice(0, 220),
        html: raw.html || '',
        price: meta.price,
        originalPrice: raw.originalPrice || '',
        cats: meta.cats,
        platforms: meta.platforms,
        author: raw.author || '',
        tag: raw.tag || '',
        replies: raw.replies || 0,
        views: raw.views || 0,
        game: raw.game || null,
        gameTitle: raw.gameTitle || '',
      };
      this.items.set(id, item);
      if (key.length >= 6) this.titleIndex.set(key, id);
      added.push(item);
    }
    if (added.length) {
      this.prune();
      this.scheduleSave();
      for (const fn of this.listeners) {
        try { fn(added); } catch (_) { /* ignore */ }
      }
    }
    return added;
  }

  prune() {
    const now = Date.now();
    for (const [id, it] of this.items) {
      if (now - it.ts > MAX_AGE && !(it.game && it.game.end && it.game.end > now)) {
        this.items.delete(id);
        this.titleIndex.delete(normTitle(it.title));
      }
    }
    if (this.items.size > MAX_ITEMS) {
      const sorted = [...this.items.values()].sort((a, b) => b.ts - a.ts);
      for (const it of sorted.slice(MAX_ITEMS)) {
        this.items.delete(it.id);
        this.titleIndex.delete(normTitle(it.title));
      }
    }
  }

  setSourceState(id, patch) {
    this.sourceState[id] = { ...(this.sourceState[id] || {}), ...patch };
    this.scheduleSave();
  }

  get(id) {
    return this.items.get(id);
  }

  query({ cat, platform, source, q, sort = 'new', before, offset = 0, limit = 30, since, ids } = {}) {
    const now = Date.now();
    let list = [...this.items.values()];
    if (ids) {
      const set = new Set(ids);
      list = list.filter((it) => set.has(it.id));
    }
    if (cat && cat !== 'all') list = list.filter((it) => it.cats.includes(cat));
    if (platform) list = list.filter((it) => it.platforms.includes(platform));
    if (source) {
      const ss = new Set(String(source).split(','));
      list = list.filter((it) => ss.has(it.source));
    }
    if (q) {
      const words = String(q).toLowerCase().split(/\s+/).filter(Boolean);
      list = list.filter((it) => {
        const hay = `${it.title} ${it.summary} ${it.tag} ${it.sourceName}`.toLowerCase();
        return words.every((w) => hay.includes(w));
      });
    }
    if (since) list = list.filter((it) => it.seen > +since);
    const total = list.length;
    if (sort === 'hot') {
      for (const it of list) it._score = hotScore(it, now);
      list.sort((a, b) => b._score - a._score);
    } else if (sort === 'price') {
      list = list.filter((it) => it.price != null && now - it.ts < 3 * 86400e3);
      list.sort((a, b) => a.price - b.price || b.ts - a.ts);
    } else {
      list.sort((a, b) => b.ts - a.ts || (a.id < b.id ? 1 : -1));
      if (before) list = list.filter((it) => it.ts < +before);
    }
    const page = list.slice(+offset || 0, (+offset || 0) + Math.min(+limit || 30, 100));
    return { total, items: page.map(lite) };
  }

  stats() {
    const now = Date.now();
    const dayAgo = now - 86400e3;
    const cats = {};
    const platforms = {};
    const sources = {};
    let today = 0;
    let free = 0;
    let latest = 0;
    const words = HOT_WORDS.map((w) => ({ w, n: 0 }));
    for (const it of this.items.values()) {
      for (const c of it.cats) cats[c] = (cats[c] || 0) + 1;
      for (const p of it.platforms) platforms[p] = (platforms[p] || 0) + 1;
      sources[it.source] = (sources[it.source] || 0) + 1;
      if (it.ts > latest) latest = it.ts;
      if (it.ts > dayAgo) {
        today++;
        if (it.cats.includes('free')) free++;
        const t = it.title.toLowerCase();
        for (const o of words) if (t.includes(o.w.toLowerCase())) o.n++;
      }
    }
    return {
      total: this.items.size,
      today,
      free,
      latest,
      cats,
      platforms,
      sources,
      hotWords: words.filter((o) => o.n > 0).sort((a, b) => b.n - a.n).slice(0, 14),
    };
  }

  games() {
    const now = Date.now();
    return [...this.items.values()]
      .filter((it) => it.game && (!it.game.end || it.game.end > now))
      .sort((a, b) => {
        const sa = a.game.status === 'active' ? 0 : 1;
        const sb = b.game.status === 'active' ? 0 : 1;
        return sa - sb || (a.source === 'epic' ? -1 : 0) - (b.source === 'epic' ? -1 : 0) || b.ts - a.ts;
      })
      .map(lite);
  }
}

function lite(it) {
  const { html, _score, ...rest } = it;
  return { ...rest, hasDetail: !!(html && html.length > 20) };
}

function hotScore(it, now) {
  const ageH = Math.max(0, (now - it.ts) / 3600e3);
  const eng = Math.log2(1 + (it.replies || 0)) * 1.6 + Math.log10(1 + (it.views || 0)) * 0.8 + (it.alsoOn ? it.alsoOn.length * 1.5 : 0);
  const bonus = (it.cats.includes('free') ? 1.2 : 0) + (it.price != null && it.price <= 10 ? 0.6 : 0) + (it.image ? 0.2 : 0);
  return (1 + eng + bonus) / Math.pow(ageH + 2, 1.15);
}

function normTitle(t) {
  return String(t || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '').slice(0, 40);
}

module.exports = { Store };
