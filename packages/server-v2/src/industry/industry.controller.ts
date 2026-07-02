import { Body, Controller, Get, Headers, Param, ParseIntPipe, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Permissions } from '../common/decorators/permissions.decorator.js';
import { PermissionsGuard } from '../common/guards/permissions.guard.js';
import {
  AdoptIndustryProductTemplateDto,
  AdoptIndustryServiceTemplateDto,
  BatchAdoptIndustryProductTemplatesDto,
  CreateIndustryAdoptionDto,
  CreateIndustryDataSourceDto,
  CreateIndustryKnowledgeItemDto,
  CreateIndustryProductTemplateDto,
  CreateIndustrySalaryBenchmarkDto,
  CreateIndustryServiceTemplateDto,
  CreateIndustrySupplyMappingRequestDto,
  QueryIndustryDataSourcesDto,
  QueryIndustryKnowledgeDto,
  QueryIndustryProductTemplatesDto,
  QueryIndustrySalaryDto,
  QueryIndustryServiceTemplatesDto,
  SaveIndustryBomTemplateDto,
  LinkIndustryProductTemplateDto,
  UpdateIndustryDataSourceDto,
  UpdateIndustryKnowledgeItemDto,
  UpdateIndustryProductTemplateDto,
  UpdateIndustrySalaryBenchmarkDto,
  UpdateIndustryServiceTemplateDto,
} from './dto/industry.dto.js';
import { IndustryService } from './industry.service.js';

@ApiTags('Industry Data Platform')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('industry')
export class IndustryController {
  constructor(private industryService: IndustryService) {}

  private storeIdFrom(headerStoreId?: string) {
    const value = Number(headerStoreId ?? 0);
    return Number.isFinite(value) && value > 0 ? value : undefined;
  }

  @Get('data-sources')
  @Permissions('core:industry:data-source', 'core:industry:view')
  @ApiOperation({ summary: '行业数据源列表' })
  dataSources(@Query() query: QueryIndustryDataSourcesDto) {
    return this.industryService.findDataSources(query);
  }

  @Post('data-sources')
  @Permissions('core:industry:data-source', 'core:industry:manage')
  @ApiOperation({ summary: '创建行业数据源' })
  createDataSource(@Body() dto: CreateIndustryDataSourceDto) {
    return this.industryService.createDataSource(dto);
  }

  @Patch('data-sources/:id')
  @Permissions('core:industry:data-source', 'core:industry:manage')
  @ApiOperation({ summary: '更新行业数据源' })
  updateDataSource(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateIndustryDataSourceDto) {
    return this.industryService.updateDataSource(id, dto);
  }

  @Get('service-templates/paginated')
  @Permissions('core:industry:service-template', 'core:industry:view')
  @ApiOperation({ summary: '行业服务项目模板分页' })
  serviceTemplatesPaginated(@Query() query: QueryIndustryServiceTemplatesDto) {
    return this.industryService.findServiceTemplatesPaginated(query);
  }

  @Get('service-templates')
  @Permissions('core:industry:service-template', 'core:industry:view', 'core:store:projects')
  @ApiOperation({ summary: '已发布行业服务项目模板列表' })
  serviceTemplates(@Query() query: QueryIndustryServiceTemplatesDto) {
    return this.industryService.findServiceTemplates(query, true);
  }

  @Get('service-templates/:id')
  @Permissions('core:industry:service-template', 'core:industry:view', 'core:store:projects')
  @ApiOperation({ summary: '行业服务项目模板详情' })
  serviceTemplate(@Param('id', ParseIntPipe) id: number) {
    return this.industryService.findServiceTemplate(id);
  }

  @Post('service-templates')
  @Permissions('core:industry:service-template', 'core:industry:manage')
  @ApiOperation({ summary: '创建行业服务项目模板' })
  createServiceTemplate(@Body() dto: CreateIndustryServiceTemplateDto) {
    return this.industryService.createServiceTemplate(dto);
  }

  @Patch('service-templates/:id')
  @Permissions('core:industry:service-template', 'core:industry:manage')
  @ApiOperation({ summary: '更新行业服务项目模板' })
  updateServiceTemplate(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateIndustryServiceTemplateDto) {
    return this.industryService.updateServiceTemplate(id, dto);
  }

  @Post('service-templates/:id/submit-review')
  @Permissions('core:industry:service-template', 'core:industry:manage')
  @ApiOperation({ summary: '提交行业服务项目模板审核' })
  submitServiceTemplateReview(@Param('id', ParseIntPipe) id: number) {
    return this.industryService.setServiceTemplateStatus(id, 'pending_review');
  }

