import {
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SubmitWorkerServiceItemDto {
  @ApiProperty({
    description: 'ID của dịch vụ từ danh mục hệ thống (UUID)',
    example: 'a26e3c78-f202-4ec0-a2f9-2462371d05a4',
  })
  @IsUUID('4', { message: 'serviceId phải là định dạng UUID hợp lệ' })
  @IsNotEmpty({ message: 'serviceId không được để trống' })
  serviceId!: string;

  @ApiPropertyOptional({
    description: 'Tiêu đề hoặc tên hiển thị riêng của thợ cho dịch vụ này',
    example: 'Vệ sinh máy lạnh treo tường giá tốt',
  })
  @IsOptional()
  @IsString({ message: 'Tiêu đề dịch vụ phải là chuỗi ký tự' })
  title?: string;

  @ApiPropertyOptional({
    description: 'Mô tả chi tiết về kinh nghiệm hoặc gói dịch vụ của thợ',
    example: 'Kinh nghiệm vệ sinh bảo dưỡng máy lạnh Panasonic, Daikin hơn 5 năm',
  })
  @IsOptional()
  @IsString({ message: 'Mô tả dịch vụ phải là chuỗi ký tự' })
  description?: string;

  @ApiPropertyOptional({
    description: 'Số năm kinh nghiệm làm dịch vụ này',
    example: 5,
    minimum: 0,
    maximum: 50,
  })
  @IsOptional()
  @IsInt({ message: 'Số năm kinh nghiệm phải là số nguyên' })
  @Min(0, { message: 'Số năm kinh nghiệm tối thiểu là 0' })
  @Max(50, { message: 'Số năm kinh nghiệm tối đa là 50' })
  experienceYears?: number;
}

export class WorkerServiceAreaDto {
  @ApiPropertyOptional({
    description: 'Địa chỉ đăng ký khu vực làm việc (dạng text)',
    example: 'Quận Cẩm Lệ, Thành phố Đà Nẵng',
  })
  @IsOptional()
  @IsString({ message: 'Địa chỉ phải là chuỗi ký tự' })
  address?: string;

  @ApiProperty({
    description: 'Vĩ độ (Latitude) của tâm khu vực nhận việc (-90 đến 90)',
    example: 16.0544,
  })
  @IsNumber({}, { message: 'latitude phải là số thực' })
  @Min(-90, { message: 'latitude tối thiểu là -90' })
  @Max(90, { message: 'latitude tối đa là 90' })
  latitude!: number;

  @ApiProperty({
    description: 'Kinh độ (Longitude) của tâm khu vực nhận việc (-180 đến 180)',
    example: 108.2022,
  })
  @IsNumber({}, { message: 'longitude phải là số thực' })
  @Min(-180, { message: 'longitude tối thiểu là -180' })
  @Max(180, { message: 'longitude tối đa là 180' })
  longitude!: number;

  @ApiProperty({
    description: 'Bán kính tìm việc tính bằng km (lựa chọn từ select box: 5, 10, 15, 20, 25, 30,...)',
    example: 15,
  })
  @IsNumber({}, { message: 'radiusKm phải là số thực' })
  @Min(1, { message: 'Bán kính tìm việc tối thiểu là 1km' })
  @Max(500, { message: 'Bán kính tìm việc tối đa là 500km' })
  radiusKm!: number;
}

export class WorkerEvidenceFileDto {
  @ApiProperty({
    description: 'Đường dẫn URL ảnh hoặc video minh chứng',
    example: 'https://res.cloudinary.com/demo/image/upload/sample.jpg',
  })
  @IsUrl({}, { message: 'url file minh chứng phải là một URL hợp lệ' })
  @IsNotEmpty({ message: 'url file minh chứng không được để trống' })
  url!: string;

  @ApiProperty({
    description: 'Loại file minh chứng',
    enum: ['image', 'video'],
    example: 'image',
  })
  @IsIn(['image', 'video'], { message: 'fileType phải là "image" hoặc "video"' })
  @IsNotEmpty({ message: 'fileType không được để trống' })
  fileType!: 'image' | 'video';

  @ApiPropertyOptional({
    description: 'Tên file hoặc chú thích minh chứng',
    example: 'Chứng chỉ thợ điện lạnh bậc 3/7',
  })
  @IsOptional()
  @IsString({ message: 'Tên hoặc chú thích phải là chuỗi ký tự' })
  name?: string;
}

export class SubmitWorkerRegistrationDto {
  @ApiProperty({
    description: 'Danh sách ID danh mục thợ đăng ký làm việc (UUID)',
    example: ['0986472e-1728-4731-82b2-ff77a7251326'],
    type: [String],
  })
  @IsArray({ message: 'categoryIds phải là một danh sách' })
  @IsUUID('4', { each: true, message: 'Mỗi categoryId phải là UUID hợp lệ' })
  @IsNotEmpty({ message: 'Vui lòng chọn ít nhất 1 danh mục' })
  categoryIds!: string[];

  @ApiProperty({
    description: 'Danh sách các dịch vụ trong danh mục thợ chọn đăng ký',
    type: [SubmitWorkerServiceItemDto],
  })
  @IsArray({ message: 'services phải là một danh sách dịch vụ' })
  @ValidateNested({ each: true })
  @Type(() => SubmitWorkerServiceItemDto)
  @IsNotEmpty({ message: 'Vui lòng chọn ít nhất 1 dịch vụ' })
  services!: SubmitWorkerServiceItemDto[];

  @ApiProperty({
    description: 'Khu vực thợ nhận làm việc (tọa độ, địa chỉ và bán kính tìm việc)',
    type: WorkerServiceAreaDto,
  })
  @ValidateNested()
  @Type(() => WorkerServiceAreaDto)
  @IsNotEmpty({ message: 'Vui lòng cung cấp khu vực làm việc' })
  serviceArea!: WorkerServiceAreaDto;

  @ApiProperty({
    description: 'Danh sách ảnh hoặc video minh chứng năng lực thực hiện dịch vụ gửi admin duyệt',
    type: [WorkerEvidenceFileDto],
  })
  @IsArray({ message: 'evidenceFiles phải là danh sách file minh chứng' })
  @ValidateNested({ each: true })
  @Type(() => WorkerEvidenceFileDto)
  @IsNotEmpty({ message: 'Vui lòng đính kèm ít nhất 1 hình ảnh hoặc video minh chứng' })
  evidenceFiles!: WorkerEvidenceFileDto[];

  @ApiPropertyOptional({
    description: 'Khóa idempotency để chống gửi trùng lặp yêu cầu (UUID hoặc chuỗi ngẫu nhiên)',
    example: 'idem-123e4567-e89b-12d3-a456-426614174000',
  })
  @IsOptional()
  @IsString({ message: 'idempotencyKey phải là chuỗi ký tự' })
  idempotencyKey?: string;
}

