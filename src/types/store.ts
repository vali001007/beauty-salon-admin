export interface Store {
  id: number;
  name: string;
  city?: string;
  address: string;
  phone?: string;
  status?: string;
  shiftRequired?: boolean;
  skuCount: number;
  totalValue: number;
  healthScore: number;
  mode: '集中' | '独立';
}

export interface Beautician {
  id: number;
  name: string;
  phone: string;
  level: string;
  specialties: string[];
  status: '在职' | '休假' | '离职';
  storeName: string;
  joinDate: string;
}

export interface BeauticianLevel {
  id: number;
  name: string;
  minScore: number;
  maxScore: number;
  commission: number;
  description: string;
}

export interface Schedule {
  beauticianId: number;
  beauticianName: string;
  date: string;
  slots: ScheduleSlot[];
}

export interface ScheduleReservationInfo {
  id: number;
  status?: string;
  customerId?: number;
  customerName?: string;
  customerPhone?: string;
  projectId?: number;
  projectName?: string;
  projectDuration?: number;
  remark?: string;
  startTime?: string;
  endTime?: string;
}

export interface ScheduleSlot {
  time: string;
  period: '上午' | '下午';
  available: boolean;
  status?: 'free' | 'available' | 'booked' | 'expired' | 'leave' | string;
  reservationInfo?: ScheduleReservationInfo;
}
