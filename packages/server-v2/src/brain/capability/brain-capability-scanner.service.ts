import { Injectable } from '@nestjs/common';
import { fingerprint } from './brain-capability-fingerprint.js';
import { scanBrainCapabilitySources } from './brain-capability-source-adapters.js';
import type {
  BrainCapabilityCandidate,
  BrainCapabilityDecoratorMetadata,
  BrainCapabilityScanIssue,
  BrainCapabilityScanReport,
  BrainCapabilitySourceEvidence,
  BrainCapabilityStoreScope,
} from './brain-capability-scan.types.js';

interface CapabilityAnchor {
  key: string;
  name: string;
  routePaths: string[];
  sourceSymbols: string[];
  prismaSymbols: string[];
  permissionHints: string[];
}

const SOURCE_ANCHORS: CapabilityAnchor[] = [
  {
    key: 'product_sales_ranking',
    name: '商品销售排行',
    routePaths: ['/orders/products'],
    sourceSymbols: [
      'OrdersController.findProductOrdersPaginated',
      'OrdersService.findProductOrders',
      'SemanticQueryExecutorService.queryProductSales',
      'getProductOrdersPaginated',
      'realGetProductOrdersPaginated',
    ],
    prismaSymbols: [
      'ProductOrder.id',
      'ProductOrder.storeId',
      'ProductOrder.status',
      'ProductOrder.paidAt',
      'ProductOrder.completedAt',
      'ProductOrder.orderItems',
      'OrderItem.productId',
      'OrderItem.quantity',
      'OrderItem.netAmount',
      'OrderItem.product',
      'Product.id',
      'Product.name',
    ],
    permissionHints: ['core:order:products'],
  },
  {
    key: 'reservation_list',
    name: '预约列表',
    routePaths: ['/stores/reservations'],
    sourceSymbols: [
      'ReservationsController.findPaginated',
      'ReservationsService.findPaginated',
      'getReservationsPaginated',
      'realGetReservationsPaginated',
    ],
    prismaSymbols: [
      'Reservation.id',
      'Reservation.storeId',
      'Reservation.customerId',
      'Reservation.projectId',
      'Reservation.beauticianId',
      'Reservation.status',
      'Reservation.reservationDate',
      'Reservation.startTime',
      'Store.id',
      'Store.name',
      'Customer.id',
      'Customer.name',
      'Project.id',
      'Project.name',
      'Beautician.id',
      'Beautician.name',
    ],
    permissionHints: ['core:store:reservations'],
  },
  {
    key: 'inventory_risk',
    name: '库存风险',
    routePaths: ['/inventory/stock', '/inventory/expiry'],
    sourceSymbols: [
      'InventoryController.getStock',
      'InventoryController.getExpiring',
      'InventoryService.getStock',
      'InventoryService.getExpiring',
      'getStockItems',
      'realGetStockItems',
      'getExpiringProducts',
      'realGetExpiringProducts',
    ],
    prismaSymbols: [
      'Product.id',
      'Product.name',
      'Product.storeId',
      'Product.currentStock',
      'Product.safetyStock',
      'Product.expiryDate',
      'StockBatch.id',
      'StockBatch.productId',
      'StockBatch.expiryDate',
      'StockBatch.remainingQuantity',
      'StockMovement.id',
      'StockMovement.productId',
      'StockMovement.quantity',
      'StockMovement.movementType',
    ],
    permissionHints: ['core:inventory:stock'],
  },
  {
    key: 'customer_facts',
    name: '客户事实',
    routePaths: ['/customers/data', '/customers/profile'],
    sourceSymbols: [
      'CustomersController.findPaginated',
      'CustomersController.getCustomerProfile',
      'CustomersController.list',
      'CustomersService.findPaginated',
      'CustomersService.list',
      'CustomerProfileService.getCustomerProfile',
      'getCustomersPaginated',
      'realGetCustomersPaginated',
      'getCustomers',
      'realGetCustomers',
      'getCustomerProfile',
      'realGetCustomerProfile',
    ],
    prismaSymbols: [
      'Customer.id',
      'Customer.storeId',
      'Customer.store',
      'Customer.name',
      'Customer.memberLevel',
      'Customer.totalSpent',
      'Customer.visitCount',
      'Customer.lastVisitDate',
      'Customer.healthProfile',
      'Customer.consumptionRecords',
      'Customer.predictionSnapshots',
      'Customer.touches',
      'CustomerLevel.vip',
    ],
    permissionHints: ['core:customer:view'],
  },
];

