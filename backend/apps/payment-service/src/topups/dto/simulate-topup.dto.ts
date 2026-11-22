import { ApiProperty } from '@nestjs/swagger';
import { Equals, IsIn } from 'class-validator';

export class SimulateTopupDto {
  @ApiProperty({
    enum: ['succeeded', 'failed'],
    example: 'succeeded',
    description: 'Kết quả giả lập cho giao dịch topup: succeeded hoặc failed',
  })
  @IsIn(['succeeded', 'failed'])
  outcome!: 'succeeded' | 'failed';

  @ApiProperty({
    example: true,
    description: 'Xác nhận chạy trên môi trường giả lập (bắt buộc true)',
  })
  @Equals(true)
  confirmSimulated!: true;
}
