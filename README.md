# 🐑 羊毛雷达 (Yangmao Radar)

全网羊毛实时聚合中文网站：自动从 **什么值得买、线报酷、0818团、爱猴线报、赚客吧、V2EX、LINUX DO、IT之家、Epic 喜加一、GamerPower** 抓取最新羊毛，去重、分类、提取价格后实时推送到前端。

## 启动

```bash
npm install
npm start          # 默认监听 http://localhost:3000
```

环境变量（均可选）：

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `3000` | 监听端口 |
| `DATA_DIR` | `./data` | 羊毛持久化目录（`store.json`） |
| `DISABLED_SOURCES` | 空 | 逗号分隔的禁用数据源 ID，如 `zuanke8,ithome` |
| `SITE_URL` | 请求 Host | 生成 RSS 链接时使用的站点根地址 |

## 接口

- `GET /api/deals?cat=free&platform=jd&source=xianbao&q=京豆&sort=new|hot|price&offset=0&limit=30`
- `GET /api/deal/:id` — 单条羊毛详情（含清洗后的正文 HTML）
- `GET /api/meta` — 统计、分类、平台、24h 热词、数据源健康状态
- `GET /api/games` — Epic / Steam 等正在限免的游戏
- `GET /api/evergreen` — 长期羊毛指南
- `GET /api/stream` — Server-Sent Events 实时新羊毛推送
- `GET /rss.xml` — RSS 2.0 订阅源（支持与 `/api/deals` 相同的过滤参数）
