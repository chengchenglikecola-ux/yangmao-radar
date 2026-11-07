// 一次性抓取脚本：供 GitHub Actions / 定时任务更新 data/store.json 并生成静态站点
'use strict';

const path = require('path');
const { Store } = require('../server/store');
const { sources, fetchDetail } = require('../server/sources');

(async () => {
  const store = new Store();
  store.load();

  await Promise.allSettled(
    sources.map(async (src) => {
      const t0 = Date.now();
      try {
        const list = await src.fetch();
        const added = store.upsert(src, list);
        store.setSourceState(src.id, { ok: true, lastRun: Date.now(), lastOk: Date.now(), ms: Date.now() - t0, fetched: list.length, added: added.length, error: null, fails: 0 });
        console.log(`✔ [${src.id}] 抓取 ${list.length} 条，新增 ${added.length} 条`);
      } catch (e) {
        store.setSourceState(src.id, { ok: false, lastRun: Date.now(), ms: Date.now() - t0, error: String(e.message || e).slice(0, 120) });
        console.warn(`✘ [${src.id}] ${e.message}`);
      }
    })
  );

  // 为最新的 0818团 / 爱猴线报补齐正文与直达链接
  const needDetail = [...store.items.values()]
    .filter((x) => (x.source === '0818tuan' || x.source === 'iehou') && !x.html)
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 20);
  await Promise.allSettled(needDetail.map((it) => fetchDetail(it)));

  store.saveNow();
  console.log(`✔ 共收录 ${store.items.size} 条羊毛`);
})();
