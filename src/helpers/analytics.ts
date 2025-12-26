import { EventMap, Account, Network } from "../types";
import { WalletError } from "../errors";

/**
 * Analytics event types that can be tracked
 */
export type AnalyticsEventType =
  | "wallet_connect_started"
  | "wallet_connect_success"
  | "wallet_connect_failed"
  | "wallet_disconnect"
  | "transaction_started"
  | "transaction_success"
  | "transaction_failed"
  | "transaction_rejected"
  | "message_sign_started"
  | "message_sign_success"
  | "message_sign_failed"
  | "account_switched"
  | "account_added"
  | "account_removed"
  | "network_switched"
  | "session_restored"
  | "session_expired"
  | "modal_opened"
  | "modal_closed"
  | "error";

/**
 * Base analytics event payload
 */
export interface AnalyticsEvent {
  type: AnalyticsEventType;
  timestamp: number;
  sessionId?: string;
  network?: Network;
  walletId?: string;
  walletName?: string;
  accountId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Wallet connect event
 */
export interface WalletConnectEvent extends AnalyticsEvent {
  type: "wallet_connect_started" | "wallet_connect_success" | "wallet_connect_failed";
  accounts?: Account[];
  duration?: number;
  error?: string;
}

/**
 * Transaction event
 */
export interface TransactionEvent extends AnalyticsEvent {
  type: "transaction_started" | "transaction_success" | "transaction_failed" | "transaction_rejected";
  receiverId?: string;
  methodName?: string;
  txHash?: string;
  gasUsed?: string;
  deposit?: string;
  duration?: number;
  error?: string;
}

/**
 * Analytics adapter interface - implement to send events to your analytics service
 */
export interface AnalyticsAdapter {
  /**
   * Track an analytics event
   */
  track(event: AnalyticsEvent): void | Promise<void>;

  /**
   * Identify a user (optional)
   */
  identify?(userId: string, traits?: Record<string, unknown>): void | Promise<void>;

  /**
   * Flush any pending events (optional)
   */
  flush?(): void | Promise<void>;
}

/**
 * Console adapter for debugging
 */
export class ConsoleAnalyticsAdapter implements AnalyticsAdapter {
  private prefix: string;

  constructor(prefix = "[Analytics]") {
    this.prefix = prefix;
  }

  track(event: AnalyticsEvent): void {
    console.log(this.prefix, event.type, event);
  }

  identify(userId: string, traits?: Record<string, unknown>): void {
    console.log(this.prefix, "identify", userId, traits);
  }
}

/**
 * No-op adapter (default)
 */
export class NoopAnalyticsAdapter implements AnalyticsAdapter {
  track(): void {}
  identify(): void {}
  flush(): void {}
}

/**
 * Batching adapter that collects events and sends them in batches
 */
export class BatchingAnalyticsAdapter implements AnalyticsAdapter {
  private adapter: AnalyticsAdapter;
  private queue: AnalyticsEvent[] = [];
  private batchSize: number;
  private flushInterval: number;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(adapter: AnalyticsAdapter, options: { batchSize?: number; flushInterval?: number } = {}) {
    this.adapter = adapter;
    this.batchSize = options.batchSize ?? 10;
    this.flushInterval = options.flushInterval ?? 5000;

    if (typeof window !== "undefined") {
      this.timer = setInterval(() => this.flush(), this.flushInterval);
    }
  }

  track(event: AnalyticsEvent): void {
    this.queue.push(event);
    if (this.queue.length >= this.batchSize) {
      this.flush();
    }
  }

  async flush(): Promise<void> {
    if (this.queue.length === 0) return;

    const events = [...this.queue];
    this.queue = [];

    for (const event of events) {
      await this.adapter.track(event);
    }

    await this.adapter.flush?.();
  }

  destroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.flush();
  }
}

/**
 * Analytics options
 */
export interface AnalyticsOptions {
  adapter?: AnalyticsAdapter;
  sessionId?: string;
  defaultMetadata?: Record<string, unknown>;
  enabled?: boolean;
}

/**
 * Analytics manager for tracking wallet events
 */
export class Analytics {
  private adapter: AnalyticsAdapter;
  private sessionId: string;
  private defaultMetadata: Record<string, unknown>;
  private enabled: boolean;
  private timers: Map<string, number> = new Map();

  constructor(options: AnalyticsOptions = {}) {
    this.adapter = options.adapter ?? new NoopAnalyticsAdapter();
    this.sessionId = options.sessionId ?? this.generateSessionId();
    this.defaultMetadata = options.defaultMetadata ?? {};
    this.enabled = options.enabled ?? true;
  }

  private generateSessionId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * Track a generic event
   */
  track(
    type: AnalyticsEventType,
    data: Partial<Omit<AnalyticsEvent, "type" | "timestamp" | "sessionId">> = {}
  ): void {
    if (!this.enabled) return;

    const event: AnalyticsEvent = {
      type,
      timestamp: Date.now(),
      sessionId: this.sessionId,
      metadata: { ...this.defaultMetadata, ...data.metadata },
      ...data,
    };

    this.adapter.track(event);
  }

  /**
   * Start a timer for duration tracking
   */
  startTimer(key: string): void {
    this.timers.set(key, Date.now());
  }

