/**
 * Privileged Wallet Manager
 *
 * Manages hardware wallets (Ledger, future Trezor)
 */

import type { Network, Transaction, Account } from '../../types';
import type {
  HardwareConfig,
  LedgerConfig,
  HardwareWaitingEvent,
  HardwareConfirmEvent,
  HardwareRejectedEvent,
} from '../../hardware/types';
import {
  LedgerWallet,
  type LedgerWalletAccount,
  type LedgerTransactionResult,
  type LedgerSignedTransaction,
  type LedgerSignMessageParams,
  type LedgerSignedMessage,
} from './ledger';

// =============================================================================
// Types
// =============================================================================

export interface PrivilegedWalletManagerConfig {
  network: Network;
  hardware?: HardwareConfig;
  rpcUrl?: string;
}

export interface PrivilegedWalletManagerEvents {
  'hardware:waiting': HardwareWaitingEvent;
  'hardware:confirm': HardwareConfirmEvent;
  'hardware:rejected': HardwareRejectedEvent;
}

type EventCallback<T> = (data: T) => void;
type Unsubscribe = () => void;

export interface WalletManifest {
  id: string;
  name: string;
  description?: string;
  iconUrl: string;
  type: 'privileged';
  hardwareType?: 'ledger' | 'trezor';
  features?: Record<string, boolean>;
}

// =============================================================================
// Manager
// =============================================================================

export class PrivilegedWalletManager {
  private wallets: Map<string, LedgerWallet> = new Map();
  private eventListeners: Map<keyof PrivilegedWalletManagerEvents, Set<EventCallback<unknown>>> = new Map();
  private config: PrivilegedWalletManagerConfig;

  constructor(config: PrivilegedWalletManagerConfig) {
    this.config = config;
    this.initializeWallets();
  }

  // ===========================================================================
  // Initialization
  // ===========================================================================

  private initializeWallets(): void {
    const { hardware, network, rpcUrl } = this.config;

    if (!hardware) return;

    // Initialize Ledger
    if (hardware.ledger) {
      const ledgerConfig = this.normalizeLedgerConfig(hardware.ledger);

      if (ledgerConfig.enabled && LedgerWallet.isSupported()) {
        const ledger = new LedgerWallet({
          network,
          ledger: ledgerConfig,
          rpcUrl,
        });

        this.registerWallet(ledger);
      }
    }

    // Future: Initialize Trezor
    // if (hardware.trezor) { ... }
  }

  private normalizeLedgerConfig(config: LedgerConfig | boolean): LedgerConfig {
    if (typeof config === 'boolean') {
      return { enabled: config };
    }
    return { enabled: true, ...config };
  }

  private registerWallet(wallet: LedgerWallet): void {
    this.wallets.set(wallet.id, wallet);

    // Forward events
    wallet.onWaiting((event) => {
      this.emit('hardware:waiting', event);
    });

    wallet.onConfirm((event) => {
      this.emit('hardware:confirm', event);
    });

    wallet.onRejected((event) => {
      this.emit('hardware:rejected', event);
    });
  }

  // ===========================================================================
  // Wallet Discovery
  // ===========================================================================

  getManifests(): WalletManifest[] {
    const manifests: WalletManifest[] = [];

    for (const wallet of this.wallets.values()) {
      manifests.push(LedgerWallet.getManifest());
    }

    return manifests;
  }

  isPrivilegedWallet(walletId: string): boolean {
    return this.wallets.has(walletId);
  }

  getWallet(walletId: string): LedgerWallet | undefined {
    return this.wallets.get(walletId);
  }

  hasAvailableWallets(): boolean {
    return this.wallets.size > 0;
  }

  // ===========================================================================
  // Wallet Operations
  // ===========================================================================

  async connect(walletId: string): Promise<LedgerWalletAccount[]> {
    const wallet = this.wallets.get(walletId);

    if (!wallet) {
      throw new Error(`Privileged wallet not found: ${walletId}`);
    }

    return wallet.signIn();
  }

  async disconnect(walletId: string): Promise<void> {
    const wallet = this.wallets.get(walletId);

    if (!wallet) {
      throw new Error(`Privileged wallet not found: ${walletId}`);
    }

    return wallet.signOut();
  }

  async getAccounts(walletId: string): Promise<LedgerWalletAccount[]> {
    const wallet = this.wallets.get(walletId);

    if (!wallet) {
      throw new Error(`Privileged wallet not found: ${walletId}`);
    }

    return wallet.getAccounts();
  }

  isConnected(walletId: string): boolean {
    const wallet = this.wallets.get(walletId);
    return wallet?.isConnected() ?? false;
  }

  async signTransaction(walletId: string, tx: Transaction): Promise<LedgerSignedTransaction> {
    const wallet = this.wallets.get(walletId);

    if (!wallet) {
      throw new Error(`Privileged wallet not found: ${walletId}`);
    }

    return wallet.signTransaction(tx);
  }

  async signAndSendTransaction(walletId: string, tx: Transaction): Promise<LedgerTransactionResult> {
    const wallet = this.wallets.get(walletId);

    if (!wallet) {
      throw new Error(`Privileged wallet not found: ${walletId}`);
    }

    return wallet.signAndSendTransaction(tx);
  }

  async signAndSendTransactions(walletId: string, txs: Transaction[]): Promise<LedgerTransactionResult[]> {
    const wallet = this.wallets.get(walletId);

    if (!wallet) {
      throw new Error(`Privileged wallet not found: ${walletId}`);
    }

    return wallet.signAndSendTransactions(txs);
  }

  async signMessage(walletId: string, params: LedgerSignMessageParams): Promise<LedgerSignedMessage> {
    const wallet = this.wallets.get(walletId);

    if (!wallet) {
      throw new Error(`Privileged wallet not found: ${walletId}`);
    }

    return wallet.signMessage(params);
  }

  // ===========================================================================
  // Event System
  // ===========================================================================

  on<K extends keyof PrivilegedWalletManagerEvents>(
    event: K,
    callback: EventCallback<PrivilegedWalletManagerEvents[K]>
  ): Unsubscribe {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(callback as EventCallback<unknown>);
    return () => this.eventListeners.get(event)?.delete(callback as EventCallback<unknown>);
  }

  private emit<K extends keyof PrivilegedWalletManagerEvents>(
    event: K,
    data: PrivilegedWalletManagerEvents[K]
  ): void {
    this.eventListeners.get(event)?.forEach((cb) => {
      try {
        cb(data);
      } catch (e) {
        console.error(`Error in ${event} listener:`, e);
      }
    });
  }

  // ===========================================================================
  // Cleanup
  // ===========================================================================

  async destroy(): Promise<void> {
    for (const wallet of this.wallets.values()) {
      try {
        await wallet.signOut();
      } catch {
        // Ignore cleanup errors
      }
    }
    this.wallets.clear();
    this.eventListeners.clear();
  }
}
