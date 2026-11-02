import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

@ValidatorConstraint({ name: 'isCommaSeparatedEnum', async: false })
export class IsCommaSeparatedEnumConstraint
  implements ValidatorConstraintInterface
{
  validate(value: any, args?: ValidationArguments): boolean {
    if (typeof value !== 'string') {
      return false;
    }

    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return false;
    }

    const enumObj = args?.constraints?.[0];
    const allowedValues: string[] = Array.isArray(enumObj)
      ? enumObj
      : Object.values(enumObj || {});

    const rawTokens = value.split(',');
    if (rawTokens.length === 0) {
      return false;
    }

    for (const rawToken of rawTokens) {
      const token = rawToken.trim();
      if (token.length === 0) {
        return false;
      }
      if (!allowedValues.includes(token)) {
        return false;
      }
    }

    return true;
  }

  defaultMessage(args?: ValidationArguments): string {
    const enumObj = args?.constraints?.[0];
    const allowedValues: string[] = Array.isArray(enumObj)
      ? enumObj
      : Object.values(enumObj || {});

    return `${args?.property} must be a valid comma-separated list of enum values (${allowedValues.join(', ')})`;
  }
}

export function IsCommaSeparatedEnum(
  enumType: object | string[],
  validationOptions?: ValidationOptions,
) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isCommaSeparatedEnum',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [enumType],
      validator: IsCommaSeparatedEnumConstraint,
    });
  };
}