  @Post('service-templates/:id/publish')
  @Permissions('core:industry:service-template', 'core:industry:manage')
  @ApiOperation({ summary: '发布行业服务项目模板' })
  publishServiceTemplate(@Param('id', ParseIntPipe) id: number) {
    return this.industryService.setServiceTemplateStatus(id, 'published');
  }

  @Post('service-templates/:id/offline')
  @Permissions('core:industry:service-template', 'core:industry:manage')
  @ApiOperation({ summary: '下线行业服务项目模板' })
  offlineServiceTemplate(@Param('id', ParseIntPipe) id: number) {
    return this.industryService.setServiceTemplateStatus(id, 'offline');
  }

  @Get('service-templates/:id/bom')
  @Permissions('core:industry:bom-template', 'core:industry:view', 'core:store:projects')
  @ApiOperation({ summary: '查询行业项目 BOM 模板' })
  serviceTemplateBom(@Param('id', ParseIntPipe) id: number) {
    return this.industryService.getBomTemplate(id, true);
  }

  @Post('service-templates/:id/adopt-project')
  @Permissions('core:store:projects', 'core:industry:adoption')
  @ApiOperation({ summary: '采用行业服务项目模板创建门店项目和 BOM' })
  adoptServiceTemplateAsProject(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AdoptIndustryServiceTemplateDto,
    @Headers('x-store-id') storeHeader?: string,
  ) {
    return this.industryService.adoptServiceTemplateAsProject(id, dto, this.storeIdFrom(storeHeader));
  }

  @Get('bom-templates/:serviceTemplateId')
  @Permissions('core:industry:bom-template', 'core:industry:view')
  @ApiOperation({ summary: '后台查询行业项目 BOM 模板' })
  bomTemplate(@Param('serviceTemplateId', ParseIntPipe) serviceTemplateId: number) {
    return this.industryService.getBomTemplate(serviceTemplateId);
  }

  @Put('bom-templates/:serviceTemplateId')
  @Permissions('core:industry:bom-template', 'core:industry:manage')
  @ApiOperation({ summary: '保存行业项目 BOM 模板' })
  saveBomTemplate(@Param('serviceTemplateId', ParseIntPipe) serviceTemplateId: number, @Body() dto: SaveIndustryBomTemplateDto) {
    return this.industryService.saveBomTemplate(serviceTemplateId, dto);
  }

  @Post('bom-templates/:serviceTemplateId/publish')
  @Permissions('core:industry:bom-template', 'core:industry:manage')
  @ApiOperation({ summary: '发布行业项目 BOM 模板' })
  publishBomTemplate(@Param('serviceTemplateId', ParseIntPipe) serviceTemplateId: number) {
    return this.industryService.publishBomTemplate(serviceTemplateId);
  }

  @Get('product-templates/paginated')
  @Permissions('core:industry:product-template', 'core:industry:view')
  @ApiOperation({ summary: '行业标准商品/耗品分页' })
  productTemplatesPaginated(@Query() query: QueryIndustryProductTemplatesDto, @Headers('x-store-id') storeHeader?: string) {
    return this.industryService.findProductTemplatesPaginated(query, this.storeIdFrom(storeHeader));
  }

  @Get('product-templates')
  @Permissions('core:industry:product-template', 'core:industry:view', 'core:goods:products', 'core:inventory:products')
  @ApiOperation({ summary: '已发布行业标准商品/耗品列表' })
  productTemplates(@Query() query: QueryIndustryProductTemplatesDto, @Headers('x-store-id') storeHeader?: string) {
    return this.industryService.findProductTemplates(query, true, this.storeIdFrom(storeHeader));
  }

  @Get('product-templates/adoption-coverage')
  @Permissions('core:industry:product-template', 'core:industry:view', 'core:industry:adoption')
  @ApiOperation({ summary: '行业标准品采用覆盖率' })
  productTemplateAdoptionCoverage(@Query() query: QueryIndustryProductTemplatesDto, @Headers('x-store-id') storeHeader?: string) {
    return this.industryService.productTemplateAdoptionCoverage(query, this.storeIdFrom(storeHeader));
  }

  @Get('product-template-chain/overview')
  @Permissions('core:industry:product-template', 'core:industry:view', 'core:inventory:products')
  @ApiOperation({ summary: '行业标准品到本地库存、采购、BOM 和销售链路总览' })
  productTemplateChainOverview(@Query() query: QueryIndustryProductTemplatesDto, @Headers('x-store-id') storeHeader?: string) {
    return this.industryService.productTemplateChainOverview(query, this.storeIdFrom(storeHeader));
  }

