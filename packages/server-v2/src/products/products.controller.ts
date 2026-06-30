import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, ParseIntPipe, Headers } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ProductsService } from './products.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Permissions } from '../common/decorators/permissions.decorator.js';
import { CreateProductDto } from './dto/create-product.dto.js';
import { UpdateProductDto } from './dto/update-product.dto.js';

@ApiTags('Products')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('products')
export class ProductsController {
  constructor(private productsService: ProductsService) {}

  @Get()
  @Permissions('core:goods:products')
  @ApiOperation({ summary: '获取商品列表' })
  findAll(
    @Headers('x-store-id') storeId?: string,
    @Query('categoryId') categoryId?: string,
    @Query('status') status?: string,
    @Query('keyword') keyword?: string,
  ) {
    return this.productsService.findAll(
      storeId ? +storeId : undefined,
      categoryId ? +categoryId : undefined,
      status,
      keyword,
    );
  }

  @Get('paginated')
  @Permissions('core:goods:products')
  @ApiOperation({ summary: '分页获取商品' })
  findPaginated(
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
    @Query('keyword') keyword?: string,
    @Query('categoryId') categoryId?: string,
    @Query('status') status?: string,
    @Query('sellableOnly') sellableOnly?: string,
    @Headers('x-store-id') storeId?: string,
  ) {
    return this.productsService.findPaginated(
      { page, pageSize, keyword, categoryId: categoryId ? +categoryId : undefined, status, sellableOnly },
      storeId ? +storeId : undefined,
    );
  }

  @Get('categories')
  @Permissions('core:goods:types', 'core:goods:products')
  @ApiOperation({ summary: '获取商品分类' })
  getCategories() {
    return this.productsService.getCategories();
  }

  @Post('categories')
  @Permissions('core:goods:types')
  @ApiOperation({ summary: '创建商品分类' })
  createCategory(@Body() dto: any) {
    return this.productsService.createCategory(dto);
  }

  @Put('categories/:id')
  @Permissions('core:goods:types')
  @ApiOperation({ summary: '更新商品分类' })
  updateCategory(@Param('id', ParseIntPipe) id: number, @Body() dto: any) {
    return this.productsService.updateCategory(id, dto);
  }

  @Post('categories/batch-delete')
  @Permissions('core:goods:types')
  @ApiOperation({ summary: '批量删除商品分类' })
  deleteCategories(@Body('ids') ids: number[]) {
    return this.productsService.deleteCategories(ids);
  }

  @Get(':id')
  @Permissions('core:goods:products')
  @ApiOperation({ summary: '获取商品详情' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.productsService.findById(id);
  }

  @Post()
  @Permissions('core:goods:products')
  @ApiOperation({ summary: '创建商品' })
  create(@Body() dto: CreateProductDto, @Headers('x-store-id') storeId?: string) {
    return this.productsService.create(dto, storeId ? +storeId : undefined);
  }

  @Put(':id')
  @Permissions('core:goods:products')
  @ApiOperation({ summary: '更新商品' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateProductDto, @Headers('x-store-id') storeId?: string) {
    return this.productsService.update(id, dto, storeId ? +storeId : undefined);
  }

  @Delete(':id')
  @Permissions('core:goods:products')
  @ApiOperation({ summary: '删除商品' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.productsService.remove(id);
  }
}
