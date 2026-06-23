import type {
  CreateProcurementOrderPayload,
  CreateSupplierShipmentPayload,
  CreateSupplierQualificationPayload,
  CreateSupplyQuotePayload,
  CreateSupplySkuPayload,
  CreateSupplySupplierPayload,
  GetProcurementOrders,
  ProcurementOrder,
  ReceiveProcurementOrderPayload,
  SupplierShipment,
  SupplyQuote,
  SupplySettlement,
  SupplySku,
  SupplySupplier,
} from '@/types/supplyPlatform';
import {
  realAuditSupplyQuote,
  realAuditSupplySku,
  realCreateProcurementOrder,
  realCreateSupplierQualification,
  realCreateSupplierShipment,
  realCreateSupplyQuote,
  realCreateSupplySku,
  realCreateSupplySupplier,
  realGenerateSupplySettlement,
  realGetProcurementOrder,
  realGetProcurementOrders,
  realGetSupplyQuotes,
  realGetSupplySettlements,
  realGetSupplySkus,
  realGetSupplySuppliers,
  realReceiveProcurementOrder,
  realUpdateProcurementOrderStatus,
  realUpdateSupplySupplierStatus,
} from './real/supplyPlatform';

export const getSupplySuppliers: (params?: {
  page?: number;
  pageSize?: number;
  keyword?: string;
  status?: string;
}) => Promise<{ items: SupplySupplier[]; total: number; page: number; pageSize: number }> = realGetSupplySuppliers;

export const createSupplySupplier: (data: CreateSupplySupplierPayload) => Promise<SupplySupplier> = realCreateSupplySupplier;

export const updateSupplySupplierStatus: (
  id: number,
  data: { status: string; qualificationStatus?: string },
) => Promise<SupplySupplier> = realUpdateSupplySupplierStatus;

export const createSupplierQualification: (data: CreateSupplierQualificationPayload) => Promise<unknown> =
  realCreateSupplierQualification;

export const getSupplySkus: (params?: {
  page?: number;
  pageSize?: number;
  supplierId?: number;
  keyword?: string;
  status?: string;
  auditStatus?: string;
}) => Promise<{ items: SupplySku[]; total: number; page: number; pageSize: number }> = realGetSupplySkus;

export const createSupplySku: (data: CreateSupplySkuPayload) => Promise<SupplySku> = realCreateSupplySku;

export const auditSupplySku: (
  id: number,
  data: { auditStatus: string; status?: string; rejectReason?: string },
) => Promise<SupplySku> = realAuditSupplySku;

export const getSupplyQuotes: (params: {
  page?: number;
  pageSize?: number;
  supplySkuId?: number;
  supplierId?: number;
  storeId?: number;
  status?: string;
  auditStatus?: string;
  availableOnly?: boolean;
}) => Promise<{ items: SupplyQuote[]; total: number; page: number; pageSize: number }> = realGetSupplyQuotes;

export const createSupplyQuote: (data: CreateSupplyQuotePayload) => Promise<SupplyQuote> = realCreateSupplyQuote;

export const auditSupplyQuote: (
  id: number,
  data: { auditStatus: string; status?: string; rejectReason?: string },
) => Promise<SupplyQuote> = realAuditSupplyQuote;

export const getProcurementOrders: GetProcurementOrders = realGetProcurementOrders;

export const getProcurementOrder: (id: number) => Promise<ProcurementOrder> = realGetProcurementOrder;

export const createProcurementOrder: (data: CreateProcurementOrderPayload) => Promise<ProcurementOrder> =
  realCreateProcurementOrder;

export const updateProcurementOrderStatus: (id: number, status: string) => Promise<ProcurementOrder> =
  realUpdateProcurementOrderStatus;

export const createSupplierShipment: (id: number, data: CreateSupplierShipmentPayload) => Promise<SupplierShipment> =
  realCreateSupplierShipment;

export const receiveProcurementOrder: (id: number, data: ReceiveProcurementOrderPayload) => Promise<ProcurementOrder> =
  realReceiveProcurementOrder;

export const getSupplySettlements: (params?: {
  page?: number;
  pageSize?: number;
  supplierId?: number;
  status?: string;
}) => Promise<{ items: SupplySettlement[]; total: number; page: number; pageSize: number }> = realGetSupplySettlements;

export const generateSupplySettlement: (data: { settleMonth: string; supplierId?: number }) => Promise<SupplySettlement> =
  realGenerateSupplySettlement;
