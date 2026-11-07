// 全网羊毛数据源：每个 source 返回标准化的 deal 列表
'use strict';

const { XMLParser } = require('fast-xml-parser');
const { sanitize, stripTags, firstImage, safeUrl, decodeEntities } = require('./sanitize');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 YangmaoRadar/1.0';
const xml = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', textNodeName: '#text', trimValues: true, processEntities: false });

async function get(url, { encoding = 'utf-8', timeout = 15000, json = false } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: { 'User-Agent': UA, Accept: json ? 'application/json' : 'text/html,application/xml;q=0.9,*/*;q=0.8', 'Accept-Language': 'zh-CN,zh;q=0.9' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const text = new TextDecoder(encoding).decode(buf);
    if (json) return JSON.parse(text);
    return text;
  } finally {
    clearTimeout(t);
  }
}

const arr = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
const txt = (v) => (v == null ? '' : typeof v === 'object' ? v['#text'] ?? '' : String(v));
// 关闭了解析器的实体展开（防止大 feed 触发限制），对未用 CDATA 包裹的 HTML 手动解码
const htmlOf = (v) => {
  const s = txt(v);
  return /&lt;[a-z\/]/i.test(s) ? decodeEntities(s) : s;
};

// 将「北京时间」的无时区字符串转为时间戳
function cnTime(str) {
  if (!str) return null;
  const s = String(str).trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(s);
  if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4] - 8, +m[5], +(m[6] || 0));
  m = /^(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{2})/.exec(s); // 11-07 21:02（无年份）
  if (m) {
    const nowCn = new Date(Date.now() + 8 * 3600e3);
    let y = nowCn.getUTCFullYear();
    let ts = Date.UTC(y, +m[1] - 1, +m[2], +m[3] - 8, +m[4]);
    if (ts - Date.now() > 2 * 86400e3) ts = Date.UTC(y - 1, +m[1] - 1, +m[2], +m[3] - 8, +m[4]);
    return ts;
  }
  // RFC 822 但没有时区（什么值得买）
  if (/^[A-Za-z]{3}, \d{1,2} [A-Za-z]{3} \d{4} \d{2}:\d{2}:\d{2}$/.test(s)) return Date.parse(s + ' +0800');
  const p = Date.parse(s);
  return Number.isNaN(p) ? null : p;
}

function clampTs(ts) {
  const now = Date.now();
  if (!ts || Number.isNaN(ts)) return now;
  return Math.min(ts, now);
}

/* ---------------- 各数据源 ---------------- */

