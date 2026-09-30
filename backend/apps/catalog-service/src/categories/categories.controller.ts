import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CategoriesService } from './categories.service.js';
import { CreateCategoryDto } from './dto/create-category.dto.js';
import { UpdateCategoryDto } from './dto/update-category.dto.js';
import { QueryCategoryDto } from './dto/query-category.dto.js';
import { CategoryResponseDto } from './dto/category-response.dto.js';

@ApiTags('Service Categories')
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a new service category',
    description:
      'Admin endpoint to create a new category or subcategory with unique name validation',
  })
  @ApiBody({ type: CreateCategoryDto })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Category created successfully',
    type: CategoryResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid input data',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Parent category not found',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Duplicate category name under parent',
  })
  create(@Body() dto: CreateCategoryDto) {
    return this.categoriesService.create(dto);
  }

  @Get()
  @ApiOperation({
    summary: 'Get list of service categories',
    description:
      'Public endpoint to fetch categories with pagination, search, status filtering, and hierarchical tree mode',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'List of categories or category tree',
    type: [CategoryResponseDto],
  })
  findAll(@Query() query: QueryCategoryDto) {
    return this.categoriesService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get service category detail',
    description:
      'Public/Admin endpoint to get category details with children subcategories and associated services',
  })
  @ApiParam({ name: 'id', description: 'Category UUID', type: String })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Category detail',
    type: CategoryResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Category not found',
  })
  findOne(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.categoriesService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update a service category',
    description:
      'Admin endpoint to update category information with hierarchy cycle prevention and uniqueness checks',
  })
  @ApiParam({ name: 'id', description: 'Category UUID', type: String })
  @ApiBody({ type: UpdateCategoryDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Category updated successfully',
    type: CategoryResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid input or circular parent dependency',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Category or parent not found',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Duplicate category name',
  })
  update(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.categoriesService.update(id, dto);
  }

  @Patch(':id/status')
  @ApiOperation({
    summary: 'Enable or disable a category',
    description:
      'Admin endpoint to quickly toggle or set the active status of a category',
  })
  @ApiParam({ name: 'id', description: 'Category UUID', type: String })
  @ApiQuery({
    name: 'isActive',
    required: false,
    type: Boolean,
    description: 'Explicit active status. If omitted, toggles current status.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Category status updated',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Category not found',
  })
  toggleStatus(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Query('isActive') isActive?: boolean,
  ) {
    return this.categoriesService.toggleStatus(id, isActive);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete or disable a service category',
    description:
      'Admin endpoint to soft-delete (deactivate) or hard-delete (when ?hard=true) a category',
  })
  @ApiParam({ name: 'id', description: 'Category UUID', type: String })
  @ApiQuery({
    name: 'hard',
    required: false,
    type: Boolean,
    description:
      'If true, permanently deletes the category from DB (must have no children or services)',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Category deleted or deactivated',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Cannot delete category with dependent records',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Category not found',
  })
  remove(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Query('hard') hard?: boolean,
  ) {
    return this.categoriesService.remove(id, String(hard) === 'true');
  }
}
