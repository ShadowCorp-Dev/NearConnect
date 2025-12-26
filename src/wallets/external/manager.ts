/**
 * External Wallet Manager (Mobile + WalletConnect)
 *
 * Handles wallets that communicate via:
 * - Deep links (mobile apps)
 * - WalletConnect protocol
 * - Redirect flows (web wallets on mobile)
 */

import type { Network, Transaction, Account } from '../../types';

// =============================================================================
// Types
// =============================================================================

export type ExternalWalletType = 'deeplink' | 'walletconnect' | 'redirect';

export interface ExternalWalletConfig {
  id: string;
  name: string;
  type: ExternalWalletType;
  icon: string;

  // Deep link configuration
  deepLink?: {
    scheme: string;           // e.g., 'near', 'meteor', 'here'
    signIn: string;           // Path for sign in
    signTransaction: string;  // Path for signing
    signMessage?: string;     // Path for message signing
  };

  // WalletConnect configuration
  walletConnect?: {
    projectId: string;
    relayUrl?: string;
    metadata?: {
      name: string;
      description: string;
      url: string;
      icons: string[];
    };
  };

  // Redirect configuration (web wallets on mobile)
  redirect?: {
    signInUrl: string;
    signTransactionUrl: string;
    callbackUrl?: string;
  };

  // Platform availability
  platforms: {
    ios?: string;      // App Store URL
    android?: string;  // Play Store URL
    webapp?: string;   // Web fallback URL
  };
}

export interface ExternalWalletManagerConfig {
  network: Network;
  wallets: ExternalWalletConfig[];
  appName: string;
  appUrl: string;
  callbackUrl?: string;
}

export interface PendingRequest {
  id: string;
  type: 'signIn' | 'signTransaction' | 'signMessage';
  walletId: string;
  timestamp: number;
  payload: unknown;
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
}

export interface ExternalWalletAccount {
  accountId: string;
  publicKey?: string;
}

export interface ExternalTransactionResult {
  transaction: { hash: string; signerId: string; receiverId: string };
  status: { SuccessValue?: string; Failure?: unknown };
}

export interface ExternalSignMessageParams {
  message: string;
  recipient: string;
  nonce: Uint8Array;
  callbackUrl?: string;
}

export interface ExternalSignedMessage {
  accountId: string;
  publicKey: string;
  signature: string;
  message: string;
}

export interface ExternalWalletManifest {
  id: string;
  name: string;
  iconUrl: string;
  type: 'external';
  externalType: ExternalWalletType;
  platforms?: {
    ios?: string;
    android?: string;
    webapp?: string;
  };
  features?: {
    signTransaction?: boolean;
    signAndSendTransaction?: boolean;
    signMessage?: boolean;
  };
}

type EventCallback<T> = (data: T) => void;
type Unsubscribe = () => void;

// =============================================================================
// Manager
// =============================================================================

export class ExternalWalletManager {
  private config: ExternalWalletManagerConfig;
  private wallets: Map<string, ExternalWalletConfig> = new Map();
  private pendingRequests: Map<string, PendingRequest> = new Map();
  private connectedWallet: { id: string; accounts: ExternalWalletAccount[] } | null = null;
  private listeners: Map<string, Set<EventCallback<unknown>>> = new Map();

  // WalletConnect client (lazy loaded)
  private wcClient: unknown = null;
  private wcSession: unknown = null;

  constructor(config: ExternalWalletManagerConfig) {
    this.config = config;

    for (const wallet of config.wallets) {
      this.wallets.set(wallet.id, wallet);
    }

    this.setupCallbackListener();
  }

  // ===========================================================================
  // Wallet Discovery
  // ===========================================================================

  getManifests(): ExternalWalletManifest[] {
    const manifests: ExternalWalletManifest[] = [];
    const isMobile = this.isMobileDevice();

    for (const wallet of this.wallets.values()) {
      // Only show mobile wallets on mobile devices (or WalletConnect anywhere)
      const isAvailable = isMobile || wallet.type === 'walletconnect';

      if (isAvailable) {
        manifests.push({
          id: wallet.id,
          name: wallet.name,
          iconUrl: wallet.icon,
          type: 'external' as const,
          externalType: wallet.type,
          platforms: wallet.platforms,
          features: {
            signTransaction: true,
            signAndSendTransaction: true,
            signMessage: !!wallet.deepLink?.signMessage,
          },
        });
      }
    }

    return manifests;
  }

