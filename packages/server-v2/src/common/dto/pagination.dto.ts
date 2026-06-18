import { IsInt, IsOptional, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class PaginationDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  pageSize?: number = 20;
}

export class PaginatedResponse<T> {
  items: T[];
  data: T[];
  total: number;
  page: number;
  pageSize: number;

  constructor(items: T[], total: number, page: number, pageSize: number) {
    this.items = items;
    this.data = items;
    this.total = total;
    this.page = page;
    this.pageSize = pageSize;
  }
}
