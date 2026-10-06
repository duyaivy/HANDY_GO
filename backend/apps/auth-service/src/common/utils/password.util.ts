import {
  registerDecorator,
  type ValidationArguments,
  type ValidationOptions,
} from 'class-validator';

/**
 * Validates that a string does not exceed a maximum byte length when encoded in UTF-8.
 * Essential for password fields to respect bcrypt's hard 72-byte truncation boundary.
 */
export function IsMaxByteLength(
  maxBytes: number,
  validationOptions?: ValidationOptions,
) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'isMaxByteLength',
      target: object.constructor,
      propertyName,
      constraints: [maxBytes],
      options: validationOptions,
      validator: {
        validate(value: unknown, args: ValidationArguments): boolean {
          if (typeof value !== 'string') {
            return false;
          }
          const [limit] = args.constraints;
          return Buffer.byteLength(value, 'utf8') <= limit;
        },
        defaultMessage(args: ValidationArguments): string {
          const [limit] = args.constraints;
          return `Mật khẩu không được vượt quá ${limit} byte UTF-8`;
        },
      },
    });
  };
}
