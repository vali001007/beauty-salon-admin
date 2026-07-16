import { mkdtemp, mkdir, rename, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BrainCapabilityDriftService } from './brain-capability-drift.service.js';
import { escapeMarkdownCell, resolveWorkspacePath } from './brain-capability-cli.helpers.js';
import { BrainCapabilityScannerService } from './brain-capability-scanner.service.js';

describe('BrainCapabilityScannerService', () => {
  const writeFixture = async (root: string, path: string, content: string) => {
    const target = join(root, path);
    await mkdir(join(target, '..'), { recursive: true });
    await writeFile(target, content, 'utf8');
  };

  const createFixture = async (
    dtoExtra = '',
    methodPermission = 'core:customer:view',
    classPermission = 'core:customer:admin',
  ) => {
    const root = await mkdtemp(join(tmpdir(), 'ami-brain-capability-scan-'));
    await writeFixture(
      root,
      'packages/server-v2/src/customers/dto/customer-query.dto.ts',
      `export class CustomerQueryDto { storeId!: number; keyword?: string; ${dtoExtra} }`,
    );
    await writeFixture(
      root,
      'packages/server-v2/src/customers/customers.service.ts',
      `export class CustomersService {
        list(query: CustomerQueryDto) { return this.prisma.customer.findMany({ where: { storeId: query.storeId } }); }
        createTouch(body: CreateTouchDto) { return this.prisma.customerTouch.create({ data: body }); }
      }`,
    );
    await writeFixture(
      root,
      'packages/server-v2/src/unrelated/other.service.ts',
      `export class OtherService { list() { return this.prisma.auditLog.findMany(); } }`,
    );
    await writeFixture(
      root,
      'packages/server-v2/src/customers/customers.controller.ts',
      `
        @Controller('customers')
        ${classPermission ? `@Permissions('${classPermission}')` : ''}
        export class CustomersController {
          constructor(private readonly customers: CustomersService) {}

          @Get()
          @Permissions('${methodPermission}')
          @BrainCapability({
            key: 'customer_facts',
            businessDefinitionKeys: ['customer.entity'],
            readOnly: true,
            storeScope: 'required',
            permissions: ['${methodPermission}'],
            requiresConfirmation: false,
            idempotency: 'not_applicable'
          })
          list(@Query() query: CustomerQueryDto): Promise<Customer[]> {
            return this.customers.list(query);
          }

          @Post('touch')
          createTouch(@Body() body: CreateTouchDto) { return this.customers.createTouch(body); }
        }
      `,
    );
    await writeFixture(
      root,
      'src/app/routes.tsx',
      `export const routes = [{ path: '/customers/data', element: withGuard('${methodPermission}', CustomerData) }];`,
    );
    await writeFixture(
      root,
      'src/app/components/Layout.tsx',
      `export const MENU_ITEMS = [{ title: '客户数据', path: '/customers/data', permission: '${methodPermission}' }];`,
    );
    await writeFixture(
      root,
      'src/api/real/customer.ts',
      `export async function realGetCustomers(params: CustomerQueryDto): Promise<Customer[]> { return apiClient.get('/customers', { params }); }`,
    );
    await writeFixture(
      root,
      'src/api/customer.ts',
      `export const getCustomers: (params: CustomerQueryDto) => Promise<Customer[]> = realGetCustomers;`,
    );
    await writeFixture(
      root,
      'src/config/permissions.ts',
      `export const PERMISSION_CATALOG = [{ code: 'core:customer:view', type: 'menu' }, { code: 'core:customer:admin', type: 'operation' }];`,
    );
    await writeFixture(
      root,
      'packages/server-v2/prisma/schema.prisma',
      `
        enum CustomerLevel { normal vip }
        model Store { id Int @id customers Customer[] }
        model Customer {
          id Int @id
          storeId Int
          store Store @relation(fields: [storeId], references: [id])
          level CustomerLevel
        }
      `,
    );
    return root;
  };

  it('scans explicit metadata and applies method permissions as an override', async () => {
    const root = await createFixture();
    const report = await new BrainCapabilityScannerService().scan({ workspaceRoot: root });
    const candidate = report.capabilities.find((item) => item.key === 'customer_facts');

    expect(candidate).toMatchObject({
      status: 'draft',
      explicit: true,
      businessDefinitionKeys: ['customer.entity'],
      readOnly: true,
      storeScope: 'required',
      requiredPermissions: ['core:customer:view'],
    });
    expect(candidate?.requiredPermissions).not.toContain('core:customer:admin');
    expect(candidate?.evidence.some((item) => item.symbol === 'OtherService.list')).toBe(false);
    expect(candidate?.evidence.find((item) => item.sourceType === 'route')?.data).toMatchObject({
      permission: 'core:customer:view',
      component: 'CustomerData',
    });
    expect(candidate?.evidence.map((item) => item.sourceType)).toEqual(
      expect.arrayContaining([
        'controller',
        'dto',
        'service',
        'route',
        'menu',
        'real_facade',
        'facade',
        'permission',
        'prisma',
      ]),
    );
    expect(candidate?.evidence.every((item) => !item.path.includes(root))).toBe(true);
    expect(candidate?.evidence.find((item) => item.sourceType === 'controller')?.data.executorTarget).toMatchObject({
      kind: 'controller',
      className: 'CustomersController',
      methodName: 'list',
      sourcePath: 'packages/server-v2/src/customers/customers.controller.ts',
    });
  });

  it('scans an explicitly decorated read-only service method as a real internal executor contract', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ami-brain-capability-service-scan-'));
    await writeFixture(
      root,
      'packages/server-v2/src/brain/capability/product-ranking.dto.ts',
      `export class ProductRankingDto { limit?: number; question!: string; }`,
    );
    await writeFixture(
      root,
      'packages/server-v2/src/brain/capability/product-ranking.service.ts',
      `@Injectable()
       export class ProductRankingService {
         @BrainCapability({
           key: 'product_sales_ranking',
           businessDefinitionKeys: ['metric.product_sales_quantity'],
           readOnly: true,
           storeScope: 'required',
           permissions: ['core:order:products'],
           requiresConfirmation: false,
           idempotency: 'not_applicable'
         })
         execute(input: ProductRankingDto): Promise<ProductRankingResult> {
           return this.query(input);
         }
         private query(input: ProductRankingDto) { return this.prisma.orderItem.findMany({ take: input.limit }); }
       }`,
    );
    await writeFixture(
      root,
      'src/config/permissions.ts',
      `export const PERMISSION_CATALOG = [{ code: 'core:order:products', type: 'menu' }];`,
    );
    await writeFixture(root, 'packages/server-v2/prisma/schema.prisma', `model OrderItem { id Int @id quantity Int }`);

    const report = await new BrainCapabilityScannerService().scan({ workspaceRoot: root, explicitOnly: true });

    expect(report.summary).toMatchObject({ total: 1, explicit: 1, draft: 1, blocked: 0 });
    expect(report.capabilities[0]).toMatchObject({
      key: 'product_sales_ranking',
      businessDefinitionKeys: ['metric.product_sales_quantity'],
      inputContract: { limit: 'optional:number', question: 'required:string' },
      outputContract: { return: 'Promise<ProductRankingResult>' },
      requiredPermissions: ['core:order:products'],
      readOnly: true,
      storeScope: 'required',
    });
    expect(report.capabilities[0]?.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceType: 'service',
          symbol: 'ProductRankingService.execute',
          data: expect.objectContaining({
            executorTarget: expect.objectContaining({
              kind: 'service',
              className: 'ProductRankingService',
              methodName: 'execute',
              sourcePath: 'packages/server-v2/src/brain/capability/product-ranking.service.ts',
            }),
          }),
        }),
        expect.objectContaining({ sourceType: 'service', symbol: 'ProductRankingService.query' }),
        expect.objectContaining({ sourceType: 'decorator', symbol: 'ProductRankingService.execute' }),
        expect.objectContaining({ sourceType: 'dto', symbol: 'ProductRankingDto' }),
      ]),
    );
  });

  it('keeps an unmarked API as draft and blocks writes without governance controls', async () => {
    const root = await createFixture('', 'core:customer:view', '');
    const report = await new BrainCapabilityScannerService().scan({ workspaceRoot: root });
    const write = report.capabilities.find((item) => item.key === 'customers_create_touch');

    expect(write).toMatchObject({ explicit: false, status: 'blocked', readOnly: false, sideEffect: true });
    expect(write?.issues.map((item) => item.code)).toEqual(
      expect.arrayContaining([
        'missing_permission',
        'missing_store_scope',
        'missing_confirmation',
        'missing_idempotency',
      ]),
    );
  });

  it('includes unmarked APIs by default and supports explicit-only opt-out', async () => {
    const root = await createFixture();
    const scanner = new BrainCapabilityScannerService();
    const defaultReport = await scanner.scan({ workspaceRoot: root });
    const explicitOnly = await scanner.scan({ workspaceRoot: root, includeUnmarkedApis: false });

    expect(defaultReport.capabilities.some((item) => item.key === 'customers_create_touch')).toBe(true);
    expect(explicitOnly.capabilities.some((item) => item.key === 'customers_create_touch')).toBe(false);
  });

  it('explicit-only returns decorator candidates only and no hard-coded anchors', async () => {
    const root = await createFixture();
    const fixture = await new BrainCapabilityScannerService().scan({ workspaceRoot: root, explicitOnly: true });
    expect(fixture.capabilities).toHaveLength(1);
    expect(fixture.capabilities.every((item) => item.explicit)).toBe(true);

    const workspaceRoot = join(process.cwd(), '..', '..');
    const real = await new BrainCapabilityScannerService().scan({ workspaceRoot, explicitOnly: true });
    expect(real.capabilities).toHaveLength(18);
    expect(real.capabilities.every((item) => item.explicit)).toBe(true);
  }, 30_000);

  it('blocks hard-coded anchors when no primary source evidence exists', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ami-brain-empty-anchor-'));
    await writeFixture(root, 'src/config/permissions.ts', `export const PERMISSION_CATALOG = [];`);
    await writeFixture(root, 'packages/server-v2/prisma/schema.prisma', `model AuditLog { id Int @id }`);

    const report = await new BrainCapabilityScannerService().scan({ workspaceRoot: root, includeUnmarkedApis: false });
    expect(report.capabilities).toHaveLength(4);
    expect(report.capabilities.every((item) => item.status === 'blocked')).toBe(true);
    expect(
      report.capabilities.every((item) => item.issues.some((issue) => issue.code === 'missing_anchor_evidence')),
    ).toBe(true);
  });

  it('blocks read-only capabilities for any governance issue', async () => {
    const root = await createFixture('', 'core:customer:unregistered');
    const report = await new BrainCapabilityScannerService().scan({ workspaceRoot: root, includeUnmarkedApis: false });
    const candidate = report.capabilities.find((item) => item.key === 'customer_facts');

    expect(candidate?.readOnly).toBe(true);
    expect(candidate?.status).toBe('blocked');
    expect(candidate?.issues.map((item) => item.code)).toContain('unregistered_permission');
  });

  it('derives writes from bound service Prisma operations instead of HTTP verbs', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ami-brain-write-evidence-'));
    await writeFixture(
      root,
      'packages/server-v2/src/operations/query.dto.ts',
      `export class QueryDto { storeId!: number; }`,
    );
    await writeFixture(
      root,
      'packages/server-v2/src/operations/operations.service.ts',
      `export class OperationsService {
        query(input: QueryDto) { return this.prisma.customer.findMany({ where: { storeId: input.storeId } }); }
        mutate(input: QueryDto) { return this.prisma.customer.updateMany({ where: { storeId: input.storeId }, data: {} }); }
      }`,
    );
    await writeFixture(
      root,
      'packages/server-v2/src/operations/operations.controller.ts',
      `@Controller('operations') @Permissions('core:operation:view') export class OperationsController {
        constructor(private readonly operations: OperationsService) {}
        @Post('query') postQuery(@Body() input: QueryDto) { return this.operations.query(input); }
        @Get('mutate') getMutate(@Query() input: QueryDto) { return this.operations.mutate(input); }
      }`,
    );
    await writeFixture(
      root,
      'src/config/permissions.ts',
      `export const PERMISSION_CATALOG = [{ code: 'core:operation:view' }];`,
    );
    await writeFixture(root, 'packages/server-v2/prisma/schema.prisma', `model Customer { id Int @id storeId Int }`);

    const report = await new BrainCapabilityScannerService().scan({ workspaceRoot: root });
    expect(report.capabilities.find((item) => item.key === 'operations_post_query')).toMatchObject({
      readOnly: true,
      sideEffect: false,
      status: 'draft',
    });
    expect(report.capabilities.find((item) => item.key === 'operations_get_mutate')).toMatchObject({
      readOnly: false,
      sideEffect: true,
      status: 'blocked',
    });
  });

  it('detects nested Prisma writes through transaction callback aliases', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ami-brain-transaction-write-'));
    await writeFixture(
      root,
      'packages/server-v2/src/cards/cards.service.ts',
      `export class CardsService {
        verify(input: QueryDto) {
          return this.prisma.$transaction(async (tx) => {
            await tx.cardUsage.create({ data: input });
            return tx.customerCard.update({ where: { id: 1 }, data: {} });
          });
        }
        create(input: QueryDto) {
          return this.prisma.$transaction(async (database) => database.cardUsage.createMany({ data: [input] }));
        }
      }`,
    );
    await writeFixture(
      root,
      'packages/server-v2/src/cards/cards.controller.ts',
      `@Controller('cards') @Permissions('core:order:card-usage') export class CardsController {
        constructor(private readonly cards: CardsService) {}
        @Post('verify-usage') verifyUsage(@Body() input: QueryDto) { return this.cards.verify(input); }
        @Post('usage') createUsage(@Body() input: QueryDto) { return this.cards.create(input); }
      }`,
    );
    await writeFixture(
      root,
      'packages/server-v2/src/cards/query.dto.ts',
      `export class QueryDto { storeId!: number; }`,
    );
    await writeFixture(
      root,
      'src/config/permissions.ts',
      `export const PERMISSION_CATALOG = [{ code: 'core:order:card-usage' }];`,
    );
    await writeFixture(
      root,
      'packages/server-v2/prisma/schema.prisma',
      `model CardUsage { id Int @id } model CustomerCard { id Int @id }`,
    );

    const report = await new BrainCapabilityScannerService().scan({ workspaceRoot: root });
    for (const key of ['cards_verify_usage', 'cards_create_usage']) {
      expect(report.capabilities.find((item) => item.key === key)).toMatchObject({
        sideEffect: true,
        readOnly: false,
        status: 'blocked',
      });
    }
  });

  it('detects real card usage transaction writes', async () => {
    const workspaceRoot = join(process.cwd(), '..', '..');
    const report = await new BrainCapabilityScannerService().scan({ workspaceRoot });
    for (const key of ['cards_verify_usage', 'cards_create_usage']) {
      expect(report.capabilities.find((item) => item.key === key)).toMatchObject({ sideEffect: true, readOnly: false });
    }
  }, 30_000);

  it('includes Prisma fields, relations and enums in the candidate evidence', async () => {
    const root = await createFixture();
    const report = await new BrainCapabilityScannerService().scan({ workspaceRoot: root });
    const prisma = report.capabilities
      .find((item) => item.key === 'customer_facts')
      ?.evidence.filter((item) => item.sourceType === 'prisma');

    expect(prisma?.some((item) => item.symbol === 'Customer.store')).toBe(true);
    expect(prisma?.some((item) => item.symbol === 'CustomerLevel.vip')).toBe(true);
  });

  it('parses multiline Prisma relations, attributes and comments structurally', async () => {
    const root = await createFixture();
    await writeFixture(
      root,
      'packages/server-v2/prisma/schema.prisma',
      `/* schema comment */
       enum CustomerLevel {
         normal
         vip // inline comment
       }
       model Store { id Int @id customers Customer[] }
       model Customer {
         id Int @id
         storeId Int
         store Store @relation(
           fields: [storeId],
           references: [id]
         )
         level CustomerLevel
         @@index([storeId])
       }`,
    );
    const report = await new BrainCapabilityScannerService().scan({ workspaceRoot: root, includeUnmarkedApis: false });
    const relation = report.capabilities
      .find((item) => item.key === 'customer_facts')
      ?.evidence.find((item) => item.symbol === 'Customer.store');

    expect(relation?.data).toMatchObject({ relation: true, type: 'Store' });
    expect(String(relation?.data.attributes)).toContain('references:[id]');
  });

  it('keeps fingerprints stable across formatting, line and absolute-root changes', async () => {
    const firstRoot = await createFixture();
    const secondRoot = await createFixture();
    await writeFixture(
      secondRoot,
      'src/api/customer.ts',
      `\n\nexport const getCustomers:(params:CustomerQueryDto)=>Promise<Customer[]> = realGetCustomers;\n`,
    );

    const scanner = new BrainCapabilityScannerService();
    const first = await scanner.scan({ workspaceRoot: firstRoot });
    const second = await scanner.scan({ workspaceRoot: secondRoot });

    expect(first.capabilities.find((item) => item.key === 'customer_facts')?.sourceFingerprint).toBe(
      second.capabilities.find((item) => item.key === 'customer_facts')?.sourceFingerprint,
    );
  });

  it('keeps fingerprints stable when source files move', async () => {
    const firstRoot = await createFixture();
    const secondRoot = await createFixture();
    await mkdir(join(secondRoot, 'packages/server-v2/src/relocated'), { recursive: true });
    await rename(
      join(secondRoot, 'packages/server-v2/src/customers/customers.controller.ts'),
      join(secondRoot, 'packages/server-v2/src/relocated/customers.controller.ts'),
    );
    const scanner = new BrainCapabilityScannerService();
    const first = await scanner.scan({ workspaceRoot: firstRoot, includeUnmarkedApis: false });
    const second = await scanner.scan({ workspaceRoot: secondRoot, includeUnmarkedApis: false });

    expect(first.capabilities.find((item) => item.key === 'customer_facts')?.sourceFingerprint).toBe(
      second.capabilities.find((item) => item.key === 'customer_facts')?.sourceFingerprint,
    );
  });

  it('changes the source fingerprint when a bound DTO contract changes', async () => {
    const beforeRoot = await createFixture();
    const afterRoot = await createFixture('memberLevel?: string;');
    const scanner = new BrainCapabilityScannerService();
    const before = await scanner.scan({ workspaceRoot: beforeRoot });
    const after = await scanner.scan({ workspaceRoot: afterRoot });

    expect(after.capabilities.find((item) => item.key === 'customer_facts')?.sourceFingerprint).not.toBe(
      before.capabilities.find((item) => item.key === 'customer_facts')?.sourceFingerprint,
    );
    const drift = new BrainCapabilityDriftService().compare(after, before);
    expect(drift.items).toEqual(
      expect.arrayContaining([expect.objectContaining({ key: 'customer_facts', type: 'changed' })]),
    );
  });

  it('changes the source fingerprint when a bound Prisma store predicate is removed', async () => {
    const beforeRoot = await createFixture();
    const afterRoot = await createFixture();
    await writeFixture(
      afterRoot,
      'packages/server-v2/src/customers/customers.service.ts',
      `export class CustomersService {
        list(query: CustomerQueryDto) { return this.prisma.customer.findMany({}); }
        createTouch(body: CreateTouchDto) { return this.prisma.customerTouch.create({ data: body }); }
      }`,
    );
    const scanner = new BrainCapabilityScannerService();
    const before = await scanner.scan({ workspaceRoot: beforeRoot, explicitOnly: true });
    const after = await scanner.scan({ workspaceRoot: afterRoot, explicitOnly: true });

    expect(after.capabilities[0]?.sourceFingerprint).not.toBe(before.capabilities[0]?.sourceFingerprint);
  });

  it('keeps the method semantic fingerprint stable for comments and formatting only', async () => {
    const beforeRoot = await createFixture();
    const afterRoot = await createFixture();
    await writeFixture(
      afterRoot,
      'packages/server-v2/src/customers/customers.service.ts',
      `export class CustomersService {
        list(
          query: CustomerQueryDto,
        ) {
          // formatting-only change
          return this.prisma.customer.findMany(
            { where: { storeId: query.storeId } },
          );
        }
        createTouch(body: CreateTouchDto) { return this.prisma.customerTouch.create({ data: body }); }
      }`,
    );
    const scanner = new BrainCapabilityScannerService();
    const before = await scanner.scan({ workspaceRoot: beforeRoot, explicitOnly: true });
    const after = await scanner.scan({ workspaceRoot: afterRoot, explicitOnly: true });

    expect(after.capabilities[0]?.sourceFingerprint).toBe(before.capabilities[0]?.sourceFingerprint);
  });

  it('ignores unrelated same-domain APIs but drifts for a directly bound service change', async () => {
    const beforeRoot = await createFixture();
    const unrelatedRoot = await createFixture();
    await writeFixture(
      unrelatedRoot,
      'packages/server-v2/src/customers/customer-analytics.service.ts',
      `export class CustomerAnalyticsService { summary() { return this.prisma.customer.count(); } }`,
    );
    await writeFixture(
      unrelatedRoot,
      'packages/server-v2/src/customers/customer-analytics.controller.ts',
      `@Controller('customer-analytics') export class CustomerAnalyticsController {
        constructor(private readonly analytics: CustomerAnalyticsService) {}
        @Get() summary() { return this.analytics.summary(); }
      }`,
    );
    const directRoot = await createFixture();
    await writeFixture(
      directRoot,
      'packages/server-v2/src/customers/customers.service.ts',
      `export class CustomersService {
        list(query: CustomerQueryDto) { return this.prisma.customer.findFirst({ where: { storeId: query.storeId } }); }
        createTouch(body: CreateTouchDto) { return this.prisma.customerTouch.create({ data: body }); }
      }`,
    );
    const scanner = new BrainCapabilityScannerService();
    const before = await scanner.scan({ workspaceRoot: beforeRoot, includeUnmarkedApis: false });
    const unrelated = await scanner.scan({ workspaceRoot: unrelatedRoot, includeUnmarkedApis: false });
    const direct = await scanner.scan({ workspaceRoot: directRoot, includeUnmarkedApis: false });
    const getFingerprint = (report: Awaited<ReturnType<BrainCapabilityScannerService['scan']>>) =>
      report.capabilities.find((item) => item.key === 'customer_facts')?.sourceFingerprint;

    expect(getFingerprint(unrelated)).toBe(getFingerprint(before));
    expect(getFingerprint(direct)).not.toBe(getFingerprint(before));
  });

  it('blocks parse failures and fails strict against an empty baseline', async () => {
    const root = await createFixture();
    await writeFixture(
      root,
      'packages/server-v2/src/customers/broken.controller.ts',
      `@Controller('broken') export class BrokenController { @Get( broken(`,
    );
    const report = await new BrainCapabilityScannerService().scan({ workspaceRoot: root, includeUnmarkedApis: false });
    const candidate = report.capabilities.find((item) => item.key === 'customer_facts');
    const empty = { ...report, capabilities: [], summary: { total: 0, draft: 0, blocked: 0, explicit: 0 } };
    const drift = new BrainCapabilityDriftService().compare(report, empty);

    expect(candidate?.issues.map((item) => item.code)).toContain('parse_failure');
    expect(candidate?.status).toBe('blocked');
    expect(new BrainCapabilityDriftService().evaluateStrict(drift).passed).toBe(false);
  });

  it('resolves CLI paths from workspace root and escapes Markdown cells', () => {
    expect(resolveWorkspacePath('D:/workspace', 'reports/scan.json')).toBe(join('D:/workspace', 'reports/scan.json'));
    expect(escapeMarkdownCell('a|b\nc')).toBe('a\\|b<br>c');
  });

  it('marks permission narrowing as high-risk drift and fails strict evaluation', async () => {
    const beforeRoot = await createFixture('', 'core:customer:view');
    const afterRoot = await createFixture('', 'core:customer:profile');
    await writeFixture(
      afterRoot,
      'src/config/permissions.ts',
      `export const PERMISSION_CATALOG = [{ code: 'core:customer:profile', type: 'menu' }];`,
    );
    const scanner = new BrainCapabilityScannerService();
    const before = await scanner.scan({ workspaceRoot: beforeRoot });
    before.capabilities[0]!.enabled = true;
    const after = await scanner.scan({ workspaceRoot: afterRoot });
    const drift = new BrainCapabilityDriftService().compare(after, before);

    const customerDrift = drift.items.find((item) => item.key === 'customer_facts');
    expect(customerDrift).toMatchObject({ key: 'customer_facts', type: 'stale', highRisk: true });
    expect(customerDrift?.reasons).toContain('permission_narrowed_or_changed');
    expect(new BrainCapabilityDriftService().evaluateStrict(drift)).toMatchObject({ passed: false });
  });

  it('fails strict for a healthy added candidate against an empty baseline', async () => {
    const root = await createFixture();
    const current = await new BrainCapabilityScannerService().scan({ workspaceRoot: root, explicitOnly: true });
    expect(current.capabilities).toHaveLength(1);
    expect(current.capabilities[0]).toMatchObject({ status: 'draft', explicit: true });
    const empty = { ...current, capabilities: [], summary: { total: 0, draft: 0, blocked: 0, explicit: 0 } };
    const drift = new BrainCapabilityDriftService().compare(current, empty);

    expect(drift.items).toEqual([expect.objectContaining({ type: 'added', highRisk: false })]);
    expect(new BrainCapabilityDriftService().evaluateStrict(drift).passed).toBe(false);
  });

  it('discovers the four P12 source anchors in the current repository', async () => {
    const workspaceRoot = join(process.cwd(), '..', '..');
    const report = await new BrainCapabilityScannerService().scan({ workspaceRoot });
    const byKey = new Map(report.capabilities.map((item) => [item.key, item]));

    for (const key of ['product_sales_ranking', 'reservation_list', 'inventory_risk', 'customer_facts']) {
      expect(byKey.get(key)).toBeDefined();
      expect(byKey.get(key)?.evidence.length).toBeGreaterThan(3);
      expect(byKey.get(key)?.evidence.length).toBeLessThan(80);
      expect(byKey.get(key)?.issues.map((item) => item.code)).not.toContain('missing_anchor_evidence');
    }
    expect(byKey.get('product_sales_ranking')?.requiredPermissions).toContain('core:order:products');
    expect(byKey.get('reservation_list')?.requiredPermissions).toContain('core:store:reservations');
    expect(byKey.get('inventory_risk')?.requiredPermissions).toContain('core:inventory:stock');
    expect(byKey.get('customer_facts')?.requiredPermissions).toContain('core:customer:view');
  }, 30_000);

  it('discovers eighteen explicit production executors without legacy anchor contamination', async () => {
    const workspaceRoot = join(process.cwd(), '..', '..');
    const report = await new BrainCapabilityScannerService().scan({ workspaceRoot, explicitOnly: true });

    expect(report.summary).toEqual({ total: 18, draft: 18, blocked: 0, explicit: 18 });
    expect(report.capabilities.map((item) => item.key)).toEqual([
      'beautician_service_overview',
      'customer_facts',
      'customer_priority_recommendation',
      'finance_payment_breakdown',
      'finance_risk_overview',
      'front_desk_operations_overview',
      'inventory_operations_overview',
      'inventory_procurement_advice',
      'inventory_risk_ranking',
      'manager_staff_overview',
      'marketing_customer_segment',
      'marketing_growth_overview',
      'order_revenue_analysis',
      'product_sales_ranking',
      'project_service_ranking',
      'reservation_list',
      'staff_performance_ranking',
      'store_operations_overview',
    ]);
    expect(
      report.capabilities.every((item) => item.evidence.some((evidence) => evidence.sourceType === 'service')),
    ).toBe(true);
    expect(report.capabilities.every((item) => item.issues.length === 0)).toBe(true);
    expect(new Map(report.capabilities.map((item) => [item.key, item.allowedRoles])).get('beautician_service_overview')).toEqual(['beautician']);
    expect(new Map(report.capabilities.map((item) => [item.key, item.allowedRoles])).get('finance_payment_breakdown')).toEqual(['finance', 'store_manager']);
    expect(new Map(report.capabilities.map((item) => [item.key, item.allowedRoles])).get('store_operations_overview')).toEqual(['store_manager']);
  }, 30_000);
});
