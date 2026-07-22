import { BadRequestException, Body, Controller, ForbiddenException, Get, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Permissions } from '../common/decorators/permissions.decorator.js';
import { PermissionsGuard } from '../common/guards/permissions.guard.js';
import { AskDataService } from './ask-data.service.js';
import type { AskDataQueryRequest, AskDataRequestContext } from './ask-data.types.js';

interface AuthenticatedAskDataRequest extends Request {
  user?: {
    id?: number;
    storeIds?: number[];
    permissions?: string[];
    deniedPermissions?: string[];
  };
}

@ApiTags('AskData')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('ask-data')
export class AskDataController {
  constructor(private readonly askDataService: AskDataService) {}

  @Post('query')
  @Permissions('core:dashboard:view')
  @ApiOperation({ summary: '基础版智能问数查询' })
  query(@Req() req: AuthenticatedAskDataRequest, @Body() body: AskDataQueryRequest) {
    return this.askDataService.query(body, this.contextFromRequest(req));
  }

  @Get('catalog')
  @Permissions('core:dashboard:view')
  @ApiOperation({ summary: '基础版智能问数覆盖目录' })
  getCatalog() {
    return this.askDataService.getCatalog();
  }

  private contextFromRequest(req: AuthenticatedAskDataRequest): AskDataRequestContext {
    const rawStoreId = req.headers['x-store-id'];
    const storeId = Number(Array.isArray(rawStoreId) ? rawStoreId[0] : rawStoreId);
    if (!Number.isInteger(storeId) || storeId <= 0) {
      throw new BadRequestException('缺少有效的 X-Store-Id');
    }

    const visibleStoreIds = req.user?.storeIds ?? [];
    if (!visibleStoreIds.includes(storeId)) {
      throw new ForbiddenException(`store_scope_denied:${storeId}`);
    }

    return {
      userId: Number(req.user?.id),
      storeId,
      visibleStoreIds,
      permissions: req.user?.permissions ?? [],
      deniedPermissions: req.user?.deniedPermissions ?? [],
    };
  }
}
