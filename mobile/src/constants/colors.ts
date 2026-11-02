/**
 * Chuẩn bảng màu HandyGo (Mô hình nhận diện Vua Thợ)
 *
 * Semantic Tokens:
 * - primary: Vàng Hổ Phách (#F5A524)
 * - secondary: Xanh Kỹ Thuật (#2563EB)
 * - background: Nền chính ứng dụng (#FFFFFF / Dark: #0A0A0A)
 * - surface: Nền thẻ / bề mặt giao diện (#FFFFFF / Dark: #171717)
 * - text: Màu chữ chuẩn (primary: #0A0A0A, secondary: #737373)
 * - border: Đường viền khung / ngăn cách (#E5E5E5 / Dark: #404040)
 * - error: Cảnh báo / lỗi (#EF4444)
 * - success: Hoàn thành / thành công (#22C55E)
 */

// 1. Standalone Core Semantic Constants (Vua Thợ)
export const PRIMARY_COLOR = '#F5A524';
export const SECONDARY_COLOR = '#2563EB';
export const BACKGROUND_COLOR = '#FFFFFF';
export const SURFACE_COLOR = '#FFFFFF';
export const TEXT_PRIMARY_COLOR = '#0A0A0A';
export const TEXT_SECONDARY_COLOR = '#737373';
export const BORDER_COLOR = '#E5E5E5';
export const ERROR_COLOR = '#EF4444';
export const SUCCESS_COLOR = '#22C55E';

// 2. Direct named semantic exports (as const)
export const primary = '#F5A524' as const;
export const secondary = '#2563EB' as const;
export const background = '#FFFFFF' as const;
export const surface = '#FFFFFF' as const;
export const text = {
  primary: '#0A0A0A',
  secondary: '#737373',
  DEFAULT: '#0A0A0A',
} as const;
export const border = '#E5E5E5' as const;
export const error = '#EF4444' as const;
export const success = '#22C55E' as const;

// 3. Compact semantic theme dictionary
export const themeColors = {
  primary: '#F5A524',
  secondary: '#2563EB',
  background: '#FFFFFF',
  surface: '#FFFFFF',
  text: {
    primary: '#0A0A0A',
    secondary: '#737373',
  },
  border: '#E5E5E5',
  error: '#EF4444',
  success: '#22C55E',
} as const;

// 4. Full Design System Palette (Multi-shade + Semantic compatibility)
export const colors = {
  primary: {
    DEFAULT: '#F5A524',
    50: '#FFF9EB',
    100: '#FEEEC8',
    200: '#FDDC8E',
    300: '#FCC554',
    400: '#FBAF2B',
    500: '#F5A524',
    600: '#D9820A',
    700: '#B26006',
    800: '#8E4B09',
    900: '#743E0B',
  },
  secondary: {
    DEFAULT: '#2563EB',
    50: '#EFF6FF',
    100: '#DBEAFE',
    200: '#BFDBFE',
    300: '#93C5FD',
    400: '#60A5FA',
    500: '#3B82F6',
    600: '#2563EB',
    700: '#1D4ED8',
    800: '#1E40AF',
    900: '#1E3A8A',
  },
  background: {
    DEFAULT: '#FFFFFF',
    light: '#FFFFFF',
    dark: '#0A0A0A',
  },
  surface: {
    DEFAULT: '#FFFFFF',
    light: '#FFFFFF',
    dark: '#171717',
  },
  text: {
    DEFAULT: '#0A0A0A',
    primary: '#0A0A0A',
    secondary: '#737373',
    light: '#0A0A0A',
    dark: '#FAFAFA',
    muted: '#737373',
  },
  border: {
    DEFAULT: '#E5E5E5',
    light: '#E5E5E5',
    dark: '#404040',
  },
  error: {
    DEFAULT: '#EF4444',
    50: '#FEF2F2',
    100: '#FEE2E2',
    500: '#EF4444',
    600: '#DC2626',
  },
  success: {
    DEFAULT: '#22C55E',
    50: '#F0FDF4',
    100: '#DCFCE7',
    500: '#22C55E',
    600: '#16A34A',
    700: '#15803D',
  },
  neutral: {
    50: '#FAFAFA',
    100: '#F5F5F5',
    200: '#F0EFEE',
    300: '#D4D4D4',
    400: '#A3A3A3',
    500: '#737373',
    600: '#525252',
    700: '#404040',
    800: '#262626',
    900: '#171717',
    950: '#0A0A0A',
  },
  charcoal: {
    50: '#F2F2F2',
    100: '#E5E5E5',
    200: '#C9C9C9',
    300: '#B0B0B0',
    400: '#969696',
    500: '#7D7D7D',
    600: '#616161',
    700: '#474747',
    800: '#383838',
    850: '#2E2E2E',
    900: '#1E1E1E',
    950: '#121212',
  },
  warning: {
    DEFAULT: '#F59E0B',
    50: '#FFFBEB',
    100: '#FEF3C7',
    500: '#F59E0B',
    600: '#D97706',
  },
  danger: {
    DEFAULT: '#EF4444',
    50: '#FEF2F2',
    100: '#FEE2E2',
    500: '#EF4444',
    600: '#DC2626',
  },
  white: '#FFFFFF',
  black: '#000000',
  transparent: 'transparent',
} as const;

// 5. Export TypeScript types
export type ColorTheme = typeof colors;
export type ThemeColors = typeof themeColors;
export type ThemeColorName = keyof ThemeColors;
