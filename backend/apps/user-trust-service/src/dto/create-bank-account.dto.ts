import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateBankAccountDto {
  @ApiProperty({ example: 'VCB', description: 'Mã ngân hàng (VCB, TCB, MB, ...)' })
  @IsString({ message: 'Mã ngân hàng phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'Mã ngân hàng không được để trống' })
  @MaxLength(20, { message: 'Mã ngân hàng không được vượt quá 20 ký tự' })
  bankCode!: string;

  @ApiProperty({ example: 'Vietcombank', description: 'Tên đầy đủ của ngân hàng' })
  @IsString({ message: 'Tên ngân hàng phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'Tên ngân hàng không được để trống' })
  @MaxLength(100, { message: 'Tên ngân hàng không được vượt quá 100 ký tự' })
  bankName!: string;

  @ApiProperty({ example: '0123456789', description: 'Số tài khoản ngân hàng' })
  @IsString({ message: 'Số tài khoản phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'Số tài khoản không được để trống' })
  @MaxLength(50, { message: 'Số tài khoản không được vượt quá 50 ký tự' })
  accountNumber!: string;

  @ApiProperty({ example: 'NGUYEN VAN A', description: 'Tên chủ tài khoản ngân hàng' })
  @IsString({ message: 'Tên chủ tài khoản phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'Tên chủ tài khoản không được để trống' })
  @MaxLength(150, { message: 'Tên chủ tài khoản không được vượt quá 150 ký tự' })
  accountHolderName!: string;

  @ApiPropertyOptional({ example: true, description: 'Đặt làm tài khoản mặc định', default: false })
  @IsOptional()
  @IsBoolean({ message: 'isDefault phải là boolean' })
  isDefault?: boolean;
}