export interface BrainCapabilityScanOptions {
  workspaceRoot: string;
  includeUnmarkedApis?: boolean;
  explicitOnly?: boolean;
  generatedAt?: Date;
}

@Injectable()
export class BrainCapabilityScannerService {
  async scan(options: BrainCapabilityScanOptions): Promise<BrainCapabilityScanReport> {
    const sources = await scanBrainCapabilitySources(options.workspaceRoot);
    const parserEvidence = sources.evidence.filter((item) => item.sourceType === 'parser');
    const candidates = new Map<string, BrainCapabilityCandidate>();

    if (!options.explicitOnly) {
      for (const anchor of SOURCE_ANCHORS) {
        candidates.set(
          anchor.key,
          this.buildCandidate({
            anchor,
            evidence: [...this.collectAnchorEvidence(anchor, sources.evidence), ...parserEvidence],
            requireAnchorEvidence: true,
            registeredPermissions: sources.registeredPermissions,
            dtoContracts: sources.dtoContracts,
          }),
        );
      }
    }

    const decoratedExecutors = sources.evidence.filter(
      (item) => ['controller', 'service'].includes(item.sourceType) && this.capabilityMetadata(item),
    );
    for (const executor of decoratedExecutors) {
      const metadata = this.capabilityMetadata(executor)!;
      const anchor = SOURCE_ANCHORS.find((item) => item.key === metadata.key);
      const related = [
        ...(executor.sourceType === 'controller'
          ? this.collectControllerEvidence(executor, sources.evidence, anchor)
          : this.collectServiceEvidence(executor, sources.evidence)),
        ...parserEvidence,
      ];
      candidates.set(
        metadata.key,
        this.buildCandidate({
          anchor: anchor ?? this.anchorFromMetadata(metadata),
          metadata,
          controller: executor,
          evidence: related,
          registeredPermissions: sources.registeredPermissions,
          dtoContracts: sources.dtoContracts,
        }),
      );
    }

    if (!options.explicitOnly && options.includeUnmarkedApis !== false) {
      for (const controller of sources.evidence.filter(
        (item) => item.sourceType === 'controller' && !this.capabilityMetadata(item),
      )) {
        const key = this.unmarkedCapabilityKey(controller);
        if (candidates.has(key)) continue;
        candidates.set(
          key,
          this.buildCandidate({
            anchor: this.anchorFromController(key, controller),
            controller,
            evidence: [...this.collectControllerEvidence(controller, sources.evidence), ...parserEvidence],
            registeredPermissions: sources.registeredPermissions,
            dtoContracts: sources.dtoContracts,
          }),
        );
      }
    }

    const capabilities = [...candidates.values()].sort((left, right) => left.key.localeCompare(right.key));
    return {
      schemaVersion: 1,
      generatedAt: (options.generatedAt ?? new Date()).toISOString(),
      capabilities,
      summary: {
        total: capabilities.length,
        draft: capabilities.filter((item) => item.status === 'draft').length,
        blocked: capabilities.filter((item) => item.status === 'blocked').length,
        explicit: capabilities.filter((item) => item.explicit).length,
      },
    };
  }

