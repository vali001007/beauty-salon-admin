import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(import.meta.dirname, '..', '.env') });

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const apply = process.argv.includes('--apply');
const confirmed = process.argv.includes('--yes');
const verifyOnly = process.argv.includes('--verify-only') || process.argv.includes('--verify');
const dryRun = !verifyOnly && (!apply || !confirmed || process.argv.includes('--dry-run'));

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
  max: Number(process.env.DATABASE_POOL_MAX || 3),
  idleTimeoutMillis: Number(process.env.DATABASE_IDLE_TIMEOUT_MS || 10000),
  connectionTimeoutMillis: Number(process.env.DATABASE_CONNECTION_TIMEOUT_MS || 10000),
});
const prisma = new PrismaClient({ adapter }) as any;

const dataSource = {
  name: 'Ami 行业数据平台 MVP 人工审核模板包',
  sourceType: 'manual',
  licenseType: 'internal_reference',
  confidenceLevel: 'medium',
  applicableScope: '生活美容门店初始化配置、项目 BOM、标准耗品和基础岗位薪酬参考',
  ownerName: 'Ami 行业数据运营',
  notes: 'MVP 种子模板包：用于管理端接入验证，不代表最终行业标准。',
  status: 'available',
};

const productTemplates = [
  {
    standardProductCode: 'STD-CLEANSER-PRO-001',
    name: '院装温和洁面乳',
    category: '院装护肤耗品',
    subCategory: '清洁',
    productType: 'professional_consumable',
    recommendedSpec: '500ml',
    unit: 'ml',
    packageUnit: '瓶',
    referenceCostMin: 0.18,
    referenceCostMax: 0.45,
    referenceRetailPriceMin: 98,
    referenceRetailPriceMax: 198,
    applicableServiceCategories: ['基础面部护理', '功效面部护理'],
    supplyCategoryCode: 'skincare_cleanser',
    preferredSpecKey: 'cleanser_500ml',
    status: 'published',
  },
  {
    standardProductCode: 'STD-MASK-POWDER-001',
    name: '补水软膜粉',
    category: '院装护肤耗品',
    subCategory: '面膜',
    productType: 'professional_consumable',
    recommendedSpec: '500g',
    unit: 'g',
    packageUnit: '罐',
    referenceCostMin: 0.12,
    referenceCostMax: 0.35,
    applicableServiceCategories: ['基础面部护理'],
    supplyCategoryCode: 'skincare_mask',
    preferredSpecKey: 'mask_powder_500g',
    status: 'published',
  },
  {
    standardProductCode: 'STD-SERUM-HYDRATING-001',
    name: '补水精华液',
    category: '院装护肤耗品',
    subCategory: '精华',
    productType: 'professional_consumable',
    recommendedSpec: '100ml',
    unit: 'ml',
    packageUnit: '瓶',
    referenceCostMin: 1.2,
    referenceCostMax: 3.5,
    applicableServiceCategories: ['基础面部护理', '功效面部护理'],
    supplyCategoryCode: 'skincare_serum',
    preferredSpecKey: 'hydrating_serum_100ml',
    status: 'published',
  },
  {
    standardProductCode: 'STD-TOWEL-DISPOSABLE-001',
    name: '一次性面巾',
    category: '一次性耗材',
    subCategory: '卫生耗材',
    productType: 'disposable',
    recommendedSpec: '加厚款',
    unit: '片',
    packageUnit: '包',
    referenceCostMin: 0.35,
    referenceCostMax: 0.9,
    applicableServiceCategories: ['基础面部护理', '身体护理', '仪器护理'],
    supplyCategoryCode: 'disposable_towel',
    preferredSpecKey: 'face_towel_piece',
    status: 'published',
  },
  {
    standardProductCode: 'STD-COTTON-PAD-001',
    name: '美容棉片',
    category: '一次性耗材',
    subCategory: '擦拭耗材',
    productType: 'disposable',
    recommendedSpec: '标准片',
    unit: '片',
    packageUnit: '包',
    referenceCostMin: 0.04,
    referenceCostMax: 0.12,
    applicableServiceCategories: ['基础面部护理', '功效面部护理'],
    supplyCategoryCode: 'disposable_cotton_pad',
    preferredSpecKey: 'cotton_pad_piece',
    status: 'published',
  },
  {
    standardProductCode: 'STD-MASSAGE-OIL-001',
    name: '身体护理按摩精油',
    category: '院装护肤耗品',
    subCategory: '身体护理',
    productType: 'professional_consumable',
    recommendedSpec: '1000ml',
    unit: 'ml',
    packageUnit: '瓶',
    referenceCostMin: 0.25,
    referenceCostMax: 0.8,
    applicableServiceCategories: ['身体护理'],
    supplyCategoryCode: 'body_oil',
    preferredSpecKey: 'massage_oil_1000ml',
    status: 'published',
  },
  {
    standardProductCode: 'STD-DISINFECTANT-001',
    name: '皮肤表面清洁消毒液',
    category: '消毒清洁用品',
    subCategory: '消毒用品',
    productType: 'disinfectant',
    recommendedSpec: '500ml',
    unit: 'ml',
    packageUnit: '瓶',
    referenceCostMin: 0.05,
    referenceCostMax: 0.16,
    applicableServiceCategories: ['仪器护理', '美睫美甲'],
    supplyCategoryCode: 'disinfectant',
    preferredSpecKey: 'skin_disinfectant_500ml',
    status: 'published',
  },
];

const serviceTemplates = [
  {
    code: 'SVC-FACE-HYDRATING-BASIC',
    name: '深层补水护理',
    category: '基础面部护理',
    subCategory: '补水护理',
    recommendedDurationMin: 45,
    recommendedDurationMax: 60,
    referencePriceMin: 198,
    referencePriceMax: 398,
    targetCustomers: ['皮肤干燥', '换季缺水', '基础护理客户'],
    contraindications: ['开放性伤口', '严重过敏期'],
    recommendedFrequency: '2-4 周一次',
    sellingPoints: ['补充角质层水分', '改善干燥紧绷', '适合作为新客体验项目'],
    status: 'published',
    bom: [
      { code: 'STD-CLEANSER-PRO-001', qty: 5, unit: 'ml', step: '清洁' },
      { code: 'STD-SERUM-HYDRATING-001', qty: 3, unit: 'ml', step: '导入' },
      { code: 'STD-MASK-POWDER-001', qty: 25, unit: 'g', step: '敷膜' },
      { code: 'STD-TOWEL-DISPOSABLE-001', qty: 1, unit: '片', step: '卫生准备' },
      { code: 'STD-COTTON-PAD-001', qty: 4, unit: '片', step: '擦拭' },
    ],
  },
  {
    code: 'SVC-FACE-SENSITIVE-REPAIR',
    name: '敏感肌舒缓修护',
    category: '功效面部护理',
    subCategory: '舒缓修护',
    recommendedDurationMin: 50,
    recommendedDurationMax: 70,
    referencePriceMin: 298,
    referencePriceMax: 498,
    targetCustomers: ['泛红敏感', '屏障受损', '换季不适'],
    contraindications: ['急性皮炎期', '开放性创口', '近期医美恢复期未确认'],
    recommendedFrequency: '2-3 周一次',
    sellingPoints: ['降低刺激', '强化屏障修护', '适合换季敏感客户'],
    status: 'published',
    bom: [
      { code: 'STD-CLEANSER-PRO-001', qty: 4, unit: 'ml', step: '温和清洁' },
      { code: 'STD-SERUM-HYDRATING-001', qty: 4, unit: 'ml', step: '舒缓导入' },
      { code: 'STD-TOWEL-DISPOSABLE-001', qty: 1, unit: '片', step: '卫生准备' },
      { code: 'STD-COTTON-PAD-001', qty: 5, unit: '片', step: '湿敷擦拭' },
    ],
  },
  {
    code: 'SVC-BODY-SHOULDER-NECK',
    name: '肩颈舒压养护',
    category: '身体护理',
    subCategory: '肩颈护理',
    recommendedDurationMin: 40,
    recommendedDurationMax: 60,
    referencePriceMin: 168,
    referencePriceMax: 298,
    targetCustomers: ['久坐肩颈紧张', '睡眠质量差', '身体放松需求'],
    contraindications: ['严重颈椎疾病未评估', '皮肤破损', '孕期需谨慎'],
    recommendedFrequency: '1-2 周一次',
    sellingPoints: ['放松肩颈肌肉', '提升服务体验', '适合作为到店复购项目'],
    status: 'published',
    bom: [
      { code: 'STD-MASSAGE-OIL-001', qty: 15, unit: 'ml', step: '按摩舒压' },
      { code: 'STD-TOWEL-DISPOSABLE-001', qty: 1, unit: '片', step: '卫生准备' },
    ],
  },
];

