import type { Card } from '@/types/card';
import type { CardFormData } from '@/schemas/card';

const MOCK_CARDS: Card[] = [
  { id: 44, name: '元心卡', type: '护理卡', totalTimes: 10, price: 1991, validDays: 3650, storeName: '心悦美容养生会所', status: '上架', createdAt: '2026-03-13 18:23:31', projects: [{ projectName: '巨补水', timesPerCard: 10 }] },
  { id: 43, name: '八级享充次感', type: '仪器卡', totalTimes: 20, price: 1980, validDays: 3650, storeName: '凤仪阁美容养生会所', status: '上架', createdAt: '2026-03-13 11:58:26', projects: [{ projectName: '八戒享秀仪器', timesPerCard: 20 }] },
  { id: 42, name: '赛玛', type: '综合卡', totalTimes: 30, price: 9991, validDays: 3650, storeName: '凤仪阁美容养生会所', status: '上架', createdAt: '2026-03-13 11:48:13', projects: [{ projectName: '能量屋', timesPerCard: 15 }, { projectName: '膏方灸', timesPerCard: 15 }] },
];

export async function mockGetCards(): Promise<Card[]> {
  return [...MOCK_CARDS];
}

export async function mockCreateCard(data: CardFormData): Promise<Card> {
  const newCard: Card = {
    id: Date.now(),
    name: data.name,
    type: data.type,
    totalTimes: data.totalTimes,
    price: data.price,
    validDays: data.validDays,
    storeName: '心悦美容养生会所',
    status: '上架',
    createdAt: new Date().toISOString().replace('T', ' ').slice(0, 19),
    projects: data.projects,
  };
  MOCK_CARDS.push(newCard);
  return newCard;
}

export async function mockUpdateCard(id: number, data: Partial<CardFormData>): Promise<Card> {
  const index = MOCK_CARDS.findIndex((c) => c.id === id);
  if (index === -1) throw new Error('次卡不存在');
  MOCK_CARDS[index] = { ...MOCK_CARDS[index], ...data };
  return MOCK_CARDS[index];
}

import type { PaginatedResponse, PaginationParams } from '@/types/pagination';

interface CardOrder {
  id: string;
  cardName: string;
  userName: string;
  actualPrice: number;
  status: 'active' | 'expired' | 'voided';
  purchaseTime: string;
  expireTime: string;
}

interface CardUsageRecord {
  id: number;
  cardName: string;
  userName: string;
  storeName: string;
  projectName: string;
  usedTimes: number;
  consumedTimes: number;
  usageTime: string;
  operationPermission: string;
  orderTime: string;
}

const MOCK_CARD_ORDERS: CardOrder[] = [
  { id: '481662821', cardName: '元心艾', userName: '陈洁蓉', actualPrice: 7960, status: 'active', purchaseTime: '2026-03-14 21:32:48', expireTime: '2028-05-08 20:23:44' },
  { id: '115208150', cardName: '2991创始会员卡', userName: '陈爱琴', actualPrice: 2991, status: 'active', purchaseTime: '2026-03-14 21:27:15', expireTime: '2028-02-09 20:23:44' },
  { id: '249233335', cardName: '9999一卡通', userName: '陈爱琴', actualPrice: 9999, status: 'active', purchaseTime: '2026-03-14 21:25:35', expireTime: '2028-12-05 20:23:44' },
  { id: '284967099', cardName: '2991创始会员卡', userName: '楮倩', actualPrice: 2991, status: 'voided', purchaseTime: '2026-03-14 21:15:18', expireTime: '2028-02-11 20:23:44' },
  { id: '530217414', cardName: '9999一卡通', userName: '陈茶娟（阿慧）', actualPrice: 9999, status: 'active', purchaseTime: '2026-03-14 21:12:24', expireTime: '2028-12-31 20:23:44' },
  { id: '182120175', cardName: '元心艾', userName: '陈茶娟（阿慧）', actualPrice: 7960, status: 'active', purchaseTime: '2026-03-14 21:07:55', expireTime: '2028-03-04 20:23:44' },
  { id: '724120132', cardName: '2991创始会员卡', userName: '陈茶娟（阿慧）', actualPrice: 2991, status: 'active', purchaseTime: '2026-03-14 21:06:18', expireTime: '2028-11-27 20:23:44' },
  { id: '13492803', cardName: '2991创始会员卡', userName: '陈途', actualPrice: 2991, status: 'active', purchaseTime: '2026-03-14 21:01:27', expireTime: '2028-10-08 20:23:44' },
  { id: '552200333', cardName: '2991创始会员卡', userName: '释团梅', actualPrice: 2991, status: 'active', purchaseTime: '2026-03-14 20:46:36', expireTime: '2028-02-09 20:23:44' },
  { id: '381072020', cardName: '八戒享秀仪器', userName: '陈吉', actualPrice: 1980, status: 'active', purchaseTime: '2026-03-14 20:35:05', expireTime: '2028-11-22 20:23:44' },
];

