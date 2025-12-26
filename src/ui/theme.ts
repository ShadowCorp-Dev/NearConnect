/**
 * Theme configuration for NEAR Connect UI
 */

export type ThemeMode = "dark" | "light" | "auto";

/**
 * Color palette for themes
 */
export interface ThemeColors {
  // Backgrounds
  background: string;
  backgroundSecondary: string;
  backgroundOverlay: string;

  // Text
  text: string;
  textSecondary: string;
  textMuted: string;

  // Borders
  border: string;
  borderHover: string;

  // Accent
  accent: string;
  accentHover: string;
  accentText: string;

  // States
  success: string;
  error: string;
  warning: string;

  // Interactive
  buttonBackground: string;
  buttonText: string;
  buttonHover: string;
}

/**
 * Typography configuration
 */
export interface ThemeTypography {
  fontFamily: string;
  fontFamilyMono: string;
  fontSizeXs: string;
  fontSizeSm: string;
  fontSizeMd: string;
  fontSizeLg: string;
  fontSizeXl: string;
  fontWeight: string;
  fontWeightMedium: string;
  fontWeightBold: string;
  lineHeight: string;
}

/**
 * Spacing configuration
 */
export interface ThemeSpacing {
  xs: string;
  sm: string;
  md: string;
  lg: string;
  xl: string;
  xxl: string;
}

/**
 * Border radius configuration
 */
export interface ThemeBorderRadius {
  sm: string;
  md: string;
  lg: string;
  xl: string;
  full: string;
}

/**
 * Animation configuration
 */
export interface ThemeAnimation {
  duration: string;
  durationFast: string;
  durationSlow: string;
  easing: string;
}

/**
 * Branding configuration
 */
export interface ThemeBranding {
  name: string;
  logo?: string;
  helpUrl?: string;
  getWalletUrl?: string;
}

/**
 * Complete theme configuration
 */
export interface Theme {
  mode: ThemeMode;
  colors: ThemeColors;
  typography: ThemeTypography;
  spacing: ThemeSpacing;
  borderRadius: ThemeBorderRadius;
  animation: ThemeAnimation;
  branding: ThemeBranding;
}

/**
 * Partial theme for overrides
 */
export type ThemeOverrides = {
  mode?: ThemeMode;
  colors?: Partial<ThemeColors>;
  typography?: Partial<ThemeTypography>;
  spacing?: Partial<ThemeSpacing>;
  borderRadius?: Partial<ThemeBorderRadius>;
  animation?: Partial<ThemeAnimation>;
  branding?: Partial<ThemeBranding>;
};

/**
 * Dark theme colors
 */
const darkColors: ThemeColors = {
  background: "#0d0d0d",
  backgroundSecondary: "rgba(255, 255, 255, 0.08)",
  backgroundOverlay: "rgba(0, 0, 0, 0.5)",

  text: "#ffffff",
  textSecondary: "rgba(255, 255, 255, 0.9)",
  textMuted: "rgba(255, 255, 255, 0.5)",

  border: "rgba(255, 255, 255, 0.1)",
  borderHover: "rgba(255, 255, 255, 0.2)",

  accent: "#6366f1",
  accentHover: "#4f46e5",
  accentText: "#ffffff",

  success: "#22c55e",
  error: "#ef4444",
  warning: "#f59e0b",

  buttonBackground: "#ffffff",
  buttonText: "#000000",
  buttonHover: "rgba(255, 255, 255, 0.9)",
};

/**
 * Light theme colors
 */
const lightColors: ThemeColors = {
  background: "#ffffff",
  backgroundSecondary: "rgba(0, 0, 0, 0.04)",
  backgroundOverlay: "rgba(0, 0, 0, 0.3)",

  text: "#0d0d0d",
  textSecondary: "rgba(0, 0, 0, 0.8)",
  textMuted: "rgba(0, 0, 0, 0.5)",

  border: "rgba(0, 0, 0, 0.1)",
  borderHover: "rgba(0, 0, 0, 0.2)",

  accent: "#6366f1",
  accentHover: "#4f46e5",
  accentText: "#ffffff",

  success: "#22c55e",
  error: "#ef4444",
  warning: "#f59e0b",

  buttonBackground: "#0d0d0d",
  buttonText: "#ffffff",
  buttonHover: "rgba(0, 0, 0, 0.85)",
};

