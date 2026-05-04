export interface Customer {
  id: number;
  name: string;
  phone: string;
  gender: '男' | '女';
  age?: number;
  memberLevel: string;
  totalSpent: number;
  visitCount: number;
  lastVisitDate: string;
  tags: string[];
  source: string;
  storeName: string;
  createdAt: string;
  // Extended fields
  email?: string;
  landline?: string;
  wechat?: string;
  maritalStatus?: '未知' | '已婚' | '未婚';
  birthday?: string;
  height?: number;
  weight?: number;
  occupation?: string;
  workplace?: string;
  address?: string;
  hasAllergy?: '无' | '有';
  hasSurgery?: '无' | '有';
  skinCondition?: string;
  remark?: string;
}

export interface CustomerTag {
  id: number;
  name: string;
  color: string;
}
