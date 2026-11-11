import { ApiProperty } from '@nestjs/swagger';

export class MessageReadDto {
  @ApiProperty({
    description:
      'Số thứ tự sequence cao nhất của tin nhắn đã đọc trong hội thoại',
    example: '15',
  })
  lastReadSequence!: string;
}