const salaryBenchmarks = [
  {
    jobRole: '美容师',
    roleCategory: '服务岗位',
    employeeLevel: '初级',
    cityTier: 'new_first_tier',
    baseSalaryMin: 3500,
    baseSalaryMax: 5500,
    commissionRateMin: 0.05,
    commissionRateMax: 0.12,
    serviceFeeMin: 10,
    serviceFeeMax: 40,
    responsibilities: ['完成护理服务', '维护顾客服务记录', '配合顾问做护理建议'],
    capabilityRequirements: ['基础面部护理', '服务礼仪', '耗材规范使用'],
    status: 'published',
  },
  {
    jobRole: '美容顾问',
    roleCategory: '销售岗位',
    employeeLevel: '标准',
    cityTier: 'new_first_tier',
    baseSalaryMin: 4500,
    baseSalaryMax: 8000,
    commissionRateMin: 0.08,
    commissionRateMax: 0.18,
    responsibilities: ['顾客咨询', '方案设计', '卡项和项目转化'],
    capabilityRequirements: ['顾客画像分析', '项目组合推荐', '售后跟进'],
    status: 'published',
  },
];

const knowledgeItems = [
  {
    domain: 'service_sop',
    title: '深层补水护理标准流程',
    content: '清洁、皮肤观察、补水精华导入、软膜敷膜、基础收尾。服务中应持续观察客户刺痛和泛红反馈。',
    tags: ['补水', '面部护理', 'SOP'],
    applicableRoles: ['美容师', '美容顾问'],
    reviewStatus: 'approved',
  },
  {
    domain: 'contraindication',
    title: '敏感肌护理禁忌提醒',
    content: '急性过敏、开放性伤口、严重皮炎期不建议做刺激性护理。顾客近期做过医美项目时，应先确认恢复周期。',
    tags: ['敏感肌', '禁忌', '安全'],
    applicableRoles: ['美容师', '美容顾问'],
    reviewStatus: 'approved',
  },
  {
    domain: 'hygiene',
    title: '一次性耗材使用规范',
    content: '面巾、棉片、手套、口罩等一次性耗材不得重复使用。仪器接触面应按门店卫生规范清洁消毒。',
    tags: ['卫生安全', '耗材'],
    applicableRoles: ['美容师', '店长'],
    reviewStatus: 'approved',
  },
];

productTemplates.push(
  {
    standardProductCode: 'STD-EXFOLIANT-ENZYME-001',
    name: '温和酵素去角质啫喱',
    category: '院装护肤耗品',
    subCategory: '角质管理',
    productType: 'professional_consumable',
    recommendedSpec: '300ml',
    unit: 'ml',
    packageUnit: '瓶',
    referenceCostMin: 0.45,
    referenceCostMax: 1.2,
    applicableServiceCategories: ['基础面部护理', '功效面部护理'],
    supplyCategoryCode: 'skincare_exfoliant',
    preferredSpecKey: 'enzyme_exfoliant_300ml',
    status: 'published',
  },
  {
    standardProductCode: 'STD-ESSENCE-BRIGHTENING-001',
    name: '亮肤精华液',
    category: '院装护肤耗品',
    subCategory: '精华',
    productType: 'professional_consumable',
    recommendedSpec: '100ml',
    unit: 'ml',
    packageUnit: '瓶',
    referenceCostMin: 1.8,
    referenceCostMax: 5.8,
    applicableServiceCategories: ['功效面部护理', '仪器护理'],
    supplyCategoryCode: 'skincare_serum',
    preferredSpecKey: 'brightening_serum_100ml',
    status: 'published',
  },
  {
    standardProductCode: 'STD-ESSENCE-REPAIR-001',
    name: '屏障修护精华',
    category: '院装护肤耗品',
    subCategory: '精华',
    productType: 'professional_consumable',
    recommendedSpec: '100ml',
    unit: 'ml',
    packageUnit: '瓶',
    referenceCostMin: 2.2,
    referenceCostMax: 6.5,
    applicableServiceCategories: ['功效面部护理', '敏感肌护理'],
    supplyCategoryCode: 'skincare_serum',
    preferredSpecKey: 'repair_serum_100ml',
    status: 'published',
  },
  {
    standardProductCode: 'STD-MASK-SOOTHING-001',
    name: '舒缓修护膜',
    category: '院装护肤耗品',
    subCategory: '面膜',
    productType: 'professional_consumable',
    recommendedSpec: '500g',
    unit: 'g',
    packageUnit: '罐',
    referenceCostMin: 0.2,
    referenceCostMax: 0.6,
    applicableServiceCategories: ['功效面部护理', '敏感肌护理'],
    supplyCategoryCode: 'skincare_mask',
    preferredSpecKey: 'soothing_mask_500g',
    status: 'published',
  },
  {
    standardProductCode: 'STD-MASK-BRIGHTENING-001',
    name: '亮肤软膜粉',
    category: '院装护肤耗品',
    subCategory: '面膜',
    productType: 'professional_consumable',
    recommendedSpec: '500g',
    unit: 'g',
    packageUnit: '罐',
    referenceCostMin: 0.18,
    referenceCostMax: 0.55,
    applicableServiceCategories: ['功效面部护理'],
    supplyCategoryCode: 'skincare_mask',
    preferredSpecKey: 'brightening_mask_powder_500g',
    status: 'published',
  },
  {
    standardProductCode: 'STD-GEL-RF-001',
    name: '射频仪器导入凝胶',
    category: '仪器耗材',
    subCategory: '导入介质',
    productType: 'instrument_consumable',
    recommendedSpec: '500ml',
    unit: 'ml',
    packageUnit: '瓶',
    referenceCostMin: 0.18,
    referenceCostMax: 0.5,
    applicableServiceCategories: ['仪器护理'],
    supplyCategoryCode: 'instrument_gel',
    preferredSpecKey: 'rf_gel_500ml',
    status: 'published',
  },
  {
    standardProductCode: 'STD-HYDRODERMABRASION-TIP-001',
    name: '小气泡一次性探头',
    category: '仪器耗材',
    subCategory: '探头耗材',
    productType: 'instrument_consumable',
    recommendedSpec: '标准头',
    unit: '个',
    packageUnit: '包',
    referenceCostMin: 1.2,
    referenceCostMax: 3.5,
    applicableServiceCategories: ['仪器护理', '清洁护理'],
    supplyCategoryCode: 'instrument_tip',
    preferredSpecKey: 'hydrodermabrasion_tip_piece',
    status: 'published',
  },
  {
    standardProductCode: 'STD-SCALP-SHAMPOO-001',
    name: '头皮净澈洗护液',
    category: '头皮护理耗品',
    subCategory: '清洁',
    productType: 'professional_consumable',
    recommendedSpec: '1000ml',
    unit: 'ml',
    packageUnit: '瓶',
    referenceCostMin: 0.18,
    referenceCostMax: 0.55,
    applicableServiceCategories: ['头皮护理'],
    supplyCategoryCode: 'scalp_care',
    preferredSpecKey: 'scalp_shampoo_1000ml',
    status: 'published',
  },
  {
    standardProductCode: 'STD-SCALP-ESSENCE-001',
    name: '头皮养护精华',
    category: '头皮护理耗品',
    subCategory: '精华',
    productType: 'professional_consumable',
    recommendedSpec: '100ml',
    unit: 'ml',
    packageUnit: '瓶',
    referenceCostMin: 1.5,
    referenceCostMax: 4.8,
    applicableServiceCategories: ['头皮护理'],
    supplyCategoryCode: 'scalp_care',
    preferredSpecKey: 'scalp_essence_100ml',
    status: 'published',
  },
  {
    standardProductCode: 'STD-LASH-GLUE-001',
    name: '美睫专用胶',
    category: '美睫耗材',
    subCategory: '胶水',
    productType: 'nail_lash_consumable',
    recommendedSpec: '5ml',
    unit: 'ml',
    packageUnit: '瓶',
    referenceCostMin: 8,
    referenceCostMax: 18,
    applicableServiceCategories: ['美睫'],
    supplyCategoryCode: 'lash_consumable',
    preferredSpecKey: 'lash_glue_5ml',
    status: 'published',
  },
  {
    standardProductCode: 'STD-LASH-FIBER-001',
    name: '单根嫁接睫毛',
    category: '美睫耗材',
    subCategory: '睫毛',
    productType: 'nail_lash_consumable',
    recommendedSpec: '混合长度',
    unit: '束',
    packageUnit: '盒',
    referenceCostMin: 0.08,
    referenceCostMax: 0.28,
    applicableServiceCategories: ['美睫'],
    supplyCategoryCode: 'lash_consumable',
    preferredSpecKey: 'lash_fiber_bundle',
    status: 'published',
  },
  {
    standardProductCode: 'STD-NAIL-GEL-POLISH-001',
    name: '甲油胶',
    category: '美甲耗材',
    subCategory: '色胶',
    productType: 'nail_lash_consumable',
    recommendedSpec: '15ml',
    unit: 'ml',
    packageUnit: '瓶',
    referenceCostMin: 1.2,
    referenceCostMax: 3.8,
    applicableServiceCategories: ['美甲'],
    supplyCategoryCode: 'nail_consumable',
    preferredSpecKey: 'gel_polish_15ml',
    status: 'published',
  },
  {
    standardProductCode: 'STD-NAIL-BASE-TOP-001',
    name: '底胶封层套装',
    category: '美甲耗材',
    subCategory: '基础胶',
    productType: 'nail_lash_consumable',
    recommendedSpec: '15ml',
    unit: 'ml',
    packageUnit: '瓶',
    referenceCostMin: 1,
    referenceCostMax: 3.2,
    applicableServiceCategories: ['美甲'],
    supplyCategoryCode: 'nail_consumable',
    preferredSpecKey: 'base_top_gel_15ml',
    status: 'published',
  },
  {
    standardProductCode: 'STD-GLOVES-NITRILE-001',
    name: '一次性丁腈手套',
    category: '一次性耗材',
    subCategory: '卫生耗材',
    productType: 'disposable',
    recommendedSpec: 'M码',
    unit: '只',
    packageUnit: '盒',
    referenceCostMin: 0.18,
    referenceCostMax: 0.45,
    applicableServiceCategories: ['面部护理', '身体护理', '美睫美甲'],
    supplyCategoryCode: 'disposable_gloves',
    preferredSpecKey: 'nitrile_glove_piece',
    status: 'published',
  },
  {
    standardProductCode: 'STD-MASK-MEDICAL-001',
    name: '一次性医用口罩',
    category: '一次性耗材',
    subCategory: '卫生耗材',
    productType: 'disposable',
    recommendedSpec: '三层',
    unit: '只',
    packageUnit: '盒',
    referenceCostMin: 0.12,
    referenceCostMax: 0.35,
    applicableServiceCategories: ['面部护理', '美睫美甲'],
    supplyCategoryCode: 'disposable_mask',
    preferredSpecKey: 'medical_mask_piece',
    status: 'published',
  },
  {
    standardProductCode: 'STD-RETAIL-SUNSCREEN-001',
    name: '日间防晒乳',
    category: '零售护肤商品',
    subCategory: '防晒',
    productType: 'retail_product',
    recommendedSpec: '50ml',
    unit: '支',
    packageUnit: '支',
    referenceCostMin: 48,
    referenceCostMax: 98,
    referenceRetailPriceMin: 168,
    referenceRetailPriceMax: 298,
    applicableServiceCategories: ['居家护理搭配'],
    supplyCategoryCode: 'retail_skincare',
    preferredSpecKey: 'sunscreen_50ml',
    status: 'published',
  },
  {
    standardProductCode: 'STD-RETAIL-MASK-001',
    name: '居家补水面膜',
    category: '零售护肤商品',
    subCategory: '面膜',
    productType: 'retail_product',
    recommendedSpec: '5片/盒',
    unit: '盒',
    packageUnit: '盒',
    referenceCostMin: 35,
    referenceCostMax: 88,
    referenceRetailPriceMin: 128,
    referenceRetailPriceMax: 268,
    applicableServiceCategories: ['居家护理搭配'],
    supplyCategoryCode: 'retail_skincare',
    preferredSpecKey: 'hydrating_mask_retail_box',
    status: 'published',
  },
);

