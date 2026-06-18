import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateRoleDto } from './dto/create-role.dto.js';
import { UpdateRoleDto } from './dto/update-role.dto.js';

@Injectable()
export class RolesService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    const roles = await this.prisma.role.findMany({
      include: { _count: { select: { users: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return roles.map((r) => ({ ...r, userCount: r._count.users }));
  }

  async findById(id: number) {
    const role = await this.prisma.role.findUnique({
      where: { id },
      include: { _count: { select: { users: true } } },
    });
    if (!role) throw new NotFoundException('角色不存在');
    return { ...role, userCount: role._count.users };
  }

  async create(dto: CreateRoleDto) {
    return this.prisma.role.create({
      data: {
        key: dto.key,
        name: dto.name,
        description: dto.description,
        permissions: dto.permissions || [],
        platformScopes: dto.platformScopes,
        dataScopes: dto.dataScopes,
        fieldScopes: dto.fieldScopes,
        approvalScopes: dto.approvalScopes,
      },
    });
  }

  async update(id: number, dto: UpdateRoleDto) {
    await this.findById(id);
    return this.prisma.role.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        permissions: dto.permissions,
        platformScopes: dto.platformScopes,
        dataScopes: dto.dataScopes,
        fieldScopes: dto.fieldScopes,
        approvalScopes: dto.approvalScopes,
      },
    });
  }

  async updatePermissions(id: number, permissions: string[]) {
    await this.findById(id);
    return this.prisma.role.update({
      where: { id },
      data: { permissions },
    });
  }

  async remove(id: number) {
    const role = await this.findById(id);
    if (role.isSystem) {
      throw new NotFoundException('系统角色不可删除');
    }
    return this.prisma.role.delete({ where: { id } });
  }
}
