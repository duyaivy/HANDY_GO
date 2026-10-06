import { describe, expect, it } from 'vitest';
import { validate } from 'class-validator';
import { IsMaxByteLength } from './password.util.js';

class TestPasswordDto {
  @IsMaxByteLength(72, { message: 'Mật khẩu không được vượt quá 72 byte UTF-8' })
  password!: string;
}

describe('IsMaxByteLength Validator', () => {
  it('should pass for passwords well within 72 bytes', async () => {
    const dto = new TestPasswordDto();
    dto.password = 'P@ssword123';
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should pass for exactly 72 ascii characters', async () => {
    const dto = new TestPasswordDto();
    dto.password = 'A'.repeat(72);
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should fail for 73 ascii characters', async () => {
    const dto = new TestPasswordDto();
    dto.password = 'A'.repeat(73);
    const errors = await validate(dto);
    expect(errors.length).toBe(1);
    expect(errors[0].constraints?.isMaxByteLength).toContain('72 byte UTF-8');
  });

  it('should fail for multi-byte characters that exceed 72 bytes even if character length <= 72', async () => {
    const dto = new TestPasswordDto();
    // 'TiếngViệtĐẹp' has multibyte accented characters
    // 40 repetitions of 'Tiếng' -> 40 chars * 6 bytes > 72 bytes
    dto.password = 'TiếngViệt'.repeat(8); // 9 chars * 8 = 72 chars, but UTF-8 byte length is 104 bytes!
    expect(dto.password.length).toBe(72);
    expect(Buffer.byteLength(dto.password, 'utf8')).toBeGreaterThan(72);

    const errors = await validate(dto);
    expect(errors.length).toBe(1);
    expect(errors[0].constraints?.isMaxByteLength).toContain('72 byte UTF-8');
  });
});