serviceTemplates.push(
  {
    code: 'SVC-FACE-DEEP-CLEAN',
    name: '深层清洁小气泡',
    category: '仪器护理',
    subCategory: '清洁管理',
    recommendedDurationMin: 50,
    recommendedDurationMax: 70,
    referencePriceMin: 198,
    referencePriceMax: 398,
    targetCustomers: ['黑头粉刺', '油脂分泌旺盛', '毛孔堵塞'],
    contraindications: ['皮肤破损', '急性炎症期', '严重敏感期'],
    recommendedFrequency: '3-4 周一次',
    sellingPoints: ['清洁毛孔', '改善油脂堆积', '适合新客检测后转化'],
    status: 'published',
    bom: [
      { code: 'STD-CLEANSER-PRO-001', qty: 5, unit: 'ml', step: '清洁' },
      { code: 'STD-HYDRODERMABRASION-TIP-001', qty: 1, unit: '个', step: '小气泡操作' },
      { code: 'STD-MASK-POWDER-001', qty: 20, unit: 'g', step: '镇静敷膜' },
      { code: 'STD-TOWEL-DISPOSABLE-001', qty: 1, unit: '片', step: '卫生准备' },
      { code: 'STD-COTTON-PAD-001', qty: 6, unit: '片', step: '擦拭' },
    ],
  },
  {
    code: 'SVC-FACE-BRIGHTENING',
    name: '亮肤焕采护理',
    category: '功效面部护理',
    subCategory: '亮肤管理',
    recommendedDurationMin: 60,
    recommendedDurationMax: 80,
    referencePriceMin: 398,
    referencePriceMax: 698,
    targetCustomers: ['暗沉', '肤色不均', '熬夜疲态'],
    contraindications: ['晒伤期', '急性过敏期', '医美恢复期未确认'],
    recommendedFrequency: '3-4 周一次',
    sellingPoints: ['改善暗沉观感', '提升光泽感', '适合疗程卡组合'],
    status: 'published',
    bom: [
      { code: 'STD-CLEANSER-PRO-001', qty: 5, unit: 'ml', step: '清洁' },
      { code: 'STD-EXFOLIANT-ENZYME-001', qty: 3, unit: 'ml', step: '角质管理' },
      { code: 'STD-ESSENCE-BRIGHTENING-001', qty: 4, unit: 'ml', step: '亮肤导入' },
      { code: 'STD-MASK-BRIGHTENING-001', qty: 25, unit: 'g', step: '亮肤敷膜' },
      { code: 'STD-TOWEL-DISPOSABLE-001', qty: 1, unit: '片', step: '卫生准备' },
    ],
  },
  {
    code: 'SVC-FACE-RF-LIFTING',
    name: '射频紧致提升护理',
    category: '仪器护理',
    subCategory: '紧致提升',
    recommendedDurationMin: 60,
    recommendedDurationMax: 90,
    referencePriceMin: 498,
    referencePriceMax: 980,
    targetCustomers: ['面部松弛', '轮廓管理需求', '熟龄肌客户'],
    contraindications: ['植入电子设备', '孕期', '金属植入部位', '严重皮肤炎症'],
    recommendedFrequency: '3-4 周一次',
    sellingPoints: ['仪器护理客单提升', '适合疗程组合', '强调服务前禁忌确认'],
    status: 'published',
    bom: [
      { code: 'STD-CLEANSER-PRO-001', qty: 5, unit: 'ml', step: '清洁' },
      { code: 'STD-GEL-RF-001', qty: 12, unit: 'ml', step: '射频操作' },
      { code: 'STD-ESSENCE-REPAIR-001', qty: 3, unit: 'ml', step: '修护收尾' },
      { code: 'STD-TOWEL-DISPOSABLE-001', qty: 1, unit: '片', step: '卫生准备' },
      { code: 'STD-DISINFECTANT-001', qty: 3, unit: 'ml', step: '仪器接触面清洁' },
    ],
  },
  {
    code: 'SVC-FACE-ACNE-CALMING',
    name: '痘肌净颜舒缓护理',
    category: '功效面部护理',
    subCategory: '痘肌管理',
    recommendedDurationMin: 60,
    recommendedDurationMax: 80,
    referencePriceMin: 298,
    referencePriceMax: 598,
    targetCustomers: ['闭口粉刺', '油痘肌', '清洁后舒缓需求'],
    contraindications: ['脓包破溃', '感染期', '正在使用强刺激药物未确认'],
    recommendedFrequency: '2-3 周一次',
    sellingPoints: ['清洁与舒缓结合', '强调不承诺医疗效果', '适合周期护理'],
    status: 'published',
    bom: [
      { code: 'STD-CLEANSER-PRO-001', qty: 5, unit: 'ml', step: '清洁' },
      { code: 'STD-EXFOLIANT-ENZYME-001', qty: 2, unit: 'ml', step: '温和角质管理' },
      { code: 'STD-MASK-SOOTHING-001', qty: 25, unit: 'g', step: '舒缓敷膜' },
      { code: 'STD-COTTON-PAD-001', qty: 8, unit: '片', step: '局部擦拭' },
      { code: 'STD-GLOVES-NITRILE-001', qty: 2, unit: '只', step: '卫生防护' },
    ],
  },
  {
    code: 'SVC-BODY-BACK-CLEAN',
    name: '背部净透护理',
    category: '身体护理',
    subCategory: '背部护理',
    recommendedDurationMin: 50,
    recommendedDurationMax: 70,
    referencePriceMin: 238,
    referencePriceMax: 498,
    targetCustomers: ['背部油脂堆积', '背部闭口', '夏季身体护理需求'],
    contraindications: ['背部皮肤破损', '感染期', '严重晒伤'],
    recommendedFrequency: '3-4 周一次',
    sellingPoints: ['夏季高频项目', '适合套餐搭配', '提升身体护理复购'],
    status: 'published',
    bom: [
      { code: 'STD-CLEANSER-PRO-001', qty: 10, unit: 'ml', step: '背部清洁' },
      { code: 'STD-EXFOLIANT-ENZYME-001', qty: 6, unit: 'ml', step: '角质管理' },
      { code: 'STD-MASK-POWDER-001', qty: 35, unit: 'g', step: '背部敷膜' },
      { code: 'STD-TOWEL-DISPOSABLE-001', qty: 2, unit: '片', step: '卫生准备' },
      { code: 'STD-GLOVES-NITRILE-001', qty: 2, unit: '只', step: '卫生防护' },
    ],
  },
  {
    code: 'SVC-BODY-AROMA-RELAX',
    name: '全身芳疗放松',
    category: '身体护理',
    subCategory: '芳疗放松',
    recommendedDurationMin: 60,
    recommendedDurationMax: 90,
    referencePriceMin: 298,
    referencePriceMax: 598,
    targetCustomers: ['身体疲劳', '睡眠压力', '放松体验需求'],
    contraindications: ['孕期需谨慎', '皮肤破损', '精油过敏史'],
    recommendedFrequency: '2-4 周一次',
    sellingPoints: ['体验感强', '适合会员复购', '可搭配肩颈护理'],
    status: 'published',
    bom: [
      { code: 'STD-MASSAGE-OIL-001', qty: 30, unit: 'ml', step: '芳疗按摩' },
      { code: 'STD-TOWEL-DISPOSABLE-001', qty: 2, unit: '片', step: '卫生准备' },
      { code: 'STD-GLOVES-NITRILE-001', qty: 2, unit: '只', step: '卫生防护' },
    ],
  },
  {
    code: 'SVC-SCALP-DEEP-CLEAN',
    name: '头皮深层净澈护理',
    category: '头皮护理',
    subCategory: '清洁养护',
    recommendedDurationMin: 50,
    recommendedDurationMax: 75,
    referencePriceMin: 198,
    referencePriceMax: 498,
    targetCustomers: ['头皮油腻', '头皮紧绷', '换季头皮不适'],
    contraindications: ['头皮破损', '感染期', '严重皮炎未评估'],
    recommendedFrequency: '2-4 周一次',
    sellingPoints: ['拓展头皮护理品类', '适合检测后转化', '可搭配居家养护商品'],
    status: 'published',
    bom: [
      { code: 'STD-SCALP-SHAMPOO-001', qty: 20, unit: 'ml', step: '头皮清洁' },
      { code: 'STD-SCALP-ESSENCE-001', qty: 5, unit: 'ml', step: '头皮养护' },
      { code: 'STD-TOWEL-DISPOSABLE-001', qty: 2, unit: '片', step: '卫生准备' },
      { code: 'STD-GLOVES-NITRILE-001', qty: 2, unit: '只', step: '卫生防护' },
    ],
  },
  {
    code: 'SVC-LASH-NATURAL-SET',
    name: '自然款美睫嫁接',
    category: '美睫',
    subCategory: '单根嫁接',
    recommendedDurationMin: 80,
    recommendedDurationMax: 120,
    referencePriceMin: 198,
    referencePriceMax: 498,
    targetCustomers: ['自然放大双眼', '通勤妆感', '首次美睫客户'],
    contraindications: ['眼周过敏', '结膜炎', '近期眼部手术'],
    recommendedFrequency: '3-5 周一次',
    sellingPoints: ['高复购项目', '适合会员锁定周期', '强调眼周安全'],
    status: 'published',
    bom: [
      { code: 'STD-LASH-FIBER-001', qty: 120, unit: '束', step: '嫁接' },
      { code: 'STD-LASH-GLUE-001', qty: 0.2, unit: 'ml', step: '嫁接固定' },
      { code: 'STD-DISINFECTANT-001', qty: 2, unit: 'ml', step: '工具清洁' },
      { code: 'STD-MASK-MEDICAL-001', qty: 1, unit: '只', step: '卫生防护' },
      { code: 'STD-GLOVES-NITRILE-001', qty: 2, unit: '只', step: '卫生防护' },
    ],
  },
  {
    code: 'SVC-NAIL-SINGLE-COLOR',
    name: '单色美甲护理',
    category: '美甲',
    subCategory: '基础款',
    recommendedDurationMin: 50,
    recommendedDurationMax: 80,
    referencePriceMin: 128,
    referencePriceMax: 298,
    targetCustomers: ['基础美甲需求', '通勤简约款', '会员加购项目'],
    contraindications: ['甲周感染', '甲面严重损伤', '胶类过敏史'],
    recommendedFrequency: '3-4 周一次',
    sellingPoints: ['高频加购', '标准化强', '适合套餐搭配'],
    status: 'published',
    bom: [
      { code: 'STD-NAIL-GEL-POLISH-001', qty: 2, unit: 'ml', step: '上色' },
      { code: 'STD-NAIL-BASE-TOP-001', qty: 1.5, unit: 'ml', step: '底胶封层' },
      { code: 'STD-DISINFECTANT-001', qty: 2, unit: 'ml', step: '工具清洁' },
      { code: 'STD-GLOVES-NITRILE-001', qty: 2, unit: '只', step: '卫生防护' },
      { code: 'STD-MASK-MEDICAL-001', qty: 1, unit: '只', step: '卫生防护' },
    ],
  },
);