  private buildCandidate(input: {
    anchor: CapabilityAnchor;
    metadata?: BrainCapabilityDecoratorMetadata;
    controller?: BrainCapabilitySourceEvidence;
    evidence: BrainCapabilitySourceEvidence[];
    requireAnchorEvidence?: boolean;
    registeredPermissions: Set<string>;
    dtoContracts: Map<string, Record<string, string>>;
  }): BrainCapabilityCandidate {
    const controllerData = input.controller?.data ?? {};
    const metadata = input.metadata;
    const primaryEvidence = input.evidence.filter((item) => item.data.transitiveDependency !== true);
    const writes =
      metadata?.readOnly === false ||
      primaryEvidence.some((item) => item.sourceType === 'service' && item.data.writes === true);
    const readOnly = metadata?.readOnly ?? !writes;
    const sideEffect = !readOnly || writes;
    const businessDefinitionKeys = uniqueSorted(metadata?.businessDefinitionKeys ?? []);
    const riskLevel = sideEffect ? 'high' : 'low';
    const permissions = uniqueSorted([
      ...(metadata?.permissions ?? []),
      ...asStringArray(controllerData.permissions),
      ...primaryEvidence.flatMap((item) => {
        const value = item.data.permission;
        return typeof value === 'string' ? [value] : [];
      }),
      ...(metadata ? [] : input.anchor.permissionHints.filter((item) => input.registeredPermissions.has(item))),
    ]);
    const storeScope = metadata?.storeScope ?? this.inferStoreScope(primaryEvidence);
    const requiresConfirmation =
      metadata?.requiresConfirmation ?? primaryEvidence.some((item) => item.sourceType === 'approval');
    const idempotency =
      metadata?.idempotency ??
      (primaryEvidence.some((item) => item.sourceType === 'idempotency')
        ? 'required'
        : sideEffect
          ? 'unknown'
          : 'not_applicable');
    const inputTypes = input.controller
      ? controllerData.inputTypes
      : primaryEvidence
          .filter((item) => item.sourceType === 'controller')
          .flatMap((item) => asStringArray(item.data.inputTypes));
    const returnTypes = uniqueSorted(
      input.controller
        ? [typeof controllerData.returnType === 'string' ? controllerData.returnType : 'unknown']
        : primaryEvidence
            .filter((item) => item.sourceType === 'controller')
            .map((item) => item.data.returnType)
            .filter((item): item is string => typeof item === 'string'),
    );
    const inputContract = this.resolveInputContract(inputTypes, input.dtoContracts);
    const outputContract = { return: returnTypes.join(' | ') || 'unknown' };
    const issues = this.validateCandidate({
      readOnly,
      sideEffect,
      permissions,
      storeScope,
      requiresConfirmation,
      idempotency,
      evidence: primaryEvidence,
      registeredPermissions: input.registeredPermissions,
      requireAnchorEvidence: input.requireAnchorEvidence,
    });
    const allowedRoles = uniqueSorted(metadata?.allowedRoles ?? []);
    const normalizedEvidence = [
      ...new Map(
        input.evidence.map(({ sourceType, symbol, data }) => {
          const fingerprintData = evidenceFingerprintData(data);
          return [
            `${sourceType}:${symbol}:${JSON.stringify(fingerprintData)}`,
            { sourceType, symbol, data: fingerprintData },
          ];
        }),
      ).values(),
    ].sort((left, right) =>
      `${left.sourceType}:${left.symbol}:${JSON.stringify(left.data)}`.localeCompare(
        `${right.sourceType}:${right.symbol}:${JSON.stringify(right.data)}`,
      ),
    );
    const executorClass = input.controller?.symbol.split('.')[0];
    const implementationDependencies = uniqueSorted([
      ...normalizedEvidence
        .filter((item) => item.sourceType === 'service')
        .map((item) => item.symbol.split('.')[0]!)
        .filter((className) => className && className !== executorClass),
      ...normalizedEvidence
        .filter((item) => item.sourceType === 'provider')
        .map((item) => `provider:${item.symbol}`),
    ]);
    const sourceFingerprint = fingerprint({
      key: input.anchor.key,
      metadata,
      businessDefinitionKeys,
      readOnly,
      sideEffect,
      riskLevel,
      storeScope,
      permissions,
      allowedRoles,
      requiresConfirmation,
      idempotency,
      inputContract,
      outputContract,
      implementationDependencies,
      evidence: normalizedEvidence,
    });

    return {
      key: input.anchor.key,
      name: input.anchor.name,
      businessDefinitionKeys,
      status: issues.length > 0 ? 'blocked' : 'draft',
      enabled: metadata?.enabled ?? false,
      explicit: Boolean(metadata),
      readOnly,
      sideEffect,
      riskLevel,
      storeScope,
      requiredPermissions: permissions,
      allowedRoles,
      requiresConfirmation,
      idempotency,
      inputContract,
      outputContract,
      sourceFingerprint,
      implementationDependencies,
      evidence: dedupeEvidence(primaryEvidence),
      issues,
      ...(metadata?.name && metadata.description && metadata.intents?.length && metadata.examples?.length && metadata.negativeExamples?.length
        ? {
            semanticHints: {
              name: metadata.name,
              description: metadata.description,
              intents: uniqueSorted(metadata.intents),
              examples: uniqueSorted(metadata.examples),
              negativeExamples: uniqueSorted(metadata.negativeExamples),
              synonyms: uniqueSorted(metadata.synonyms ?? []),
            },
          }
        : {}),
    };
  }

