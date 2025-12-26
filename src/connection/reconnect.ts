import { WalletError, ErrorCode } from "../errors";
import { RetryConfig, DEFAULT_RETRY_CONFIG, calculateBackoffDelay } from "./retry";

/**
 * Reconnection triggers
 */
export interface ReconnectTriggers {
  /** Reconnect when tab becomes visible (default: true) */
  visibilityChange: boolean;
  /** Reconnect when network status changes (default: true) */
  networkChange: boolean;
  /** Reconnect after system wake from sleep (default: true) */
  wakeFromSleep: boolean;
  /** Reconnect on heartbeat failure (default: true) */
  heartbeatFailure: boolean;
  /** Reconnect on user activity after idle (default: false) */
  userActivity: boolean;
}

/**
 * Reconnection configuration
 */
export interface ReconnectConfig {
  /** Whether to enable auto-reconnect (default: true) */
  autoReconnect: boolean;
  /** Reconnect trigger configuration */
  reconnectOn: ReconnectTriggers;
  /** Maximum reconnect attempts (default: 5) */
  maxReconnectAttempts: number;
  /** Retry configuration for reconnects */
  backoff: Partial<RetryConfig>;
  /** Whether to preserve operation queue during reconnect (default: true) */
  preserveQueue: boolean;
  /** Whether to reconnect silently without UI (default: true) */
  silentReconnect: boolean;
  /** Minimum time between reconnect attempts in ms (default: 1000) */
  minReconnectInterval: number;
  /** Time to wait after visibility change before reconnecting (default: 500) */
  visibilityDebounce: number;
  /** Time to consider as "sleep" for wake detection in ms (default: 30000) */
  sleepThreshold: number;
}

/**
 * Queued operation for replay after reconnect
 */
export interface QueuedOperation {
  id: string;
  type: "sign" | "send" | "signMessage" | "signAndSend";
  payload: unknown;
  timestamp: number;
  retries: number;
  maxRetries: number;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
}

/**
 * Reconnection state
 */
export interface ReconnectState {
  /** Whether currently attempting to reconnect */
  attempting: boolean;
  /** Current attempt number */
  attempt: number;
  /** Timestamp of last attempt */
  lastAttempt: number;
  /** Queued operations waiting for reconnect */
  queuedOperations: QueuedOperation[];
  /** Reason for last reconnect trigger */
  lastTrigger: keyof ReconnectTriggers | "manual" | null;
  /** Whether reconnect is disabled temporarily */
  disabled: boolean;
}

/**
 * Reconnection event types
 */
export interface ReconnectEventMap {
  "reconnect:started": { attempt: number; trigger: string };
  "reconnect:success": { attempt: number; trigger: string };
  "reconnect:failed": { attempt: number; error: Error; willRetry: boolean };
  "reconnect:exhausted": { attempts: number; trigger: string };
  "reconnect:cancelled": { reason: string };
  "queue:added": { operation: QueuedOperation };
  "queue:removed": { operationId: string };
  "queue:replaying": { operations: QueuedOperation[] };
  "queue:replayed": { successful: number; failed: number };
  "trigger:visibility": { visible: boolean };
  "trigger:network": { online: boolean };
  "trigger:wake": { sleepDuration: number };
}

/**
 * Default reconnection triggers
 */
export const DEFAULT_RECONNECT_TRIGGERS: ReconnectTriggers = {
  visibilityChange: true,
  networkChange: true,
  wakeFromSleep: true,
  heartbeatFailure: true,
  userActivity: false,
};

/**
 * Default reconnection configuration
 */
export const DEFAULT_RECONNECT_CONFIG: ReconnectConfig = {
  autoReconnect: true,
  reconnectOn: DEFAULT_RECONNECT_TRIGGERS,
  maxReconnectAttempts: 5,
  backoff: {
    maxAttempts: 5,
    baseDelay: 1000,
    maxDelay: 30000,
    backoffMultiplier: 2,
    jitter: true,
  },
  preserveQueue: true,
  silentReconnect: true,
  minReconnectInterval: 1000,
  visibilityDebounce: 500,
  sleepThreshold: 30000,
};