/**
 * Default typography
 */
const defaultTypography: ThemeTypography = {
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol"',
  fontFamilyMono: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, Consolas, monospace',
  fontSizeXs: "12px",
  fontSizeSm: "14px",
  fontSizeMd: "16px",
  fontSizeLg: "18px",
  fontSizeXl: "24px",
  fontWeight: "400",
  fontWeightMedium: "500",
  fontWeightBold: "600",
  lineHeight: "1.5",
};

/**
 * Default spacing
 */
const defaultSpacing: ThemeSpacing = {
  xs: "4px",
  sm: "8px",
  md: "16px",
  lg: "24px",
  xl: "32px",
  xxl: "48px",
};

/**
 * Default border radius
 */
const defaultBorderRadius: ThemeBorderRadius = {
  sm: "8px",
  md: "12px",
  lg: "16px",
  xl: "24px",
  full: "9999px",
};

/**
 * Default animation
 */
const defaultAnimation: ThemeAnimation = {
  duration: "200ms",
  durationFast: "100ms",
  durationSlow: "300ms",
  easing: "ease-in-out",
};

/**
 * Default branding
 */
const defaultBranding: ThemeBranding = {
  name: "NEAR Connect",
  helpUrl: "https://near.org/learn",
  getWalletUrl: "https://near.org/wallets",
};

/**
 * Create dark theme
 */
export function createDarkTheme(overrides?: ThemeOverrides): Theme {
  return mergeTheme(
    {
      mode: "dark",
      colors: darkColors,
      typography: defaultTypography,
      spacing: defaultSpacing,
      borderRadius: defaultBorderRadius,
      animation: defaultAnimation,
      branding: defaultBranding,
    },
    overrides
  );
}

/**
 * Create light theme
 */
export function createLightTheme(overrides?: ThemeOverrides): Theme {
  return mergeTheme(
    {
      mode: "light",
      colors: lightColors,
      typography: defaultTypography,
      spacing: defaultSpacing,
      borderRadius: defaultBorderRadius,
      animation: defaultAnimation,
      branding: defaultBranding,
    },
    overrides
  );
}

/**
 * Merge theme with overrides
 */
export function mergeTheme(base: Theme, overrides?: ThemeOverrides): Theme {
  if (!overrides) return base;

  return {
    mode: overrides.mode ?? base.mode,
    colors: { ...base.colors, ...overrides.colors },
    typography: { ...base.typography, ...overrides.typography },
    spacing: { ...base.spacing, ...overrides.spacing },
    borderRadius: { ...base.borderRadius, ...overrides.borderRadius },
    animation: { ...base.animation, ...overrides.animation },
    branding: { ...base.branding, ...overrides.branding },
  };
}

/**
 * Get theme based on system preference
 */
export function getSystemTheme(darkTheme: Theme, lightTheme: Theme): Theme {
  if (typeof window === "undefined") return darkTheme;

  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  return prefersDark ? darkTheme : lightTheme;
}

/**
 * Convert theme to CSS custom properties
 */
export function themeToCssVars(theme: Theme): string {
  const vars: string[] = [];

  // Colors
  Object.entries(theme.colors).forEach(([key, value]) => {
    vars.push(`--nc-color-${camelToKebab(key)}: ${value};`);
  });

  // Typography
  Object.entries(theme.typography).forEach(([key, value]) => {
    vars.push(`--nc-${camelToKebab(key)}: ${value};`);
  });

  // Spacing
  Object.entries(theme.spacing).forEach(([key, value]) => {
    vars.push(`--nc-spacing-${key}: ${value};`);
  });

  // Border radius
  Object.entries(theme.borderRadius).forEach(([key, value]) => {
    vars.push(`--nc-radius-${key}: ${value};`);
  });

  // Animation
  Object.entries(theme.animation).forEach(([key, value]) => {
    vars.push(`--nc-${camelToKebab(key)}: ${value};`);
  });

  return vars.join("\n  ");
}

/**
 * Convert camelCase to kebab-case
 */
function camelToKebab(str: string): string {
  return str.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
}

/**
 * Default dark theme instance
 */
export const darkTheme = createDarkTheme();

/**
 * Default light theme instance
 */
export const lightTheme = createLightTheme();