  private validateCandidate(input: {
    readOnly: boolean;
    sideEffect: boolean;
    permissions: string[];
    storeScope: BrainCapabilityStoreScope;
    requiresConfirmation: boolean;
    idempotency: BrainCapabilityCandidate['idempotency'];
    evidence: BrainCapabilitySourceEvidence[];
    registeredPermissions: Set<string>;
    requireAnchorEvidence?: boolean;
  }): BrainCapabilityScanIssue[] {
    const issues: BrainCapabilityScanIssue[] = [];
    if (input.readOnly && input.sideEffect) {
      issues.push({ code: 'read_only_write_conflict', message: 'Read-only metadata conflicts with write evidence.' });
    }
    if (input.sideEffect && input.permissions.length === 0) {
      issues.push({ code: 'missing_permission', message: 'Write capability has no effective permission.' });
    }
    for (const permission of input.permissions) {
      if (!input.registeredPermissions.has(permission)) {
        issues.push({ code: 'unregistered_permission', message: `Permission is not registered: ${permission}` });
      }
    }
    if (input.sideEffect && !['required', 'optional'].includes(input.storeScope)) {
      issues.push({ code: 'missing_store_scope', message: 'Write capability has no explicit store scope.' });
    }
    if (input.sideEffect && !input.requiresConfirmation) {
      issues.push({ code: 'missing_confirmation', message: 'Write capability requires confirmation evidence.' });
    }
    if (input.sideEffect && input.idempotency !== 'required') {
      issues.push({ code: 'missing_idempotency', message: 'Write capability requires idempotency evidence.' });
    }
    if (input.evidence.some((item) => containsUnconstrainedAny(item.data))) {
      issues.push({ code: 'unconstrained_contract', message: 'Source contract contains unconstrained any.' });
    }
    if (input.evidence.some((item) => item.sourceType === 'parser')) {
      issues.push({ code: 'parse_failure', message: 'One or more source files could not be parsed completely.' });
    }
    if (
      input.requireAnchorEvidence &&
      !input.evidence.some((item) => ['controller', 'service', 'real_facade', 'facade'].includes(item.sourceType))
    ) {
      issues.push({
        code: 'missing_anchor_evidence',
        message: 'Anchor has no primary controller, service or facade evidence.',
      });
    }
    return issues;
  }

  private collectAnchorEvidence(anchor: CapabilityAnchor, evidence: BrainCapabilitySourceEvidence[]) {
    const selected = evidence.filter((item) => {
      if (item.sourceType === 'permission') return anchor.permissionHints.includes(item.symbol);
      if (item.sourceType === 'prisma') return anchor.prismaSymbols.includes(item.symbol);
      const route = typeof item.data.path === 'string' ? item.data.path : undefined;
      if (route && anchor.routePaths.includes(route)) return true;
      return anchor.sourceSymbols.includes(item.symbol);
    });
    const inputTypes = selected
      .filter((item) => ['controller', 'service'].includes(item.sourceType))
      .flatMap((item) => asStringArray(item.data.inputTypes))
      .flatMap(extractTypeNames);
    for (const item of evidence) {
      if (item.sourceType === 'dto' && inputTypes.includes(item.symbol)) selected.push(item);
    }
    return dedupeEvidence(selected);
  }

