import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { InventoryController } from './inventory.controller.js';

describe('InventoryController purchase order store scope', () => {
  let inventoryService: {
    getPurchaseOrders: jest.Mock;
    createPurchaseOrder: jest.Mock;
    updatePurchaseOrderStatus: jest.Mock;
    submitPurchaseOrderForApproval: jest.Mock;
    receivePurchaseOrder: jest.Mock;
  };
  let controller: InventoryController;

  beforeEach(() => {
    inventoryService = {
      getPurchaseOrders: jest.fn(),
      createPurchaseOrder: jest.fn(),
      updatePurchaseOrderStatus: jest.fn(),
      submitPurchaseOrderForApproval: jest.fn(),
      receivePurchaseOrder: jest.fn(),
    };
    controller = new InventoryController(inventoryService as never);
  });

  it('requires X-Store-Id for purchase order reads', () => {
    expect(() => controller.getPurchaseOrders(1, 20, undefined, request([2]))).toThrow(BadRequestException);
    expect(inventoryService.getPurchaseOrders).not.toHaveBeenCalled();
  });

  it('rejects a purchase order store outside the authenticated user scope', () => {
    expect(() => controller.getPurchaseOrders(1, 20, '3', request([2]))).toThrow(ForbiddenException);
    expect(inventoryService.getPurchaseOrders).not.toHaveBeenCalled();
  });

  it('forwards the authenticated store scope to list, create, status and receipt operations', () => {
    const req = request([2], 9);

    controller.getPurchaseOrders(1, 20, '2', req);
    controller.createPurchaseOrder(
      { storeId: 99, supplier: '供应商A', items: [{ productId: 1 }] },
      req,
      '2',
      'purchase-request-1',
    );
    controller.updatePurchaseOrderStatus(70, { status: '已审核' }, req, '2');
    controller.submitPurchaseOrderForApproval(
      70,
      { expectedPurchaseOrderUpdatedAt: '2026-07-30T10:00:00.000Z' },
      req,
      '2',
      'purchase-submit-70',
    );
    controller.receivePurchaseOrder(70, { operatorId: 99, items: [{ sku: 'SKU-1', receivedQty: 1 }] }, req, '2');

    expect(inventoryService.getPurchaseOrders).toHaveBeenCalledWith(2, 1, 20);
    expect(inventoryService.createPurchaseOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        storeId: 2,
        source: 'admin',
        idempotencyKey: 'purchase-request-1',
      }),
    );
    expect(inventoryService.updatePurchaseOrderStatus).toHaveBeenCalledWith(70, 2, { status: '已审核' });
    expect(inventoryService.submitPurchaseOrderForApproval).toHaveBeenCalledWith(
      70,
      2,
      '2026-07-30T10:00:00.000Z',
      {
        capabilityKey: 'submit_purchase_order_for_approval',
        idempotencyKey: 'purchase-submit-70',
        mutationKind: 'state_transition',
        requestPayload: {
          purchaseOrderId: 70,
          expectedPurchaseOrderUpdatedAt: '2026-07-30T10:00:00.000Z',
        },
        actorId: 9,
      },
    );
    expect(inventoryService.receivePurchaseOrder).toHaveBeenCalledWith(
      70,
      2,
      expect.objectContaining({ operatorId: 9, items: [{ sku: 'SKU-1', receivedQty: 1 }] }),
    );
  });

  it('allows a wildcard administrator to select an explicit store', () => {
    controller.getPurchaseOrders(1, 20, '6', request([], 1, ['*']));

    expect(inventoryService.getPurchaseOrders).toHaveBeenCalledWith(6, 1, 20);
  });

  it('requires a frozen version and idempotency key before submitting a purchase order', () => {
    const req = request([2], 9);

    expect(() => controller.submitPurchaseOrderForApproval(70, {}, req, '2', 'submit-70')).toThrow(
      'expectedPurchaseOrderUpdatedAt is required',
    );
    expect(() =>
      controller.submitPurchaseOrderForApproval(
        70,
        { expectedPurchaseOrderUpdatedAt: '2026-07-30T10:00:00.000Z' },
        req,
        '2',
      ),
    ).toThrow('Idempotency-Key is required');
    expect(inventoryService.submitPurchaseOrderForApproval).not.toHaveBeenCalled();
  });
});

function request(stores: number[], userId = 9, permissions = ['core:inventory:purchase']) {
  return { user: { id: userId, stores, permissions } } as any;
}
