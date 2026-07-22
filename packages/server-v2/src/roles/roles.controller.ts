import {
  Controller, Get, Post, Put, Delete, Body, Param, UseGuards, ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { RolesService } from './roles.service.js';
import { CreateRoleDto } from './dto/create-role.dto.js';
import { UpdateRoleDto } from './dto/update-role.dto.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Permissions } from '../common/decorators/permissions.decorator.js';
import { PermissionsGuard } from '../common/guards/permissions.guard.js';

@ApiTags('Roles')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('roles')
export class RolesController {
  constructor(private rolesService: RolesService) {}

  @Get()
  @Permissions('core:system:roles')
  @ApiOperation({ summary: '获取角色列表' })
  findAll() {
    return this.rolesService.findAll();
  }

  @Get('permission-catalog')
  @Permissions('core:system:permissions')
  @ApiOperation({ summary: '获取后端统一权限目录' })
  listPermissionCatalog() {
    return this.rolesService.listPermissionCatalog();
  }

  @Get(':id')
  @Permissions('core:system:roles')
  @ApiOperation({ summary: '获取角色详情' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.rolesService.findById(id);
  }

  @Post()
  @Permissions('core:system:roles')
  @ApiOperation({ summary: '创建角色' })
  create(@Body() dto: CreateRoleDto) {
    return this.rolesService.create(dto);
  }

  @Put(':id')
  @Permissions('core:system:roles')
  @ApiOperation({ summary: '更新角色' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateRoleDto) {
    return this.rolesService.update(id, dto);
  }

  @Put(':id/permissions')
  @Permissions('core:system:roles')
  @ApiOperation({ summary: '更新角色权限' })
  updatePermissions(
    @Param('id', ParseIntPipe) id: number,
    @Body('permissions') permissions: string[],
  ) {
    return this.rolesService.updatePermissions(id, permissions);
  }

  @Delete(':id')
  @Permissions('core:system:roles')
  @ApiOperation({ summary: '删除角色' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.rolesService.remove(id);
  }
}