  private collectControllerEvidence(
    controller: BrainCapabilitySourceEvidence,
    all: BrainCapabilitySourceEvidence[],
    anchor?: CapabilityAnchor,
  ) {
    const selected = new Set<BrainCapabilitySourceEvidence>([controller]);
    const inputTypes = asStringArray(controller.data.inputTypes).flatMap(extractTypeNames);
    const serviceBindings = asStringRecord(controller.data.serviceBindings);
    const serviceTargets = asStringArray(controller.data.serviceCalls).flatMap((item) => {
      const match = /^this\.(\w+)\.(\w+)$/.exec(item);
      if (!match) return [];
      const serviceType = serviceBindings[match[1]!];
      return serviceType ? [`${serviceType}.${match[2]}`] : [];
    });
    const serviceMethods =
      serviceTargets.length === 0
        ? asStringArray(controller.data.serviceCalls).map((item) => item.split('.').at(-1))
        : [];
    const permissions = asStringArray(controller.data.permissions);
    for (const item of all) {
      if (item.sourceType === 'decorator' && item.symbol === controller.symbol) selected.add(item);
      if (item.sourceType === 'dto' && inputTypes.includes(item.symbol)) selected.add(item);
      if (
        item.sourceType === 'service' &&
        (serviceTargets.includes(item.symbol) || serviceMethods.some((method) => item.symbol.endsWith(`.${method}`)))
      ) {
        selected.add(item);
      }
      if (item.sourceType === 'permission' && permissions.includes(item.symbol)) selected.add(item);
    }
    if (anchor) {
      for (const item of this.collectAnchorEvidence(anchor, all)) {
        if (!['controller', 'service', 'decorator'].includes(item.sourceType)) selected.add(item);
      }
    }
    return dedupeEvidence([...selected]);
  }

  private collectServiceEvidence(
    service: BrainCapabilitySourceEvidence,
    all: BrainCapabilitySourceEvidence[],
    anchor?: CapabilityAnchor,
  ) {
    const selected = new Map<string, BrainCapabilitySourceEvidence>();
    const queue: BrainCapabilitySourceEvidence[] = [];
    const serviceEvidence = all.filter((item) => item.sourceType === 'service');
    const serviceBySymbol = new Map(serviceEvidence.map((item) => [item.symbol, item]));
    const providersByToken = new Map<string, BrainCapabilitySourceEvidence[]>();
    for (const provider of all.filter((item) => item.sourceType === 'provider')) {
      const values = providersByToken.get(provider.symbol) ?? [];
      values.push(provider);
      providersByToken.set(provider.symbol, values);
    }
    const evidenceKey = (item: BrainCapabilitySourceEvidence) => `${item.sourceType}:${item.path}:${item.symbol}`;
    const addEvidence = (item: BrainCapabilitySourceEvidence, transitive: boolean) => {
      const key = evidenceKey(item);
      const existing = selected.get(key);
      if (existing && (!existing.data.transitiveDependency || transitive)) return;
      const value = transitive
        ? { ...item, data: { ...item.data, transitiveDependency: true } }
        : item;
      selected.set(key, value);
      if (item.sourceType === 'service') queue.push(value);
    };
    const addServiceMethod = (className: string, methodName: string, transitive: boolean) => {
      const target = serviceBySymbol.get(`${className}.${methodName}`);
      if (target) addEvidence(target, transitive);
    };

    addEvidence(service, false);
    while (queue.length) {
      const current = queue.shift()!;
      const transitive = current.data.transitiveDependency === true;
      const currentClass = current.symbol.split('.')[0]!;
      const inputTypes = asStringArray(current.data.inputTypes).flatMap(extractTypeNames);
      const metadata = this.capabilityMetadata(current);
      for (const item of all) {
        if (item.sourceType === 'decorator' && item.symbol === current.symbol) addEvidence(item, transitive);
        if (item.sourceType === 'dto' && inputTypes.includes(item.symbol)) addEvidence(item, transitive);
        if (item.sourceType === 'permission' && metadata?.permissions.includes(item.symbol)) addEvidence(item, transitive);
      }

      const serviceBindings = asStringRecord(current.data.serviceBindings);
      const injectionBindings = asStringRecord(current.data.injectionBindings);
      const semantics = current.data.methodSemantics;
      const propertyCalls = semantics && typeof semantics === 'object' && !Array.isArray(semantics)
        ? asStringArray((semantics as Record<string, unknown>).propertyCalls)
        : [];
      for (const call of propertyCalls) {
        const ownCall = /^this\.(\w+)$/.exec(call);
        if (ownCall) {
          addServiceMethod(currentClass, ownCall[1]!, transitive);
          continue;
        }
        const injectedCall = /^this\.(\w+)\.(\w+)$/.exec(call);
        if (!injectedCall) continue;
        const property = injectedCall[1]!;
        const methodName = injectedCall[2]!;
        for (const className of extractTypeNames(serviceBindings[property] ?? '')) {
          addServiceMethod(className, methodName, true);
        }
        const injectionToken = injectionBindings[property];
        if (!injectionToken) continue;
        for (const provider of providersByToken.get(injectionToken) ?? []) {
          addEvidence(provider, true);
          for (const className of asStringArray(provider.data.dependencies).flatMap(extractTypeNames)) {
            addServiceMethod(className, 'canHandle', true);
            addServiceMethod(className, 'execute', true);
          }
        }
      }
    }
    if (anchor) {
      for (const item of this.collectAnchorEvidence(anchor, all)) {
        if (!['controller', 'service', 'decorator'].includes(item.sourceType)) addEvidence(item, false);
      }
    }
    return dedupeEvidence([...selected.values()]);
  }