/**
 * Reconnection function type
 */
export type ReconnectFn = () => Promise<boolean>;

/**
 * Reconnection Manager
 *
 * Handles automatic reconnection with various triggers:
 * - Page visibility changes (tab focus)
 * - Network status changes
 * - System wake from sleep
 * - Heartbeat failures
 */
export class ReconnectionManager {
  private config: ReconnectConfig;
  private state: ReconnectState;
  private reconnectFn: ReconnectFn;
  private listeners: Map<keyof ReconnectEventMap, Set<(payload: unknown) => void>> = new Map();

  // Browser event listeners
  private visibilityHandler: (() => void) | null = null;
  private networkHandler: (() => void) | null = null;
  private activityHandler: (() => void) | null = null;

  // Timers and tracking
  private lastActivityTime: number = Date.now();
  private lastCheckTime: number = Date.now();
  private sleepCheckInterval: ReturnType<typeof setInterval> | null = null;
  private visibilityDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private operationIdCounter: number = 0;

  constructor(reconnectFn: ReconnectFn, config: Partial<ReconnectConfig> = {}) {
    this.reconnectFn = reconnectFn;
    this.config = {
      ...DEFAULT_RECONNECT_CONFIG,
      ...config,
      reconnectOn: { ...DEFAULT_RECONNECT_TRIGGERS, ...config.reconnectOn },
      backoff: { ...DEFAULT_RECONNECT_CONFIG.backoff, ...config.backoff },
    };
    this.state = this.createInitialState();
  }

  /**
   * Create initial state
   */
  private createInitialState(): ReconnectState {
    return {
      attempting: false,
      attempt: 0,
      lastAttempt: 0,
      queuedOperations: [],
      lastTrigger: null,
      disabled: false,
    };
  }

  /**
   * Start listening for reconnection triggers
   */
  start(): void {
    if (typeof window === "undefined") return;

    // Visibility change
    if (this.config.reconnectOn.visibilityChange) {
      this.visibilityHandler = this.handleVisibilityChange.bind(this);
      document.addEventListener("visibilitychange", this.visibilityHandler);
    }

    // Network change
    if (this.config.reconnectOn.networkChange) {
      this.networkHandler = this.handleNetworkChange.bind(this);
      window.addEventListener("online", this.networkHandler);
      window.addEventListener("offline", this.networkHandler);
    }

    // User activity
    if (this.config.reconnectOn.userActivity) {
      this.activityHandler = this.handleUserActivity.bind(this);
      window.addEventListener("mousemove", this.activityHandler, { passive: true });
      window.addEventListener("keydown", this.activityHandler, { passive: true });
      window.addEventListener("touchstart", this.activityHandler, { passive: true });
    }

    // Wake from sleep detection
    if (this.config.reconnectOn.wakeFromSleep) {
      this.startSleepDetection();
    }
  }

  /**
   * Stop listening for reconnection triggers
   */
  stop(): void {
    if (typeof window === "undefined") return;

    if (this.visibilityHandler) {
      document.removeEventListener("visibilitychange", this.visibilityHandler);
      this.visibilityHandler = null;
    }

    if (this.networkHandler) {
      window.removeEventListener("online", this.networkHandler);
      window.removeEventListener("offline", this.networkHandler);
      this.networkHandler = null;
    }

    if (this.activityHandler) {
      window.removeEventListener("mousemove", this.activityHandler);
      window.removeEventListener("keydown", this.activityHandler);
      window.removeEventListener("touchstart", this.activityHandler);
      this.activityHandler = null;
    }

    this.stopSleepDetection();
    this.cancelReconnect();
  }

  /**
   * Handle visibility change
   */
  private handleVisibilityChange(): void {
    const visible = document.visibilityState === "visible";
    this.emit("trigger:visibility", { visible });

    if (visible) {
      // Debounce to avoid rapid reconnects
      if (this.visibilityDebounceTimer) {
        clearTimeout(this.visibilityDebounceTimer);
      }

      this.visibilityDebounceTimer = setTimeout(() => {
        this.trigger("visibilityChange");
      }, this.config.visibilityDebounce);
    }
  }

