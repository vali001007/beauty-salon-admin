import type { Card } from '@/types/card';
import type { CardFormData } from '@/schemas/card';
import { mockGetCards, mockCreateCard, mockUpdateCard } from './mock/card';
import { realGetCards, realCreateCard, realUpdateCard } from './real/card';

const isReal = import.meta.env.VITE_API_MODE === 'real';

export const getCards: () => Promise<Card[]> =
  isReal ? realGetCards : mockGetCards;

export const createCard: (data: CardFormData) => Promise<Card> =
  isReal ? realCreateCard : mockCreateCard;

export const updateCard: (id: number, data: Partial<CardFormData>) => Promise<Card> =
  isReal ? realUpdateCard : mockUpdateCard;

import type { PaginatedResponse, PaginationParams } from '@/types/pagination';
import { mockGetCardOrdersPaginated, mockGetCardUsageRecordsPaginated } from './mock/card';
import { realGetCardOrdersPaginated, realGetCardUsageRecordsPaginated } from './real/card';

export const getCardOrdersPaginated: (params: PaginationParams & { userName?: string; cardName?: string }) => Promise<PaginatedResponse<any>> =
  isReal ? realGetCardOrdersPaginated : mockGetCardOrdersPaginated;

export const getCardUsageRecordsPaginated: (params: PaginationParams & { cardName?: string; userName?: string }) => Promise<PaginatedResponse<any>> =
  isReal ? realGetCardUsageRecordsPaginated : mockGetCardUsageRecordsPaginated;