  @Get('product-template-chain/operational-report')
  @Permissions('core:industry:product-template', 'core:industry:view', 'core:inventory:products')
  @ApiOperation({ summary: '行业标准品链路运营问题清单' })
  productTemplateChainOperationalReport(@Query() query: QueryIndustryProductTemplatesDto, @Headers('x-store-id') storeHeader?: string) {
    return this.industryService.productTemplateChainOperationalReport(query, this.storeIdFrom(storeHeader));
  }

  @Get('product-templates/:id/chain')
  @Permissions('core:industry:product-template', 'core:industry:view', 'core:inventory:products')
  @ApiOperation({ summary: '行业标准品单品链路明细' })
  productTemplateChainDetail(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: QueryIndustryProductTemplatesDto,
    @Headers('x-store-id') storeHeader?: string,
  ) {
    return this.industryService.productTemplateChainDetail(id, query, this.storeIdFrom(storeHeader));
  }

  @Get('product-templates/:id')
  @Permissions('core:industry:product-template', 'core:industry:view', 'core:goods:products', 'core:inventory:products')
  @ApiOperation({ summary: '行业标准商品/耗品详情' })
  productTemplate(@Param('id', ParseIntPipe) id: number) {
    return this.industryService.findProductTemplate(id);
  }

  @Post('product-templates')
  @Permissions('core:industry:product-template', 'core:industry:manage')
  @ApiOperation({ summary: '创建行业标准商品/耗品' })
  createProductTemplate(@Body() dto: CreateIndustryProductTemplateDto) {
    return this.industryService.createProductTemplate(dto);
  }

  @Patch('product-templates/:id')
  @Permissions('core:industry:product-template', 'core:industry:manage')
  @ApiOperation({ summary: '更新行业标准商品/耗品' })
  updateProductTemplate(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateIndustryProductTemplateDto) {
    return this.industryService.updateProductTemplate(id, dto);
  }

  @Post('product-templates/:id/publish')
  @Permissions('core:industry:product-template', 'core:industry:manage')
  @ApiOperation({ summary: '发布行业标准商品/耗品' })
  publishProductTemplate(@Param('id', ParseIntPipe) id: number) {
    return this.industryService.setProductTemplateStatus(id, 'published');
  }

  @Post('product-templates/:id/adopt-product')
  @Permissions('core:goods:products', 'core:inventory:products', 'core:industry:adoption')
  @ApiOperation({ summary: '采用行业标准商品/耗品创建门店商品' })
  adoptProductTemplateAsProduct(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AdoptIndustryProductTemplateDto,
    @Headers('x-store-id') storeHeader?: string,
  ) {
    return this.industryService.adoptProductTemplateAsProduct(id, dto, this.storeIdFrom(storeHeader));
  }

  @Post('product-templates/batch-adopt-products')
  @Permissions('core:goods:products', 'core:inventory:products', 'core:industry:adoption')
  @ApiOperation({ summary: '批量采用行业标准品创建门店商品' })
  batchAdoptProductTemplates(
    @Body() dto: BatchAdoptIndustryProductTemplatesDto,
    @Headers('x-store-id') storeHeader?: string,
  ) {
    return this.industryService.batchAdoptProductTemplates(dto, this.storeIdFrom(storeHeader));
  }

  @Post('product-templates/:id/link-product')
  @Permissions('core:goods:products', 'core:inventory:products', 'core:industry:adoption')
  @ApiOperation({ summary: '将行业标准品映射到已有门店商品' })
  linkProductTemplateToProduct(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: LinkIndustryProductTemplateDto,
    @Headers('x-store-id') storeHeader?: string,
  ) {
    return this.industryService.linkProductTemplateToProduct(id, dto, this.storeIdFrom(storeHeader));
  }

  @Get('knowledge/items/paginated')
  @Permissions('core:industry:knowledge', 'core:industry:view')
  @ApiOperation({ summary: '行业知识库分页' })
  knowledgeItemsPaginated(@Query() query: QueryIndustryKnowledgeDto) {
    return this.industryService.findKnowledgeItemsPaginated(query);
  }

  @Get('knowledge/items')
  @Permissions('core:industry:knowledge', 'core:industry:view', 'terminal:service:start')
  @ApiOperation({ summary: '已发布行业知识库条目' })
  knowledgeItems(@Query() query: QueryIndustryKnowledgeDto) {
    return this.industryService.findKnowledgeItems(query, true);
  }

