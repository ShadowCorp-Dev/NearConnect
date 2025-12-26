import { EventMap, Account } from "../types";

/**
 * Connection health status
 */
export type HealthStatus = "healthy" | "degraded" | "stale" | "lost";

/**
 * Connection health information
 */
export interface ConnectionHealth {
  /** Current health status */
  status: HealthStatus;
  /** Timestamp of last successful heartbeat */
  lastHeartbeat: number;
  /** Timestamp of last user interaction */
  lastInteraction: number;
  /** Average response latency in ms */
  latency: number;
  /** Number of consecutive heartbeat failures */
  consecutiveFailures: number;
  /** Whether currently checking health */
  checking: boolean;
}

/**
 * Health check result
 */
export interface HealthCheckResult {
  success: boolean;
  latency: number;
  accounts?: Account[];
  error?: Error;
  timestamp: number;
}

/**
 * Health monitor configuration
 */
export interface HealthConfig {
  /** Interval between heartbeats in ms (default: 30000 = 30s) */
  heartbeatInterval: number;
  /** Timeout for heartbeat response in ms (default: 10000 = 10s) */
  heartbeatTimeout: number;
  /** Time since last interaction to consider connection stale (default: 300000 = 5min) */
  staleThreshold: number;
  /** Number of consecutive failures before marking as lost (default: 3) */
  maxConsecutiveFailures: number;
  /** Whether to auto-reconnect on failure (default: true) */
  autoReconnect: boolean;
  /** Whether to sync account list on heartbeat (default: false) */
  syncAccounts: boolean;
  /** Interval for account sync in ms (default: 60000 = 1min) */
  syncInterval: number;
  /** Latency threshold for degraded status in ms (default: 5000) */
  degradedLatencyThreshold: number;
  /** Whether to disable heartbeat entirely (default: false) */
  disabled: boolean;
}

/**
 * Default health configuration
 */
export const DEFAULT_HEALTH_CONFIG: HealthConfig = {
  heartbeatInterval: 30000,
  heartbeatTimeout: 10000,
  staleThreshold: 300000, // 5 minutes
  maxConsecutiveFailures: 3,
  autoReconnect: true,
  syncAccounts: false,
  syncInterval: 60000,
  degradedLatencyThreshold: 5000,
  disabled: false,
};

/**
 * Health event types
 */
export interface HealthEventMap {
  "health:check": { result: HealthCheckResult };
  "health:status-changed": { from: HealthStatus; to: HealthStatus; health: ConnectionHealth };
  "health:degraded": { latency: number; threshold: number };
  "health:stale": { lastInteraction: number; threshold: number };
  "health:lost": { failures: number; lastError?: Error };
  "health:restored": { previousStatus: HealthStatus };
  "accounts:synced": { accounts: Account[] };
  "accounts:changed": { previous: Account[]; current: Account[] };
}

/**
 * Health check function type
 */
export type HealthCheckFn = () => Promise<HealthCheckResult>;

/**
 * Connection Health Monitor
 *
 * Monitors the health of wallet connections through periodic heartbeats
 * and tracks connection quality metrics
 */
export class HealthMonitor {
  private config: HealthConfig;
  private health: ConnectionHealth;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private syncTimer: ReturnType<typeof setInterval> | null = null;
  private running: boolean = false;
  private healthCheck: HealthCheckFn;
  private listeners: Map<keyof HealthEventMap, Set<(payload: unknown) => void>> = new Map();
  private latencyHistory: number[] = [];
  private maxLatencyHistory: number = 10;
  private lastAccounts: Account[] = [];

  constructor(
    healthCheck: HealthCheckFn,
    config: Partial<HealthConfig> = {}
  ) {
    this.healthCheck = healthCheck;
    this.config = { ...DEFAULT_HEALTH_CONFIG, ...config };
    this.health = this.createInitialHealth();
  }

  /**
   * Create initial health state
   */
  private createInitialHealth(): ConnectionHealth {
    const now = Date.now();
    return {
      status: "healthy",
      lastHeartbeat: now,
      lastInteraction: now,
      latency: 0,
      consecutiveFailures: 0,
      checking: false,
    };
  }

