/**
 * Injected Wallet Module
 *
 * Exports for browser extension wallet detection and management.
 */

export { InjectedWalletDetector } from './detector';
export type { InjectedWalletInfo, DetectedWallet, DetectionCallback } from './detector';

export { InjectedWalletAdapter } from './adapter';

export { InjectedWalletManager } from './manager';
export type { InjectedWalletManagerConfig } from './manager';