const MOCK_CARD_USAGE_RECORDS: CardUsageRecord[] = [
  { id: 1, cardName: '元心卡', userName: '张女士', storeName: '心悦美容养生会所', projectName: '巨补水', usedTimes: 1, consumedTimes: 1, usageTime: '2026-03-25 10:30:00', operationPermission: '李美容师', orderTime: '2026-03-20 14:20:00' },
  { id: 2, cardName: '八级享充次感', userName: '王女士', storeName: '凤仪阁美容养生会所', projectName: '八戒享秀仪器', usedTimes: 2, consumedTimes: 2, usageTime: '2026-03-24 15:20:00', operationPermission: '陈美容师', orderTime: '2026-03-18 09:15:00' },
  { id: 3, cardName: '赛玛', userName: '赵女士', storeName: '凤仪阁美容养生会所', projectName: '能量屋', usedTimes: 1, consumedTimes: 1, usageTime: '2026-03-24 11:00:00', operationPermission: '刘美容师', orderTime: '2026-03-15 16:30:00' },
  { id: 4, cardName: '元心艾', userName: '李女士', storeName: '凤仪阁美容养生会所', projectName: '膏方灸', usedTimes: 3, consumedTimes: 3, usageTime: '2026-03-23 14:45:00', operationPermission: '张美容师', orderTime: '2026-03-10 10:20:00' },
  { id: 5, cardName: '能量层', userName: '孙女士', storeName: '凤仪阁美容养生会所', projectName: '能量屋', usedTimes: 1, consumedTimes: 1, usageTime: '2026-03-23 09:30:00', operationPermission: '王美容师', orderTime: '2026-03-12 11:40:00' },
  { id: 6, cardName: '泡澡', userName: '周女士', storeName: '凤仪阁美容养生会所', projectName: '泡澡', usedTimes: 5, consumedTimes: 5, usageTime: '2026-03-22 16:15:00', operationPermission: '赵美容师', orderTime: '2026-03-08 13:50:00' },
  { id: 7, cardName: '桃花頸', userName: '吴女士', storeName: '凤仪阁美容养生会所', projectName: '古方灸', usedTimes: 2, consumedTimes: 2, usageTime: '2026-03-22 10:20:00', operationPermission: '李美容师', orderTime: '2026-03-05 15:10:00' },
  { id: 8, cardName: '桃花面', userName: '郑女士', storeName: '凤仪阁美容养生会所', projectName: '巨补水', usedTimes: 1, consumedTimes: 1, usageTime: '2026-03-21 13:40:00', operationPermission: '陈美容师', orderTime: '2026-03-03 09:25:00' },
  { id: 9, cardName: '古方泽（40次）', userName: '刘女士', storeName: '凤仪阁美容养生会所', projectName: '古方灸', usedTimes: 8, consumedTimes: 8, usageTime: '2026-03-21 11:10:00', operationPermission: '刘美容师', orderTime: '2026-03-01 14:35:00' },
  { id: 10, cardName: '古方泽（10次）', userName: '陈女士', storeName: '凤仪阁美容养生会所', projectName: '古方灸', usedTimes: 3, consumedTimes: 3, usageTime: '2026-03-20 15:50:00', operationPermission: '张美容师', orderTime: '2026-02-28 10:45:00' },
];

export async function mockGetCardOrdersPaginated(params: PaginationParams & { userName?: string; cardName?: string }): Promise<PaginatedResponse<CardOrder>> {
  let result = [...MOCK_CARD_ORDERS];
  if (params.userName) {
    result = result.filter((o) => o.userName.includes(params.userName!));
  }
  if (params.cardName) {
    result = result.filter((o) => o.cardName.includes(params.cardName!));
  }
  const total = result.length;
  const start = (params.page - 1) * params.pageSize;
  const data = result.slice(start, start + params.pageSize);
  return { data, total, page: params.page, pageSize: params.pageSize };
}

export async function mockGetCardUsageRecordsPaginated(params: PaginationParams & { cardName?: string; userName?: string }): Promise<PaginatedResponse<CardUsageRecord>> {
  let result = [...MOCK_CARD_USAGE_RECORDS];
  if (params.cardName) {
    result = result.filter((r) => r.cardName.includes(params.cardName!));
  }
  if (params.userName) {
    result = result.filter((r) => r.userName.includes(params.userName!));
  }
  const total = result.length;
  const start = (params.page - 1) * params.pageSize;
  const data = result.slice(start, start + params.pageSize);
  return { data, total, page: params.page, pageSize: params.pageSize };
}
