import type { BeauticianLevel } from './domain-types';
import { realGetBeauticianLevels, realCreateBeauticianLevel, realUpdateBeauticianLevel, realDeleteBeauticianLevels } from './real/beauticianLevel';

export type { BeauticianLevel };

export const getBeauticianLevels: () => Promise<BeauticianLevel[]> =
  realGetBeauticianLevels;

export const createBeauticianLevel: (data: { name: string; status: '可用' | '停用' }) => Promise<BeauticianLevel> =
  realCreateBeauticianLevel;

export const updateBeauticianLevel: (id: number, data: Partial<{ name: string; status: '可用' | '停用' }>) => Promise<BeauticianLevel> =
  realUpdateBeauticianLevel;

export const deleteBeauticianLevels: (ids: number[]) => Promise<void> =
  realDeleteBeauticianLevels;
