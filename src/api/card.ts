import type { Card } from '@/types/card';
import type { CardFormData } from '@/schemas/card';
import type { CreateCardOrderPayload } from './real/card';
import { realGetCards, realCreateCard, realUpdateCard, realDeleteCard, realCreateCardOrder, realCreateCardUsage } from './real/card';

export const getCards: () => Promise<Card[]> =
  realGetCards;

export const createCard: (data: CardFormData) => Promise<Card> =
  realCreateCard;

export const updateCard: (id: number, data: Partial<CardFormData>) => Promise<Card> =
  realUpdateCard;

export const deleteCard: (id: number) => Promise<void> =
  realDeleteCard;

export const createCardOrder: (data: CreateCardOrderPayload) => Promise<any> =
  realCreateCardOrder;

export const createCardUsage: (data: {
  cardOrderId?: string | number;
  customerCardId?: string | number;
  customerId?: number;
  cardName?: string;
  projectName: string;
  consumedTimes: number;
  operatorId?: number;
}) => Promise<any> = realCreateCardUsage;

import type { PaginatedResponse, PaginationParams } from '@/types/pagination';
import { realGetCardOrdersPaginated, realGetCardUsageRecordsPaginated } from './real/card';

export const getCardOrdersPaginated: (params: PaginationParams & { userName?: string; cardName?: string }) => Promise<PaginatedResponse<any>> =
  realGetCardOrdersPaginated;

export const getCardUsageRecordsPaginated: (
  params: PaginationParams & { cardName?: string; userName?: string; projectName?: string },
) => Promise<PaginatedResponse<any>> = realGetCardUsageRecordsPaginated;
