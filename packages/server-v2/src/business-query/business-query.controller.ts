import { Body, Controller, ForbiddenException, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { BusinessQueryService } from './business-query.service.js';
import { BusinessQueryAskDto } from './dto/business-query.dto.js';
import { DeviceAuthGuard } from '../terminal/guards/device-auth.guard.js';
import { CurrentDevice } from '../terminal/decorators/current-device.decorator.js';
import type { BusinessQueryContext, BusinessQueryRole } from './business-query.types.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { resolveAuraAvailableRolesForUser } from '../terminal/terminal-role-access.js';

@ApiTags('Business Query')
@ApiBearerAuth()
@UseGuards(DeviceAuthGuard)
@Controller('business-query')
export class BusinessQueryController {
  constructor(
    private readonly businessQueryService: BusinessQueryService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('capabilities')
  @ApiOperation({ summary: '当前角色可用 AI 问数能力目录' })
  capabilities(@Query('role') role?: BusinessQueryRole) {
    return this.businessQueryService.capabilities(role);
  }

  @Post('ask')
  @ApiOperation({ summary: 'AI 问数一体化查询：解析、执行并返回证据化回答' })
  async ask(
    @CurrentDevice('storeId') storeId: number,
    @CurrentDevice('userId') operatorId: number | undefined,
    @Body() dto: BusinessQueryAskDto,
  ) {
    const actor = await this.resolveOperatorContext(storeId, operatorId, dto.operatorId, dto.role);
    return this.businessQueryService.ask({
      question: dto.question,
      role: actor.role,
      storeId,
      operatorId: actor.operatorId,
      context: dto.context as BusinessQueryContext | undefined,
    });
  }

  private async resolveOperatorContext(
    storeId: number,
    authenticatedUserId: number | undefined,
    requestedOperatorId?: number | null,
    requestedRole?: BusinessQueryRole,
  ): Promise<{ operatorId?: number; role?: BusinessQueryRole }> {
    const operatorId = Number(requestedOperatorId);
    if (!Number.isFinite(operatorId) || operatorId <= 0) {
      return { operatorId: authenticatedUserId, role: requestedRole };
    }

    const user = await this.prisma.user.findFirst({
      where: {
        id: operatorId,
        deletedAt: null,
        status: 'active',
        OR: [
          { stores: { some: { storeId } } },
          { roles: { some: { role: { key: { in: ['super_admin', 'store_manager'] } } } } },
        ],
      },
      include: { stores: true, roles: { include: { role: true } } },
    });
    if (!user) {
      throw new ForbiddenException('当前选择账号无权使用此门店终端。');
    }
    const roles = resolveAuraAvailableRolesForUser(user) as BusinessQueryRole[];
    const role = requestedRole ?? roles[0];
    if (role && !roles.includes(role)) {
      throw new ForbiddenException('当前选择账号不能使用该终端角色。');
    }
    return { operatorId, role };
  }
}