productTemplates.push(
  {
    standardProductCode: 'STD-HAND-SCRUB-001',
    name: '手部温和磨砂膏',
    category: '身体护理耗品',
    subCategory: '手部护理',
    productType: 'professional_consumable',
    recommendedSpec: '500g',
    unit: 'g',
    packageUnit: '罐',
    referenceCostMin: 0.16,
    referenceCostMax: 0.48,
    applicableServiceCategories: ['手部护理', '身体护理'],
    supplyCategoryCode: 'body_hand_care',
    preferredSpecKey: 'hand_scrub_500g',
    status: 'published',
  },
  {
    standardProductCode: 'STD-HAND-MASK-001',
    name: '手部滋养手膜',
    category: '身体护理耗品',
    subCategory: '手部护理',
    productType: 'professional_consumable',
    recommendedSpec: '10对/盒',
    unit: '对',
    packageUnit: '盒',
    referenceCostMin: 3.5,
    referenceCostMax: 9.8,
    applicableServiceCategories: ['手部护理'],
    supplyCategoryCode: 'body_hand_care',
    preferredSpecKey: 'hand_mask_pair',
    status: 'published',
  },
  {
    standardProductCode: 'STD-HAND-CREAM-001',
    name: '手部滋润护理霜',
    category: '身体护理耗品',
    subCategory: '手部护理',
    productType: 'professional_consumable',
    recommendedSpec: '300ml',
    unit: 'ml',
    packageUnit: '瓶',
    referenceCostMin: 0.22,
    referenceCostMax: 0.65,
    applicableServiceCategories: ['手部护理'],
    supplyCategoryCode: 'body_hand_care',
    preferredSpecKey: 'hand_cream_300ml',
    status: 'published',
  },
);

