/**
 * Pre-built UI components for NEAR Connect
 */

// Theme system
export {
  type ThemeMode,
  type ThemeColors,
  type ThemeTypography,
  type ThemeSpacing,
  type ThemeBorderRadius,
  type ThemeAnimation,
  type ThemeBranding,
  type Theme,
  type ThemeOverrides,
  createDarkTheme,
  createLightTheme,
  mergeTheme,
  getSystemTheme,
  themeToCssVars,
  darkTheme,
  lightTheme,
} from "./theme";

// Icons
export { icons, type IconName } from "./icons";

// Styles
export { generateStyles } from "./styles";

// Modal components
export { Modal, type ModalOptions } from "./Modal";
export {
  WalletSelectorModal,
  type WalletSelectorOptions,
  type WalletUIInfo,
  type WalletCategory,
} from "./WalletSelectorModal";
export { TransactionModal, type TransactionModalOptions } from "./TransactionModal";
export { AccountSwitcherModal, type AccountSwitcherOptions, type AccountUIInfo } from "./AccountSwitcherModal";
