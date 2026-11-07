// 长期羊毛：常驻、可持续薅的福利清单（规则以官方为准）
'use strict';

module.exports = [
  {
    id: 'daily',
    name: '每日签到',
    desc: '每天花 3 分钟，积少成多',
    items: [
      { title: '京东 · 签到领京豆', platform: '京东', freq: '每日', how: '京东 App →「我的」→「京豆」→ 签到；下单时京豆可直接抵扣现金（100 京豆 = 1 元）。', url: 'https://www.jd.com/' },
      { title: '淘宝 · 淘金币签到', platform: '淘宝', freq: '每日', how: '淘宝 App 搜索「淘金币」，每日签到与浏览任务领金币，支持金币抵扣的商品下单立减。', url: 'https://www.taobao.com/' },
      { title: '支付宝 · 会员积分', platform: '支付宝', freq: '每日', how: '支付宝「我的」→「支付宝会员」→ 领积分，积分可兑换视频会员、红包、出行券等。', url: 'https://www.alipay.com/' },
      { title: '云闪付 · 签到领积点', platform: '云闪付', freq: '每日', how: '云闪付 App 首页签到领积点，积点可兑换话费、红包、立减券；各地还经常发放消费券。', url: 'https://yunshanfu.unionpay.com/' },
      { title: '美团 / 饿了么 · 外卖红包', platform: '外卖', freq: '每日', how: '点外卖前先进 App 首页「领红包 / 神券」入口，再搭配会员红包膨胀，单单能省几块钱。', url: 'https://waimai.meituan.com/' },
      { title: '三大运营商 App · 签到', platform: '运营商', freq: '每日', how: '中国移动 / 联通 / 电信官方 App 均有签到，可领流量、积分或金豆兑换话费。', url: 'https://www.10086.cn/' },
    ],
  },
  {
    id: 'bank',
    name: '银行 & 支付',
    desc: '银行是最大的羊毛来源',
    items: [
      { title: '信用卡新户首刷礼', platform: '银行', freq: '新户', how: '各大银行信用卡新户在规定时间内完成首刷 / 绑卡，通常可领实物礼品或现金红包，申请前对比各行活动。', url: 'https://www.cmbchina.com/' },
      { title: '手机银行 · 微信立减金', platform: '银行', freq: '每月', how: '工行、农行、建行、中行等手机银行常有「月度任务」「积分兑换」领取微信立减金，可在 0818团 / 线报酷 盯最新入口。', url: 'https://www.icbc.com.cn/' },
      { title: '招行掌上生活 · 饭票与周三活动', platform: '招商银行', freq: '每周', how: '掌上生活 App 的「饭票」「周三」专区常有餐饮、影票折扣，持招行信用卡即可参与。', url: 'https://www.cmbchina.com/' },
      { title: '建行生活 · 外卖餐饮满减', platform: '建设银行', freq: '常态', how: '建行生活 App 内点外卖、到店餐饮经常有满减，使用建行卡支付叠加优惠。', url: 'http://www.ccb.com/' },
      { title: '数字人民币 · 红包与满减', platform: '数字人民币', freq: '不定期', how: '开通数字人民币钱包后，各地政府与平台会不定期发放数币红包和支付立减。', url: 'https://www.pbc.gov.cn/' },
    ],
  },
  {
    id: 'game',
    name: '游戏喜加一',
    desc: '正版游戏永久入库',
    items: [
      { title: 'Epic Games · 每周限免', platform: 'Epic', freq: '每周', how: 'Epic 商店每周（北京时间周四晚 / 周五凌晨）更新限免游戏，领取后永久入库，本站首页实时追踪。', url: 'https://store.epicgames.com/zh-CN/free-games' },
      { title: 'Steam · 限时免费 & 免费周末', platform: 'Steam', freq: '不定期', how: 'Steam 不定期有限时免费领取与「免费试玩周末」，关注本站「游戏福利」分类即可。', url: 'https://store.steampowered.com/' },
      { title: 'GOG · 限时赠送', platform: 'GOG', freq: '不定期', how: 'GOG 首页经常出现无 DRM 的免费游戏赠送横幅，登录即可领取。', url: 'https://www.gog.com/' },
      { title: 'Prime Gaming · 每月免费游戏', platform: 'Amazon', freq: '每月', how: '拥有亚马逊 Prime 会员（需对应地区账号）即可每月领取若干款免费游戏与游戏内礼包。', url: 'https://gaming.amazon.com/' },
    ],
  },
  {
    id: 'dev',
    name: '学生 & 开发者',
    desc: '一个学生邮箱价值上万元',
    items: [
      { title: 'GitHub Student Developer Pack', platform: 'GitHub', freq: '学生', how: '用学校邮箱或学生证认证后，免费获得 GitHub Copilot、域名、云服务等数十项开发者权益。', url: 'https://education.github.com/pack' },
      { title: 'JetBrains 教育许可', platform: 'JetBrains', freq: '学生/教师', how: '学生与教师可免费使用 IntelliJ IDEA、PyCharm 等全家桶，每年续期一次。', url: 'https://www.jetbrains.com/community/education/' },
      { title: 'Apple 教育优惠', platform: 'Apple', freq: '学生/教师', how: '在 Apple 教育商店购买 Mac / iPad 享教育价，开学季还常有赠品活动。', url: 'https://www.apple.com.cn/cn-edu/store' },
      { title: 'Azure for Students', platform: 'Microsoft', freq: '学生', how: '学生认证后无需信用卡即可获得 Azure 免费额度与多项免费服务。', url: 'https://azure.microsoft.com/free/students/' },
      { title: 'Cloudflare 免费套餐', platform: 'Cloudflare', freq: '长期', how: 'CDN、DNS、Pages、Workers 均有慷慨的免费额度，个人网站基本零成本。', url: 'https://www.cloudflare.com/plans/' },
      { title: 'Oracle Cloud Always Free', platform: 'Oracle', freq: '长期', how: '注册后可长期免费使用 ARM 云主机、块存储等资源（需信用卡验证）。', url: 'https://www.oracle.com/cloud/free/' },
    ],
  },
  {
    id: 'life',
    name: '生活冷知识',
    desc: '很多人不知道的「官方羊毛」',
    items: [
      { title: '个税 App · 年度汇算退税', platform: '个人所得税', freq: '每年 3–6 月', how: '每年 3 月 1 日至 6 月 30 日在「个人所得税」App 办理年度汇算，填好专项附加扣除，可能退回多缴的税款。', url: 'https://etax.chinatax.gov.cn/' },
      { title: '公共图书馆 · 免费数字资源', platform: '图书馆', freq: '长期', how: '办一张本地公共图书馆读者证，即可免费使用电子书、期刊数据库、有声书等大量付费资源。', url: 'https://www.nlc.cn/' },
      { title: '12306 · 铁路畅行积分', platform: '12306', freq: '长期', how: '开通「铁路畅行」会员，乘车累积积分，可直接兑换火车票。', url: 'https://www.12306.cn/' },
      { title: '以旧换新 · 国家补贴', platform: '国补', freq: '阶段性', how: '家电、数码以旧换新国家补贴通常按地区分批发放，可在京东、淘宝、线下门店领取后叠加平台优惠。', url: 'https://www.mofcom.gov.cn/' },
    ],
  },
];
