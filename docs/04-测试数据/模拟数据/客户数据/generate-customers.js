/**
 * 客户管理 - 客户数据模拟数据生成脚本（美容行业优化版）
 *
 * 特点：
 * - 95%女性客户，符合美容行业真实比例
 * - 年龄集中在22-55岁，25-40岁占比最高
 * - 会员等级呈金字塔分布（普通多、钻石少）
 * - 消费金额与会员等级正相关
 * - 到店频率符合美容行业周期（2-4周一次）
 * - 客户来源以门店和朋友介绍为主
 * - 肌肤问题按年龄段分布（年轻偏痘痘/出油，年长偏抗衰/干纹）
 *
 * 用法: node generate-customers.js
 * 输出: customers.json / consumption-records.json / health-profiles.json
 */

const fs = require('fs');
const path = require('path');

// ========== 美容行业真实数据池 ==========
const SURNAMES = [
  '张', '王', '李', '赵', '刘', '陈', '杨', '黄', '周', '吴',
  '徐', '孙', '马', '朱', '胡', '林', '郭', '何', '高', '罗',
  '郑', '梁', '谢', '宋', '唐', '韩', '曹', '许', '邓', '冯',
  '萧', '程', '蔡', '彭', '潘', '袁', '于', '董', '余', '叶',
];
const FEMALE_GIVEN = [
  '美琳', '雅婷', '诗涵', '欣怡', '梦瑶', '紫萱', '思琪', '佳慧',
  '晓雯', '婉清', '若兰', '静怡', '雨薇', '芷若', '心怡', '语嫣',
  '梓涵', '可馨', '雅琴', '思颖', '嘉欣', '慧敏', '丽华', '秀英',
  '玉兰', '淑芬', '桂花', '春梅', '翠萍', '凤英', '小红', '建华',
  '丽萍', '秀珍', '月华', '彩云', '金凤', '玉珍', '素芳', '惠兰',
  '晓燕', '海燕', '小芳', '丽娟', '秀兰', '桂英', '玉华', '淑珍',
  '文静', '雅丽', '婷婷', '莹莹', '娜娜', '蓉蓉', '琳琳', '倩倩',
];
const MALE_GIVEN = [
  '俊杰', '浩然', '子轩', '文博', '天佑', '志强', '建国', '伟明',
  '国强', '永刚', '海涛', '明辉', '鹏飞', '文斌', '志远', '家豪',
];

const STORES = [
  { name: '心悦芸美容养生会所', city: '杭州市', district: '西湖区' },
  { name: '凤仪阁美容养生会所', city: '杭州市', district: '拱墅区' },
  { name: '兰亭美容SPA馆', city: '杭州市', district: '滨江区' },
];

// 会员等级：金字塔分布权重
const MEMBER_LEVELS = [
  { level: '无', weight: 15 },
  { level: '普通会员', weight: 35 },
  { level: '银卡会员', weight: 25 },
  { level: '金卡会员', weight: 18 },
  { level: '钻石会员', weight: 7 },
];

// 客户来源：美容行业真实分布
const SOURCES = [
  { source: '朋友介绍', weight: 30 },
  { source: '门店', weight: 25 },
  { source: '小红书', weight: 15 },
  { source: '抖音', weight: 10 },
  { source: '美团/大众点评', weight: 8 },
  { source: '线上广告', weight: 5 },
  { source: '活动', weight: 4 },
  { source: '其他', weight: 3 },
];

const TAGS_BY_AGE = {
  young: ['痘痘肌', '油性肌', '美白需求', '新客户', '学生党', '敏感肌', '控油需求'],
  middle: ['补水需求', '抗衰需求', '高消费', 'VIP', '混合肌', '敏感肌', '美白需求', '紧致需求'],
  mature: ['抗衰需求', '高消费', 'VIP', '干性肌', '沉睡客户', '紧致需求', '淡斑需求', '敏感肌'],
};

const MARITAL_BY_AGE = {
  young: [{ v: '未婚', w: 70 }, { v: '已婚', w: 15 }, { v: '未知', w: 15 }],
  middle: [{ v: '已婚', w: 60 }, { v: '未婚', w: 20 }, { v: '未知', w: 20 }],
  mature: [{ v: '已婚', w: 70 }, { v: '未知', w: 20 }, { v: '未婚', w: 10 }],
};

const OCCUPATIONS_BY_AGE = {
  young: ['学生', '实习生', '新媒体运营', '设计师', '前台', '销售', '客服', '幼师', '护士'],
  middle: ['教师', '医生', '设计师', '会计', '律师', '销售经理', '自由职业', '企业主', '公务员', '银行职员', '全职妈妈', '主播', '模特', '人事经理', '市场总监'],
  mature: ['企业主', '高管', '全职太太', '教师', '医生', '公务员', '退休', '自由职业', '会计师'],
};

