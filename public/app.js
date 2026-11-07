// 羊毛雷达 · 前端交互
(function () {
  'use strict';

  const CAT_COLOR = {
    all: 'hsl(24 18% 20%)',
    free: 'hsl(152 55% 38%)',
    cheap: 'hsl(7 80% 52%)',
    coupon: 'hsl(28 92% 48%)',
    bank: 'hsl(212 68% 48%)',
    telecom: 'hsl(188 70% 40%)',
    game: 'hsl(338 72% 52%)',
    digital: 'hsl(200 72% 44%)',
    life: 'hsl(88 50% 40%)',
    shopping: 'hsl(32 30% 48%)',
  };
  const SRC_HUE = { xianbao: 14, smzdm: 6, '0818tuan': 152, iehou: 36, zuanke8: 210, v2ex: 220, linuxdo: 170, ithome: 350, epic: 200, gamerpower: 330 };
  const TKL_RE = /([￥¥$€£₴¢][0-9A-Za-z]{8,14}[￥¥$€£₴¢]|(?:\d\s*)?[￥¥$][0-9A-Za-z]{8,14}\/|(?:CZ|MF|HU|CA)\d{2,4}\s*[^\s<>]{6,30})/i;

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const ls = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (_) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} },
  };

  const state = {
    view: 'feed',
    cat: 'all',
    platform: '',
    source: '',
    q: '',
    sort: 'new',
    hideRead: !!ls.get('ym:hideRead', false),
    favs: new Map(ls.get('ym:favs', [])),       // id -> snap
    read: new Set(ls.get('ym:read', [])),
    alerts: ls.get('ym:alerts', []),
    egDone: new Set(ls.get('ym:egDone', [])),
    meta: null,
    items: [],
    total: 0,
    loading: false,
    ended: false,
    pendingNew: 0,
    egLoaded: false,
    openDeal: null,
  };

  /* ---------------- 工具 ---------------- */

  function saveFavs() { ls.set('ym:favs', [...state.favs.entries()].slice(-300)); renderFavCount(); }
  function saveRead() { const a = [...state.read]; if (a.length > 1500) a.splice(0, a.length - 1500); ls.set('ym:read', a); }
  function saveAlerts() { ls.set('ym:alerts', state.alerts); renderAlerts(); }

  function relTime(ts) {
    if (!ts) return '';
    const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
    if (s < 45) return '刚刚';
    const m = Math.floor(s / 60);
    if (m < 60) return `${m} 分钟前`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h} 小时前`;
    const d = Math.floor(h / 24);
    if (d < 15) return `${d} 天前`;
    const dt = new Date(ts);
    return `${dt.getMonth() + 1}-${String(dt.getDate()).padStart(2, '0')}`;
  }

  function fmtCountdown(end) {
    if (!end) return '';
    const ms = end - Date.now();
    if (ms <= 0) return '已结束';
    const h = Math.floor(ms / 3600e3);
    const m = Math.floor((ms % 3600e3) / 60e3);
    if (h >= 48) return `剩 ${Math.floor(h / 24)} 天`;
    return `剩 ${h}h ${m}m`;
  }

  function highlight(text) {
    const words = [...new Set([...(state.q ? state.q.split(/\s+/) : []), ...state.alerts])].filter((w) => w && w.length >= 1);
    let out = esc(text);
    if (!words.length) return out;
    const re = new RegExp(`(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
    return out.replace(re, '<mark>$1</mark>');
  }

  function matchAlert(item) {
    if (!state.alerts.length) return null;
    const t = `${item.title} ${item.summary || ''}`.toLowerCase();
    return state.alerts.find((w) => t.includes(w.toLowerCase())) || null;
  }

  function catName(id) {
    return (state.meta?.categories || []).find((c) => c.id === id)?.name || id;
  }
  function platName(id) {
    return (state.meta?.platforms || []).find((p) => p.id === id)?.name || id;
  }

  function toast(html) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = `<svg class="ico"><use href="#i-check"/></svg><span>${html}</span>`;
    $('#toasts').appendChild(el);
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, 2800);
  }

  async function copy(text, msg = '已复制到剪贴板') {
    try {
      await navigator.clipboard.writeText(text);
    } catch (_) {
      const ta = document.createElement('textarea');
      ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
    }
    toast(msg);
  }

  function animateNum(el, to) {
    const from = parseInt(el.dataset.v || '0', 10) || 0;
    el.dataset.v = to;
    if (from === to || matchMedia('(prefers-reduced-motion: reduce)').matches) { el.textContent = to.toLocaleString(); return; }
    const t0 = performance.now();
    const dur = 520;
    const step = (t) => {
      const p = Math.min(1, (t - t0) / dur);
      const v = Math.round(from + (to - from) * (1 - Math.pow(1 - p, 3)));
      el.textContent = v.toLocaleString();
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /* ---------------- 路由 ---------------- */

  function parseHash() {
    const h = location.hash.replace(/^#/, '') || '/';
    const [path, qs] = h.split('?');
    const p = new URLSearchParams(qs || '');
    if (path.startsWith('/evergreen')) return { view: 'evergreen' };
    if (path.startsWith('/favs')) return { view: 'favs' };
    if (path.startsWith('/radar')) return { view: 'radar' };
    return {
      view: 'feed',
      cat: p.get('cat') || 'all',
      platform: p.get('platform') || '',
      source: p.get('source') || '',
      q: p.get('q') || '',
      sort: p.get('sort') || 'new',
      deal: p.get('deal') || '',
    };
  }

  function setRoute(patch, replace = false) {
    const next = { view: state.view, cat: state.cat, platform: state.platform, source: state.source, q: state.q, sort: state.sort, ...patch };
    if (next.view !== 'feed') {
      const hash = `#/${next.view}`;
      if (location.hash !== hash) replace ? history.replaceState(null, '', hash) : (location.hash = hash);
      else onRoute();
      return;
    }
    const p = new URLSearchParams();
    if (next.cat && next.cat !== 'all') p.set('cat', next.cat);
    if (next.platform) p.set('platform', next.platform);
    if (next.source) p.set('source', next.source);
    if (next.q) p.set('q', next.q);
    if (next.sort && next.sort !== 'new') p.set('sort', next.sort);
    const qs = p.toString();
    const hash = qs ? `#/?${qs}` : '#/';
    if (location.hash !== hash) replace ? history.replaceState(null, '', hash) : (location.hash = hash);
    else onRoute();
  }

  async function onRoute() {
    const r = parseHash();
    const filterChanged = r.view === 'feed' && (r.cat !== state.cat || r.platform !== state.platform || r.source !== state.source || r.q !== state.q || r.sort !== state.sort || state.view !== 'feed');
    state.view = r.view;
    document.body.dataset.view = r.view;
    $$('.navlink').forEach((a) => a.classList.toggle('active', a.dataset.nav === r.view));
    $('#view-evergreen').hidden = r.view !== 'evergreen';
    $('#view-favs').hidden = r.view !== 'favs';

    if (r.view === 'evergreen') { loadEvergreen(); return; }
    if (r.view === 'favs') { renderFavsView(); return; }
    if (r.view === 'radar') return;

    state.cat = r.cat;
    state.platform = r.platform;
    state.source = r.source;
    state.q = r.q;
    state.sort = r.sort;
    $('#search-input').value = state.q;
    syncFiltersUI();
    if (filterChanged || !state.items.length) await loadDeals(true);
    if (r.deal) openDrawer(r.deal);
  }

  /* ---------------- 数据加载 ---------------- */

  async function loadMeta() {
    const res = await fetch('/api/meta');
    const data = await res.json();
    state.meta = data;
    renderStats(data);
    renderCategories(data);
    renderPlatforms(data);
    renderHotwords(data.stats.hotWords);
    renderSources(data.sources);
    syncFiltersUI();
  }

  async function loadGames() {
    const res = await fetch('/api/games');
    const { items } = await res.json();
    renderGames(items || []);
  }

  async function loadDeals(reset = false) {
    if (state.loading) return;
    state.loading = true;
    if (reset) {
      state.items = [];
      state.ended = false;
      state.pendingNew = 0;
      $('#newbar').hidden = true;
      renderSkeletons();
    }
    try {
      const p = new URLSearchParams({
        cat: state.cat,
        platform: state.platform,
        source: state.source,
        q: state.q,
        sort: state.sort,
        offset: String(state.items.length),
        limit: '30',
      });
      const res = await fetch(`/api/deals?${p}`);
      const { total, items } = await res.json();
      state.total = total;
      if (reset) state.items = items;
      else state.items.push(...items);
      if (items.length < 30 || state.items.length >= total) state.ended = true;
      renderFeed(reset);
    } catch (e) {
      $('#feed').innerHTML = `<li class="empty"><h3>加载失败</h3><p>${esc(e.message)}</p></li>`;
    } finally {
      state.loading = false;
    }
  }

  /* ---------------- 渲染 ---------------- */

  function renderStats({ stats, sources }) {
    animateNum($('#stat-today'), stats.today);
    animateNum($('#stat-free'), stats.free);
    animateNum($('#stat-total'), stats.total);
    const okCount = sources.filter((s) => s.ok).length;
    $('#stat-sources').textContent = `${okCount}/${sources.length}`;
    const names = sources.filter((s) => s.ok).slice(0, 5).map((s) => `<b>${esc(s.name)}</b>`).join('、');
    $('#hero-sub').innerHTML = stats.latest
      ? `实时聚合 ${names} 等 ${sources.length} 个来源 · 最近更新 <b>${relTime(stats.latest)}</b>`
      : '正在抓取各站点最新羊毛，请稍候…';
  }

  function renderCategories({ categories, stats }) {
    const all = [{ id: 'all', name: '全部羊毛' }, ...categories];
    $('#catlist').innerHTML = all.map((c) => {
      const cnt = c.id === 'all' ? stats.total : stats.cats[c.id] || 0;
      return `<li><button type="button" class="cat" data-cat="${c.id}" style="--c:${CAT_COLOR[c.id] || CAT_COLOR.shopping}">
        <span class="cat-dot"></span><span>${esc(c.name)}</span><span class="cat-count">${cnt}</span>
      </button></li>`;
    }).join('');
    $('#cats-mobile').innerHTML = all.map((c) => {
      const cnt = c.id === 'all' ? stats.total : stats.cats[c.id] || 0;
      return `<button type="button" role="tab" class="chip" data-cat="${c.id}">${esc(c.name)} <small>${cnt}</small></button>`;
    }).join('');
  }

  function renderPlatforms({ platforms, stats }) {
    const list = platforms.filter((p) => (stats.platforms[p.id] || 0) > 0);
    $('#platlist').innerHTML = list.map((p) => `<button type="button" class="chip" data-plat="${p.id}">${esc(p.name)} <small>${stats.platforms[p.id]}</small></button>`).join('');
  }

  function syncFiltersUI() {
    $$('[data-cat]').forEach((b) => b.classList.toggle('active', b.dataset.cat === state.cat));
    $$('[data-plat]').forEach((b) => b.classList.toggle('active', b.dataset.plat === state.platform));
    $$('#sort-seg button').forEach((b) => {
      const on = b.dataset.sort === state.sort;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', on);
    });
    $('#hide-read').checked = state.hideRead;

    // 活动筛选胶囊
    const pills = [];
    if (state.platform) pills.push({ k: 'platform', label: `平台：${platName(state.platform)}` });
    if (state.source) {
      const s = (state.meta?.sources || []).find((x) => x.id === state.source);
      pills.push({ k: 'source', label: `来源：${s ? s.name : state.source}` });
    }
    if (state.q) pills.push({ k: 'q', label: `搜索：${state.q}` });
    $('#active-filters').innerHTML = pills.map((p) => `<button type="button" class="chip active" data-clear="${p.k}">${esc(p.label)}<svg class="ico chip-x"><use href="#i-x"/></svg></button>`).join('');
  }

  function renderSkeletons() {
    $('#feed').innerHTML = Array.from({ length: 6 }, () => `<li class="deal skel"><div class="thumb"></div><div class="deal-body"><div class="skel-line" style="width:35%"></div><div class="skel-line" style="width:88%;height:16px"></div><div class="skel-line" style="width:55%"></div></div><div class="deal-side"><div class="skel-line" style="width:56px;height:22px"></div></div></li>`).join('');
    $('#feed-end').textContent = '';
  }

  function dealHTML(it, i = 0) {
    const hue = SRC_HUE[it.source] ?? 28;
    const isRead = state.read.has(it.id);
    if (state.hideRead && isRead && state.view === 'feed') return '';
    const isFav = state.favs.has(it.id);
    const isFresh = Date.now() - it.ts < 15 * 60e3;
    const alertHit = matchAlert(it);
    const glyph = esc((it.platforms[0] ? platName(it.platforms[0]) : it.sourceName).slice(0, 1));
    const sub = esc(it.sourceName.slice(0, 4));
    const thumb = it.image
      ? `<div class="thumb" style="--h:${hue}"><img src="${esc(it.image)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'thumb-mono',innerHTML:'<div>${glyph}<small>${sub}</small></div>'}))"/></div>`
      : `<div class="thumb" style="--h:${hue}"><div class="thumb-mono"><div>${glyph}<small>${sub}</small></div></div></div>`;

    const plat = it.platforms.slice(0, 2).map(platName).join(' / ');
    const sum = it.summary && it.summary !== it.title ? `<p class="deal-sum">${highlight(it.summary)}</p>` : '';

    const tags = [];
    if (alertHit) tags.push(`<span class="tag tag-alert">命中：${esc(alertHit)}</span>`);
    if (it.cats.includes('free')) tags.push('<span class="tag tag-free">0元 / 免费</span>');
    else if (it.cats.includes('cheap')) tags.push('<span class="tag tag-hot">白菜好价</span>');
    for (const c of it.cats.filter((x) => x !== 'free' && x !== 'cheap' && x !== 'shopping').slice(0, 2)) {
      tags.push(`<span class="tag">${esc(catName(c))}</span>`);
    }
    if (it.alsoOn?.length) tags.push(`<span class="tag">+${it.alsoOn.length} 站同推</span>`);

    let priceBlock = '<span class="price-none">见详情</span>';
    if (it.price === 0) {
      priceBlock = `<div class="price is-free"><b>免费</b>${it.originalPrice ? `<del>${esc(it.originalPrice)}</del>` : ''}</div>`;
    } else if (typeof it.price === 'number') {
      priceBlock = `<div class="price"><small>¥</small><b>${it.price}</b>${it.originalPrice ? `<del>${esc(it.originalPrice)}</del>` : ''}</div>`;
    }

    return `<li class="deal${isRead ? ' is-read' : ''}${isFresh ? ' is-fresh' : ''}" data-id="${esc(it.id)}" style="--i:${Math.min(i, 12)}">
      ${thumb}
      <div class="deal-body">
        <div class="deal-top">
          <span class="src" style="--h:${hue}">${esc(it.sourceName)}</span>
          ${plat ? `<span class="plat">${esc(plat)}</span>` : ''}
          <time class="deal-time" data-ts="${it.ts}">${relTime(it.ts)}</time>
        </div>
        <h3 class="deal-title"><a href="${esc(it.url)}" target="_blank" rel="noopener noreferrer nofollow" data-direct>${highlight(it.title)}</a></h3>
        ${sum}
        <div class="deal-foot">
          ${tags.join('')}
          ${it.replies ? `<span class="deal-stat" title="评论/回复"><svg class="ico"><use href="#i-chat"/></svg>${it.replies}</span>` : ''}
          ${it.views ? `<span class="deal-stat" title="热度/浏览"><svg class="ico"><use href="#i-eye"/></svg>${it.views}</span>` : ''}
        </div>
      </div>
      <div class="deal-side">
        ${priceBlock}
        <div class="deal-actions">
          <button type="button" class="act${isFav ? ' is-on' : ''}" data-fav="${esc(it.id)}" aria-label="收藏" title="收藏"><svg class="ico"><use href="#i-star"/></svg></button>
          <a class="act" href="${esc(it.url)}" target="_blank" rel="noopener noreferrer nofollow" data-go="${esc(it.id)}" aria-label="直达原帖" title="直达原帖"><svg class="ico"><use href="#i-external"/></svg></a>
        </div>
      </div>
    </li>`;
  }

  function renderFeed() {
    const html = state.items.map((it, i) => dealHTML(it, i)).filter(Boolean).join('');
    if (!html) {
      $('#feed').innerHTML = `<li class="empty">
        <img src="/img/mascot.webp" alt="小羊" width="150" height="150" />
        <h3>这片草地暂时被薅空了</h3>
        <p>${state.hideRead && state.items.length ? '当前筛选下的羊毛都已读，关闭「隐藏已读」或换个分类看看。' : '试试切换分类、清空搜索词，或者等几秒钟新羊毛入库。'}</p>
      </li>`;
      $('#feed-end').textContent = '';
      return;
    }
    $('#feed').innerHTML = html;
    $('#feed-end').textContent = state.ended ? `— 已显示全部 ${state.total} 条羊毛 —` : '下滑加载更多…';
  }

  function renderGames(items) {
    const featured = items.filter((x) => x.source === 'epic' || x.game?.status === 'active').slice(0, 2);
    const rest = items.filter((x) => !featured.includes(x)).slice(0, 4);
    const cardHtml = (g) => {
      const active = g.game?.status !== 'upcoming';
      const badge = active ? `<span class="game-badge">免费领 · <span class="game-count" data-end="${g.game?.end || ''}">${fmtCountdown(g.game?.end)}</span></span>` : '<span class="game-badge up">即将免费</span>';
      return `<a class="game" href="${esc(g.url)}" target="_blank" rel="noopener noreferrer" data-deal-open="${esc(g.id)}">
        ${g.image ? `<img class="game-img" src="${esc(g.image)}" alt="" loading="lazy" referrerpolicy="no-referrer"/>` : '<div class="game-img"></div>'}
        ${badge}
        <div class="game-info">
          <div class="game-name">${esc(g.gameTitle || g.title)}</div>
          <div class="game-meta"><span>${esc(g.game?.platform || g.sourceName)}</span>${g.originalPrice ? `<del>${esc(g.originalPrice)}</del>` : ''}</div>
        </div>
      </a>`;
    };
    $('#games').innerHTML = featured.map(cardHtml).join('') + rest.map((g) => `<a class="game-mini" href="${esc(g.url)}" target="_blank" rel="noopener" data-deal-open="${esc(g.id)}">
      ${g.image ? `<img src="${esc(g.image)}" alt="" loading="lazy" referrerpolicy="no-referrer"/>` : ''}
      <div><b>${esc(g.gameTitle || g.title)}</b><span>${esc(g.game?.platform || g.sourceName)} ${g.originalPrice ? `· 原价 ${esc(g.originalPrice)}` : ''}</span></div>
    </a>`).join('');
    $('#games-strip-mobile').innerHTML = items.slice(0, 5).map(cardHtml).join('');
  }

  function renderHotwords(list = []) {
    $('#hotwords').innerHTML = list.map((o) => `<button type="button" class="hotword" data-word="${esc(o.w)}">${esc(o.w)}<small>${o.n}</small></button>`).join('');
  }

  function renderSources(list = []) {
    $('#sources').innerHTML = list.map((s) => {
      const dot = s.lastRun ? (s.ok ? '' : 'err') : 'wait';
      const tip = s.ok ? `正常 · ${s.ms}ms` : s.error || '等待首次抓取';
      return `<li class="source" title="${esc(tip)}">
        <span class="source-dot ${dot}"></span>
        <div>
          <div class="source-name"><button type="button" data-src="${s.id}">${esc(s.name)}</button></div>
          <div class="source-desc">${esc(s.desc)}</div>
        </div>
        <div class="source-num">${s.count} 条<small>${s.lastOk ? relTime(s.lastOk) : '同步中'}</small></div>
      </li>`;
    }).join('');
  }

  function renderAlerts() {
    $('#alert-tags').innerHTML = state.alerts.map((w) => `<li class="alert-tag"><span>${esc(w)}</span><button type="button" data-del-alert="${esc(w)}" aria-label="删除"><svg class="ico"><use href="#i-x"/></svg></button></li>`).join('');
  }

  function renderFavCount() {
    const n = state.favs.size;
    const el = $('#fav-count');
    el.hidden = n === 0;
    el.textContent = n;
  }

  /* ---------------- 长期羊毛 & 收藏 ---------------- */

  async function loadEvergreen() {
    if (!state.egLoaded) {
      const res = await fetch('/api/evergreen');
      const { groups } = await res.json();
      $('#eg-nav').innerHTML = groups.map((g) => `<a class="chip" href="#eg-${g.id}" data-eg-jump="${g.id}">${esc(g.name)}</a>`).join('');
      $('#eg-groups').innerHTML = groups.map((g) => `<section class="eg-group" id="eg-${g.id}">
        <div class="eg-group-head"><h2>${esc(g.name)}</h2><p>${esc(g.desc)}</p></div>
        <div class="eg-grid">
          ${g.items.map((it, idx) => {
            const key = `${g.id}-${idx}`;
            const done = state.egDone.has(key);
            return `<article class="eg-card${done ? ' done' : ''}" data-eg="${key}">
              <div class="eg-card-top"><h3>${esc(it.title)}</h3><span class="eg-freq">${esc(it.freq)}</span></div>
              <p>${esc(it.how)}</p>
              <div class="eg-card-foot">
                <label class="eg-check"><input type="checkbox" data-eg-check="${key}" ${done ? 'checked' : ''}/>今日已薅</label>
                <a href="${esc(it.url)}" target="_blank" rel="noopener noreferrer">前往 ${esc(it.platform)} <svg class="ico"><use href="#i-external"/></svg></a>
              </div>
            </article>`;
          }).join('')}
        </div>
      </section>`).join('');
      state.egLoaded = true;
    }
  }

  async function renderFavsView() {
    const list = [...state.favs.values()].reverse();
    if (!list.length) {
      $('#favs-list').innerHTML = `<li class="empty"><img src="/img/mascot.webp" alt="小羊" width="150" height="150"/><h3>还没有收藏任何羊毛</h3><p>在实时羊毛列表点击五角星，把心动的羊毛收进这里。</p></li>`;
      return;
    }
    $('#favs-list').innerHTML = list.map((it, i) => dealHTML(it, i)).join('');
  }

  /* ---------------- 详情抽屉 ---------------- */

  async function openDrawer(id) {
    markRead(id);
    let it = state.items.find((x) => x.id === id) || state.favs.get(id);
    $('#drawer-mask').hidden = false;
    $('#drawer').hidden = false;
    document.body.style.overflow = 'hidden';
    try {
      const res = await fetch(`/api/deal/${encodeURIComponent(id)}`);
      if (res.ok) it = await res.json();
    } catch (_) {}
    if (!it) { closeDrawer(); return; }
    state.openDeal = it;
    const hue = SRC_HUE[it.source] ?? 28;
    const isFav = state.favs.has(it.id);
    const tkl = (TKL_RE.exec(`${it.title} ${it.summary} ${it.html || ''}`) || [])[1];

    $('#drawer-meta').innerHTML = `<span class="src" style="--h:${hue}">${esc(it.sourceName)}</span>
      <span>${relTime(it.ts)}</span>
      ${it.author ? `<span>· ${esc(it.author)}</span>` : ''}`;

    let priceHtml = '';
    if (it.price === 0) priceHtml = `<div class="drawer-price"><div class="price is-free"><b>免费 / 0元</b>${it.originalPrice ? `<del>${esc(it.originalPrice)}</del>` : ''}</div></div>`;
    else if (typeof it.price === 'number') priceHtml = `<div class="drawer-price"><div class="price"><small>¥</small><b>${it.price}</b>${it.originalPrice ? `<del>${esc(it.originalPrice)}</del>` : ''}</div></div>`;

    const bodyContent = it.html
      ? `<div class="drawer-content">${it.html}</div>`
      : it.summary
      ? `<div class="drawer-content"><p>${esc(it.summary)}</p></div>`
      : `<div class="drawer-empty">该来源仅提供标题索引，点击下方「前往 ${esc(it.sourceName)} 薅羊毛」查看完整活动入口、口令与二维码。</div>`;

    const also = it.alsoOn?.length
      ? `<div class="drawer-also">同时被收录于：${it.alsoOn.map((a) => `<a href="${esc(a.url)}" target="_blank" rel="noopener">${esc(a.name)}</a>`).join(' · ')}</div>`
      : '';

    $('#drawer-body').innerHTML = `
      ${it.image ? `<img class="drawer-hero" src="${esc(it.image)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()"/>` : ''}
      <h2 class="drawer-title" id="drawer-title">${highlight(it.title)}</h2>
      ${priceHtml}
      <div class="drawer-tags">
        ${it.cats.map((c) => `<span class="tag">${esc(catName(c))}</span>`).join('')}
        ${it.platforms.map((p) => `<span class="tag">${esc(platName(p))}</span>`).join('')}
      </div>
      ${bodyContent}
      ${also}
    `;

    const overseas = it.source === 'v2ex' || it.source === 'gamerpower';
    const primaryHref = it.actionUrl || it.url;
    const primaryText = it.actionUrl ? '直达领券 / 活动页' : `打开 ${it.sourceName} 原帖${overseas ? '（需海外网络）' : ''}`;

    $('#drawer-foot').innerHTML = `
      <a class="btn btn-accent" href="${esc(primaryHref)}" target="_blank" rel="noopener noreferrer nofollow">
        ${esc(primaryText)} <svg class="ico"><use href="#i-external"/></svg>
      </a>
      ${tkl ? `<button type="button" class="btn btn-ink" data-copy-tkl="${esc(tkl)}"><svg class="ico"><use href="#i-copy"/></svg>复制口令</button>` : ''}
      ${it.actionUrl ? `<a class="btn btn-ghost" href="${esc(it.url)}" target="_blank" rel="noopener noreferrer nofollow" title="打开 ${esc(it.sourceName)} 原帖${overseas ? '（需海外网络）' : ''}"><svg class="ico"><use href="#i-layers"/></svg></a>` : ''}
      <button type="button" class="btn btn-ghost${isFav ? ' is-on' : ''}" data-fav="${esc(it.id)}" aria-label="收藏" title="收藏"><svg class="ico"><use href="#i-star"/></svg></button>
      <button type="button" class="btn btn-ghost" data-share aria-label="复制分享链接" title="复制分享链接"><svg class="ico"><use href="#i-share"/></svg></button>
    `;
  }

  function closeDrawer() {
    $('#drawer-mask').hidden = true;
    $('#drawer').hidden = true;
    document.body.style.overflow = '';
    state.openDeal = null;
  }

  function markRead(id) {
    state.read.add(id);
    saveRead();
    const card = $(`.deal[data-id="${CSS.escape(id)}"]`);
    if (card) card.classList.add('is-read');
  }

  function toggleFav(id, btn) {
    if (state.favs.has(id)) {
      state.favs.delete(id);
      toast('已移出收藏');
    } else {
      const it = state.items.find((x) => x.id === id) || state.openDeal;
      if (it) state.favs.set(id, { ...it, html: undefined });
      toast('已加入收藏');
    }
    saveFavs();
    $$(`[data-fav="${CSS.escape(id)}"]`).forEach((b) => {
      b.classList.toggle('is-on', state.favs.has(id));
      b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop');
    });
    if (state.view === 'favs') renderFavsView();
  }

  /* ---------------- 实时流 ---------------- */

  function connectStream() {
    const es = new EventSource('/api/stream');
    es.addEventListener('new', (e) => {
      const data = JSON.parse(e.data);
      state.pendingNew += data.count || 1;
      const bar = $('#newbar');
      $('#newbar-text').textContent = `有 ${state.pendingNew} 条新羊毛入库，点击刷新`;
      bar.hidden = false;
      loadMeta();
      // 关键词命中提醒
      for (const t of data.titles || []) {
        const hit = state.alerts.find((w) => t.title.toLowerCase().includes(w.toLowerCase()));
        if (hit) {
          toast(`🔔 命中「<b>${esc(hit)}</b>」：${esc(t.title.slice(0, 36))}`);
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification(`羊毛雷达 · 命中「${hit}」`, { body: t.title, icon: '/img/mascot.jpg' });
          }
        }
      }
    });
    es.onerror = () => { es.close(); setTimeout(connectStream, 8000); };
  }

  /* ---------------- 事件绑定 ---------------- */

  function bindEvents() {
    window.addEventListener('hashchange', onRoute);
    window.addEventListener('scroll', () => {
      $('#topbar').classList.toggle('scrolled', window.scrollY > 8);
    }, { passive: true });

    // 主题切换
    $('#theme-toggle').addEventListener('click', () => {
      const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      try { localStorage.setItem('ym:theme', next); } catch (_) {}
    });

    // 搜索
    let searchTimer = null;
    $('#search-form').addEventListener('submit', (e) => {
      e.preventDefault();
      clearTimeout(searchTimer);
      setRoute({ view: 'feed', q: $('#search-input').value.trim() });
    });
    $('#search-input').addEventListener('input', (e) => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => setRoute({ view: 'feed', q: e.target.value.trim() }, true), 260);
    });

    // 快捷键
    window.addEventListener('keydown', (e) => {
      if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) {
        e.preventDefault();
        $('#search-input').focus();
      } else if (e.key === 'Escape' && !$('#drawer').hidden) {
        closeDrawer();
      }
    });

    // 委托点击
    document.addEventListener('click', (e) => {
      const catBtn = e.target.closest('[data-cat]');
      if (catBtn) return setRoute({ view: 'feed', cat: catBtn.dataset.cat });

      const platBtn = e.target.closest('[data-plat]');
      if (platBtn) {
        const p = platBtn.dataset.plat;
        return setRoute({ view: 'feed', platform: state.platform === p ? '' : p });
      }

      const sortBtn = e.target.closest('[data-sort]');
      if (sortBtn) return setRoute({ view: 'feed', sort: sortBtn.dataset.sort });

      const clearBtn = e.target.closest('[data-clear]');
      if (clearBtn) return setRoute({ [clearBtn.dataset.clear]: '' });

      const wordBtn = e.target.closest('[data-word]');
      if (wordBtn) return setRoute({ view: 'feed', q: wordBtn.dataset.word });

      const srcBtn = e.target.closest('[data-src]');
      if (srcBtn) {
        const s = srcBtn.dataset.src;
        return setRoute({ view: 'feed', source: state.source === s ? '' : s });
      }

      const favBtn = e.target.closest('[data-fav]');
      if (favBtn) { e.stopPropagation(); return toggleFav(favBtn.dataset.fav, favBtn); }

      const goBtn = e.target.closest('[data-go]');
      if (goBtn) { e.stopPropagation(); markRead(goBtn.dataset.go); return; }

      const direct = e.target.closest('[data-direct]');
      if (direct && (e.metaKey || e.ctrlKey || e.button === 1)) return;
      if (direct) e.preventDefault();

      const dealOpen = e.target.closest('[data-deal-open]');
      if (dealOpen && !e.metaKey && !e.ctrlKey) { e.preventDefault(); return openDrawer(dealOpen.dataset.dealOpen); }

      const card = e.target.closest('.deal[data-id]');
      if (card) return openDrawer(card.dataset.id);

      const copyTkl = e.target.closest('[data-copy-tkl]');
      if (copyTkl) return copy(copyTkl.dataset.copyTkl, '口令已复制，打开对应 App 即可');

      if (e.target.closest('[data-share]') && state.openDeal) {
        return copy(`${state.openDeal.title} ${state.openDeal.url}`, '标题与链接已复制');
      }

      const delAlert = e.target.closest('[data-del-alert]');
      if (delAlert) {
        state.alerts = state.alerts.filter((w) => w !== delAlert.dataset.delAlert);
        saveAlerts();
        renderFeed();
      }

      const egJump = e.target.closest('[data-eg-jump]');
      if (egJump) {
        e.preventDefault();
        $(`#eg-${egJump.dataset.egJump}`)?.scrollIntoView({ behavior: 'smooth' });
      }
    });

    // 长期羊毛打卡
    document.addEventListener('change', (e) => {
      const chk = e.target.closest('[data-eg-check]');
      if (chk) {
        const k = chk.dataset.egCheck;
        chk.checked ? state.egDone.add(k) : state.egDone.delete(k);
        ls.set('ym:egDone', [...state.egDone]);
        chk.closest('.eg-card')?.classList.toggle('done', chk.checked);
      }
    });

    $('#hide-read').addEventListener('change', (e) => {
      state.hideRead = e.target.checked;
      ls.set('ym:hideRead', state.hideRead);
      renderFeed();
    });

    $('#newbar').addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      loadDeals(true);
    });

    $('#drawer-close').addEventListener('click', closeDrawer);
    $('#drawer-mask').addEventListener('click', closeDrawer);

    $('#favs-clear').addEventListener('click', () => {
      state.favs.clear();
      saveFavs();
      renderFavsView();
      toast('已清空收藏');
    });

    // 关键词订阅
    $('#alert-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const v = $('#alert-input').value.trim();
      if (!v) return;
      if (!state.alerts.includes(v)) state.alerts.push(v);
      $('#alert-input').value = '';
      saveAlerts();
      renderFeed();
      toast(`已订阅关键词「<b>${esc(v)}</b>」`);
      if ('Notification' in window && Notification.permission === 'default') {
        try { await Notification.requestPermission(); } catch (_) {}
      }
    });

    // 无限滚动
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && state.view === 'feed' && !state.loading && !state.ended && state.items.length) {
        loadDeals(false);
      }
    }, { rootMargin: '420px' });
    io.observe($('#sentinel'));

    // 定时刷新相对时间与倒计时
    setInterval(() => {
      $$('[data-ts]').forEach((el) => { el.textContent = relTime(+el.dataset.ts); });
      $$('[data-end]').forEach((el) => { if (el.dataset.end) el.textContent = fmtCountdown(+el.dataset.end); });
    }, 30e3);
  }

  /* ---------------- 启动 ---------------- */

  renderFavCount();
  renderAlerts();
  bindEvents();
  Promise.all([loadMeta(), loadGames()]).catch(() => {});
  onRoute();
  connectStream();
})();
