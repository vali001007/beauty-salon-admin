import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Permissions } from '../common/decorators/permissions.decorator.js';
import { BomService } from './bom.service.js';

@ApiTags('BOM')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('bom')
export class BomController {
  constructor(private bomService: BomService) {}

  @Get('services')
  @Permissions('core:inventory:view')
  @ApiOperation({ summary: 'List service BOM definitions' })
  listServices() {
    return this.bomService.listServices();
  }

  @Get('services/:id/consumption')
  @Permissions('core:inventory:view')
  @ApiOperation({ summary: 'List BOM consumption records for a service' })
  getServiceConsumption(@Param('id', ParseIntPipe) id: number) {
    return this.bomService.getServiceConsumption(id);
  }

  @Get('consumption-records')
  @Permissions('core:inventory:view')
  @ApiOperation({ summary: 'List all BOM consumption records' })
  getConsumptionRecords() {
    return this.bomService.getConsumptionRecords();
  }

  @Get('forecast')
  @Permissions('core:inventory:view')
  @ApiOperation({ summary: 'Get BOM material forecast' })
  getForecast() {
    return this.bomService.getForecast();
  }

  @Post('services')
  @Permissions('core:inventory:update')
  @ApiOperation({ summary: 'Create service BOM definition' })
  createService(@Body() dto: any) {
    return this.bomService.createService(dto);
  }

  @Put('services/:id')
  @Permissions('core:inventory:update')
  @ApiOperation({ summary: 'Update service BOM definition' })
  updateService(@Param('id', ParseIntPipe) id: number, @Body() dto: any) {
    return this.bomService.updateService(id, dto);
  }

  @Delete('services/:id')
  @Permissions('core:inventory:update')
  @ApiOperation({ summary: 'Delete service BOM definition' })
  deleteService(@Param('id', ParseIntPipe) id: number) {
    return this.bomService.deleteService(id);
  }
}