  /**
   * Handle network change
   */
  private handleNetworkChange(): void {
    const online = navigator.onLine;
    this.emit("trigger:network", { online });

    if (online) {
      this.trigger("networkChange");
    }
  }

  /**
   * Handle user activity
   */
  private handleUserActivity(): void {
    this.lastActivityTime = Date.now();
  }

  /**
   * Start sleep detection
   */
  private startSleepDetection(): void {
    this.lastCheckTime = Date.now();

    this.sleepCheckInterval = setInterval(() => {
      const now = Date.now();
      const elapsed = now - this.lastCheckTime;

      // If elapsed time is much greater than interval, system was asleep
      if (elapsed > this.config.sleepThreshold) {
        this.emit("trigger:wake", { sleepDuration: elapsed });
        this.trigger("wakeFromSleep");
      }

      this.lastCheckTime = now;
    }, 10000); // Check every 10 seconds
  }

  /**
   * Stop sleep detection
   */
  private stopSleepDetection(): void {
    if (this.sleepCheckInterval) {
      clearInterval(this.sleepCheckInterval);
      this.sleepCheckInterval = null;
    }
  }

  /**
   * Trigger reconnection
   */
  async trigger(reason: keyof ReconnectTriggers | "manual"): Promise<boolean> {
    if (!this.config.autoReconnect || this.state.disabled) {
      return false;
    }

    // Don't interrupt ongoing reconnect
    if (this.state.attempting) {
      return false;
    }

    // Enforce minimum interval
    if (Date.now() - this.state.lastAttempt < this.config.minReconnectInterval) {
      return false;
    }

    this.state.lastTrigger = reason;
    return this.attemptReconnect();
  }

  /**
   * Attempt reconnection with retries
   */
  private async attemptReconnect(): Promise<boolean> {
    this.state.attempting = true;
    this.state.attempt = 0;

    const maxAttempts = this.config.maxReconnectAttempts;
    const backoff = { ...DEFAULT_RETRY_CONFIG, ...this.config.backoff };

    while (this.state.attempt < maxAttempts) {
      this.state.attempt++;
      this.state.lastAttempt = Date.now();

      this.emit("reconnect:started", {
        attempt: this.state.attempt,
        trigger: this.state.lastTrigger || "unknown",
      });

      try {
        const success = await this.reconnectFn();

        if (success) {
          this.emit("reconnect:success", {
            attempt: this.state.attempt,
            trigger: this.state.lastTrigger || "unknown",
          });

          this.state.attempting = false;

          // Replay queued operations
          if (this.config.preserveQueue && this.state.queuedOperations.length > 0) {
            await this.replayQueue();
          }

          return true;
        }
      } catch (error) {
        const willRetry = this.state.attempt < maxAttempts;

        this.emit("reconnect:failed", {
          attempt: this.state.attempt,
          error: error instanceof Error ? error : new Error(String(error)),
          willRetry,
        });

        if (willRetry) {
          // Wait before next attempt
          const delay = calculateBackoffDelay(this.state.attempt - 1, backoff);
          await this.wait(delay);
        }
      }
    }

    // All attempts exhausted
    this.emit("reconnect:exhausted", {
      attempts: this.state.attempt,
      trigger: this.state.lastTrigger || "unknown",
    });

    this.state.attempting = false;
    return false;
  }

  /**
   * Cancel ongoing reconnection
   */
  cancelReconnect(): void {
    if (this.state.attempting) {
      this.state.attempting = false;
      this.emit("reconnect:cancelled", { reason: "manual" });
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.visibilityDebounceTimer) {
      clearTimeout(this.visibilityDebounceTimer);
      this.visibilityDebounceTimer = null;
    }
  }