const WORKPLACES = [
  '杭州XX科技有限公司', '浙江省人民医院', '杭州市第一中学', '自营美甲工作室',
  '中国银行杭州支行', '浙江XX律师事务所', '杭州XX广告传媒', '阿里巴巴', '网易',
  '浙江大学', '杭州师范大学', '某外贸公司', '某房地产公司', '某保险公司',
  '自营服装店', '某连锁餐饮', '某医美机构', '某幼儿园', '', '', '',
];

const STREETS = ['文三路', '延安路', '解放路', '中山路', '体育场路', '凤起路', '庆春路', '武林路', '莫干山路', '湖墅路', '古翠路', '学院路', '文一路', '天目山路', '西溪路'];

// 肌肤相关 - 按年龄段
const SKIN_TYPES_BY_AGE = {
  young: [{ v: '油性', w: 30 }, { v: '混油', w: 30 }, { v: '中性', w: 20 }, { v: '敏感', w: 15 }, { v: '混干', w: 5 }],
  middle: [{ v: '混干', w: 25 }, { v: '混油', w: 20 }, { v: '中性', w: 20 }, { v: '敏感', w: 20 }, { v: '干性', w: 10 }, { v: '油性', w: 5 }],
  mature: [{ v: '干性', w: 35 }, { v: '混干', w: 25 }, { v: '敏感', w: 20 }, { v: '中性', w: 15 }, { v: '混油', w: 5 }],
};
const SKIN_PROBLEMS_BY_AGE = {
  young: ['T区出油', '毛孔粗大', '闭口粉刺', '黑头', '痘痘', '痘印', '肤色暗沉', '敏感泛红'],
  middle: ['毛孔粗大', '色斑', '肤色不均', '细纹', '法令纹', '眼袋', '黑眼圈', '皮肤松弛', '暗沉', '敏感泛红'],
  mature: ['皱纹', '法令纹', '皮肤松弛', '色斑', '老年斑', '干纹', '眼袋', '双下巴', '颈纹', '肤色暗沉'],
};
const SKIN_STATUS_BY_AGE = {
  young: ['易出油', '毛孔粗大', '偶尔长痘', '肤色不均', '状态良好', '偏油缺水'],
  middle: ['皮肤缺乏光泽', '肤色不均', '弹性一般', '偏干缺水', '状态良好', '轻微松弛'],
  mature: ['皮肤弹性较差', '皮肤薄', '偏干缺水', '皮肤松弛', '肤色暗沉', '皱纹明显'],
};
const SKIN_GOALS_BY_AGE = {
  young: ['控油祛痘', '收缩毛孔', '美白提亮', '补水保湿', '祛痘印'],
  middle: ['补水保湿', '美白淡斑', '抗衰紧致', '提亮肤色', '收缩毛孔', '淡化细纹'],
  mature: ['抗衰紧致', '淡斑祛皱', '补水保湿', '提拉紧致', '改善松弛', '淡化色斑'],
};
const CARE_PLANS_BY_AGE = {
  young: ['清痘+消炎修复', '控油+补水平衡', '果酸焕肤+修复', '美白精华导入+面膜', '补水保湿+光子嫩肤'],
  middle: ['补水保湿+光子嫩肤', '美白精华导入+面膜', '射频紧致+胶原修复', '水光针+补水', '热玛吉+修复面膜'],
  mature: ['射频紧致+胶原修复', '热玛吉+修复面膜', '超声刀+术后修复', '水光针+补水', '线雕提升+修复'],
};
const INSTRUMENTS = ['面部皮肤检测器', 'VISIA皮肤分析仪', '水分检测仪', '毛孔分析仪', '皮肤CT检测仪'];

