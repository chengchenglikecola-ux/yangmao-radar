// 羊毛分类器：根据标题 / 内容关键词判断分类、平台与价格
'use strict';

const CATEGORIES = [
  { id: 'free', name: '0元免费', re: /0元|免费|白嫖|喜加一|免单|0撸|零元|限免|白送|赠送|免费领|送会员|\bfree\b|giveaway|抽奖|必中/i },
  { id: 'cheap', name: '白菜价', re: /白菜|神价|bug价|史低|历史低价|好价|速度|手慢无|大水|0\.\d+元|[^\d.][1-9](\.\d+)?元(?!券)/i },
  { id: 'coupon', name: '红包卡券', re: /红包|券|立减|满减|无门槛|返现|津贴|补贴|礼金|淘金币|京豆|积分兑|膨胀|抵扣/ },
  { id: 'bank', name: '银行金融', re: /银行|工行|建行|农行|中行|招行|交行|邮储|浦发|中信|光大|民生|兴业|广发|华夏|信用卡|储蓄卡|云闪付|数币|数字人民币|立减金|掌上生活|买单吧|动卡空间|手机银行|基金|理财|翼支付|和包/ },
  { id: 'telecom', name: '话费会员', re: /话费|流量|中国移动|移动|联通|电信|宽带|腾讯视频|爱奇艺|优酷|芒果|B站|大会员|网易云|QQ音乐|酷狗|视频会员|会员月卡|年卡|88VIP|PLUS会员/i },
  { id: 'game', name: '游戏福利', re: /steam|epic|喜加一|游戏|switch|ps5|ps plus|xbox|game pass|gog|ubisoft|育碧|原神|王者|和平精英|网易游戏/i },
  { id: 'digital', name: '数码AI', re: /\bAI\b|GPT|Claude|Gemini|DeepSeek|Kimi|额度|API|token|credits|云服务器|VPS|域名|服务器|显卡|手机|耳机|笔记本|iPad|iPhone|Mac|数码|键盘|鼠标|显示器|SSD|硬盘|路由器|充电|相机|手表|平板|小米|华为|苹果/i },
  { id: 'life', name: '吃喝出行', re: /外卖|美团|饿了么|肯德基|KFC|麦当劳|瑞幸|星巴克|奶茶|咖啡|喜茶|蜜雪|霸王茶姬|打车|滴滴|高德|哈啰|12306|机票|酒店|火车|电影|猫眼|淘票票|加油|充电桩|地铁|公交|骑行/i },
];

const PLATFORMS = [
  { id: 'jd', name: '京东', re: /京东|\bJD\b|jd\.com|u\.jd\.com|京豆|PLUS/i },
  { id: 'taobao', name: '淘宝天猫', re: /淘宝|天猫|\bTB\b|tb\.cn|猫超|88VIP|淘金币|淘口令|闪购/i },
  { id: 'pdd', name: '拼多多', re: /拼多多|\bPDD\b|多多买菜|百亿补贴/i },
  { id: 'meituan', name: '美团', re: /美团|大众点评/ },
  { id: 'eleme', name: '饿了么', re: /饿了么|饿了吗/ },
  { id: 'douyin', name: '抖音', re: /抖音|抖店/ },
  { id: 'alipay', name: '支付宝', re: /支付宝|蚂蚁|余额宝|\bZFB\b/i },
  { id: 'wechat', name: '微信', re: /微信|\bVX\b|\bWX\b|立减金|小程序/i },
  { id: 'unionpay', name: '云闪付', re: /云闪付|银联|\bYSF\b/i },
  { id: 'bank', name: '银行', re: /银行|工行|建行|农行|中行|招行|交行|邮储|浦发|中信|光大|民生|兴业|广发|信用卡/ },
  { id: 'xhs', name: '小红书', re: /小红书/ },
  { id: 'steam', name: 'Steam', re: /steam/i },
  { id: 'epic', name: 'Epic', re: /epic/i },
];

function extractPrice(title) {
  if (!title) return null;
  if (/即将免费/.test(title)) return null;
  if (/0元|免费|免单|白嫖|喜加一|0撸|限免/.test(title)) return 0;
  // 取最后一个「数字+元」，排除「满xx-xx」「xx元券」「减xx元」这类非成交价
  const re = /(\d+(?:\.\d+)?)\s*(?:元|块)(?!券|无门槛|红包|立减金|话费券)/g;
  let m;
  let last = null;
  while ((m = re.exec(title))) {
    const before = title.slice(Math.max(0, m.index - 2), m.index);
    if (/[减\-]$/.test(before) || /满$/.test(before)) continue;
    last = parseFloat(m[1]);
  }
  if (last !== null && last < 100000) return last;
  return null;
}

function classify(item) {
  const text = `${item.title || ''} ${item.hint || ''}`;
  const cats = CATEGORIES.filter((c) => c.re.test(text)).map((c) => c.id);
  const platforms = PLATFORMS.filter((p) => p.re.test(text)).map((p) => p.id);
  let price = typeof item.price === 'number' ? item.price : extractPrice(item.title);
  if (price === 0 && !cats.includes('free')) cats.unshift('free');
  if (price !== null && price > 0 && price <= 9.9 && !cats.includes('cheap')) cats.push('cheap');
  if (!cats.length) cats.push('shopping');
  return { cats, platforms, price };
}

module.exports = {
  classify,
  extractPrice,
  CATEGORIES: [...CATEGORIES.map(({ id, name }) => ({ id, name })), { id: 'shopping', name: '网购好物' }],
  PLATFORMS: PLATFORMS.map(({ id, name }) => ({ id, name })),
};
