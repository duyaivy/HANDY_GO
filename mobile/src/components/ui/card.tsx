import type { ReactNode } from 'react';
import type { ViewProps } from 'react-native';
import { View } from 'react-native';
import { tv } from 'tailwind-variants';

const cardVariants = tv({
  base: 'rounded-2xl bg-white p-4 dark:bg-neutral-900',
  variants: {
    variant: {
      default: 'border border-neutral-100 shadow-sm dark:border-neutral-800',
      outlined: 'border border-neutral-200 shadow-none dark:border-neutral-700',
      flat: 'bg-neutral-50 shadow-none dark:bg-neutral-800',
      elevated: 'border-0 shadow-md',
    },
    padding: {
      none: 'p-0',
      sm: 'p-3',
      md: 'p-4',
      lg: 'p-6',
    },
  },
  defaultVariants: {
    variant: 'default',
    padding: 'md',
  },
});

export type CardProps = {
  children: ReactNode;
  className?: string;
  variant?: 'default' | 'outlined' | 'flat' | 'elevated';
  padding?: 'none' | 'sm' | 'md' | 'lg';
} & ViewProps;

export function Card({
  children,
  className,
  variant,
  padding,
  style,
  ...props
}: CardProps) {
  return (
    <View
      className={cardVariants({ variant, padding, className })}
      style={style}
      {...props}
    >
      {children}
    </View>
  );
}
