/**
 * Injected Wallet Manager
 *
 * Manages detection and interaction with browser extension wallets.
 */

import type { NearWalletBase } from '../../types';
import { InjectedWalletDetector, type DetectedWallet } from './detector';
import { InjectedWalletAdapter } from './adapter';

export interface InjectedWalletManagerConfig {
  /** Detection timeout in ms (default: 2000) */
  detectionTimeout?: number;
  /** Callback when wallets are detected */
  onDetected?: (wallets: NearWalletBase[]) => void;
}

export class InjectedWalletManager {
  private detector: InjectedWalletDetector;
  private adapters: Map<string, InjectedWalletAdapter> = new Map();
  private config: InjectedWalletManagerConfig;
  private initialized = false;

  constructor(config: InjectedWalletManagerConfig = {}) {
    this.detector = new InjectedWalletDetector();
    this.config = config;
  }

  /**
   * Initialize detection
   */
  async init(): Promise<NearWalletBase[]> {
    if (this.initialized) {
      return this.getWallets();
    }

    const timeout = this.config.detectionTimeout ?? 2000;
    const detected = await this.detector.detect(timeout);

    for (const wallet of detected) {
      this.addAdapter(wallet);
    }

    // Subscribe to future detections
    this.detector.onDetected((wallets) => {
      for (const wallet of wallets) {
        if (!this.adapters.has(wallet.info.id)) {
          this.addAdapter(wallet);
        }
      }
      if (this.config.onDetected) {
        this.config.onDetected(this.getWallets());
      }
    });

    this.initialized = true;

    console.log(`[NearConnect] Found ${detected.length} injected wallet(s)`);

    return this.getWallets();
  }

  /**
   * Add an adapter for a detected wallet
   * Skips postMessage channel wallets since they need to go through sandboxed executor
   */
  private addAdapter(wallet: DetectedWallet): void {
    // PostMessage channel wallets (like Meteor) can't be operated directly
    // They inject a communication channel, not a wallet provider
    // Actual wallet operations must go through the sandboxed executor from manifest
    if (wallet.info.usesPostMessageChannel) {
      console.log(
        `[NearConnect] ${wallet.info.name} extension detected. ` +
        `Wallet operations will use sandboxed executor from manifest.`
      );
      return;
    }

    const adapter = new InjectedWalletAdapter(wallet);
    this.adapters.set(wallet.info.id, adapter);
  }

  /**
   * Get all detected wallets as NearWalletBase
   */
  getWallets(): NearWalletBase[] {
    return Array.from(this.adapters.values());
  }

  /**
   * Get a specific wallet by ID
   */
  getWallet(walletId: string): NearWalletBase | undefined {
    return this.adapters.get(walletId);
  }

  /**
   * Check if wallet ID is an injected wallet (has usable adapter)
   */
  isInjectedWallet(walletId: string): boolean {
    return this.adapters.has(walletId);
  }

  /**
   * Check if a wallet extension is detected (including postMessage channel wallets)
   * Use this to show "extension detected" in the UI even for wallets like Meteor
   * that need to go through the sandboxed executor
   */
  isExtensionDetected(walletId: string): boolean {
    return this.detector.isAvailable(walletId);
  }

  /**
   * Get all detected wallet IDs (including postMessage channel wallets)
   */
  getDetectedWalletIds(): string[] {
    return this.detector.getAll().map((w) => w.info.id);
  }

  /**
   * Check if any injected wallets were detected
   */
  hasWallets(): boolean {
    return this.adapters.size > 0;
  }

  /**
   * Get count of detected wallets
   */
  get count(): number {
    return this.adapters.size;
  }

  /**
   * Cleanup
   */
  destroy(): void {
    this.detector.destroy();
    this.adapters.clear();
    this.initialized = false;
  }
}