serviceTemplates.push(
  {
    code: 'SVC-FACE-SERUM-INFUSION',
    name: '精华导入护理',
    category: '功效面部护理',
    subCategory: '精华导入',
    recommendedDurationMin: 60,
    recommendedDurationMax: 90,
    referencePriceMin: 398,
    referencePriceMax: 598,
    targetCustomers: ['干燥缺水', '屏障脆弱', '需要密集护理客户'],
    contraindications: ['急性过敏期', '开放性创口', '医美恢复期未确认'],
    recommendedFrequency: '2-3 周一次',
    sellingPoints: ['提升精华吸收体验', '适合疗程卡承接', '可按肤况选择补水或修护精华'],
    status: 'published',
    bom: [
      { code: 'STD-CLEANSER-PRO-001', qty: 5, unit: 'ml', step: '清洁' },
      { code: 'STD-SERUM-HYDRATING-001', qty: 5, unit: 'ml', step: '补水精华导入' },
      { code: 'STD-ESSENCE-REPAIR-001', qty: 2, unit: 'ml', step: '屏障修护' },
      { code: 'STD-TOWEL-DISPOSABLE-001', qty: 1, unit: '片', step: '卫生准备' },
    ],
  },
  {
    code: 'SVC-BODY-ESSENTIAL-OIL-SPA',
    name: '全身精油 SPA',
    category: '身体护理',
    subCategory: '精油 SPA',
    recommendedDurationMin: 90,
    recommendedDurationMax: 120,
    referencePriceMin: 498,
    referencePriceMax: 798,
    targetCustomers: ['深度放松需求', '压力疲劳', '高客单身体护理客户'],
    contraindications: ['精油过敏史', '孕期需谨慎', '皮肤破损', '发热或急性不适'],
    recommendedFrequency: '2-4 周一次',
    sellingPoints: ['高体验感', '适合会员复购', '可与肩颈护理组合销售'],
    status: 'published',
    bom: [
      { code: 'STD-MASSAGE-OIL-001', qty: 45, unit: 'ml', step: '全身精油按摩' },
      { code: 'STD-TOWEL-DISPOSABLE-001', qty: 3, unit: '片', step: '卫生准备' },
      { code: 'STD-GLOVES-NITRILE-001', qty: 2, unit: '只', step: '卫生防护' },
    ],
  },
  {
    code: 'SVC-SCALP-SOOTHING-CARE',
    name: '头皮舒缓养护',
    category: '头皮护理',
    subCategory: '舒缓养护',
    recommendedDurationMin: 55,
    recommendedDurationMax: 70,
    referencePriceMin: 298,
    referencePriceMax: 398,
    targetCustomers: ['头皮紧绷', '头皮干痒', '换季不适'],
    contraindications: ['头皮破损', '感染期', '严重皮炎未评估'],
    recommendedFrequency: '2-4 周一次',
    sellingPoints: ['头皮清洁和舒缓结合', '适合检测后转化', '可搭配居家头皮养护'],
    status: 'published',
    bom: [
      { code: 'STD-SCALP-SHAMPOO-001', qty: 18, unit: 'ml', step: '头皮清洁' },
      { code: 'STD-SCALP-ESSENCE-001', qty: 6, unit: 'ml', step: '舒缓养护' },
      { code: 'STD-TOWEL-DISPOSABLE-001', qty: 2, unit: '片', step: '卫生准备' },
      { code: 'STD-GLOVES-NITRILE-001', qty: 2, unit: '只', step: '卫生防护' },
    ],
  },
  {
    code: 'SVC-HAND-SOFTENING-CARE',
    name: '手部细嫩护理',
    category: '身体护理',
    subCategory: '手部护理',
    recommendedDurationMin: 40,
    recommendedDurationMax: 50,
    referencePriceMin: 168,
    referencePriceMax: 238,
    targetCustomers: ['手部干燥', '角质粗糙', '美甲前后护理'],
    contraindications: ['手部破损', '甲周感染', '护理霜或手膜过敏史'],
    recommendedFrequency: '2-4 周一次',
    sellingPoints: ['轻量加购项目', '可与美甲组合', '耗材标准化明确'],
    status: 'published',
    bom: [
      { code: 'STD-HAND-SCRUB-001', qty: 8, unit: 'g', step: '手部角质护理' },
      { code: 'STD-HAND-MASK-001', qty: 1, unit: '对', step: '手膜滋养' },
      { code: 'STD-HAND-CREAM-001', qty: 5, unit: 'ml', step: '滋润收尾' },
      { code: 'STD-TOWEL-DISPOSABLE-001', qty: 1, unit: '片', step: '卫生准备' },
    ],
  },
);

productTemplates.push(
  {
    standardProductCode: 'STD-EYE-GEL-FIRMING-001',
    name: '眼周紧致啫喱',
    category: '院装护肤耗品',
    subCategory: '眼周护理',
    productType: 'professional_consumable',
    recommendedSpec: '100ml',
    unit: 'ml',
    packageUnit: '瓶',
    referenceCostMin: 1.8,
    referenceCostMax: 5.5,
    applicableServiceCategories: ['眼周护理', '紧致护理'],
    supplyCategoryCode: 'skincare_eye_care',
    preferredSpecKey: 'firming_eye_gel_100ml',
    status: 'published',
  },
  {
    standardProductCode: 'STD-EYE-MASK-001',
    name: '眼周护理膜',
    category: '院装护肤耗品',
    subCategory: '眼周护理',
    productType: 'professional_consumable',
    recommendedSpec: '10对/盒',
    unit: '对',
    packageUnit: '盒',
    referenceCostMin: 2.8,
    referenceCostMax: 8.8,
    applicableServiceCategories: ['眼周护理'],
    supplyCategoryCode: 'skincare_eye_care',
    preferredSpecKey: 'eye_mask_pair',
    status: 'published',
  },
  {
    standardProductCode: 'STD-POSTSUN-GEL-001',
    name: '晒后舒缓凝胶',
    category: '院装护肤耗品',
    subCategory: '晒后修护',
    productType: 'professional_consumable',
    recommendedSpec: '300ml',
    unit: 'ml',
    packageUnit: '瓶',
    referenceCostMin: 0.6,
    referenceCostMax: 1.8,
    applicableServiceCategories: ['晒后修护', '敏感肌护理'],
    supplyCategoryCode: 'skincare_soothing',
    preferredSpecKey: 'post_sun_gel_300ml',
    status: 'published',
  },
  {
    standardProductCode: 'STD-COLLAGEN-AMPOULE-001',
    name: '胶原焕活安瓶',
    category: '院装护肤耗品',
    subCategory: '抗衰精华',
    productType: 'professional_consumable',
    recommendedSpec: '10支/盒',
    unit: '支',
    packageUnit: '盒',
    referenceCostMin: 8,
    referenceCostMax: 22,
    applicableServiceCategories: ['紧致护理', '抗衰护理'],
    supplyCategoryCode: 'skincare_ampoule',
    preferredSpecKey: 'collagen_ampoule_piece',
    status: 'published',
  },
  {
    standardProductCode: 'STD-BARRIER-CREAM-001',
    name: '屏障养护乳霜',
    category: '院装护肤耗品',
    subCategory: '屏障养护',
    productType: 'professional_consumable',
    recommendedSpec: '300ml',
    unit: 'ml',
    packageUnit: '瓶',
    referenceCostMin: 0.8,
    referenceCostMax: 2.6,
    applicableServiceCategories: ['屏障养护', '敏感肌护理'],
    supplyCategoryCode: 'skincare_barrier',
    preferredSpecKey: 'barrier_cream_300ml',
    status: 'published',
  },
  {
    standardProductCode: 'STD-OXYGEN-SOLUTION-001',
    name: '水氧护理精华液',
    category: '仪器耗材',
    subCategory: '水氧耗材',
    productType: 'instrument_consumable',
    recommendedSpec: '500ml',
    unit: 'ml',
    packageUnit: '瓶',
    referenceCostMin: 0.35,
    referenceCostMax: 1.2,
    applicableServiceCategories: ['水氧护理', '清洁护理'],
    supplyCategoryCode: 'instrument_solution',
    preferredSpecKey: 'oxygen_solution_500ml',
    status: 'published',
  },
  {
    standardProductCode: 'STD-SPOT-BRIGHTENING-ESSENCE-001',
    name: '淡斑亮肤精华',
    category: '院装护肤耗品',
    subCategory: '亮肤淡斑',
    productType: 'professional_consumable',
    recommendedSpec: '100ml',
    unit: 'ml',
    packageUnit: '瓶',
    referenceCostMin: 2.8,
    referenceCostMax: 8.8,
    applicableServiceCategories: ['亮肤淡斑', '功效面护'],
    supplyCategoryCode: 'skincare_serum',
    preferredSpecKey: 'spot_brightening_essence_100ml',
    status: 'published',
  },
);

