import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateCategoryDto } from './dto/create-category.dto.js';
import { UpdateCategoryDto } from './dto/update-category.dto.js';
import { QueryCategoryDto } from './dto/query-category.dto.js';

export interface CategoryTreeNode {
  id: string;
  parentId: string | null;
  name: string;
  description: string | null;
  imageUrl: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  servicesCount?: number;
  children: CategoryTreeNode[];
}

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateCategoryDto) {
    if (dto.parentId) {
      const parent = await this.prisma.category.findUnique({
        where: { id: dto.parentId },
      });
      if (!parent) {
        throw new NotFoundException(
          `Parent category with ID '${dto.parentId}' not found`,
        );
      }
    }

    // Check duplicate name under the same parent
    const existing = await this.prisma.category.findFirst({
      where: {
        parentId: dto.parentId ?? null,
        name: {
          equals: dto.name,
          mode: 'insensitive',
        },
      },
    });

    if (existing) {
      throw new ConflictException(
        `Category '${dto.name}' already exists in this hierarchy level`,
      );
    }

    return this.prisma.category.create({
      data: {
        name: dto.name,
        description: dto.description,
        imageUrl: dto.imageUrl,
        parentId: dto.parentId ?? null,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async findAll(query: QueryCategoryDto) {
    const where: Prisma.CategoryWhereInput = {};

    if (query.isActive !== undefined) {
      where.isActive = query.isActive;
    }

    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    if (query.parentId !== undefined) {
      where.parentId = query.parentId;
    }

    // If tree mode requested, build nested hierarchical tree
    if (query.tree) {
      const allCategories = await this.prisma.category.findMany({
        where,
        orderBy: { name: 'asc' },
        include: {
          _count: {
            select: { services: true },
          },
        },
      });

      return this.buildTree(allCategories);
    }

    // Flat paginated list
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const [total, items] = await Promise.all([
      this.prisma.category.count({ where }),
      this.prisma.category.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ parentId: 'asc' }, { name: 'asc' }],
        include: {
          parent: {
            select: { id: true, name: true },
          },
          _count: {
            select: { children: true, services: true },
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
    const category = await this.prisma.category.findUnique({
      where: { id },
      include: {
        parent: {
          select: { id: true, name: true, imageUrl: true },
        },
        children: {
          orderBy: { name: 'asc' },
          include: {
            _count: {
              select: { services: true },
            },
          },
        },
        services: {
          where: { isActive: true },
          orderBy: { name: 'asc' },
          take: 50,
        },
        _count: {
          select: { services: true, children: true },
        },
      },
    });

    if (!category) {
      throw new NotFoundException(`Service category with ID '${id}' not found`);
    }

    return category;
  }

  async update(id: string, dto: UpdateCategoryDto) {
    const category = await this.prisma.category.findUnique({
      where: { id },
    });
    if (!category) {
      throw new NotFoundException(`Service category with ID '${id}' not found`);
    }

    const targetParentId =
      dto.parentId !== undefined ? dto.parentId : category.parentId;

    if (dto.parentId !== undefined && dto.parentId !== null) {
      if (dto.parentId === id) {
        throw new BadRequestException('A category cannot be its own parent');
      }

      // Check parent exists
      const parent = await this.prisma.category.findUnique({
        where: { id: dto.parentId },
      });
      if (!parent) {
        throw new NotFoundException(
          `Parent category with ID '${dto.parentId}' not found`,
        );
      }

      // Prevent cyclic reference (cannot set parent to one of its descendants)
      const isDescendant = await this.checkIsDescendant(id, dto.parentId);
      if (isDescendant) {
        throw new BadRequestException(
          'Cannot set parent to a descendant category (circular reference)',
        );
      }
    }

    // Check duplicate name if name or parent changed
    const targetName = dto.name ?? category.name;
    if (dto.name || dto.parentId !== undefined) {
      const duplicate = await this.prisma.category.findFirst({
        where: {
          id: { not: id },
          parentId: targetParentId ?? null,
          name: { equals: targetName, mode: 'insensitive' },
        },
      });

      if (duplicate) {
        throw new ConflictException(
          `Category '${targetName}' already exists under this parent level`,
        );
      }
    }

    return this.prisma.category.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.imageUrl !== undefined && { imageUrl: dto.imageUrl }),
        ...(dto.parentId !== undefined && { parentId: dto.parentId }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });
  }

  async remove(id: string, hard = false) {
    const category = await this.prisma.category.findUnique({
      where: { id },
      include: {
        _count: {
          select: { children: true, services: true },
        },
      },
    });

    if (!category) {
      throw new NotFoundException(`Service category with ID '${id}' not found`);
    }

    if (hard) {
      if (category._count.children > 0) {
        throw new BadRequestException(
          `Cannot delete category having ${category._count.children} subcategories. Please reassign or delete them first.`,
        );
      }
      if (category._count.services > 0) {
        throw new BadRequestException(
          `Cannot delete category having ${category._count.services} associated services.`,
        );
      }

      await this.prisma.category.delete({ where: { id } });
      return { message: `Category '${category.name}' deleted successfully` };
    }

    // Soft delete / disable
    const updated = await this.prisma.category.update({
      where: { id },
      data: { isActive: false },
    });

    return {
      message: `Category '${category.name}' deactivated successfully`,
      data: updated,
    };
  }

  async toggleStatus(id: string, isActive?: boolean) {
    const category = await this.prisma.category.findUnique({
      where: { id },
    });
    if (!category) {
      throw new NotFoundException(`Service category with ID '${id}' not found`);
    }

    const nextStatus = isActive !== undefined ? isActive : !category.isActive;

    return this.prisma.category.update({
      where: { id },
      data: { isActive: nextStatus },
    });
  }

  private async checkIsDescendant(
    ancestorId: string,
    candidateId: string,
  ): Promise<boolean> {
    let currentId: string | null = candidateId;
    const visited = new Set<string>();

    while (currentId) {
      if (currentId === ancestorId) {
        return true;
      }
      if (visited.has(currentId)) {
        break;
      }
      visited.add(currentId);

      const node: { parentId: string | null } | null =
        await this.prisma.category.findUnique({
          where: { id: currentId },
          select: { parentId: true },
        });

      currentId = node?.parentId ?? null;
    }

    return false;
  }

  private buildTree(
    categories: Array<{
      id: string;
      parentId: string | null;
      name: string;
      description: string | null;
      imageUrl: string | null;
      isActive: boolean;
      createdAt: Date;
      updatedAt: Date;
      _count?: { services: number };
    }>,
  ): CategoryTreeNode[] {
    const map = new Map<string, CategoryTreeNode>();
    const roots: CategoryTreeNode[] = [];

    // Initialize map
    for (const cat of categories) {
      map.set(cat.id, {
        id: cat.id,
        parentId: cat.parentId,
        name: cat.name,
        description: cat.description,
        imageUrl: cat.imageUrl,
        isActive: cat.isActive,
        createdAt: cat.createdAt,
        updatedAt: cat.updatedAt,
        servicesCount: cat._count?.services ?? 0,
        children: [],
      });
    }

    // Connect parents and children
    for (const cat of categories) {
      const node = map.get(cat.id)!;
      if (cat.parentId && map.has(cat.parentId)) {
        map.get(cat.parentId)!.children.push(node);
      } else {
        roots.push(node);
      }
    }

    return roots;
  }
}
