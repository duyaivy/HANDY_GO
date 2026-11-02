import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RequestChangesProposalDto {
  @ApiProperty({
    description:
      'Reason and note explaining requested modifications to terms, scope, price, or schedule',
    example:
      'Cần tăng giá thêm 50,000đ do đường ống bị chôn sâu trong tường, và đổi lịch sang 16h.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  responseNote: string;
}
