import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateServiceDto } from './dto/create-service.dto.js';
import { UpdateServiceDto } from './dto/update-service.dto.js';
import { QueryServiceDto } from './dto/query-service.dto.js';

@Injectable()
export class ServicesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateServiceDto) {
    const category = await this.prisma.serviceCategory.findUnique({
      where: { id: dto.categoryId },
    });
    if (!category) {
      throw new NotFoundException(
        `Category with ID '${dto.categoryId}' not found`,
      );
    }

    const existing = await this.prisma.service.findFirst({
      where: {
        categoryId: dto.categoryId,
        name: { equals: dto.name, mode: 'insensitive' },
      },
    });
    if (existing) {
      throw new ConflictException(
        `Service '${dto.name}' already exists in this category`,
      );
    }

    return this.prisma.service.create({
      data: {
        categoryId: dto.categoryId,
        name: dto.name,
        description: dto.description,
        iconUrl: dto.iconUrl,
        isActive: dto.isActive ?? true,
      },
      include: {
        category: {
          select: { id: true, name: true, imageUrl: true },
        },
      },
    });
  }

  async findAll(query: QueryServiceDto) {
    const where: Prisma.ServiceWhereInput = {};

    if (query.categoryId) {
      where.categoryId = query.categoryId;
    }

    if (query.isActive !== undefined) {
      where.isActive = query.isActive;
    }

    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const [total, items] = await Promise.all([
      this.prisma.service.count({ where }),
      this.prisma.service.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ name: 'asc' }],
        include: {
          category: {
            select: { id: true, name: true, imageUrl: true },
          },
        },
      }),
    ]);

    return {
      data: items,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string) {
    const service = await this.prisma.service.findUnique({
      where: { id },
      include: {
        category: {
          select: { id: true, name: true, imageUrl: true, parentId: true },
        },
      },
    });

    if (!service) {
      throw new NotFoundException(`Service with ID '${id}' not found`);
    }

    return service;
  }

  async update(id: string, dto: UpdateServiceDto) {
    const service = await this.prisma.service.findUnique({
      where: { id },
    });
    if (!service) {
      throw new NotFoundException(`Service with ID '${id}' not found`);
    }

    const targetCategoryId = dto.categoryId ?? service.categoryId;

    if (dto.categoryId && dto.categoryId !== service.categoryId) {
      const category = await this.prisma.category.findUnique({
        where: { id: dto.categoryId },
      });
      if (!category) {
        throw new NotFoundException(
          `Category with ID '${dto.categoryId}' not found`,
        );
      }
    }

    const targetName = dto.name ?? service.name;
    if (dto.name || dto.categoryId) {
      const duplicate = await this.prisma.service.findFirst({
        where: {
          id: { not: id },
          categoryId: targetCategoryId,
          name: { equals: targetName, mode: 'insensitive' },
        },
      });

      if (duplicate) {
        throw new ConflictException(
          `Service '${targetName}' already exists in this category`,
        );
      }
    }

    return this.prisma.service.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.iconUrl !== undefined && { iconUrl: dto.iconUrl }),
        ...(dto.categoryId !== undefined && { categoryId: dto.categoryId }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
      include: {
        category: {
          select: { id: true, name: true, imageUrl: true },
        },
      },
    });
  }

  async remove(id: string, hard = false) {
    const service = await this.prisma.service.findUnique({
      where: { id },
    });

    if (!service) {
      throw new NotFoundException(`Service with ID '${id}' not found`);
    }

    if (hard) {
      await this.prisma.service.delete({ where: { id } });
      return { message: `Service '${service.name}' deleted successfully` };
    }

    const updated = await this.prisma.service.update({
      where: { id },
      data: { isActive: false },
    });

    return {
      message: `Service '${service.name}' deactivated successfully`,
      data: updated,
    };
  }

  async toggleStatus(id: string, isActive?: boolean) {
    const service = await this.prisma.service.findUnique({
      where: { id },
    });
    if (!service) {
      throw new NotFoundException(`Service with ID '${id}' not found`);
    }

    const nextStatus = isActive !== undefined ? isActive : !service.isActive;

    return this.prisma.service.update({
      where: { id },
      data: { isActive: nextStatus },
      include: {
        category: {
          select: { id: true, name: true },
        },
      },
    });
  }
}