  @Post('knowledge/items')
  @Permissions('core:industry:knowledge', 'core:industry:manage')
  @ApiOperation({ summary: '创建行业知识库条目' })
  createKnowledgeItem(@Body() dto: CreateIndustryKnowledgeItemDto) {
    return this.industryService.createKnowledgeItem(dto);
  }

  @Patch('knowledge/items/:id')
  @Permissions('core:industry:knowledge', 'core:industry:manage')
  @ApiOperation({ summary: '更新行业知识库条目' })
  updateKnowledgeItem(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateIndustryKnowledgeItemDto) {
    return this.industryService.updateKnowledgeItem(id, dto);
  }

  @Get('salary-benchmarks/paginated')
  @Permissions('core:industry:salary', 'core:industry:view')
  @ApiOperation({ summary: '行业岗位薪酬模板分页' })
  salaryBenchmarksPaginated(@Query() query: QueryIndustrySalaryDto) {
    return this.industryService.findSalaryBenchmarksPaginated(query);
  }

  @Get('salary-benchmarks')
  @Permissions('core:industry:salary', 'core:industry:view', 'core:system:users')
  @ApiOperation({ summary: '已发布行业岗位薪酬模板' })
  salaryBenchmarks(@Query() query: QueryIndustrySalaryDto) {
    return this.industryService.findSalaryBenchmarks(query, true);
  }

  @Post('salary-benchmarks')
  @Permissions('core:industry:salary', 'core:industry:manage')
  @ApiOperation({ summary: '创建行业岗位薪酬模板' })
  createSalaryBenchmark(@Body() dto: CreateIndustrySalaryBenchmarkDto) {
    return this.industryService.createSalaryBenchmark(dto);
  }

  @Patch('salary-benchmarks/:id')
  @Permissions('core:industry:salary', 'core:industry:manage')
  @ApiOperation({ summary: '更新行业岗位薪酬模板' })
  updateSalaryBenchmark(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateIndustrySalaryBenchmarkDto) {
    return this.industryService.updateSalaryBenchmark(id, dto);
  }

  @Post('adoptions')
  @Permissions('core:industry:adoption', 'core:industry:manage', 'core:store:projects', 'core:goods:products')
  @ApiOperation({ summary: '记录行业模板采用' })
  createAdoption(@Body() dto: CreateIndustryAdoptionDto, @Headers('x-store-id') storeHeader?: string) {
    return this.industryService.createAdoption(dto, this.storeIdFrom(storeHeader));
  }

  @Get('adoptions')
  @Permissions('core:industry:adoption', 'core:industry:view')
  @ApiOperation({ summary: '行业模板采用记录' })
  adoptions(
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
    @Query('storeId') storeId?: number,
    @Query('adoptionType') adoptionType?: string,
    @Query('serviceTemplateId') serviceTemplateId?: number,
    @Query('productTemplateId') productTemplateId?: number,
  ) {
    return this.industryService.findAdoptions({
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
      storeId: storeId ? Number(storeId) : undefined,
      adoptionType,
      serviceTemplateId: serviceTemplateId ? Number(serviceTemplateId) : undefined,
      productTemplateId: productTemplateId ? Number(productTemplateId) : undefined,
    });
  }

  @Get('template-updates')
  @Permissions('core:industry:adoption', 'core:industry:view', 'core:store:projects')
  @ApiOperation({ summary: '查询行业模板可升级版本' })
  templateUpdates() {
    return this.industryService.templateUpdates();
  }

  @Get('product-templates/:id/supply-mappings')
  @Permissions('core:industry:supply-mapping', 'core:industry:view')
  @ApiOperation({ summary: '行业标准品未来供应链映射状态' })
  productSupplyMappings(@Param('id', ParseIntPipe) id: number) {
    return this.industryService.productSupplyMappings(id);
  }

  @Get('bom-items/:id/supply-candidates')
  @Permissions('core:industry:supply-mapping', 'core:industry:view')
  @ApiOperation({ summary: '行业 BOM 明细未来供应链候选占位' })
  bomSupplyCandidates(@Param('id', ParseIntPipe) id: number) {
    return this.industryService.bomSupplyCandidates(id);
  }

  @Post('supply-mapping-requests')
  @Permissions('core:industry:supply-mapping', 'core:industry:manage')
  @ApiOperation({ summary: '记录未来供应链映射需求' })
  createSupplyMappingRequest(@Body() dto: CreateIndustrySupplyMappingRequestDto, @Headers('x-store-id') storeHeader?: string) {
    return this.industryService.createSupplyMappingRequest(dto, this.storeIdFrom(storeHeader));
  }
}