serviceTemplates.push(
  {
    code: 'SVC-EYE-FIRMING-CARE',
    name: '眼周紧致护理',
    category: '功效面部护理',
    subCategory: '眼周护理',
    recommendedDurationMin: 45,
    recommendedDurationMax: 55,
    referencePriceMin: 238,
    referencePriceMax: 358,
    targetCustomers: ['眼周干纹', '眼周疲态', '轻熟龄客户'],
    contraindications: ['眼周过敏', '结膜炎', '近期眼部手术'],
    recommendedFrequency: '2-3 周一次',
    sellingPoints: ['眼周专项护理', '适合面护加购', '强调眼周安全'],
    status: 'published',
    bom: [
      { code: 'STD-CLEANSER-PRO-001', qty: 3, unit: 'ml', step: '眼周清洁' },
      { code: 'STD-EYE-GEL-FIRMING-001', qty: 3, unit: 'ml', step: '紧致导入' },
      { code: 'STD-EYE-MASK-001', qty: 1, unit: '对', step: '眼膜护理' },
      { code: 'STD-COTTON-PAD-001', qty: 4, unit: '片', step: '擦拭' },
    ],
  },
  {
    code: 'SVC-FACE-POSTSUN-SOOTHING',
    name: '晒后舒缓修护',
    category: '功效面部护理',
    subCategory: '晒后修护',
    recommendedDurationMin: 55,
    recommendedDurationMax: 65,
    referencePriceMin: 268,
    referencePriceMax: 398,
    targetCustomers: ['日晒后泛红', '换季敏感', '皮肤干热不适'],
    contraindications: ['严重晒伤水泡', '开放性伤口', '急性皮炎'],
    recommendedFrequency: '晒后 3-7 天内按需护理',
    sellingPoints: ['舒缓泛红', '补水镇静', '适合夏季活动转化'],
    status: 'published',
    bom: [
      { code: 'STD-CLEANSER-PRO-001', qty: 4, unit: 'ml', step: '温和清洁' },
      { code: 'STD-POSTSUN-GEL-001', qty: 6, unit: 'ml', step: '晒后舒缓' },
      { code: 'STD-MASK-SOOTHING-001', qty: 25, unit: 'g', step: '舒缓敷膜' },
      { code: 'STD-TOWEL-DISPOSABLE-001', qty: 1, unit: '片', step: '卫生准备' },
    ],
  },
  {
    code: 'SVC-FACE-COLLAGEN-LIFT',
    name: '胶原焕活提拉',
    category: '功效面部护理',
    subCategory: '胶原抗衰',
    recommendedDurationMin: 80,
    recommendedDurationMax: 95,
    referencePriceMin: 498,
    referencePriceMax: 698,
    targetCustomers: ['熟龄肌', '轮廓松弛', '高客单抗衰客户'],
    contraindications: ['急性过敏期', '严重炎症', '医美恢复期未确认'],
    recommendedFrequency: '3-4 周一次',
    sellingPoints: ['高客单护理', '适合疗程组合', '胶原焕活卖点清晰'],
    status: 'published',
    bom: [
      { code: 'STD-CLEANSER-PRO-001', qty: 5, unit: 'ml', step: '清洁' },
      { code: 'STD-COLLAGEN-AMPOULE-001', qty: 1, unit: '支', step: '胶原安瓶导入' },
      { code: 'STD-GEL-RF-001', qty: 10, unit: 'ml', step: '提拉仪器配合' },
      { code: 'STD-MASK-SOOTHING-001', qty: 20, unit: 'g', step: '舒缓收尾' },
    ],
  },
  {
    code: 'SVC-FACE-SEASONAL-BARRIER',
    name: '季节屏障养护',
    category: '功效面部护理',
    subCategory: '屏障养护',
    recommendedDurationMin: 60,
    recommendedDurationMax: 75,
    referencePriceMin: 328,
    referencePriceMax: 528,
    targetCustomers: ['换季敏感', '屏障脆弱', '干燥紧绷'],
    contraindications: ['急性皮炎', '开放性创口', '严重过敏期'],
    recommendedFrequency: '2-3 周一次',
    sellingPoints: ['换季高频护理', '敏感客户友好', '适合作为会员维护项目'],
    status: 'published',
    bom: [
      { code: 'STD-CLEANSER-PRO-001', qty: 4, unit: 'ml', step: '温和清洁' },
      { code: 'STD-ESSENCE-REPAIR-001', qty: 4, unit: 'ml', step: '修护精华' },
      { code: 'STD-BARRIER-CREAM-001', qty: 5, unit: 'ml', step: '屏障养护' },
      { code: 'STD-TOWEL-DISPOSABLE-001', qty: 1, unit: '片', step: '卫生准备' },
    ],
  },
  {
    code: 'SVC-FACE-BUBBLE-CLEAN',
    name: '小气泡清洁护理',
    category: '仪器护理',
    subCategory: '清洁管理',
    recommendedDurationMin: 40,
    recommendedDurationMax: 50,
    referencePriceMin: 198,
    referencePriceMax: 318,
    targetCustomers: ['黑头粉刺', '油脂旺盛', '毛孔堵塞'],
    contraindications: ['皮肤破损', '急性炎症期', '严重敏感期'],
    recommendedFrequency: '3-4 周一次',
    sellingPoints: ['清洁毛孔', '新客易体验', '耗材标准化'],
    status: 'published',
    bom: [
      { code: 'STD-CLEANSER-PRO-001', qty: 5, unit: 'ml', step: '清洁' },
      { code: 'STD-HYDRODERMABRASION-TIP-001', qty: 1, unit: '个', step: '小气泡探头' },
      { code: 'STD-OXYGEN-SOLUTION-001', qty: 8, unit: 'ml', step: '水氧清洁' },
      { code: 'STD-COTTON-PAD-001', qty: 6, unit: '片', step: '擦拭' },
    ],
  },
  {
    code: 'SVC-FACE-FIRMING-ANTIAGING',
    name: '紧致抗衰护理',
    category: '仪器护理',
    subCategory: '紧致抗衰',
    recommendedDurationMin: 90,
    recommendedDurationMax: 110,
    referencePriceMin: 598,
    referencePriceMax: 798,
    targetCustomers: ['熟龄肌', '松弛下垂', '抗衰护理需求'],
    contraindications: ['孕期', '植入电子设备', '金属植入部位', '严重皮肤炎症'],
    recommendedFrequency: '3-4 周一次',
    sellingPoints: ['高客单项目', '适合疗程卡', '标准化仪器耗材'],
    status: 'published',
    bom: [
      { code: 'STD-CLEANSER-PRO-001', qty: 5, unit: 'ml', step: '清洁' },
      { code: 'STD-GEL-RF-001', qty: 14, unit: 'ml', step: '紧致仪器操作' },
      { code: 'STD-COLLAGEN-AMPOULE-001', qty: 1, unit: '支', step: '抗衰精华' },
      { code: 'STD-TOWEL-DISPOSABLE-001', qty: 1, unit: '片', step: '卫生准备' },
    ],
  },
  {
    code: 'SVC-FACE-SPOT-BRIGHTENING',
    name: '亮肤淡斑管理',
    category: '功效面部护理',
    subCategory: '亮肤淡斑',
    recommendedDurationMin: 80,
    recommendedDurationMax: 95,
    referencePriceMin: 498,
    referencePriceMax: 688,
    targetCustomers: ['肤色不均', '暗沉', '淡斑护理需求'],
    contraindications: ['晒伤期', '急性过敏', '医美恢复期未确认'],
    recommendedFrequency: '3-4 周一次',
    sellingPoints: ['亮肤淡斑卖点明确', '适合疗程转化', '搭配防晒零售推荐'],
    status: 'published',
    bom: [
      { code: 'STD-CLEANSER-PRO-001', qty: 5, unit: 'ml', step: '清洁' },
      { code: 'STD-SPOT-BRIGHTENING-ESSENCE-001', qty: 4, unit: 'ml', step: '淡斑精华导入' },
      { code: 'STD-MASK-BRIGHTENING-001', qty: 25, unit: 'g', step: '亮肤敷膜' },
      { code: 'STD-RETAIL-SUNSCREEN-001', qty: 0.05, unit: '支', step: '防晒建议样量' },
    ],
  },
  {
    code: 'SVC-FACE-OXYGEN-RENEW',
    name: '水氧清洁焕肤',
    category: '仪器护理',
    subCategory: '水氧焕肤',
    recommendedDurationMin: 55,
    recommendedDurationMax: 65,
    referencePriceMin: 298,
    referencePriceMax: 438,
    targetCustomers: ['基础清洁需求', '暗沉疲态', '水氧体验客户'],
    contraindications: ['皮肤破损', '严重敏感期', '急性炎症'],
    recommendedFrequency: '3-4 周一次',
    sellingPoints: ['清洁加补水', '适合新客体验', '可与补水护理搭配'],
    status: 'published',
    bom: [
      { code: 'STD-CLEANSER-PRO-001', qty: 5, unit: 'ml', step: '清洁' },
      { code: 'STD-OXYGEN-SOLUTION-001', qty: 10, unit: 'ml', step: '水氧操作' },
      { code: 'STD-SERUM-HYDRATING-001', qty: 3, unit: 'ml', step: '补水导入' },
      { code: 'STD-TOWEL-DISPOSABLE-001', qty: 1, unit: '片', step: '卫生准备' },
    ],
  },
);

