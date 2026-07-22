import { Body, Controller, Get, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Permissions } from '../common/decorators/permissions.decorator.js';
import { PermissionsGuard } from '../common/guards/permissions.guard.js';
import {
  CreateBusinessDefinitionDraftDto,
  ListBusinessDefinitionsDto,
  PublishBusinessDefinitionVersionDto,
  ValidateBusinessDefinitionVersionDto,
} from './business-definition.dto.js';
import { BusinessDefinitionRegistryService } from './business-definition-registry.service.js';

// Follow-up permission to register before replacing the system-admin fallback below.
export const BUSINESS_DEFINITION_DEDICATED_PERMISSION = 'core:system:business-definitions';

@ApiTags('Business Definitions')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('business-definitions')
export class BusinessDefinitionController {
  constructor(private readonly registry: BusinessDefinitionRegistryService) {}

  @Get()
  @Permissions('core:system:view')
  @ApiOperation({ summary: 'List governed business definitions' })
  list(@Query() query: ListBusinessDefinitionsDto) {
    return this.registry.list(query);
  }

  @Get(':kind/:definitionKey')
  @Permissions('core:system:view')
  @ApiOperation({ summary: 'Get a business definition and its versions' })
  get(@Param('kind') kind: string, @Param('definitionKey') definitionKey: string) {
    return this.registry.get(kind, definitionKey);
  }

  @Post('drafts')
  @Permissions('core:system:permissions')
  @ApiOperation({ summary: 'Create an immutable candidate or draft version' })
  createDraft(@Body() dto: CreateBusinessDefinitionDraftDto, @CurrentUser('id') userId: number) {
    return this.registry.createDraft({ ...dto, createdBy: userId });
  }

  @Post('versions/:versionId/validate')
  @Permissions('core:system:permissions')
  @ApiOperation({ summary: 'Record deterministic validation for a draft version' })
  validateVersion(
    @Param('versionId', ParseIntPipe) versionId: number,
    @Body() dto: ValidateBusinessDefinitionVersionDto,
    @CurrentUser('id') userId: number,
  ) {
    return this.registry.validateVersion(versionId, { reason: dto.reason, validatedBy: userId });
  }

  @Post('versions/:versionId/publish')
  @Permissions('core:system:permissions')
  @ApiOperation({ summary: 'Publish a validated version and its read-only projections' })
  publishVersion(
    @Param('versionId', ParseIntPipe) versionId: number,
    @Body() dto: PublishBusinessDefinitionVersionDto,
    @CurrentUser('id') userId: number,
  ) {
    return this.registry.publishVersion(versionId, {
      publishedBy: userId,
      expectedCurrentVersionId: dto.expectedCurrentVersionId,
    });
  }

  @Get('versions/:versionId/projections/preview')
  @Permissions('core:system:view')
  @ApiOperation({ summary: 'Preview generated read-only projections' })
  previewProjections(@Param('versionId', ParseIntPipe) versionId: number) {
    return this.registry.previewProjections(versionId);
  }
}
