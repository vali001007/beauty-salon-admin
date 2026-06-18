import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateStoreDto } from './dto/create-store.dto.js';
import { UpdateStoreDto } from './dto/update-store.dto.js';

@Injectable()
export class StoresService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.store.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findAccessible(userStoreIds: number[]) {
    if (!userStoreIds.length) return this.findAll();
    return this.prisma.store.findMany({
      where: { id: { in: userStoreIds }, deletedAt: null },
      orderBy: { name: 'asc' },
    });
  }

  async findById(id: number) {
    const store = await this.prisma.store.findUnique({ where: { id } });
    if (!store || store.deletedAt) throw new NotFoundException('门店不存在');
    return store;
  }

  async create(dto: CreateStoreDto) {
    return this.prisma.store.create({ data: dto });
  }

  async update(id: number, dto: UpdateStoreDto) {
    await this.findById(id);
    return this.prisma.store.update({ where: { id }, data: dto });
  }

  async remove(id: number) {
    await this.findById(id);
    return this.prisma.store.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
