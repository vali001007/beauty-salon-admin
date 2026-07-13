import type {
  CreateSupplyCatalogMappingPayload,
  CreateProcurementOrderPayload,
  CreateProcurementOrdersFromReplenishmentPayload,
  CreateSupplierShipmentPayload,
  CreateSupplierQualificationPayload,
  CreateSupplyQuotePayload,
  CreateSupplySkuPayload,
  CreateSupplySupplierPayload,
  GetProcurementOrders,
  ProcurementOrder,
  ReceiveProcurementOrderPayload,
  SupplyCatalogMapping,
  SupplierShipment,
  SupplyQuote,
  SupplySettlement,
  SupplySku,
  SupplySupplier,
  UpdateSupplyCatalogMappingPayload,
} from '@/types/supplyPlatform';
import {
  realAuditSupplyQuote,
  realAuditSupplySku,
  realCreateSupplyCatalogMapping,
  realCreateProcurementOrder,
  realCreateProcurementOrdersFromReplenishment,
  realCreateSupplierQualification,
  realCreateSupplierShipment,
  realCreateSupplyQuote,
  realCreateSupplySku,
  realCreateSupplySupplier,
  realGenerateSupplySettlement,
  realGetProcurementOrder,
  realGetProcurementOrders,
  realGetSupplyCatalogMappings,
  realGetSupplyQuotes,
  realGetSupplySettlements,
  realGetSupplySkus,
  realGetSupplySuppliers,
  realReceiveProcurementOrder,
  realUpdateSupplyCatalogMapping,
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

export const getSupplyCatalogMappings: (params?: {
  page?: number;
  pageSize?: number;
  productId?: number;
  storeId?: number;
  supplySkuId?: number;
  standardProductTemplateId?: number;
  mappingStatus?: string;
  keyword?: string;
  purchasableStatus?: string;
}) => Promise<{ items: SupplyCatalogMapping[]; total: number; page: number; pageSize: number }> = realGetSupplyCatalogMappings;

export const createSupplyCatalogMapping: (data: CreateSupplyCatalogMappingPayload) => Promise<SupplyCatalogMapping> =
  realCreateSupplyCatalogMapping;

export const updateSupplyCatalogMapping: (
  id: number,
  data: UpdateSupplyCatalogMappingPayload,
) => Promise<SupplyCatalogMapping> = realUpdateSupplyCatalogMapping;

export const getProcurementOrders: GetProcurementOrders = realGetProcurementOrders;

export const getProcurementOrder: (id: number) => Promise<ProcurementOrder> = realGetProcurementOrder;

export const createProcurementOrder: (data: CreateProcurementOrderPayload) => Promise<ProcurementOrder> =
  realCreateProcurementOrder;

export const createProcurementOrdersFromReplenishment: (
  data: CreateProcurementOrdersFromReplenishmentPayload,
) => Promise<ProcurementOrder[]> = realCreateProcurementOrdersFromReplenishment;

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
