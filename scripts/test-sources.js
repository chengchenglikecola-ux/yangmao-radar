// 逐个测试数据源：node scripts/test-sources.js [sourceId]
'use strict';
const { sources } = require('../server/sources');

(async () => {
  const only = process.argv[2];
  for (const s of sources) {
    if (only && s.id !== only) continue;
    const t0 = Date.now();
    try {
      const items = await s.fetch();
      console.log(`✔ ${s.id.padEnd(11)} ${String(items.length).padStart(3)} 条  ${Date.now() - t0}ms`);
      for (const it of items.slice(0, 3)) {
        console.log(`    - [${it.ts ? new Date(it.ts).toISOString() : 'NO-TS'}] ${it.title.slice(0, 50)} | ${it.url} | img:${it.image ? 'y' : 'n'} html:${it.html ? it.html.length : 0}`);
      }
    } catch (e) {
      console.log(`✘ ${s.id.padEnd(11)} ${e.message}`);
    }
  }
})();