  isExternalWallet(walletId: string): boolean {
    return this.wallets.has(walletId);
  }

  // ===========================================================================
  // Connection
  // ===========================================================================

  async connect(walletId: string): Promise<ExternalWalletAccount[]> {
    const wallet = this.wallets.get(walletId);
    if (!wallet) {
      throw new Error(`External wallet not found: ${walletId}`);
    }

    switch (wallet.type) {
      case 'deeplink':
        return this.connectViaDeepLink(wallet);
      case 'walletconnect':
        return this.connectViaWalletConnect(wallet);
      case 'redirect':
        return this.connectViaRedirect(wallet);
      default:
        throw new Error(`Unknown external wallet type: ${wallet.type}`);
    }
  }

  async disconnect(walletId: string): Promise<void> {
    const wallet = this.wallets.get(walletId);
    if (!wallet) return;

    if (wallet.type === 'walletconnect' && this.wcSession) {
      await this.disconnectWalletConnect();
    }

    this.connectedWallet = null;
    this.clearSession();
  }

  isConnected(walletId: string): boolean {
    return this.connectedWallet?.id === walletId;
  }

  getAccounts(walletId: string): ExternalWalletAccount[] {
    if (this.connectedWallet?.id === walletId) {
      return this.connectedWallet.accounts;
    }
    return [];
  }

  // ===========================================================================
  // Deep Link Connection
  // ===========================================================================

