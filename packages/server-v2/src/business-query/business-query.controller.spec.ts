import { BusinessQueryController } from './business-query.controller.js';

describe('BusinessQueryController', () => {
  let service: jest.Mocked<any>;
  let prisma: jest.Mocked<any>;
  let controller: BusinessQueryController;

  beforeEach(() => {
    service = {
      capabilities: jest.fn(),
      ask: jest.fn().mockResolvedValue({ status: 'success' }),
    };
    prisma = {
      user: {
        findFirst: jest.fn(),
      },
    };
    controller = new BusinessQueryController(service, prisma as any);
  });

  it('uses selected terminal operator for business query after validating role', async () => {
    prisma.user.findFirst.mockResolvedValue({
      id: 31,
      status: 'active',
      deletedAt: null,
      stores: [{ storeId: 1 }],
      roles: [
        {
          role: {
            key: 'beautician',
            permissions: ['terminal:service:view'],
          },
        },
      ],
    });

    await controller.ask(1, 7, {
      question: '我的表现怎么样',
      role: 'beautician',
      operatorId: 31,
    });

    expect(service.ask).toHaveBeenCalledWith({
      question: '我的表现怎么样',
      role: 'beautician',
      storeId: 1,
      operatorId: 31,
      context: undefined,
    });
  });

  it('rejects selected operator when role does not match', async () => {
    prisma.user.findFirst.mockResolvedValue({
      id: 12,
      status: 'active',
      deletedAt: null,
      stores: [{ storeId: 1 }],
      roles: [
        {
          role: {
            key: 'frontdesk',
            permissions: ['aura:reception:view'],
          },
        },
      ],
    });

    await expect(
      controller.ask(1, 7, {
        question: '财务毛利怎么看',
        role: 'manager',
        operatorId: 12,
      }),
    ).rejects.toThrow('当前选择账号不能使用该终端角色');
    expect(service.ask).not.toHaveBeenCalled();
  });
});
