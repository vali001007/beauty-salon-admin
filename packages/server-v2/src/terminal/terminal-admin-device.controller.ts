import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Permissions } from '../common/decorators/permissions.decorator.js';
import {
  ProvisionTerminalDeviceDto,
  QueryTerminalDevicesDto,
  UpdateTerminalDeviceDto,
} from './dto/index.js';
import { TerminalService } from './terminal.service.js';

@ApiTags('Terminal - Admin Devices')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('terminal/admin/devices')
export class TerminalAdminDeviceController {
  constructor(private terminalService: TerminalService) {}

  @Get('paginated')
  @Permissions('core:system:stores')
  @ApiOperation({ summary: 'List terminal devices for admin console' })
  findPaginated(
    @Query() query: QueryTerminalDevicesDto,
    @Headers('x-store-id') storeId?: string,
  ) {
    return this.terminalService.findTerminalDevicesPaginated(query, storeId ? +storeId : undefined);
  }

  @Post('provision')
  @Permissions('core:system:stores')
  @ApiOperation({ summary: 'Provision a terminal device' })
  provision(
    @Body() dto: ProvisionTerminalDeviceDto,
    @Headers('x-store-id') storeId?: string,
  ) {
    return this.terminalService.provisionTerminalDevice(dto, storeId ? +storeId : undefined);
  }

  @Put(':id')
  @Permissions('core:system:stores')
  @ApiOperation({ summary: 'Update terminal device' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateTerminalDeviceDto) {
    return this.terminalService.updateTerminalDevice(id, dto);
  }

  @Post(':id/disable')
  @Permissions('core:system:stores')
  @ApiOperation({ summary: 'Disable terminal device' })
  disable(@Param('id', ParseIntPipe) id: number) {
    return this.terminalService.disableTerminalDevice(id);
  }

  @Post(':id/unbind/approve')
  @Permissions('core:system:stores')
  @ApiOperation({ summary: 'Approve or reject terminal device unbind request' })
  approveUnbind(@Param('id', ParseIntPipe) id: number, @Body('approved') approved: boolean) {
    return this.terminalService.approveTerminalDeviceUnbind(id, approved);
  }

  @Delete(':id')
  @Permissions('core:system:stores')
  @ApiOperation({ summary: 'Delete terminal device' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.terminalService.deleteTerminalDevice(id);
  }
}

@ApiTags('Terminal - Admin Devices')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('terminal/devices')
export class TerminalDeviceAdminCompatController {
  constructor(private terminalService: TerminalService) {}

  @Get('admin-list')
  @Permissions('core:system:stores')
  @ApiOperation({ summary: 'List terminal devices for admin console' })
  findAdminList(
    @Query() query: QueryTerminalDevicesDto,
    @Headers('x-store-id') storeId?: string,
  ) {
    return this.terminalService.findTerminalDevicesPaginated(query, storeId ? +storeId : undefined);
  }

  @Post('provision')
  @Permissions('core:system:stores')
  @ApiOperation({ summary: 'Provision a terminal device' })
  provision(
    @Body() dto: ProvisionTerminalDeviceDto,
    @Headers('x-store-id') storeId?: string,
  ) {
    return this.terminalService.provisionTerminalDevice(dto, storeId ? +storeId : undefined);
  }

  @Delete(':id')
  @Permissions('core:system:stores')
  @ApiOperation({ summary: 'Delete terminal device' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.terminalService.deleteTerminalDevice(id);
  }
}
