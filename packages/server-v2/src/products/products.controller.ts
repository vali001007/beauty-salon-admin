import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, ParseIntPipe, Headers } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ProductsService } from './products.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Permissions } from '../common/decorators/permissions.decorator.js';

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
    @Headers('x-store-id') storeId?: string,
  ) {
    return this.productsService.findPaginated(
      { page, pageSize, keyword, categoryId: categoryId ? +categoryId : undefined, status },
      storeId ? +storeId : undefined,
    );
  }

  @Get('categories')
  @ApiOperation({ summary: '获取商品分类' })
  getCategories() {
    return this.productsService.getCategories();
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
  create(@Body() dto: any) {
    return this.productsService.create(dto);
  }

  @Put(':id')
  @Permissions('core:goods:products')
  @ApiOperation({ summary: '更新商品' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: any) {
    return this.productsService.update(id, dto);
  }

  @Delete(':id')
  @Permissions('core:goods:products')
  @ApiOperation({ summary: '删除商品' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.productsService.remove(id);
  }
}