  /**
   * Queue an operation for replay after reconnect
   */
  queueOperation<T>(
    type: QueuedOperation["type"],
    payload: unknown,
    maxRetries: number = 3
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const operation: QueuedOperation = {
        id: `op_${++this.operationIdCounter}_${Date.now()}`,
        type,
        payload,
        timestamp: Date.now(),
        retries: 0,
        maxRetries,
        resolve: resolve as (value: unknown) => void,
        reject,
      };

      this.state.queuedOperations.push(operation);
      this.emit("queue:added", { operation });
    });
  }

  /**
   * Remove an operation from the queue
   */
  removeOperation(operationId: string): boolean {
    const index = this.state.queuedOperations.findIndex((op) => op.id === operationId);
    if (index !== -1) {
      const [removed] = this.state.queuedOperations.splice(index, 1);
      removed.reject(new WalletError({
        code: ErrorCode.USER_REJECTED,
        message: "Operation cancelled",
      }));
      this.emit("queue:removed", { operationId });
      return true;
    }
    return false;
  }

  /**
   * Clear all queued operations
   */
  clearQueue(): void {
    for (const op of this.state.queuedOperations) {
      op.reject(new WalletError({
        code: ErrorCode.USER_REJECTED,
        message: "Queue cleared",
      }));
    }
    this.state.queuedOperations = [];
  }

  /**
   * Replay queued operations
   */
  private async replayQueue(): Promise<void> {
    const operations = [...this.state.queuedOperations];
    this.state.queuedOperations = [];

    this.emit("queue:replaying", { operations });

    let successful = 0;
    let failed = 0;

    for (const op of operations) {
      try {
        // The actual replay logic would be implemented by the caller
        // through a custom replay handler
        // For now, we just resolve with null and let the caller handle it
        op.resolve(null);
        successful++;
      } catch (error) {
        op.reject(error);
        failed++;
      }
    }

    this.emit("queue:replayed", { successful, failed });
  }

  /**
   * Get reconnection state
   */
  getState(): ReconnectState {
    return { ...this.state };
  }

  /**
   * Get queued operations count
   */
  getQueueSize(): number {
    return this.state.queuedOperations.length;
  }

  /**
   * Disable reconnection temporarily
   */
  disable(): void {
    this.state.disabled = true;
  }

  /**
   * Enable reconnection
   */
  enable(): void {
    this.state.disabled = false;
  }

  /**
   * Check if reconnection is enabled
   */
  isEnabled(): boolean {
    return this.config.autoReconnect && !this.state.disabled;
  }

  /**
   * Event listener
   */
  on<K extends keyof ReconnectEventMap>(
    event: K,
    callback: (payload: ReconnectEventMap[K]) => void
  ): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback as (payload: unknown) => void);

    return () => {
      this.listeners.get(event)?.delete(callback as (payload: unknown) => void);
    };
  }

  /**
   * Emit event
   */
  private emit<K extends keyof ReconnectEventMap>(
    event: K,
    payload: ReconnectEventMap[K]
  ): void {
    const listeners = this.listeners.get(event);
    if (listeners) {
      for (const listener of listeners) {
        try {
          listener(payload);
        } catch (e) {
          console.error(`Error in reconnect event listener for ${event}:`, e);
        }
      }
    }
  }

  /**
   * Wait helper
   */
  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => {
      this.reconnectTimer = setTimeout(resolve, ms);
    });
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<ReconnectConfig>): void {
    this.config = {
      ...this.config,
      ...config,
      reconnectOn: { ...this.config.reconnectOn, ...config.reconnectOn },
      backoff: { ...this.config.backoff, ...config.backoff },
    };
  }

  /**
   * Reset state
   */
  reset(): void {
    this.cancelReconnect();
    this.clearQueue();
    this.state = this.createInitialState();
  }

  /**
   * Cleanup
   */
  destroy(): void {
    this.stop();
    this.clearQueue();
    this.listeners.clear();
  }
}

/**
 * Create a reconnection manager
 */
export function createReconnectionManager(
  reconnectFn: ReconnectFn,
  config?: Partial<ReconnectConfig>
): ReconnectionManager {
  return new ReconnectionManager(reconnectFn, config);
}