salaryBenchmarks.push(
  {
    jobRole: '高级美容师',
    roleCategory: '服务岗位',
    employeeLevel: '高级',
    cityTier: 'new_first_tier',
    baseSalaryMin: 5500,
    baseSalaryMax: 9000,
    commissionRateMin: 0.08,
    commissionRateMax: 0.16,
    serviceFeeMin: 30,
    serviceFeeMax: 80,
    performanceMetrics: ['服务满意度', '复购率', '指定率', '耗材规范'],
    responsibilities: ['承接高客单护理', '指导初级美容师', '维护重点客户服务记录'],
    capabilityRequirements: ['功效护理', '仪器配合', '客户沟通', '服务风险识别'],
    status: 'published',
  },
  {
    jobRole: '店长',
    roleCategory: '管理岗位',
    employeeLevel: '标准',
    cityTier: 'new_first_tier',
    baseSalaryMin: 8000,
    baseSalaryMax: 15000,
    commissionRateMin: 0.01,
    commissionRateMax: 0.05,
    responsibilities: ['门店经营目标拆解', '人员排班管理', '客户和业绩复盘', '耗材成本管控'],
    capabilityRequirements: ['经营分析', '团队管理', '服务质量管理', '库存和成本意识'],
    status: 'published',
  },
  {
    jobRole: '前台/收银',
    roleCategory: '运营岗位',
    employeeLevel: '标准',
    cityTier: 'new_first_tier',
    baseSalaryMin: 3500,
    baseSalaryMax: 6000,
    commissionRateMin: 0.01,
    commissionRateMax: 0.04,
    responsibilities: ['预约接待', '收银核销', '客户到店登记', '基础库存提醒'],
    capabilityRequirements: ['收银规范', '客户接待', '系统操作', '异常上报'],
    status: 'published',
  },
  {
    jobRole: '美睫美甲师',
    roleCategory: '专项技术岗位',
    employeeLevel: '标准',
    cityTier: 'new_first_tier',
    baseSalaryMin: 4500,
    baseSalaryMax: 8500,
    commissionRateMin: 0.12,
    commissionRateMax: 0.28,
    serviceFeeMin: 20,
    serviceFeeMax: 80,
    responsibilities: ['美睫美甲服务交付', '工具消毒', '款式沟通', '复购维护'],
    capabilityRequirements: ['专项技术', '眼周/甲周安全', '耗材管理', '审美沟通'],
    status: 'published',
  },
);

knowledgeItems.push(
  {
    domain: 'service_sop',
    title: '深层清洁小气泡标准流程',
    content: '服务前确认皮肤破损和敏感情况，先卸妆清洁，再使用一次性探头完成小气泡清洁，结束后做镇静敷膜和保湿收尾。',
    tags: ['小气泡', '清洁护理', 'SOP'],
    applicableRoles: ['美容师', '店长'],
    reviewStatus: 'approved',
  },
  {
    domain: 'service_sop',
    title: '射频紧致护理服务前确认',
    content: '射频类项目必须确认是否有植入电子设备、金属植入、孕期、严重皮肤炎症等禁忌。顾问和美容师不得承诺医疗效果。',
    tags: ['射频', '仪器护理', '禁忌'],
    applicableRoles: ['美容师', '美容顾问'],
    reviewStatus: 'approved',
  },
  {
    domain: 'service_sop',
    title: '头皮护理标准接待口径',
    content: '先询问头皮破损、感染、近期染烫和过敏史，再做清洁养护。头皮异常严重时建议客户先咨询专业医疗机构。',
    tags: ['头皮护理', '接待', '安全'],
    applicableRoles: ['美容师', '美容顾问'],
    reviewStatus: 'approved',
  },
  {
    domain: 'contraindication',
    title: '美睫眼周安全禁忌',
    content: '眼周过敏、结膜炎、近期眼部手术或不明原因红肿时不建议操作。胶水接触不适应立即停止并记录。',
    tags: ['美睫', '眼周安全', '禁忌'],
    applicableRoles: ['美睫美甲师', '店长'],
    reviewStatus: 'approved',
  },
  {
    domain: 'contraindication',
    title: '美甲甲周安全禁忌',
    content: '甲周感染、甲面严重损伤、胶类过敏史客户需谨慎接待；工具必须消毒，破损出血应停止操作。',
    tags: ['美甲', '甲周安全', '禁忌'],
    applicableRoles: ['美睫美甲师', '店长'],
    reviewStatus: 'approved',
  },
  {
    domain: 'product_knowledge',
    title: '院装耗材与零售商品区分规则',
    content: '院装耗材用于服务 BOM 和服务扣耗，零售商品用于客户购买和居家搭配。两者成本、库存和销售话术应分开管理。',
    tags: ['标准品', '耗材', '零售商品'],
    applicableRoles: ['店长', '库存管理员', '美容顾问'],
    reviewStatus: 'approved',
  },
  {
    domain: 'sales_script',
    title: '补水护理客户沟通话术',
    content: '可围绕干燥紧绷、换季护理、护理周期提醒沟通，不承诺治疗效果。建议表达为到店后结合肤况确认适合方案。',
    tags: ['补水护理', '销售话术'],
    applicableRoles: ['美容顾问', '美容师'],
    reviewStatus: 'approved',
  },
  {
    domain: 'sales_script',
    title: '疗程组合推荐边界',
    content: '推荐疗程时应基于客户肤况、到店频次和预算，不使用夸大承诺。对敏感、医美恢复、皮肤病史客户先做风险确认。',
    tags: ['疗程卡', '推荐边界', '合规'],
    applicableRoles: ['美容顾问', '店长'],
    reviewStatus: 'approved',
  },
  {
    domain: 'hygiene',
    title: '仪器接触面清洁规范',
    content: '仪器接触皮肤的探头、导入头和手柄应在每位客户服务前后清洁消毒；一次性探头不得复用。',
    tags: ['仪器护理', '卫生安全'],
    applicableRoles: ['美容师', '店长'],
    reviewStatus: 'approved',
  },
  {
    domain: 'training',
    title: '项目 BOM 记录培训要点',
    content: 'BOM 是标准耗材用量，实际服务时如有额外用量或替代品，应在服务扣耗中记录原因，避免利润核算失真。',
    tags: ['BOM', '成本', '培训'],
    applicableRoles: ['美容师', '店长', '库存管理员'],
    reviewStatus: 'approved',
  },
);

function validateSeedDataset() {
  const productCodes = new Set<string>();
  const duplicateProductCodes: string[] = [];
  for (const item of productTemplates) {
    if (productCodes.has(item.standardProductCode)) duplicateProductCodes.push(item.standardProductCode);
    productCodes.add(item.standardProductCode);
  }

  const serviceCodes = new Set<string>();
  const duplicateServiceCodes: string[] = [];
  const missingBomProductCodes: string[] = [];
  for (const item of serviceTemplates) {
    if (serviceCodes.has(item.code)) duplicateServiceCodes.push(item.code);
    serviceCodes.add(item.code);
    for (const bomItem of item.bom) {
      if (!productCodes.has(bomItem.code)) missingBomProductCodes.push(`${item.code}:${bomItem.code}`);
    }
  }

  const errors = [
    duplicateProductCodes.length ? `标准品编码重复：${duplicateProductCodes.join(', ')}` : undefined,
    duplicateServiceCodes.length ? `服务模板编码重复：${duplicateServiceCodes.join(', ')}` : undefined,
    missingBomProductCodes.length ? `BOM 引用了不存在的标准品：${missingBomProductCodes.join(', ')}` : undefined,
    serviceTemplates.some((item) => !item.bom.length) ? '存在未配置 BOM 的服务模板' : undefined,
    knowledgeItems.some((item) => item.reviewStatus !== 'approved') ? '存在未发布知识条目' : undefined,
  ].filter(Boolean);

  if (errors.length) {
    throw new Error(`行业 MVP 种子数据校验失败：${errors.join('；')}`);
  }

  return {
    duplicateProductCodes: 0,
    duplicateServiceCodes: 0,
    missingBomProductCodes: 0,
    serviceTemplatesWithBom: serviceTemplates.length,
    approvedKnowledgeItems: knowledgeItems.length,
  };
}

