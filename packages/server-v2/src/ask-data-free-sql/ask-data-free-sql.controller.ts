import { BadRequestException, Body, Controller, ForbiddenException, Get, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Permissions } from '../common/decorators/permissions.decorator.js';
import { PermissionsGuard } from '../common/guards/permissions.guard.js';
import { AskDataFreeSqlService } from './ask-data-free-sql.service.js';
import type { AskDataFreeSqlContext, AskDataFreeSqlRequest } from './ask-data-free-sql.types.js';

interface AuthenticatedAskDataFreeSqlRequest extends Request {
  user?: {
    id?: number;
    storeIds?: number[];
    stores?: number[];
    permissions?: string[];
    deniedPermissions?: string[];
  };
}

@ApiTags('AskData')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('ask-data')
export class AskDataFreeSqlController {
  constructor(private readonly service: AskDataFreeSqlService) {}

  @Post('free-sql')
  @Permissions('core:dashboard:view')
  @ApiOperation({ summary: '智能问数受控自由 SQL 查询' })
  query(@Req() req: AuthenticatedAskDataFreeSqlRequest, @Body() body: AskDataFreeSqlRequest) {
    return this.service.query(body, this.contextFromRequest(req));
  }

  @Get('free-sql/catalog')
  @Permissions('core:dashboard:view')
  @ApiOperation({ summary: '智能问数受控自由 SQL 目录' })
  getCatalog() {
    return this.service.getCatalog();
  }

  private contextFromRequest(req: AuthenticatedAskDataFreeSqlRequest): AskDataFreeSqlContext {
    const rawStoreId = req.headers['x-store-id'];
    const storeId = Number(Array.isArray(rawStoreId) ? rawStoreId[0] : rawStoreId);
    if (!Number.isInteger(storeId) || storeId <= 0) throw new BadRequestException('缺少有效的 X-Store-Id');
    // AuthService responses expose storeIds, while JwtStrategy currently puts
    // the same scoped ids on request.user.stores. Support both without widening
    // the authorized set or changing the cross-store 403 boundary.
    const visibleStoreIds = req.user?.storeIds ?? req.user?.stores ?? [];
    if (!visibleStoreIds.includes(storeId)) throw new ForbiddenException(`store_scope_denied:${storeId}`);
    return {
      userId: Number(req.user?.id) || undefined,
      storeId,
      visibleStoreIds,
      permissions: req.user?.permissions ?? [],
      deniedPermissions: req.user?.deniedPermissions ?? [],
    };
  }
}