  /**
   * Start health monitoring
   */
  start(): void {
    if (this.running || this.config.disabled) return;

    this.running = true;
    this.health = this.createInitialHealth();

    // Start heartbeat
    this.heartbeatTimer = setInterval(
      () => this.performCheck(),
      this.config.heartbeatInterval
    );

    // Start account sync if enabled
    if (this.config.syncAccounts) {
      this.syncTimer = setInterval(
        () => this.syncAccountList(),
        this.config.syncInterval
      );
    }

    // Perform initial check
    this.performCheck();
  }

  /**
   * Stop health monitoring
   */
  stop(): void {
    this.running = false;

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
  }

  /**
   * Perform a health check
   */
  async performCheck(): Promise<HealthCheckResult> {
    if (!this.running) {
      return {
        success: false,
        latency: 0,
        error: new Error("Monitor not running"),
        timestamp: Date.now(),
      };
    }

    this.health.checking = true;
    const startTime = Date.now();

    try {
      // Execute health check with timeout
      const result = await this.withTimeout(
        this.healthCheck(),
        this.config.heartbeatTimeout
      );

      // Update health state
      this.health.lastHeartbeat = Date.now();
      this.health.consecutiveFailures = 0;
      this.updateLatency(result.latency);

      // Check for account changes
      if (result.accounts && this.config.syncAccounts) {
        this.checkAccountChanges(result.accounts);
      }

      // Emit check event
      this.emit("health:check", { result });

      // Update status
      this.updateStatus();

      this.health.checking = false;
      return result;

    } catch (error) {
      const result: HealthCheckResult = {
        success: false,
        latency: Date.now() - startTime,
        error: error instanceof Error ? error : new Error(String(error)),
        timestamp: Date.now(),
      };

      // Update failure count
      this.health.consecutiveFailures++;

      // Emit check event
      this.emit("health:check", { result });

      // Update status
      this.updateStatus();

      this.health.checking = false;
      return result;
    }
  }

  /**
   * Record user interaction
   */
  recordInteraction(): void {
    this.health.lastInteraction = Date.now();
    this.updateStatus();
  }

  /**
   * Get current health state
   */
  getHealth(): ConnectionHealth {
    return { ...this.health };
  }

  /**
   * Get current status
   */
  getStatus(): HealthStatus {
    return this.health.status;
  }

  /**
   * Check if connection is healthy
   */
  isHealthy(): boolean {
    return this.health.status === "healthy";
  }

  /**
   * Update latency tracking
   */
  private updateLatency(latency: number): void {
    this.latencyHistory.push(latency);
    if (this.latencyHistory.length > this.maxLatencyHistory) {
      this.latencyHistory.shift();
    }

    // Calculate average latency
    const sum = this.latencyHistory.reduce((a, b) => a + b, 0);
    this.health.latency = Math.round(sum / this.latencyHistory.length);
  }

  /**
   * Update health status based on current metrics
   */
  private updateStatus(): void {
    const previousStatus = this.health.status;
    let newStatus: HealthStatus;

    if (this.health.consecutiveFailures >= this.config.maxConsecutiveFailures) {
      newStatus = "lost";
      this.emit("health:lost", {
        failures: this.health.consecutiveFailures,
      });
    } else if (Date.now() - this.health.lastInteraction > this.config.staleThreshold) {
      newStatus = "stale";
      this.emit("health:stale", {
        lastInteraction: this.health.lastInteraction,
        threshold: this.config.staleThreshold,
      });
    } else if (this.health.latency > this.config.degradedLatencyThreshold) {
      newStatus = "degraded";
      this.emit("health:degraded", {
        latency: this.health.latency,
        threshold: this.config.degradedLatencyThreshold,
      });
    } else {
      newStatus = "healthy";
    }

    if (newStatus !== previousStatus) {
      this.health.status = newStatus;

      // Emit status change
      this.emit("health:status-changed", {
        from: previousStatus,
        to: newStatus,
        health: this.getHealth(),
      });

      // Emit restored event if recovering
      if (
        newStatus === "healthy" &&
        ["degraded", "stale", "lost"].includes(previousStatus)
      ) {
        this.emit("health:restored", { previousStatus });
      }
    }
  }