// 消费相关 - 按会员等级
const CONSUME_CONTENTS_BY_TYPE = {
  '服务消费': [
    '深层清洁护理', '补水保湿护理', '美白焕肤疗程', '抗衰紧致项目', '全身SPA护理',
    '水光针注射', '光子嫩肤治疗', '超声波导入护理', '射频紧致护理', '果酸焕肤',
    '头皮护理套餐', '肩颈舒缓按摩', '眼部护理', '颈部护理', '手部护理',
    '背部刮痧', '腹部经络疏通', '面部提拉', '淋巴排毒', '热石SPA',
  ],
  '产品消费': [
    '玻尿酸精华液', '修复面膜套装', '美白精华', '胶原蛋白面膜', '眼霜套装',
    '防晒喷雾', '卸妆油', '洁面乳', '爽肤水', '乳液面霜',
    '精华油', '颈霜', '身体乳', '护手霜', '唇膜',
  ],
  '套餐消费': [
    '年度美肤会员卡', '季度护理套餐', '半年护理套餐', '新人体验套餐',
    '闺蜜双人套餐', '婚前美肤套餐', '产后修复套餐', '换季护理套餐',
  ],
  '充值消费': ['会员充值', '储值卡充值', '预付卡充值'],
};
const PAY_METHODS = [
  { method: '微信支付', weight: 40 },
  { method: '支付宝', weight: 25 },
  { method: '会员余额', weight: 20 },
  { method: '银行卡', weight: 10 },
  { method: '现金', weight: 5 },
];
const CAMPAIGNS = [
  '春季焕肤活动', '夏日防晒季', '秋冬补水节', '会员专享优惠', '新年特惠套餐',
  '三八女神节', '母亲节感恩', '七夕美丽约定', '双十一狂欢', '圣诞跨年特惠',
  '首次体验优惠', '老带新优惠', '生日专属折扣', '周年庆活动', '无',
];

