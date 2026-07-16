import type { BrainCapabilityCard } from '../capability/brain-capability.types.js';
import type { BrainRequestContext } from '../context/brain-request-context.js';
import { BrainRoleContextBuilderService } from './brain-role-context-builder.service.js';

const context = (overrides: Partial<BrainRequestContext> = {}): BrainRequestContext => ({
  userId: 9,
  storeId: 6,
  visibleStoreIds: [6],
  roles: ['receptionist'],
  permissions: ['core:brain:use', 'core:store:reservations'],
  deniedPermissions: [],
  requestId: 'role-context-test',
  timezone: 'Asia/Shanghai',
  ...overrides,
});

const capability = (key: string, permissions: string[] = []): BrainCapabilityCard => ({
  key,
  version: 1,
  name: key,
  description: key,
  domains: ['front_desk'],
  intents: ['query'],
  inputSchema: {},
  outputSchema: {},
  requiredPermissions: permissions,
  allowedRoles: [],
  readOnly: true,
  sideEffect: false,
  riskLevel: 'low',
  requiresConfirmation: false,
  idempotency: 'not_applicable',
  timeoutMs: 1000,
  grounding: 'domain_service',
  examples: [],
  sourceFingerprint: 'a'.repeat(64),
  definitionRefs: [],
  synonyms: [],
  negativeExamples: [],
  successSchema: {},
});

describe('BrainRoleContextBuilderService', () => {
  it('uses the authenticated role profile while keeping roleHint expression-only', async () => {
    const profiles = {
      getRuntimeProfile: jest.fn().mockResolvedValue({
        roleKey: 'receptionist',
        name: '前台',
        version: 3,
        systemPrompt: '负责前台接待，不得越权。',
        allowedSkills: ['reservation_list'],
        dataScopeRules: { storeScope: 'current_user_visible_stores' },
        knowledgePack: { domains: ['front_desk'] },
      }),
    };
    const service = new BrainRoleContextBuilderService(profiles as never);

    const result = await service.build({ context: context(), roleHint: 'finance' });

    expect(profiles.getRuntimeProfile).toHaveBeenCalledWith('receptionist');
    expect(result).toMatchObject({
      role: 'receptionist',
      expressionRole: 'finance',
      source: 'authenticated_role',
      profileVersion: 3,
      allowedSkills: ['reservation_list'],
    });
  });

  it('filters candidates by the active profile and real request permissions without granting hinted permissions', async () => {
    const service = new BrainRoleContextBuilderService({
      getRuntimeProfile: jest.fn().mockResolvedValue({
        roleKey: 'finance',
        name: '财务',
        version: 1,
        systemPrompt: '财务视角',
        allowedSkills: ['finance_summary', 'refund_ranking'],
        dataScopeRules: {},
        knowledgePack: {},
      }),
    } as never);
    const roleContext = await service.build({
      context: context({ roles: [], permissions: ['core:brain:use'] }),
      roleHint: 'finance',
    });

    const filtered = service.filterCapabilities(
      roleContext,
      context({ roles: [], permissions: ['core:brain:use'] }),
      [capability('finance_summary'), capability('refund_ranking', ['core:finance:view']), capability('inventory_summary')],
    );

    expect(filtered.map((item) => item.key)).toEqual(['finance_summary']);
  });

  it('admits a verified generated capability by allowed role and real permissions without a manual skill whitelist', async () => {
    const service = new BrainRoleContextBuilderService({
      getRuntimeProfile: jest.fn().mockResolvedValue({
        roleKey: 'receptionist',
        name: '前台',
        version: 1,
        systemPrompt: '前台视角',
        allowedSkills: [],
        dataScopeRules: {},
        knowledgePack: {},
      }),
    } as never);
    const roleContext = await service.build({ context: context() });
    const generated = {
      ...capability('reservation_list', ['core:store:reservations']),
      generatedCapability: true,
      allowedRoles: ['receptionist'],
    };

    expect(service.filterCapabilities(roleContext, context(), [generated])).toEqual([generated]);
    expect(
      service.filterCapabilities(
        roleContext,
        context({ permissions: ['core:brain:use'] }),
        [generated],
      ),
    ).toEqual([]);
  });
});
