export interface Card {
  id: number;
  name: string;
  type: string;
  totalTimes: number;
  price: number;
  validDays: number;
  storeId?: number;
  storeName: string;
  status: '上架' | '下架';
  sortOrder?: number;
  createdAt: string;
  projects: CardProject[];
}

export interface CardProject {
  projectName: string;
  timesPerCard: number;
}
