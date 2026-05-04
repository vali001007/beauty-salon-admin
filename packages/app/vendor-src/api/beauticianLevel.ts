import type { BeauticianLevel } from './mock/beauticianLevel';
import { mockGetBeauticianLevels, mockCreateBeauticianLevel, mockUpdateBeauticianLevel, mockDeleteBeauticianLevels } from './mock/beauticianLevel';
import { realGetBeauticianLevels, realCreateBeauticianLevel, realUpdateBeauticianLevel, realDeleteBeauticianLevels } from './real/beauticianLevel';

const isReal = import.meta.env.VITE_API_MODE === 'real';

export type { BeauticianLevel };

export const getBeauticianLevels: () => Promise<BeauticianLevel[]> =
  isReal ? realGetBeauticianLevels : mockGetBeauticianLevels;

export const createBeauticianLevel: (data: { name: string; status: '可用' | '停用' }) => Promise<BeauticianLevel> =
  isReal ? realCreateBeauticianLevel : mockCreateBeauticianLevel;

export const updateBeauticianLevel: (id: number, data: Partial<{ name: string; status: '可用' | '停用' }>) => Promise<BeauticianLevel> =
  isReal ? realUpdateBeauticianLevel : mockUpdateBeauticianLevel;

export const deleteBeauticianLevels: (ids: number[]) => Promise<void> =
  isReal ? realDeleteBeauticianLevels : mockDeleteBeauticianLevels;
