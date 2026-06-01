export interface Beautician {
  id: number;
  userId?: number;
  name: string;
  phone: string;
  level: string;
  specialties: string[];
  status: '在职' | '休假' | '离职';
  storeName: string;
  joinDate: string;
  createdAt: string;
}