  private resolveInputContract(value: unknown, dtoContracts: Map<string, Record<string, string>>) {
    const contract: Record<string, string> = {};
    for (const typeName of asStringArray(value).flatMap(extractTypeNames)) {
      if (SERVER_INJECTED_CAPABILITY_TYPES.has(typeName)) continue;
      const dto = dtoContracts.get(typeName);
      if (dto) Object.assign(contract, dto);
      else contract[typeName] = 'referenced';
    }
    return contract;
  }

  private inferStoreScope(evidence: BrainCapabilitySourceEvidence[]): BrainCapabilityStoreScope {
    const serialized = JSON.stringify(evidence).toLowerCase();
    if (serialized.includes('storeid') || serialized.includes('x-store-id')) return 'required';
    return 'unknown';
  }

  private capabilityMetadata(evidence: BrainCapabilitySourceEvidence): BrainCapabilityDecoratorMetadata | undefined {
    const value = evidence.data.capability;
    return value && typeof value === 'object' ? (value as BrainCapabilityDecoratorMetadata) : undefined;
  }

  private anchorFromMetadata(metadata: BrainCapabilityDecoratorMetadata): CapabilityAnchor {
    return {
      key: metadata.key,
      name: metadata.name ?? metadata.key,
      routePaths: [],
      sourceSymbols: [],
      prismaSymbols: [],
      permissionHints: metadata.permissions,
    };
  }

  private anchorFromController(key: string, controller: BrainCapabilitySourceEvidence): CapabilityAnchor {
    return {
      key,
      name: controller.symbol,
      routePaths: [],
      sourceSymbols: [],
      prismaSymbols: [],
      permissionHints: [],
    };
  }

  private unmarkedCapabilityKey(controller: BrainCapabilitySourceEvidence): string {
    const [className, methodName] = controller.symbol.split('.');
    return `${toSnakeCase(className?.replace(/Controller$/, '') ?? 'api')}_${toSnakeCase(methodName ?? 'operation')}`;
  }
}

const SERVER_INJECTED_CAPABILITY_TYPES = new Set([
  'BrainCapabilityExecutionInput',
  'BrainRequestContext',
  'Request',
  'Response',
]);

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function asStringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  );
}

function extractTypeNames(value: string): string[] {
  return [...value.matchAll(/\b[A-Z][A-Za-z0-9]*\b/g)].map((item) => item[0]).filter((item) => item !== 'Promise');
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function dedupeEvidence(values: BrainCapabilitySourceEvidence[]): BrainCapabilitySourceEvidence[] {
  return [
    ...new Map(
      values.map((item) => [`${item.sourceType}:${item.path}:${item.symbol}:${JSON.stringify(item.data)}`, item]),
    ).values(),
  ].sort((left, right) =>
    `${left.sourceType}:${left.path}:${left.symbol}`.localeCompare(`${right.sourceType}:${right.path}:${right.symbol}`),
  );
}

function evidenceFingerprintData(data: Record<string, unknown>): Record<string, unknown> {
  const target = data.executorTarget;
  if (!target || typeof target !== 'object' || Array.isArray(target)) return data;
  const { sourcePath: _sourcePath, ...stableTarget } = target as Record<string, unknown>;
  return { ...data, executorTarget: stableTarget };
}

function toSnakeCase(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .toLowerCase();
}

function containsUnconstrainedAny(value: unknown): boolean {
  if (typeof value === 'string') return /\bany\b/.test(value);
  if (Array.isArray(value)) return value.some(containsUnconstrainedAny);
  if (value && typeof value === 'object') return Object.values(value).some(containsUnconstrainedAny);
  return false;
}
