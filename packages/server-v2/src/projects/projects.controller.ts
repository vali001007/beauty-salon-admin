import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, ParseIntPipe, Headers } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ProjectsService } from './projects.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Permissions } from '../common/decorators/permissions.decorator.js';

@ApiTags('Projects')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class ProjectsController {
  constructor(private projectsService: ProjectsService) {}

  @Get('projects')
  @Permissions('core:store:projects')
  @ApiOperation({ summary: '获取项目列表' })
  findAll(@Headers('x-store-id') storeId?: string) {
    return this.projectsService.findAll(storeId ? +storeId : undefined);
  }

  @Get('projects/paginated')
  @Permissions('core:store:projects')
  @ApiOperation({ summary: '分页获取项目列表' })
  findPaginated(
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
    @Query('keyword') keyword?: string,
    @Query('type') type?: string,
    @Headers('x-store-id') storeId?: string,
  ) {
    return this.projectsService.findPaginated(
      { page: page ? +page : undefined, pageSize: pageSize ? +pageSize : undefined, keyword, type },
      storeId ? +storeId : undefined,
    );
  }

  @Get('projects/:id')
  @Permissions('core:store:projects')
  @ApiOperation({ summary: '获取项目详情' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.projectsService.findById(id);
  }

  @Post('projects')
  @Permissions('core:store:projects')
  @ApiOperation({ summary: '创建项目' })
  create(@Body() dto: any) {
    return this.projectsService.create(dto);
  }

  @Put('projects/:id')
  @Permissions('core:store:projects')
  @ApiOperation({ summary: '更新项目' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: any) {
    return this.projectsService.update(id, dto);
  }

  @Delete('projects/:id')
  @Permissions('core:store:projects')
  @ApiOperation({ summary: '删除项目' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.projectsService.remove(id);
  }

  // Project Types
  @Get('project-types')
  @Permissions('core:store:project-types')
  @ApiOperation({ summary: '获取项目类型列表' })
  findAllTypes() {
    return this.projectsService.findAllTypes();
  }

  @Post('project-types')
  @Permissions('core:store:project-types')
  @ApiOperation({ summary: '创建项目类型' })
  createType(@Body() dto: any) {
    return this.projectsService.createType(dto);
  }

  @Put('project-types/:id')
  @Permissions('core:store:project-types')
  @ApiOperation({ summary: '更新项目类型' })
  updateType(@Param('id', ParseIntPipe) id: number, @Body() dto: any) {
    return this.projectsService.updateType(id, dto);
  }

  @Delete('project-types/:id')
  @Permissions('core:store:project-types')
  @ApiOperation({ summary: '删除项目类型' })
  removeType(@Param('id', ParseIntPipe) id: number) {
    return this.projectsService.removeType(id);
  }

  // BOM
  @Get('projects/:id/bom')
  @Permissions('core:store:projects')
  @ApiOperation({ summary: '获取项目BOM' })
  getBom(@Param('id', ParseIntPipe) id: number) {
    return this.projectsService.getBomItems(id);
  }

  @Put('projects/:id/bom')
  @Permissions('core:store:projects')
  @ApiOperation({ summary: '设置项目BOM' })
  setBom(@Param('id', ParseIntPipe) id: number, @Body('items') items: any[]) {
    return this.projectsService.setBomItems(id, items);
  }
}