// ========== 工具函数 ==========
function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function pick(arr) { return arr[rand(0, arr.length - 1)]; }
function pickN(arr, n) {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(n, arr.length));
}
// 按权重随机选择
function weightedPick(items) {
  const total = items.reduce((s, i) => s + (i.weight || i.w), 0);
  let r = Math.random() * total;
  for (const item of items) {
    r -= (item.weight || item.w);
    if (r <= 0) return item.v || item.level || item.source || item.method;
  }
  return items[items.length - 1].v || items[items.length - 1].level || items[items.length - 1].source || items[items.length - 1].method;
}
function getAgeGroup(age) {
  if (age < 28) return 'young';
  if (age < 42) return 'middle';
  return 'mature';
}
function padPhone() {
  const prefixes = ['138', '139', '136', '137', '135', '158', '159', '188', '189', '177', '176', '155', '186', '187', '150', '151', '152', '131', '132', '170', '171'];
  return pick(prefixes) + String(rand(10000000, 99999999));
}
function padDate(yearMin, yearMax) {
  const y = rand(yearMin, yearMax);
  const m = String(rand(1, 12)).padStart(2, '0');
  const d = String(rand(1, 28)).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
function padDateTime(yearMin, yearMax) {
  return `${padDate(yearMin, yearMax)} ${String(rand(9, 21)).padStart(2, '0')}:${String(rand(0, 59)).padStart(2, '0')}`;
}
// 美容行业年龄分布：22-55岁，25-40岁高峰
function generateAge() {
  const r = Math.random();
  if (r < 0.08) return rand(18, 22);       // 8% 很年轻
  if (r < 0.25) return rand(23, 27);       // 17% 年轻
  if (r < 0.55) return rand(28, 35);       // 30% 核心客群
  if (r < 0.80) return rand(36, 42);       // 25% 中年
  if (r < 0.93) return rand(43, 50);       // 13% 中老年
  return rand(51, 60);                      // 7% 年长
}

// ========== 生成客户基础信息 ==========
function generateCustomers(count) {
  const customers = [];
  const usedPhones = new Set();

  for (let i = 1; i <= count; i++) {
    // 95%女性
    const gender = Math.random() < 0.95 ? '女' : '男';
    const surname = pick(SURNAMES);
    const givenName = gender === '女' ? pick(FEMALE_GIVEN) : pick(MALE_GIVEN);
    const name = surname + givenName;
    const age = generateAge();
    const ageGroup = getAgeGroup(age);
    const birthYear = 2026 - age;
    const birthday = `${birthYear}-${String(rand(1, 12)).padStart(2, '0')}-${String(rand(1, 28)).padStart(2, '0')}`;

    // 唯一手机号
    let phone;
    do { phone = padPhone(); } while (usedPhones.has(phone));
    usedPhones.add(phone);

    // 会员等级（金字塔分布）
    const memberLevel = weightedPick(MEMBER_LEVELS);

    // 消费金额与会员等级强相关
    let totalSpent, visitCount;
    switch (memberLevel) {
      case '无': totalSpent = 0; visitCount = 0; break;
      case '普通会员': totalSpent = rand(200, 5000); visitCount = rand(1, 15); break;
      case '银卡会员': totalSpent = rand(5000, 20000); visitCount = rand(10, 40); break;
      case '金卡会员': totalSpent = rand(20000, 60000); visitCount = rand(30, 80); break;
      case '钻石会员': totalSpent = rand(50000, 200000); visitCount = rand(60, 200); break;
      default: totalSpent = 0; visitCount = 0;
    }

    const store = pick(STORES);
    const maritalStatus = weightedPick(MARITAL_BY_AGE[ageGroup]);
    const source = weightedPick(SOURCES);
    const tags = pickN(TAGS_BY_AGE[ageGroup], rand(0, 3));
    const occupation = pick(OCCUPATIONS_BY_AGE[ageGroup]);

    // 最后到店时间：活跃客户近期，沉睡客户较远
    let lastVisitDate = '';
    if (visitCount > 0) {
      if (tags.includes('沉睡客户')) {
        lastVisitDate = padDate(2024, 2025);
      } else if (visitCount > 30) {
        // 高频客户最近到店
        const daysAgo = rand(1, 30);
        const d = new Date(2026, 3, 11); // 当前日期
        d.setDate(d.getDate() - daysAgo);
        lastVisitDate = d.toISOString().split('T')[0];
      } else {
        lastVisitDate = padDate(2025, 2026);
      }
    }

    customers.push({
      id: i,
      name,
      storeName: store.name,
      email: Math.random() < 0.3 ? `${surname.toLowerCase()}${givenName.charAt(0)}${rand(10, 999)}@${pick(['qq', '163', 'gmail', 'outlook', 'foxmail'])}.com` : '',
      phone,
      landline: Math.random() < 0.05 ? `0571-${rand(80000000, 89999999)}` : '',
      wechat: Math.random() < 0.55 ? `wx_${phone.slice(-4)}_${rand(10, 99)}` : '',
      gender,
      maritalStatus,
      birthday,
      age,
      height: gender === '女' ? rand(155, 172) : rand(168, 183),
      weight: gender === '女' ? rand(43, 68) : rand(58, 85),
      occupation,
      workplace: Math.random() < 0.7 ? pick(WORKPLACES) : '',
      address: `${store.city}${store.district}${pick(STREETS)}${rand(1, 500)}号${Math.random() < 0.5 ? `${rand(1, 30)}幢${rand(1, 6)}0${rand(1, 4)}室` : ''}`,
      hasAllergy: Math.random() < 0.12 ? '有' : '无',
      hasSurgery: Math.random() < 0.08 ? '有' : '无',
      skinCondition: Math.random() < 0.65 ? pickN(SKIN_STATUS_BY_AGE[ageGroup], rand(1, 2)).join('，') : '',
      totalSpent,
      visitCount,
      memberLevel,
      source,
      lastVisitDate,
      tags,
      createdAt: padDate(2022, 2026),
      remark: generateRemark(memberLevel, tags, age),
    });
  }
  return customers;
}

function generateRemark(level, tags, age) {
  const r = Math.random();
  if (r > 0.25) return '';
  const remarks = [];
  if (level === '钻石会员') remarks.push('VIP客户，优先服务', '高端客户，注意维护关系', '每月固定护理，安排资深美容师');
  if (level === '金卡会员') remarks.push('老客户，注意维护', '消费稳定，推荐升级套餐', '偏好高端产品线');
  if (tags.includes('沉睡客户')) remarks.push('超过3个月未到店，需回访', '建议发送唤醒优惠券');
  if (tags.includes('敏感肌')) remarks.push('皮肤较敏感，注意产品选择', '避免使用含酒精产品');
  if (tags.includes('新客户')) remarks.push('新客户，注意首次体验', '推荐体验套餐');
  if (age > 45) remarks.push('偏好安静环境', '注意抗衰项目推荐');
  if (remarks.length === 0) remarks.push('对价格敏感', '偏好天然产品', '喜欢尝试新项目', '时间较灵活', '');
  return pick(remarks);
}

// ========== 生成消费记录 ==========
function generateConsumptionRecords(customers) {
  const records = [];
  let id = 1;
  for (const c of customers) {
    if (c.visitCount === 0) continue;
    // 消费记录数量与到店次数相关，但不完全等于
    const recordCount = Math.min(rand(1, Math.ceil(c.visitCount * 0.6)), 8);
    for (let j = 0; j < recordCount; j++) {
      // 消费类型分布：服务消费60%，产品消费20%，套餐消费12%，充值8%
      const typeRoll = Math.random();
      let consumeType;
      if (typeRoll < 0.60) consumeType = '服务消费';
      else if (typeRoll < 0.80) consumeType = '产品消费';
      else if (typeRoll < 0.92) consumeType = '套餐消费';
      else consumeType = '充值消费';

      const content = pick(CONSUME_CONTENTS_BY_TYPE[consumeType]);
      // 金额与消费类型和会员等级相关
      let amount;
      switch (consumeType) {
        case '服务消费':
          amount = c.memberLevel === '钻石会员' ? rand(500, 5000) : c.memberLevel === '金卡会员' ? rand(300, 3000) : rand(98, 1500);
          break;
        case '产品消费':
          const qty = rand(1, 5);
          amount = rand(80, 600) * qty;
          break;
        case '套餐消费':
          amount = c.memberLevel === '钻石会员' ? rand(5000, 30000) : c.memberLevel === '金卡会员' ? rand(3000, 15000) : rand(500, 5000);
          break;
        case '充值消费':
          amount = [1000, 2000, 3000, 5000, 10000, 20000, 50000][rand(0, 6)];
          break;
        default: amount = rand(100, 1000);
      }

      records.push({
        id: id++,
        customerId: c.id,
        userName: c.name,
        consumeType,
        consumeContent: consumeType === '产品消费' ? `${content} x${rand(1, 5)}` : content,
        payMethod: weightedPick(PAY_METHODS),
        amount: `¥${amount.toLocaleString()}.00`,
        campaign: Math.random() < 0.35 ? pick(CAMPAIGNS.filter(c => c !== '无')) : '无',
        consumeTime: padDateTime(2024, 2026),
      });
    }
  }
  return records.sort((a, b) => b.consumeTime.localeCompare(a.consumeTime));
}

// ========== 生成肌肤档案 ==========
function generateHealthProfiles(customers) {
  const profiles = [];
  let id = 1;
  for (const c of customers) {
    // 到店2次以上且60%概率有档案
    if (c.visitCount < 2 || Math.random() < 0.35) continue;
    const ageGroup = getAgeGroup(c.age);

    profiles.push({
      id: id++,
      customerId: c.id,
      photo: '',
      name: c.name,
      skinType: weightedPick(SKIN_TYPES_BY_AGE[ageGroup]),
      skinStatus: pick(SKIN_STATUS_BY_AGE[ageGroup]),
      mainProblems: pickN(SKIN_PROBLEMS_BY_AGE[ageGroup], rand(1, 3)).join(', '),
      allergyHistory: c.hasAllergy === '有' ? pick(['花粉过敏', '海鲜过敏', '酒精成分过敏', '金属过敏', '果酸过敏', '某些防腐剂过敏']) : '没有',
      goals: pickN(SKIN_GOALS_BY_AGE[ageGroup], rand(1, 2)).join(', '),
      recommendedCare: pick(CARE_PLANS_BY_AGE[ageGroup]),
      instrument: pick(INSTRUMENTS),
      lastCheck: padDate(2025, 2026),
    });
  }
  return profiles;
}

// ========== 主流程 ==========
const CUSTOMER_COUNT = 1240;

console.log(`正在生成 ${CUSTOMER_COUNT} 条客户数据...`);
const customers = generateCustomers(CUSTOMER_COUNT);
const consumptionRecords = generateConsumptionRecords(customers);
const healthProfiles = generateHealthProfiles(customers);

// 统计信息
const stats = {
  总客户数: customers.length,
  女性占比: (customers.filter(c => c.gender === '女').length / customers.length * 100).toFixed(1) + '%',
  平均年龄: (customers.reduce((s, c) => s + c.age, 0) / customers.length).toFixed(1),
  会员分布: MEMBER_LEVELS.map(m => `${m.level}: ${customers.filter(c => c.memberLevel === m.level).length}`).join(', '),
  门店分布: STORES.map(s => `${s.name}: ${customers.filter(c => c.storeName === s.name).length}`).join(', '),
};

const outDir = __dirname;
fs.writeFileSync(path.join(outDir, 'customers.json'), JSON.stringify(customers, null, 2), 'utf-8');
fs.writeFileSync(path.join(outDir, 'consumption-records.json'), JSON.stringify(consumptionRecords, null, 2), 'utf-8');
fs.writeFileSync(path.join(outDir, 'health-profiles.json'), JSON.stringify(healthProfiles, null, 2), 'utf-8');

console.log(`\n✅ 生成完成:`);
console.log(`   客户基础信息: ${customers.length} 条 → customers.json`);
console.log(`   消费记录: ${consumptionRecords.length} 条 → consumption-records.json`);
console.log(`   肌肤档案: ${healthProfiles.length} 条 → health-profiles.json`);
console.log(`\n📊 数据统计:`);
Object.entries(stats).forEach(([k, v]) => console.log(`   ${k}: ${v}`));