  /**
   * Check for account changes
   */
  private checkAccountChanges(accounts: Account[]): void {
    // Compare account IDs
    const prevIds = new Set(this.lastAccounts.map((a) => a.accountId));
    const currIds = new Set(accounts.map((a) => a.accountId));

    const hasChanges =
      prevIds.size !== currIds.size ||
      [...prevIds].some((id) => !currIds.has(id));

    if (hasChanges) {
      this.emit("accounts:changed", {
        previous: this.lastAccounts,
        current: accounts,
      });
    }

    this.lastAccounts = accounts;
    this.emit("accounts:synced", { accounts });
  }

  /**
   * Sync account list
   */
  private async syncAccountList(): Promise<void> {
    try {
      const result = await this.performCheck();
      if (result.accounts) {
        this.checkAccountChanges(result.accounts);
      }
    } catch (e) {
      // Silently fail sync
    }
  }

  /**
   * Event listener
   */
  on<K extends keyof HealthEventMap>(
    event: K,
    callback: (payload: HealthEventMap[K]) => void
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
  private emit<K extends keyof HealthEventMap>(
    event: K,
    payload: HealthEventMap[K]
  ): void {
    const listeners = this.listeners.get(event);
    if (listeners) {
      for (const listener of listeners) {
        try {
          listener(payload);
        } catch (e) {
          console.error(`Error in health event listener for ${event}:`, e);
        }
      }
    }
  }

  /**
   * Promise with timeout wrapper
   */
  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Health check timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      promise
        .then((result) => {
          clearTimeout(timeoutId);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timeoutId);
          reject(error);
        });
    });
  }

  /**
   * Force a status update
   */
  forceStatusUpdate(): void {
    this.updateStatus();
  }

  /**
   * Reset health state
   */
  reset(): void {
    this.health = this.createInitialHealth();
    this.latencyHistory = [];
    this.lastAccounts = [];
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<HealthConfig>): void {
    this.config = { ...this.config, ...config };

    // Restart if running and interval changed
    if (this.running) {
      this.stop();
      this.start();
    }
  }

  /**
   * Get average latency
   */
  getAverageLatency(): number {
    if (this.latencyHistory.length === 0) return 0;
    const sum = this.latencyHistory.reduce((a, b) => a + b, 0);
    return Math.round(sum / this.latencyHistory.length);
  }

  /**
   * Get latency percentile
   */
  getLatencyPercentile(percentile: number): number {
    if (this.latencyHistory.length === 0) return 0;

    const sorted = [...this.latencyHistory].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  /**
   * Get uptime percentage since last reset
   */
  getUptimePercentage(): number {
    // This is a simplified calculation
    // In production, you'd track actual check results
    const maxFailures = this.config.maxConsecutiveFailures;
    const failureRate = this.health.consecutiveFailures / maxFailures;
    return Math.max(0, (1 - failureRate) * 100);
  }

  /**
   * Cleanup
   */
  destroy(): void {
    this.stop();
    this.listeners.clear();
  }
}

/**
 * Create a basic health check function for NEAR wallets
 */
export function createWalletHealthCheck(
  getAccounts: () => Promise<Account[]>
): HealthCheckFn {
  return async (): Promise<HealthCheckResult> => {
    const startTime = Date.now();

    try {
      const accounts = await getAccounts();
      const latency = Date.now() - startTime;

      return {
        success: true,
        latency,
        accounts,
        timestamp: Date.now(),
      };
    } catch (error) {
      return {
        success: false,
        latency: Date.now() - startTime,
        error: error instanceof Error ? error : new Error(String(error)),
        timestamp: Date.now(),
      };
    }
  };
}

/**
 * Create a health monitor with standard configuration
 */
export function createHealthMonitor(
  healthCheck: HealthCheckFn,
  config?: Partial<HealthConfig>
): HealthMonitor {
  return new HealthMonitor(healthCheck, config);
}