async function verifySeededData() {
  const productCodes = productTemplates.map((item) => item.standardProductCode);
  const serviceCodes = serviceTemplates.map((item) => item.code);
  const expectedBomItems = serviceTemplates.reduce((sum, item) => sum + item.bom.length, 0);
  const [source, products, services, salaryCount, knowledgeCount] = await Promise.all([
    prisma.industryDataSource.findFirst({ where: { name: dataSource.name, deletedAt: null } }),
    prisma.industryProductTemplate.findMany({ where: { standardProductCode: { in: productCodes }, deletedAt: null } }),
    prisma.industryServiceTemplate.findMany({
      where: { code: { in: serviceCodes }, deletedAt: null },
      include: {
        bomTemplates: {
          where: { status: 'published', deletedAt: null },
          include: { items: true },
        },
      },
    }),
    prisma.industrySalaryBenchmark.count({
      where: {
        deletedAt: null,
        OR: salaryBenchmarks.map((item) => ({ jobRole: item.jobRole, employeeLevel: item.employeeLevel })),
      },
    }),
    prisma.industryKnowledgeItem.count({
      where: {
        deletedAt: null,
        reviewStatus: 'approved',
        OR: knowledgeItems.map((item) => ({ domain: item.domain, title: item.title })),
      },
    }),
  ]);

  const bomItemCount = services.reduce(
    (sum: number, service: any) => sum + (service.bomTemplates?.[0]?.items?.length ?? 0),
    0,
  );
  const result = {
    dataSourceReady: Boolean(source),
    productTemplates: products.length,
    serviceTemplates: services.length,
    publishedBomTemplates: services.filter((service: any) => service.bomTemplates?.length).length,
    bomItems: bomItemCount,
    salaryBenchmarks: salaryCount,
    knowledgeItems: knowledgeCount,
  };

  const errors = [
    !result.dataSourceReady ? '数据源未落库' : undefined,
    result.productTemplates < productTemplates.length ? `标准品数量不足：${result.productTemplates}/${productTemplates.length}` : undefined,
    result.serviceTemplates < serviceTemplates.length ? `服务模板数量不足：${result.serviceTemplates}/${serviceTemplates.length}` : undefined,
    result.publishedBomTemplates < serviceTemplates.length ? `已发布 BOM 数量不足：${result.publishedBomTemplates}/${serviceTemplates.length}` : undefined,
    result.bomItems < expectedBomItems ? `BOM 明细数量不足：${result.bomItems}/${expectedBomItems}` : undefined,
    result.salaryBenchmarks < salaryBenchmarks.length ? `薪酬模板数量不足：${result.salaryBenchmarks}/${salaryBenchmarks.length}` : undefined,
    result.knowledgeItems < knowledgeItems.length ? `已发布知识数量不足：${result.knowledgeItems}/${knowledgeItems.length}` : undefined,
  ].filter(Boolean);

  if (errors.length) {
    throw new Error(`行业 MVP 种子落库验收失败：${errors.join('；')}`);
  }

  return result;
}

async function findOrCreateDataSource() {
  const existing = await prisma.industryDataSource.findFirst({ where: { name: dataSource.name, deletedAt: null } });
  if (existing) {
    return prisma.industryDataSource.update({ where: { id: existing.id }, data: dataSource });
  }
  return prisma.industryDataSource.create({ data: dataSource });
}

async function main() {
  const validation = validateSeedDataset();
  const report = {
    mode: dryRun ? 'dry-run' : 'apply',
    productTemplates: productTemplates.length,
    serviceTemplates: serviceTemplates.length,
    bomItems: serviceTemplates.reduce((sum, item) => sum + item.bom.length, 0),
    salaryBenchmarks: salaryBenchmarks.length,
    knowledgeItems: knowledgeItems.length,
    validation,
  };

  if (verifyOnly) {
    console.log(JSON.stringify({ mode: 'verify-only', verification: await verifySeededData() }, null, 2));
    return;
  }

  if (dryRun) {
    console.log(JSON.stringify(report, null, 2));
    if (apply && !confirmed) {
      console.log('写库需显式传入 --apply --yes。');
    }
    return;
  }

  const source = await findOrCreateDataSource();

  const productMap = new Map<string, any>();
  for (const item of productTemplates) {
    const product = await prisma.industryProductTemplate.upsert({
      where: { standardProductCode: item.standardProductCode },
      update: item,
      create: item,
    });
    productMap.set(item.standardProductCode, product);
  }

  for (const item of serviceTemplates) {
    const { bom, ...serviceData } = item;
    const service = await prisma.industryServiceTemplate.upsert({
      where: { code: serviceData.code },
      update: { ...serviceData, sourceId: source.id, publishedAt: new Date() },
      create: { ...serviceData, sourceId: source.id, publishedAt: new Date() },
    });

    const cost = bom.reduce(
      (acc, bomItem) => {
        const product = productMap.get(bomItem.code);
        acc.min += Number(product?.referenceCostMin ?? 0) * bomItem.qty;
        acc.max += Number(product?.referenceCostMax ?? 0) * bomItem.qty;
        return acc;
      },
      { min: 0, max: 0 },
    );

    const bomTemplate = await prisma.industryProjectBomTemplate.upsert({
      where: { serviceTemplateId_version: { serviceTemplateId: service.id, version: 1 } },
      update: {
        status: 'published',
        sourceId: source.id,
        totalCostMin: cost.min,
        totalCostMax: cost.max,
        publishedAt: new Date(),
      },
      create: {
        serviceTemplateId: service.id,
        version: 1,
        status: 'published',
        sourceId: source.id,
        totalCostMin: cost.min,
        totalCostMax: cost.max,
        publishedAt: new Date(),
      },
    });

    await prisma.industryProjectBomItemTemplate.deleteMany({ where: { bomTemplateId: bomTemplate.id } });
    await prisma.industryProjectBomItemTemplate.createMany({
      data: bom.map((bomItem) => ({
        bomTemplateId: bomTemplate.id,
        productTemplateId: productMap.get(bomItem.code).id,
        itemRole: bomItem.code.includes('DISPOSABLE') || bomItem.code.includes('COTTON') || bomItem.code.includes('TOWEL') ? 'disposable' : 'main_material',
        standardQty: bomItem.qty,
        unit: bomItem.unit,
        serviceStep: bomItem.step,
        required: true,
        costIncluded: true,
        futureSupplyRequired: true,
        futureSupplyMappingKey: productMap.get(bomItem.code).preferredSpecKey,
      })),
    });
  }

  for (const item of salaryBenchmarks) {
    const existing = await prisma.industrySalaryBenchmark.findFirst({
      where: { jobRole: item.jobRole, employeeLevel: item.employeeLevel, deletedAt: null },
    });
    if (existing) {
      await prisma.industrySalaryBenchmark.update({ where: { id: existing.id }, data: item });
    } else {
      await prisma.industrySalaryBenchmark.create({ data: item });
    }
  }

  for (const item of knowledgeItems) {
    const existing = await prisma.industryKnowledgeItem.findFirst({
      where: { domain: item.domain, title: item.title, deletedAt: null },
    });
    const data = { ...item, sourceId: source.id, publishedAt: new Date() };
    if (existing) {
      await prisma.industryKnowledgeItem.update({ where: { id: existing.id }, data });
    } else {
      await prisma.industryKnowledgeItem.create({ data });
    }
  }

  console.log(JSON.stringify({ ...report, verification: await verifySeededData() }, null, 2));
}

main()
  .catch((error) => {
    if (error?.code === 'P2021') {
      console.error(
        JSON.stringify(
          {
            mode: verifyOnly ? 'verify-only' : dryRun ? 'dry-run' : 'apply',
            status: 'migration_required',
            message: '当前数据库缺少行业数据平台表，请先执行 prisma migrate deploy/dev 后再运行行业 MVP 种子写库或验收。',
            details: error?.meta,
          },
          null,
          2,
        ),
      );
    } else {
      console.error(error);
    }
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