  /**
   * Get elapsed time and clear timer
   */
  endTimer(key: string): number | undefined {
    const start = this.timers.get(key);
    if (!start) return undefined;
    this.timers.delete(key);
    return Date.now() - start;
  }

  /**
   * Track wallet connection start
   */
  trackConnectStarted(walletId: string, walletName?: string, network?: Network): void {
    this.startTimer(`connect:${walletId}`);
    this.track("wallet_connect_started", { walletId, walletName, network });
  }

  /**
   * Track successful wallet connection
   */
  trackConnectSuccess(walletId: string, accounts: Account[], walletName?: string, network?: Network): void {
    const duration = this.endTimer(`connect:${walletId}`);
    this.track("wallet_connect_success", {
      walletId,
      walletName,
      network,
      accountId: accounts[0]?.accountId,
      metadata: { accountCount: accounts.length, duration },
    });
  }

  /**
   * Track failed wallet connection
   */
  trackConnectFailed(walletId: string, error: Error | WalletError, walletName?: string): void {
    const duration = this.endTimer(`connect:${walletId}`);
    this.track("wallet_connect_failed", {
      walletId,
      walletName,
      metadata: {
        error: error.message,
        errorCode: error instanceof WalletError ? error.code : undefined,
        duration,
      },
    });
  }

  /**
   * Track wallet disconnect
   */
  trackDisconnect(walletId?: string, accountId?: string): void {
    this.track("wallet_disconnect", { walletId, accountId });
  }

  /**
   * Track transaction start
   */
  trackTransactionStarted(
    walletId: string,
    receiverId: string,
    methodName?: string,
    deposit?: string
  ): void {
    const key = `tx:${walletId}:${receiverId}:${methodName}`;
    this.startTimer(key);
    this.track("transaction_started", {
      walletId,
      metadata: { receiverId, methodName, deposit },
    });
  }

  /**
   * Track successful transaction
   */
  trackTransactionSuccess(
    walletId: string,
    receiverId: string,
    txHash?: string,
    methodName?: string
  ): void {
    const key = `tx:${walletId}:${receiverId}:${methodName}`;
    const duration = this.endTimer(key);
    this.track("transaction_success", {
      walletId,
      metadata: { receiverId, methodName, txHash, duration },
    });
  }

  /**
   * Track failed transaction
   */
  trackTransactionFailed(
    walletId: string,
    receiverId: string,
    error: Error | WalletError,
    methodName?: string
  ): void {
    const key = `tx:${walletId}:${receiverId}:${methodName}`;
    const duration = this.endTimer(key);
    this.track("transaction_failed", {
      walletId,
      metadata: {
        receiverId,
        methodName,
        error: error.message,
        errorCode: error instanceof WalletError ? error.code : undefined,
        duration,
      },
    });
  }

  /**
   * Track rejected transaction
   */
  trackTransactionRejected(walletId: string, receiverId: string, methodName?: string): void {
    const key = `tx:${walletId}:${receiverId}:${methodName}`;
    const duration = this.endTimer(key);
    this.track("transaction_rejected", {
      walletId,
      metadata: { receiverId, methodName, duration },
    });
  }

  /**
   * Track account switch
   */
  trackAccountSwitched(accountId: string, previousAccountId?: string | null, walletId?: string): void {
    this.track("account_switched", {
      accountId,
      walletId,
      metadata: { previousAccountId },
    });
  }

  /**
   * Track network switch
   */
  trackNetworkSwitched(network: Network, previousNetwork?: Network): void {
    this.track("network_switched", {
      network,
      metadata: { previousNetwork },
    });
  }

  /**
   * Track error
   */
  trackError(error: Error | WalletError, context?: string): void {
    this.track("error", {
      metadata: {
        error: error.message,
        errorCode: error instanceof WalletError ? error.code : undefined,
        context,
        stack: error.stack,
      },
    });
  }

  /**
   * Identify user
   */
  identify(accountId: string, traits?: Record<string, unknown>): void {
    if (!this.enabled) return;
    this.adapter.identify?.(accountId, traits);
  }

  /**
   * Flush pending events
   */
  flush(): void {
    this.adapter.flush?.();
  }

  /**
   * Set enabled state
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Update default metadata
   */
  setDefaultMetadata(metadata: Record<string, unknown>): void {
    this.defaultMetadata = { ...this.defaultMetadata, ...metadata };
  }

  /**
   * Create event handlers for NearConnector events
   */
  createEventHandlers(): Partial<{ [K in keyof EventMap]: (payload: EventMap[K]) => void }> {
    return {
      "wallet:signIn": ({ wallet, accounts }) => {
        this.trackConnectSuccess(wallet.manifest.id, accounts, wallet.manifest.name);
      },
      "wallet:signOut": () => {
        this.trackDisconnect();
      },
      "wallet:error": ({ error, walletId, action }) => {
        this.trackError(error, `${action}:${walletId}`);
      },
      "account:switched": ({ account, previousAccountId }) => {
        this.trackAccountSwitched(account.accountId, previousAccountId);
      },
      "session:restored": ({ session }) => {
        this.track("session_restored", {
          walletId: session.walletId,
          accountId: session.accounts[0]?.accountId,
          network: session.network,
        });
      },
      "session:expired": ({ session }) => {
        this.track("session_expired", {
          walletId: session.walletId,
          accountId: session.accounts[0]?.accountId,
        });
      },
    };
  }
}
