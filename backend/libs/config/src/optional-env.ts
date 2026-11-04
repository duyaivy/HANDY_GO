/** Blank means unset; preserve nonblank values, including spaces in secrets. */
export function optionalValue(value: string | undefined): string | undefined {
  return value?.trim() ? value : undefined;
}