const sources = [
  {
    id: 'xianbao',
    name: '线报酷',
    home: 'https://new.xianbao.fun/',
    desc: '聚合赚客吧、微博、好单等实时线报',
    interval: 2 * 60e3,
    async fetch() {
      const list = await get('https://new.xianbao.fun/plus/json/push.json', { json: true });
      return list.map((x) => {
        const url = safeUrl(x.url, 'https://new.xianbao.fun/');
        const html = sanitize(x.content_html, 'https://new.xianbao.fun/');
        return {
          sid: String(x.id),
          title: decodeEntities(x.title),
          url,
          ts: x.shijianchuo ? x.shijianchuo * 1000 : cnTime(`${x.datetime} ${x.shorttime}`),
          summary: stripTags(x.content).slice(0, 200),
          html,
          image: firstImage(x.content_html, 'https://new.xianbao.fun/'),
          price: typeof x.price === 'number' && x.price > 0 ? x.price : null,
          author: x.louzhu,
          tag: x.catename,
          hint: x.catename,
          replies: x.comments || 0,
        };
      });
    },
  },
  {
    id: 'smzdm',
    name: '什么值得买',
    home: 'https://www.smzdm.com/',
    desc: '国内最大的网购好价社区',
    interval: 5 * 60e3,
    async fetch() {
      const doc = xml.parse(await get('http://feed.smzdm.com'));
      return arr(doc?.rss?.channel?.item).map((it) => {
        const link = decodeEntities(txt(it.link));
        return {
          sid: (/\/p\/(\d+)/.exec(link) || [])[1] || link,
          title: decodeEntities(txt(it.title)),
          url: link,
          ts: cnTime(txt(it.pubDate)),
          image: safeUrl(txt(it.focus_pic)),
          author: stripTags(txt(it.description)),
          summary: '',
        };
      });
    },
  },
  {
    id: '0818tuan',
    name: '0818团',
    home: 'http://www.0818tuan.com/',
    desc: '老牌一手线报站，京东/银行/话费活动',
    interval: 4 * 60e3,
    async fetch() {
      const html = await get('http://www.0818tuan.com/');
      const out = [];
      const re = /<a href="(\/xbhd\/(\d+)\.html)"[^>]*title="([^"]*)"[^>]*class="list-group-item"[^>]*>\s*<span[^>]*>\s*<font[^>]*>([^<]+)<\/font>/g;
      let m;
      while ((m = re.exec(html))) {
        out.push({ sid: m[2], title: decodeEntities(m[3]), url: 'http://www.0818tuan.com' + m[1], ts: cnTime(m[4]) });
      }
      return out;
    },
  },
  {
    id: 'iehou',
    name: '爱猴线报',
    home: 'https://iehou.com/',
    desc: '简单纯粹的活动线报分享站',
    interval: 4 * 60e3,
    async fetch() {
      const html = await get('https://iehou.com/');
      const out = [];
      const re = /<a class="mr-1" href="(https:\/\/iehou\.com\/xianbao-(\d+)\.htm)" title="([^"]*)"[\s\S]*?<span class="num-font[^"]*"[^>]*>\s*([^<]+?)\s*<\/span>/g;
      let m;
      while ((m = re.exec(html))) out.push({ sid: m[2], title: decodeEntities(m[3]), url: m[1], ts: cnTime(m[4]) });
      return out;
    },
  },
  {
    id: 'zuanke8',
    name: '赚客吧',
    home: 'http://www.zuanke8.com/',
    desc: '羊毛党大本营 · 赚客大家谈',
    interval: 5 * 60e3,
    async fetch() {
      const html = await get('http://www.zuanke8.com/forum.php?mod=forumdisplay&fid=15&filter=author&orderby=dateline', { encoding: 'gbk' });
      const out = [];
      const re = /<tbody id="normalthread_(\d+)">([\s\S]*?)<\/tbody>/g;
      let m;
      while ((m = re.exec(html))) {
        const body = m[2];
        const t = /<a href="([^"]+)"[^>]*class="s xst"[^>]*>([\s\S]*?)<\/a>/.exec(body);
        if (!t) continue;
        if (/吗[？?]*$|求推荐|有推荐|请教|求助|怎么办|[？?]$/.test(stripTags(t[2]))) continue; // 过滤闲聊提问帖
        const tm = /<td class="by">[\s\S]*?<em>(?:<span([^>]*)>)?([^<]*)/.exec(body);
        const titleAttr = tm && /title="([^"]+)"/.exec(tm[1] || '');
        const time = tm && [null, titleAttr ? titleAttr[1] : null, tm[2]];
        const num = /<td class="num"><a[^>]*>(\d+)<\/a><em>(\d+)<\/em>/.exec(body);
        const author = /<cite>\s*<a[^>]*>([^<]+)<\/a>/.exec(body);
        out.push({
          sid: m[1],
          title: decodeEntities(stripTags(t[2])),
          url: `http://www.zuanke8.com/thread-${m[1]}-1-1.html`,
          ts: cnTime((time && (time[1] || time[2])) || ''),
          replies: num ? +num[1] : 0,
          views: num ? +num[2] : 0,
          author: author ? author[1] : '',
        });
      }
      return out;
    },
  },
  {
    id: 'v2ex',
    name: 'V2EX',
    home: 'https://www.v2ex.com/go/deals',
    desc: '优惠信息 & 免费赠送节点',
    interval: 10 * 60e3,
    async fetch() {
      const feeds = ['https://www.v2ex.com/feed/deals.xml', 'https://www.v2ex.com/feed/free.xml'];
      const results = await Promise.allSettled(feeds.map((u) => get(u)));
      const out = [];
      for (const r of results) {
        if (r.status !== 'fulfilled') continue;
        const doc = xml.parse(r.value);
        for (const e of arr(doc?.feed?.entry)) {
          const href = arr(e.link).map((l) => l['@_href']).find(Boolean) || '';
          const id = (/\/t\/(\d+)/.exec(href) || [])[1];
          if (!id) continue;
          const content = htmlOf(e.content);
          out.push({
            sid: id,
            title: decodeEntities(txt(e.title)),
            url: `https://www.v2ex.com/t/${id}`,
            ts: Date.parse(txt(e.published)),
            html: sanitize(content, 'https://www.v2ex.com/'),
            summary: stripTags(content).slice(0, 200),
            image: firstImage(content, 'https://www.v2ex.com/'),
            author: txt(e.author?.name),
            replies: +((/#reply(\d+)/.exec(href) || [])[1] || 0),
          });
        }
      }
      return out;
    },
  },
  {
    id: 'linuxdo',
    name: 'LINUX DO',
    home: 'https://linux.do/c/welfare/36',
    desc: '福利羊毛板块：AI 额度、会员、喜加一',
    interval: 10 * 60e3,
    async fetch() {
      const doc = xml.parse(await get('https://linux.do/c/welfare/36.rss'));
      return arr(doc?.rss?.channel?.item)
        .filter((it) => txt(it['discourse:topicPinned']) !== 'Yes')
        .map((it) => {
          const link = decodeEntities(txt(it.link));
          const desc = htmlOf(it.description).replace(/<p><small>[\s\S]*?<\/small><\/p>/g, '').replace(/<p><a href="[^"]+">阅读完整话题<\/a><\/p>/g, '');
          const posts = /(\d+)\s*个帖子/.exec(txt(it.description));
          return {
            sid: (/topic\/(\d+)/.exec(link) || [])[1] || link,
            title: decodeEntities(txt(it.title)),
            url: link,
            ts: Date.parse(txt(it.pubDate)),
            html: sanitize(desc, 'https://linux.do/'),
            summary: stripTags(desc).slice(0, 200),
            image: firstImage(desc, 'https://linux.do/'),
            author: txt(it['dc:creator']),
            replies: posts ? Math.max(0, +posts[1] - 1) : 0,
          };
        });
    },
  },
  {
    id: 'ithome',
    name: 'IT之家',
    home: 'https://www.ithome.com/',
    desc: '数码好价、限免与降价资讯（已过滤）',
    interval: 10 * 60e3,
    async fetch() {
      const doc = xml.parse(await get('https://www.ithome.com/rss/'));
      const re = /优惠|到手|券后|领券|史低|好价|立减|限免|免费领|喜加一|元起|秒杀|国补|直降|白菜|促销价|折扣|限时.*元|首发价/;
      const bad = /销量|下调|政策|财报|营收|发布会|曝光|传闻|规划/;
      return arr(doc?.rss?.channel?.item)
        .filter((it) => re.test(txt(it.title)) && !bad.test(txt(it.title)))
        .map((it) => {
          const link = decodeEntities(txt(it.link));
          const desc = htmlOf(it.description);
          return {
            sid: (/\/(\d+)\/(\d+)\.htm/.exec(link) || []).slice(1).join('') || link,
            title: decodeEntities(txt(it.title)),
            url: link,
            ts: Date.parse(txt(it.pubDate)),
            html: sanitize(desc, 'https://www.ithome.com/'),
            summary: stripTags(desc).slice(0, 200),
            image: firstImage(desc, 'https://www.ithome.com/'),
          };
        });
    },
  },
  {
    id: 'epic',
    name: 'Epic 喜加一',
    home: 'https://store.epicgames.com/zh-CN/free-games',
    desc: 'Epic 商店每周限免游戏',
    interval: 60 * 60e3,
    async fetch() {
      const data = await get('https://store-site-backend-static.ak.epicgames.com/freeGamesPromotions?locale=zh-CN&country=CN', { json: true });
      const out = [];
      for (const e of data?.data?.Catalog?.searchStore?.elements || []) {
        const cur = e.promotions?.promotionalOffers?.[0]?.promotionalOffers || [];
        const up = e.promotions?.upcomingPromotionalOffers?.[0]?.promotionalOffers || [];
        const freeNow = cur.find((o) => o.discountSetting?.discountPercentage === 0);
        const freeNext = up.find((o) => o.discountSetting?.discountPercentage === 0);
        const offer = freeNow || freeNext;
        if (!offer) continue;
        const slug = e.catalogNs?.mappings?.[0]?.pageSlug || e.productSlug || e.urlSlug;
        const img = (e.keyImages || []).find((k) => k.type === 'OfferImageWide') || (e.keyImages || [])[0];
        out.push({
          sid: e.id,
          title: `【Epic 喜加一】${e.title} ${freeNow ? '限时免费领取' : '即将免费'}`,
          gameTitle: e.title,
          url: slug ? `https://store.epicgames.com/zh-CN/p/${slug}` : 'https://store.epicgames.com/zh-CN/free-games',
          ts: freeNow ? Math.min(Date.parse(offer.startDate), Date.now()) : Date.now() - 12 * 3600e3,
          image: img?.url || null,
          summary: e.description || '',
          price: freeNow ? 0 : null,
          originalPrice: e.price?.totalPrice?.fmtPrice?.originalPrice || '',
          hint: '游戏 epic',
          game: { platform: 'Epic', status: freeNow ? 'active' : 'upcoming', start: Date.parse(offer.startDate), end: Date.parse(offer.endDate) },
        });
      }
      return out;
    },
  },
  {
    id: 'gamerpower',
    name: 'GamerPower',
    home: 'https://www.gamerpower.com/',
    desc: 'Steam / GOG / Prime 等全平台免费游戏',
    interval: 60 * 60e3,
    async fetch() {
      const list = await get('https://www.gamerpower.com/api/giveaways?type=game&sort-by=date', { json: true });
      return list
        .filter((x) => x.status === 'Active')
        .slice(0, 40)
        .map((x) => {
          const plat = String(x.platforms || '').replace(/PC,\s*/, '');
          const name = String(x.title).replace(/\s*\((?:[^()]*)\)\s*Giveaways?$/i, '').replace(/\s*Giveaways?$/i, '');
          const end = x.end_date && x.end_date !== 'N/A' ? Date.parse(x.end_date.replace(' ', 'T') + 'Z') : null;
          return {
            sid: String(x.id),
            title: `【喜加一 · ${plat}】${name} 免费领取${x.worth && x.worth !== 'N/A' ? `（原价 ${x.worth}）` : ''}`,
            gameTitle: name,
            url: x.open_giveaway_url || x.gamerpower_url,
            ts: Date.parse(String(x.published_date).replace(' ', 'T') + 'Z'),
            image: x.image || x.thumbnail,
            summary: x.description,
            html: `<p>${escapeHtml(x.description)}</p><p><b>领取步骤</b></p><p>${escapeHtml(x.instructions).replace(/\r?\n/g, '<br>')}</p>`,
            price: 0,
            originalPrice: x.worth,
            hint: `游戏 喜加一 ${plat}`,
            views: x.users || 0,
            game: { platform: plat, status: 'active', end },
          };
        });
    },
  },
];

function escapeHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// 按需抓取单条线报正文（0818团 / 爱猴线报列表页只有标题，点开详情时服务端代抓正文并缓存）
async function fetchDetail(item) {
  if (!item || item.html) return item;
  try {
    if (item.source === '0818tuan') {
      const page = await get(item.url, { timeout: 8000 });
      const m = /<div class="post-content" id="xbcontent">([\s\S]*?)<p align="center" class="pageLink">/.exec(page);
      if (m) {
        item.html = sanitize(m[1], 'http://www.0818tuan.com/');
        item.summary = item.summary || stripTags(m[1]).slice(0, 200);
        item.image = item.image || firstImage(m[1], 'http://www.0818tuan.com/');
      }
    } else if (item.source === 'iehou') {
      const page = await get(item.url, { timeout: 8000 });
      const m = /<div class="thread-content message[^"]*">([\s\S]*?)<\/div>/.exec(page);
      if (m) {
        item.html = sanitize(m[1], 'https://iehou.com/');
        item.summary = item.summary || stripTags(m[1]).slice(0, 200);
        item.image = item.image || firstImage(m[1], 'https://iehou.com/');
      }
    }
    if (item.html && !item.actionUrl) item.actionUrl = firstActionUrl(item.html, item.url);
  } catch (_) {}
  return item;
}

module.exports = { sources, cnTime, clampTs, get, fetchDetail };