  private async connectViaDeepLink(wallet: ExternalWalletConfig): Promise<ExternalWalletAccount[]> {
    if (!wallet.deepLink) {
      throw new Error('Wallet does not support deep links');
    }

    const requestId = this.generateRequestId();
    const callbackUrl = this.buildCallbackUrl(requestId, 'signIn');

    const params = new URLSearchParams({
      callback_url: callbackUrl,
      network: this.config.network,
      app_name: this.config.appName,
      request_id: requestId,
    });

    const deepLinkUrl = `${wallet.deepLink.scheme}://${wallet.deepLink.signIn}?${params}`;

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(requestId, {
        id: requestId,
        type: 'signIn',
        walletId: wallet.id,
        timestamp: Date.now(),
        payload: null,
        resolve: (result) => {
          const accounts = result as ExternalWalletAccount[];
          this.connectedWallet = { id: wallet.id, accounts };
          this.saveSession();
          resolve(accounts);
        },
        reject,
      });

      this.openDeepLink(deepLinkUrl, wallet);

      // 5 minute timeout
      setTimeout(() => {
        if (this.pendingRequests.has(requestId)) {
          this.pendingRequests.delete(requestId);
          reject(new Error('Connection timeout - wallet did not respond'));
        }
      }, 5 * 60 * 1000);
    });
  }

  private openDeepLink(url: string, wallet: ExternalWalletConfig): void {
    const startTime = Date.now();
    window.location.href = url;

    // Fallback to app store if app not installed
    setTimeout(() => {
      if (Date.now() - startTime > 1500 && document.hasFocus()) {
        this.emit('wallet:notInstalled', { walletId: wallet.id });

        const storeUrl = this.getStoreUrl(wallet);
        if (storeUrl && confirm(`${wallet.name} is not installed. Open app store?`)) {
          window.location.href = storeUrl;
        }
      }
    }, 2000);
  }

  // ===========================================================================
  // WalletConnect Connection
  // ===========================================================================

  private async connectViaWalletConnect(wallet: ExternalWalletConfig): Promise<ExternalWalletAccount[]> {
    if (!wallet.walletConnect) {
      throw new Error('Wallet does not support WalletConnect');
    }

    const client = await this.getWalletConnectClient(wallet.walletConnect);

    const session = await (client as any).connect({
      requiredNamespaces: {
        near: {
          methods: ['near_signTransaction', 'near_signMessage'],
          chains: [`near:${this.config.network}`],
          events: ['accountsChanged'],
        },
      },
    });

    this.wcSession = session;

    const accounts = this.parseWalletConnectAccounts(session);

    this.connectedWallet = { id: wallet.id, accounts };
    this.saveSession();

    return accounts;
  }

  private async getWalletConnectClient(config: NonNullable<ExternalWalletConfig['walletConnect']>): Promise<unknown> {
    if (this.wcClient) return this.wcClient;

    // Dynamic import WalletConnect
    // @ts-ignore - WalletConnect is an optional peer dependency
    const { SignClient } = await import('@walletconnect/sign-client');

    this.wcClient = await SignClient.init({
      projectId: config.projectId,
      relayUrl: config.relayUrl || 'wss://relay.walletconnect.com',
      metadata: config.metadata || {
        name: this.config.appName,
        description: 'NEAR dApp',
        url: this.config.appUrl,
        icons: [],
      },
    });

    return this.wcClient;
  }

  private async disconnectWalletConnect(): Promise<void> {
    if (this.wcClient && this.wcSession) {
      try {
        await (this.wcClient as any).disconnect({
          topic: (this.wcSession as any).topic,
          reason: { code: 6000, message: 'User disconnected' },
        });
      } catch {
        // Ignore disconnect errors
      }
    }
    this.wcClient = null;
    this.wcSession = null;
  }

  private parseWalletConnectAccounts(session: unknown): ExternalWalletAccount[] {
    const accounts: ExternalWalletAccount[] = [];
    const namespaces = (session as any).namespaces?.near;

    if (namespaces?.accounts) {
      for (const account of namespaces.accounts) {
        // Format: near:mainnet:account.near
        const parts = account.split(':');
        if (parts.length >= 3) {
          accounts.push({
            accountId: parts[2],
            publicKey: undefined,
          });
        }
      }
    }

    return accounts;
  }

  // ===========================================================================
  // Redirect Connection (Web Wallets on Mobile)
  // ===========================================================================

  private async connectViaRedirect(wallet: ExternalWalletConfig): Promise<ExternalWalletAccount[]> {
    if (!wallet.redirect) {
      throw new Error('Wallet does not support redirect');
    }

    const requestId = this.generateRequestId();

    this.storePendingRedirect(requestId, 'signIn', wallet.id, null);

    const params = new URLSearchParams({
      callback_url: this.config.callbackUrl || window.location.href,
      network: this.config.network,
      app_name: this.config.appName,
      request_id: requestId,
    });

    window.location.href = `${wallet.redirect.signInUrl}?${params}`;

    // This promise won't resolve here - it will resolve when user returns
    return new Promise(() => {});
  }

  // ===========================================================================
  // Transaction Signing
  // ===========================================================================

  async signAndSendTransaction(walletId: string, tx: Transaction): Promise<ExternalTransactionResult> {
    const wallet = this.wallets.get(walletId);
    if (!wallet) {
      throw new Error(`External wallet not found: ${walletId}`);
    }

    switch (wallet.type) {
      case 'deeplink':
        return this.signTransactionViaDeepLink(wallet, tx);
      case 'walletconnect':
        return this.signTransactionViaWalletConnect(wallet, tx);
      case 'redirect':
        return this.signTransactionViaRedirect(wallet, tx);
      default:
        throw new Error(`Unknown wallet type: ${wallet.type}`);
    }
  }

  private async signTransactionViaDeepLink(
    wallet: ExternalWalletConfig,
    tx: Transaction
  ): Promise<ExternalTransactionResult> {
    if (!wallet.deepLink) {
      throw new Error('Wallet does not support deep links');
    }

    const requestId = this.generateRequestId();
    const callbackUrl = this.buildCallbackUrl(requestId, 'signTransaction');

    const txPayload = btoa(JSON.stringify(tx));

    const params = new URLSearchParams({
      callback_url: callbackUrl,
      request_id: requestId,
      transaction: txPayload,
    });

    const deepLinkUrl = `${wallet.deepLink.scheme}://${wallet.deepLink.signTransaction}?${params}`;

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(requestId, {
        id: requestId,
        type: 'signTransaction',
        walletId: wallet.id,
        timestamp: Date.now(),
        payload: tx,
        resolve: resolve as (result: unknown) => void,
        reject,
      });

      this.openDeepLink(deepLinkUrl, wallet);

      setTimeout(() => {
        if (this.pendingRequests.has(requestId)) {
          this.pendingRequests.delete(requestId);
          reject(new Error('Transaction timeout - wallet did not respond'));
        }
      }, 5 * 60 * 1000);
    });
  }

  private async signTransactionViaWalletConnect(
    _wallet: ExternalWalletConfig,
    tx: Transaction
  ): Promise<ExternalTransactionResult> {
    if (!this.wcClient || !this.wcSession) {
      throw new Error('WalletConnect session not established');
    }

    const result = await (this.wcClient as any).request({
      topic: (this.wcSession as any).topic,
      chainId: `near:${this.config.network}`,
      request: {
        method: 'near_signAndSendTransaction',
        params: { transaction: tx },
      },
    });

    return result;
  }

  private async signTransactionViaRedirect(
    wallet: ExternalWalletConfig,
    tx: Transaction
  ): Promise<ExternalTransactionResult> {
    if (!wallet.redirect) {
      throw new Error('Wallet does not support redirect');
    }

    const requestId = this.generateRequestId();
    this.storePendingRedirect(requestId, 'signTransaction', wallet.id, tx);

    const txPayload = btoa(JSON.stringify(tx));
    const params = new URLSearchParams({
      callback_url: this.config.callbackUrl || window.location.href,
      request_id: requestId,
      transaction: txPayload,
    });

    window.location.href = `${wallet.redirect.signTransactionUrl}?${params}`;

    return new Promise(() => {});
  }

  // ===========================================================================
  // Message Signing (NEP-413)
  // ===========================================================================

  async signMessage(walletId: string, params: ExternalSignMessageParams): Promise<ExternalSignedMessage> {
    const wallet = this.wallets.get(walletId);
    if (!wallet) {
      throw new Error(`External wallet not found: ${walletId}`);
    }

    if (wallet.type === 'walletconnect') {
      return this.signMessageViaWalletConnect(wallet, params);
    }

    if (wallet.type === 'deeplink' && wallet.deepLink?.signMessage) {
      return this.signMessageViaDeepLink(wallet, params);
    }

    throw new Error(`Wallet ${walletId} does not support message signing`);
  }

  private async signMessageViaDeepLink(
    wallet: ExternalWalletConfig,
    params: ExternalSignMessageParams
  ): Promise<ExternalSignedMessage> {
    const requestId = this.generateRequestId();
    const callbackUrl = this.buildCallbackUrl(requestId, 'signMessage');

    const messagePayload = btoa(JSON.stringify(params));

    const urlParams = new URLSearchParams({
      callback_url: callbackUrl,
      request_id: requestId,
      message_payload: messagePayload,
    });

    const deepLinkUrl = `${wallet.deepLink!.scheme}://${wallet.deepLink!.signMessage}?${urlParams}`;

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(requestId, {
        id: requestId,
        type: 'signMessage',
        walletId: wallet.id,
        timestamp: Date.now(),
        payload: params,
        resolve: resolve as (result: unknown) => void,
        reject,
      });

      this.openDeepLink(deepLinkUrl, wallet);

      setTimeout(() => {
        if (this.pendingRequests.has(requestId)) {
          this.pendingRequests.delete(requestId);
          reject(new Error('Message signing timeout'));
        }
      }, 5 * 60 * 1000);
    });
  }

  private async signMessageViaWalletConnect(
    _wallet: ExternalWalletConfig,
    params: ExternalSignMessageParams
  ): Promise<ExternalSignedMessage> {
    if (!this.wcClient || !this.wcSession) {
      throw new Error('WalletConnect session not established');
    }

    const result = await (this.wcClient as any).request({
      topic: (this.wcSession as any).topic,
      chainId: `near:${this.config.network}`,
      request: {
        method: 'near_signMessage',
        params: {
          message: params.message,
          recipient: params.recipient,
          nonce: Array.from(params.nonce),
        },
      },
    });

    return result;
  }

  // ===========================================================================
  // Callback Handling
  // ===========================================================================

  private setupCallbackListener(): void {
    if (typeof window !== 'undefined') {
      this.handleUrlCallback();
      window.addEventListener('message', this.handlePostMessage.bind(this));
    }
  }

  private handleUrlCallback(): void {
    const url = new URL(window.location.href);
    const requestId = url.searchParams.get('request_id');
    const result = url.searchParams.get('result');
    const error = url.searchParams.get('error');

    if (!requestId) {
      const stored = this.getPendingRedirect();
      if (stored && (result || error)) {
        this.handleCallbackResult(stored.requestId, result, error);
        this.clearPendingRedirect();
      }
      return;
    }

    this.handleCallbackResult(requestId, result, error);

    // Clean URL
    url.searchParams.delete('request_id');
    url.searchParams.delete('result');
    url.searchParams.delete('error');
    window.history.replaceState({}, '', url.toString());
  }

  private handlePostMessage(event: MessageEvent): void {
    if (!event.data?.type?.startsWith('near_')) return;

    const { requestId, result, error } = event.data;
    if (requestId) {
      this.handleCallbackResult(requestId, JSON.stringify(result), error);
    }
  }

  private handleCallbackResult(requestId: string, result: string | null, error: string | null): void {
    const pending = this.pendingRequests.get(requestId);
    if (!pending) return;

    this.pendingRequests.delete(requestId);

    if (error) {
      pending.reject(new Error(error));
      return;
    }

    if (result) {
      try {
        const parsed = JSON.parse(atob(result));
        pending.resolve(parsed);
      } catch {
        pending.resolve(result);
      }
    }
  }

  // ===========================================================================
  // Session Persistence
  // ===========================================================================

  private saveSession(): void {
    if (!this.connectedWallet) return;

    localStorage.setItem('near-connect:external-session', JSON.stringify({
      walletId: this.connectedWallet.id,
      accounts: this.connectedWallet.accounts,
      timestamp: Date.now(),
    }));
  }

  private clearSession(): void {
    localStorage.removeItem('near-connect:external-session');
  }

  async restoreSession(): Promise<ExternalWalletAccount[] | null> {
    const stored = localStorage.getItem('near-connect:external-session');
    if (!stored) return null;

    try {
      const session = JSON.parse(stored);

      // Check expiration (24 hours)
      if (Date.now() - session.timestamp > 24 * 60 * 60 * 1000) {
        this.clearSession();
        return null;
      }

      this.connectedWallet = {
        id: session.walletId,
        accounts: session.accounts,
      };

      return session.accounts;
    } catch {
      this.clearSession();
      return null;
    }
  }

  private storePendingRedirect(
    requestId: string,
    type: string,
    walletId: string,
    payload: unknown
  ): void {
    sessionStorage.setItem('near-connect:pending-redirect', JSON.stringify({
      requestId,
      type,
      walletId,
      payload,
      timestamp: Date.now(),
    }));
  }

  private getPendingRedirect(): { requestId: string; type: string; walletId: string; payload: unknown } | null {
    const stored = sessionStorage.getItem('near-connect:pending-redirect');
    if (!stored) return null;

    try {
      return JSON.parse(stored);
    } catch {
      return null;
    }
  }

  private clearPendingRedirect(): void {
    sessionStorage.removeItem('near-connect:pending-redirect');
  }

  // ===========================================================================
  // Utilities
  // ===========================================================================

  private generateRequestId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  }

  private buildCallbackUrl(requestId: string, action: string): string {
    const base = this.config.callbackUrl || window.location.href.split('?')[0];
    return `${base}?request_id=${requestId}&action=${action}`;
  }

  private isMobileDevice(): boolean {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent
    );
  }

  private getStoreUrl(wallet: ExternalWalletConfig): string | null {
    const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
    return isIOS ? wallet.platforms.ios || null : wallet.platforms.android || null;
  }

  // ===========================================================================
  // Events
  // ===========================================================================

  on(event: string, callback: EventCallback<unknown>): Unsubscribe {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
    return () => this.listeners.get(event)?.delete(callback);
  }

  private emit(event: string, data: unknown): void {
    this.listeners.get(event)?.forEach((cb) => {
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
    await this.disconnectWalletConnect();
    this.pendingRequests.clear();
    this.listeners.clear();
    this.connectedWallet = null;
  }
}
